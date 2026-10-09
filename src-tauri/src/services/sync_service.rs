//! Synchronization service for subscriptions and notifications.
//!
//! Handles syncing subscriptions from ntfy accounts and the manual message poll.

use tauri::{AppHandle, Manager};

use crate::db::Database;
use crate::models::{canonical_url, CreateSubscription};
use crate::services::{ConnectionManager, NtfyClient};

/// Synchronization service for subscriptions and notifications.
pub struct SyncService;

impl SyncService {
    /// Syncs subscriptions from all configured servers that have credentials.
    ///
    /// For each server with valid credentials, fetches the account's subscriptions
    /// and creates any that don't exist locally. Also starts WebSocket connections
    /// for newly created subscriptions.
    pub async fn sync_subscriptions(handle: &AppHandle) {
        let db: tauri::State<Database> = handle.state();
        let conn_manager: tauri::State<ConnectionManager> = handle.state();

        let settings = match db.get_settings() {
            Ok(s) => s,
            Err(e) => {
                log::error!("Failed to get settings for subscription sync: {e}");
                return;
            }
        };

        for server in &settings.servers {
            let (username, password) = match server.credentials() {
                Some(creds) => creds,
                None => continue,
            };

            log::info!("Syncing subscriptions from: {}", server.url);

            let client = match NtfyClient::new() {
                Ok(c) => c,
                Err(e) => {
                    log::error!("Failed to create ntfy client: {e}");
                    continue;
                }
            };

            let account = match client.get_account(&server.url, username, password).await {
                Ok(a) => a,
                Err(e) => {
                    log::error!("Failed to sync from {}: {}", server.url, e);
                    continue;
                }
            };

            log::info!(
                "Got {} subscriptions from {}",
                account.subscriptions.len(),
                server.url
            );

            let existing = match db.get_all_subscriptions() {
                Ok(s) => s,
                Err(e) => {
                    log::error!("Failed to get existing subscriptions: {e}");
                    continue;
                }
            };

            let our_url = &server.url;
            for ntfy_sub in account.subscriptions {
                if canonical_url(&ntfy_sub.base_url).ok().as_ref() != Some(our_url) {
                    continue;
                }

                let already_exists = existing
                    .iter()
                    .any(|s| s.topic == ntfy_sub.topic && s.server_url == *our_url);

                if already_exists {
                    continue;
                }

                log::info!("Creating subscription: {}", ntfy_sub.topic);
                if let Ok(new_sub) = db.create_subscription(CreateSubscription {
                    topic: ntfy_sub.topic,
                    server_url: server.url.clone(),
                    display_name: ntfy_sub.display_name,
                }) {
                    if let Err(e) = conn_manager.connect(&new_sub).await {
                        log::error!("Failed to connect to {}: {}", new_sub.id, e);
                    }
                }
            }
        }

        log::info!("Subscription sync completed");
    }

    /// Polls one subscription from its cursor (the manual sync).
    ///
    /// Live delivery and catch-up go through the WebSocket; this is the same catch-up as a
    /// one-off poll, fed through the shared receive path.
    pub async fn poll_subscription(
        handle: &AppHandle,
        client: &NtfyClient,
        sub: &crate::models::Subscription,
        username: Option<&str>,
        password: Option<&str>,
    ) {
        let db: tauri::State<Database> = handle.state();
        let since = db.get_message_cursor(&sub.id).ok().flatten();

        let messages = match client
            .get_messages(&sub.server_url, &sub.topic, since, username, password)
            .await
        {
            Ok(m) => m,
            Err(e) => {
                log::error!(
                    "Failed to fetch messages for {}/{}: {}",
                    sub.server_url,
                    sub.topic,
                    e
                );
                return;
            }
        };

        for msg in messages {
            ConnectionManager::receive_message(handle, &sub.id, msg).await;
        }
    }
}

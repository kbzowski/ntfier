//! Synchronization service for subscriptions and notifications.
//!
//! Handles syncing subscriptions from ntfy servers and fetching
//! historical notifications for each subscription.

use tauri::{AppHandle, Manager};

use crate::db::Database;
use crate::models::{normalize_url, CreateSubscription};
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
                log::error!("Failed to get settings for subscription sync: {}", e);
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
                    log::error!("Failed to create ntfy client: {}", e);
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
                    log::error!("Failed to get existing subscriptions: {}", e);
                    continue;
                }
            };

            let our_base = server.normalized_url();

            for ntfy_sub in account.subscriptions {
                let ntfy_base = normalize_url(&ntfy_sub.base_url);

                if ntfy_base != our_base {
                    continue;
                }

                let already_exists = existing
                    .iter()
                    .any(|s| s.server_url_matches(our_base) && s.topic == ntfy_sub.topic);

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

    /// Syncs notifications for all subscriptions from their servers.
    ///
    /// Fetches messages newer than each subscription's last sync timestamp
    /// and stores them in the database.
    pub async fn sync_notifications(handle: &AppHandle) {
        let db: tauri::State<Database> = handle.state();

        let settings = match db.get_settings() {
            Ok(s) => s,
            Err(e) => {
                log::error!("Failed to get settings for notification sync: {}", e);
                return;
            }
        };

        let subscriptions = match db.get_all_subscriptions() {
            Ok(s) => s,
            Err(e) => {
                log::error!("Failed to get subscriptions for notification sync: {}", e);
                return;
            }
        };

        let client = match NtfyClient::new() {
            Ok(c) => c,
            Err(e) => {
                log::error!("Failed to create ntfy client: {}", e);
                return;
            }
        };

        for sub in subscriptions {
            Self::sync_subscription_notifications(&db, &client, &settings.servers, &sub).await;
        }

        log::info!("Notification sync completed");
    }

    /// Syncs notifications for a single subscription.
    async fn sync_subscription_notifications(
        db: &Database,
        client: &NtfyClient,
        servers: &[crate::models::ServerConfig],
        sub: &crate::models::Subscription,
    ) {
        let last_sync = match db.get_subscription_with_last_sync(&sub.id) {
            Ok(Some((_, last_sync))) => last_sync,
            Ok(None) => {
                log::warn!("Subscription {} not found", sub.id);
                return;
            }
            Err(e) => {
                log::error!("Failed to get last_sync for {}: {}", sub.id, e);
                return;
            }
        };

        let server = servers.iter().find(|s| s.url_matches(&sub.server_url));

        let (username, password) = match server {
            Some(s) => (s.username.as_deref(), s.password.as_deref()),
            None => (None, None),
        };

        log::info!(
            "Syncing notifications for {}/{} (since: {:?})",
            sub.server_url,
            sub.topic,
            last_sync
        );

        let messages = match client
            .get_messages(&sub.server_url, &sub.topic, last_sync, username, password)
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

        if messages.is_empty() {
            log::info!("No new messages for {}/{}", sub.server_url, sub.topic);
        } else {
            log::info!(
                "Found {} new messages for {}/{}",
                messages.len(),
                sub.server_url,
                sub.topic
            );
        }

        let mut max_timestamp: i64 = last_sync.unwrap_or(0);

        for msg in messages {
            if db
                .notification_exists_by_ntfy_id(msg.ntfy_id())
                .unwrap_or(false)
            {
                continue;
            }

            let ntfy_id = msg.ntfy_id().to_string();
            let msg_time = msg.time;
            let notification = msg.into_notification(sub.id.clone());

            if let Err(e) = db.insert_notification_with_ntfy_id(&notification, &ntfy_id) {
                log::error!("Failed to insert notification: {}", e);
            } else {
                log::info!(
                    "Inserted notification: {} - {}",
                    notification.title,
                    notification.message
                );
            }

            if msg_time > max_timestamp {
                max_timestamp = msg_time;
            }
        }

        let new_sync_time = std::cmp::max(max_timestamp + 1, chrono::Utc::now().timestamp());
        if let Err(e) = db.update_subscription_last_sync(&sub.id, new_sync_time) {
            log::error!("Failed to update last_sync for {}: {}", sub.id, e);
        }
    }
}

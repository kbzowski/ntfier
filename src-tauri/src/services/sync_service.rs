//! Account sync and the manual message poll.
//!
//! Account sync keeps a server's subscriptions in step with the subscription list on the
//! user's ntfy account. The account is the source of truth, except on the first sync,
//! which merges local topics up.

use tauri::{AppHandle, Emitter, Manager};

use crate::db::Database;
use crate::error::AppError;
use crate::models::{canonical_url, CreateSubscription, ServerStatus, Subscription};
use crate::services::{ConnectionManager, NtfyClient, TrayManager};

pub struct SyncService;

impl SyncService {
    /// Account sync for every server with a credential (at startup).
    pub async fn sync_all_accounts(handle: &AppHandle) {
        let servers = match handle.state::<Database>().get_servers_with_credentials() {
            Ok(servers) => servers,
            Err(e) => {
                log::error!("Failed to load servers for account sync: {e}");
                return;
            }
        };
        for server in servers.iter().filter(|s| s.auth_header().is_some()) {
            if let Err(e) = Self::sync_account(handle, &server.url).await {
                log::error!("Account sync for {} failed: {e}", server.url);
            }
        }
    }

    /// Pulls the account's subscription list for one server and mirrors it locally.
    ///
    /// First sync (or after the login changed): local-only topics are pushed up and
    /// nothing is deleted. After that the account wins: missing topics are removed
    /// locally, new ones added, and the account's display names replace ours.
    /// Also starts listening on the account's sync topic.
    pub async fn sync_account(handle: &AppHandle, server_url: &str) -> Result<(), AppError> {
        let db: tauri::State<Database> = handle.state();
        let conn_manager: tauri::State<ConnectionManager> = handle.state();

        let Some(auth) = db
            .get_servers_with_credentials()?
            .into_iter()
            .find(|s| s.url == server_url)
            .and_then(|s| s.auth_header())
        else {
            return Ok(());
        };

        let client = NtfyClient::new()?;
        let account = match client.get_account(server_url, Some(&auth)).await {
            Err(e @ AppError::Auth(_)) => {
                conn_manager
                    .block_server(server_url, ServerStatus::NeedsCredentials)
                    .await;
                return Err(e);
            }
            result => result?,
        };
        if !account.is_signed_in() {
            // Login disabled or account gone: an empty list here must not delete anything
            log::warn!("{server_url} answered without an account, skipping account sync");
            return Ok(());
        }

        let remote: Vec<_> = account
            .subscriptions
            .iter()
            .filter(|s| canonical_url(&s.base_url).ok().as_deref() == Some(server_url))
            .collect();
        let local: Vec<Subscription> = db
            .get_all_subscriptions()?
            .into_iter()
            .filter(|s| s.server_url == server_url)
            .collect();
        let first_sync = !db.is_server_synced(server_url)?;
        // Until every local topic is on the account, a later sync must merge again:
        // letting the account win would delete the topic that didn't make it up
        let mut all_pushed = true;

        for sub in local
            .iter()
            .filter(|sub| !remote.iter().any(|r| r.topic == sub.topic))
        {
            if first_sync {
                if let Err(e) = client
                    .add_account_subscription(
                        server_url,
                        &auth,
                        &sub.topic,
                        sub.display_name.as_deref(),
                    )
                    .await
                {
                    log::warn!("Couldn't push {} to the account: {e}", sub.topic);
                    all_pushed = false;
                }
            } else {
                log::info!(
                    "{} was removed from the account, removing it here",
                    sub.topic
                );
                conn_manager.disconnect(&sub.id).await;
                db.delete_subscription(&sub.id)?;
            }
        }

        for entry in remote {
            match local.iter().find(|s| s.topic == entry.topic) {
                // On the first sync a local name survives an account entry without one
                Some(sub)
                    if sub.display_name != entry.display_name
                        && (entry.display_name.is_some() || !first_sync) =>
                {
                    db.set_subscription_display_name(&sub.id, entry.display_name.as_deref())?;
                }
                Some(_) => {}
                None => {
                    let created = db.create_subscription(CreateSubscription {
                        topic: entry.topic.clone(),
                        server_url: server_url.to_string(),
                        display_name: entry.display_name.clone(),
                    });
                    match created {
                        Ok(sub) => conn_manager.connect(&sub).await?,
                        // A sync running at the same time may have added it already
                        Err(e) => log::warn!("Couldn't add {} from the account: {e}", entry.topic),
                    }
                }
            }
        }

        if first_sync && all_pushed {
            db.set_server_synced(server_url)?;
        }
        if let Some(sync_topic) = account.sync_topic.as_deref() {
            conn_manager.watch_sync_topic(server_url, sync_topic);
        }

        handle.state::<TrayManager>().refresh_from_db(handle).await;
        let _ = handle.emit("subscriptions:synced", ());
        Ok(())
    }

    /// Polls one subscription from its cursor (the manual sync).
    ///
    /// Live delivery and catch-up go through the WebSocket; this is the same catch-up as a
    /// one-off poll, fed through the shared receive path.
    pub async fn poll_subscription(
        handle: &AppHandle,
        client: &NtfyClient,
        sub: &Subscription,
        auth: Option<&str>,
    ) {
        let db: tauri::State<Database> = handle.state();
        let since = db.get_message_cursor(&sub.id).ok().flatten();

        let messages = match client
            .get_messages(&sub.server_url, &sub.topic, since, auth)
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
            if let Err(e) = ConnectionManager::receive_message(handle, &sub.id, msg).await {
                // Stop so the cursor stays before the message that wasn't stored
                log::error!("Failed to store a message for {}: {e}", sub.id);
                return;
            }
        }
    }
}

use tauri::State;

use crate::db::Database;
use crate::error::AppError;
use crate::models::{Attachment, Notification, NotificationAction, Priority, Subscription};
use crate::services::{ConnectionManager, NtfyClient};

/// Sync notifications for a single subscription
async fn sync_subscription_notifications(
    db: &Database,
    client: &NtfyClient,
    sub: &Subscription,
    username: Option<&str>,
    password: Option<&str>,
) {
    // Get last_sync timestamp
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

    log::info!(
        "Syncing notifications for {}/{} (since: {:?})",
        sub.server_url,
        sub.topic,
        last_sync
    );

    // Fetch messages from server
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

    // Insert new messages
    for msg in messages {
        // Check if already exists by ntfy_id
        if db.notification_exists_by_ntfy_id(&msg.id).unwrap_or(false) {
            continue;
        }

        // Convert ntfy actions to our NotificationAction format
        let actions: Vec<NotificationAction> = msg
            .actions
            .unwrap_or_default()
            .into_iter()
            .map(|a| NotificationAction {
                id: a.id,
                label: a.label,
                url: a.url,
                method: a.method,
                clear: a.clear.unwrap_or(false),
            })
            .collect();

        // Convert ntfy attachment to our Attachment format (ntfy sends single attachment)
        let attachments: Vec<Attachment> = msg
            .attachment
            .map(|a| {
                vec![Attachment {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: a.name,
                    attachment_type: a.mime_type.unwrap_or_else(|| "application/octet-stream".to_string()),
                    url: a.url,
                    size: a.size,
                }]
            })
            .unwrap_or_default();

        let notification = Notification {
            id: uuid::Uuid::new_v4().to_string(),
            topic_id: sub.id.clone(),
            title: msg.title.unwrap_or_default(),
            message: msg.message.unwrap_or_default(),
            priority: Priority::from(msg.priority.unwrap_or(3)),
            tags: msg.tags.unwrap_or_default(),
            timestamp: msg.time * 1000, // Convert to milliseconds
            actions,
            attachments,
            read: false,
        };

        if let Err(e) = db.insert_notification_with_ntfy_id(&notification, &msg.id) {
            log::error!("Failed to insert notification: {}", e);
        } else {
            log::info!(
                "Inserted notification: {} - {}",
                notification.title,
                notification.message
            );
        }

        // Track max timestamp
        if msg.time > max_timestamp {
            max_timestamp = msg.time;
        }
    }

    // Update last_sync to current time (or max message time + 1 to avoid duplicates)
    let new_sync_time = std::cmp::max(max_timestamp + 1, chrono::Utc::now().timestamp());
    if let Err(e) = db.update_subscription_last_sync(&sub.id, new_sync_time) {
        log::error!("Failed to update last_sync for {}: {}", sub.id, e);
    }
}

/// Sync subscriptions from a server that has user credentials
#[tauri::command]
#[specta::specta]
pub async fn sync_subscriptions(
    db: State<'_, Database>,
    conn_manager: State<'_, ConnectionManager>,
    server_url: String,
) -> Result<Vec<Subscription>, AppError> {
    log::info!("sync_subscriptions called for server: {}", server_url);

    // Get server credentials from database
    let settings = db.get_settings()?;
    log::info!("Found {} servers in settings", settings.servers.len());

    let server = settings
        .servers
        .iter()
        .find(|s| s.url == server_url)
        .ok_or_else(|| {
            log::error!("Server {} not found in settings", server_url);
            AppError::NotFound(format!("Server {} not found", server_url))
        })?;

    log::info!(
        "Found server: {} (has username: {}, has password: {})",
        server.url,
        server.username.is_some(),
        server.password.is_some()
    );

    // Check if server has credentials
    let username = server
        .username
        .as_ref()
        .ok_or_else(|| AppError::Connection("Server has no username configured".to_string()))?;
    let password = server
        .password
        .as_ref()
        .ok_or_else(|| AppError::Connection("Server has no password configured".to_string()))?;

    // Fetch account info from ntfy server
    let client = NtfyClient::new()?;
    let account = client.get_account(&server_url, username, password).await?;

    log::info!(
        "Got {} subscriptions from ntfy server",
        account.subscriptions.len()
    );

    let mut synced_subscriptions = Vec::new();

    // Add each subscription from the server
    for ntfy_sub in account.subscriptions {
        log::info!(
            "Processing subscription: {} @ {}",
            ntfy_sub.topic,
            ntfy_sub.base_url
        );

        // Skip if base_url doesn't match (subscription might be for a different server)
        let ntfy_base = ntfy_sub.base_url.trim_end_matches('/');
        let our_base = server_url.trim_end_matches('/');

        if ntfy_base != our_base {
            log::info!(
                "Skipping subscription - base_url mismatch: {} vs {}",
                ntfy_base,
                our_base
            );
            continue;
        }

        // Check if subscription already exists
        let existing = db.get_all_subscriptions()?;
        let already_exists = existing.iter().any(|s| {
            s.server_url.trim_end_matches('/') == our_base && s.topic == ntfy_sub.topic
        });

        if already_exists {
            log::info!("Subscription already exists: {}", ntfy_sub.topic);
            // Find and return the existing subscription
            if let Some(existing_sub) = existing.into_iter().find(|s| {
                s.server_url.trim_end_matches('/') == our_base && s.topic == ntfy_sub.topic
            }) {
                synced_subscriptions.push(existing_sub);
            }
            continue;
        }

        // Create new subscription
        log::info!("Creating new subscription: {}", ntfy_sub.topic);
        let new_sub = db.create_subscription(crate::models::CreateSubscription {
            topic: ntfy_sub.topic.clone(),
            server_url: server_url.clone(),
            display_name: ntfy_sub.display_name,
        })?;

        // Start WebSocket connection for this subscription
        if let Err(e) = conn_manager.connect(&new_sub).await {
            log::error!("Failed to connect to subscription {}: {}", new_sub.id, e);
        }

        synced_subscriptions.push(new_sub);
    }

    log::info!("Synced {} subscriptions total", synced_subscriptions.len());

    // Now sync notifications for all synced subscriptions
    log::info!("Syncing notifications for {} subscriptions...", synced_subscriptions.len());
    for sub in &synced_subscriptions {
        sync_subscription_notifications(
            &db,
            &client,
            sub,
            Some(username.as_str()),
            Some(password.as_str()),
        )
        .await;
    }

    log::info!("Notification sync completed for server {}", server_url);

    Ok(synced_subscriptions)
}

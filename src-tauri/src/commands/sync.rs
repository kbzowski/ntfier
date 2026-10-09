use tauri::{AppHandle, State};

use crate::db::Database;
use crate::error::AppError;
use crate::models::{canonical_url, ServerStatus, Subscription};
use crate::services::{ConnectionManager, NtfyClient, SyncService};

/// Sync subscriptions from a server that has user credentials
#[tauri::command]
#[specta::specta]
pub async fn sync_subscriptions(
    app_handle: AppHandle,
    db: State<'_, Database>,
    conn_manager: State<'_, ConnectionManager>,
    server_url: String,
) -> Result<Vec<Subscription>, AppError> {
    log::info!("sync_subscriptions called for server: {server_url}");

    // Get server credentials from database
    let settings = db.get_settings()?;
    log::info!("Found {} servers in settings", settings.servers.len());

    let server = settings
        .servers
        .iter()
        .find(|s| s.url == server_url)
        .ok_or_else(|| {
            log::error!("Server {server_url} not found in settings");
            AppError::NotFound(format!("Server {server_url} not found"))
        })?;

    let auth = server
        .auth_header()
        .ok_or_else(|| AppError::Validation("Server has no login configured".to_string()))?;

    // Fetch account info from ntfy server
    let client = NtfyClient::new()?;
    let account = match client.get_account(&server_url, Some(&auth)).await {
        Err(e @ AppError::Auth(_)) => {
            conn_manager
                .block_server(&server_url, ServerStatus::NeedsCredentials)
                .await;
            return Err(e);
        }
        result => result?,
    };

    log::info!(
        "Got {} subscriptions from ntfy server",
        account.subscriptions.len()
    );

    // Load existing subscriptions once (avoid N+1 query)
    let existing = db.get_all_subscriptions()?;

    let mut synced_subscriptions = Vec::new();

    for ntfy_sub in account.subscriptions {
        log::info!(
            "Processing subscription: {} @ {}",
            ntfy_sub.topic,
            ntfy_sub.base_url
        );

        // Skip entries for other servers
        if canonical_url(&ntfy_sub.base_url).ok().as_ref() != Some(&server_url) {
            log::info!(
                "Skipping subscription - base_url mismatch: {}",
                ntfy_sub.base_url
            );
            continue;
        }

        // Check if subscription already exists
        if let Some(existing_sub) = existing
            .iter()
            .find(|s| s.server_url == server_url && s.topic == ntfy_sub.topic)
        {
            log::info!("Subscription already exists: {}", ntfy_sub.topic);
            synced_subscriptions.push(existing_sub.clone());
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
    log::info!(
        "Syncing notifications for {} subscriptions...",
        synced_subscriptions.len()
    );
    for sub in &synced_subscriptions {
        SyncService::poll_subscription(&app_handle, &client, sub, Some(&auth)).await;
    }

    log::info!("Notification sync completed for server {server_url}");

    Ok(synced_subscriptions)
}

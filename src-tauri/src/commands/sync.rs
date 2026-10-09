use tauri::{AppHandle, State};

use crate::db::Database;
use crate::error::AppError;
use crate::models::Subscription;
use crate::services::{NtfyClient, SyncService};

/// Manual sync for one server: account sync, then a poll of each of its subscriptions.
/// Returns the server's subscriptions afterwards.
#[tauri::command]
#[specta::specta]
pub async fn sync_subscriptions(
    app_handle: AppHandle,
    db: State<'_, Database>,
    server_url: String,
) -> Result<Vec<Subscription>, AppError> {
    SyncService::sync_account(&app_handle, &server_url).await?;

    let auth = db
        .get_servers_with_credentials()?
        .into_iter()
        .find(|s| s.url == server_url)
        .and_then(|s| s.auth_header());
    let subs: Vec<Subscription> = db
        .get_all_subscriptions()?
        .into_iter()
        .filter(|s| s.server_url == server_url)
        .collect();

    let client = NtfyClient::new()?;
    for sub in &subs {
        SyncService::poll_subscription(&app_handle, &client, sub, auth.as_deref()).await;
    }
    Ok(subs)
}

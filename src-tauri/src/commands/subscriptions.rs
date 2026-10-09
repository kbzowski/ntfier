use tauri::{AppHandle, State};

use crate::commands::notifications::refresh_tray;

use crate::db::Database;
use crate::error::AppError;
use crate::models::{canonical_url, CreateSubscription, Subscription};
use crate::services::ConnectionManager;

#[tauri::command]
#[specta::specta]
pub fn get_subscriptions(db: State<'_, Database>) -> Result<Vec<Subscription>, AppError> {
    db.get_all_subscriptions()
}

#[tauri::command]
#[specta::specta]
pub async fn add_subscription(
    db: State<'_, Database>,
    conn_manager: State<'_, ConnectionManager>,
    mut subscription: CreateSubscription,
) -> Result<Subscription, AppError> {
    subscription.validate()?;
    subscription.server_url = canonical_url(&subscription.server_url)?;
    // Before saving: creating the subscription also creates an unknown server
    let auth = db
        .get_servers_with_credentials()?
        .into_iter()
        .find(|s| s.url == subscription.server_url)
        .and_then(|s| s.auth_header());
    conn_manager
        .ensure_supported(&subscription.server_url, auth.as_deref())
        .await?;
    let sub = db.create_subscription(subscription)?;
    conn_manager.connect(&sub).await?;
    Ok(sub)
}

#[tauri::command]
#[specta::specta]
pub async fn remove_subscription(
    app_handle: AppHandle,
    db: State<'_, Database>,
    conn_manager: State<'_, ConnectionManager>,
    id: String,
) -> Result<(), AppError> {
    conn_manager.disconnect(&id).await;
    db.delete_subscription(&id)?;
    refresh_tray(app_handle);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn toggle_mute(
    app_handle: AppHandle,
    db: State<'_, Database>,
    id: String,
) -> Result<Subscription, AppError> {
    let sub = db.toggle_subscription_mute(&id)?;
    refresh_tray(app_handle);
    Ok(sub)
}

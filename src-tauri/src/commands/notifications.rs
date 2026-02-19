use tauri::{AppHandle, Manager, State};

use crate::db::Database;
use crate::error::AppError;
use crate::models::Notification;
use crate::services::{NtfyClient, TrayManager};

/// Helper to refresh tray icon after unread count changes
fn refresh_tray(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let tray_manager: tauri::State<TrayManager> = app_handle.state();
        tray_manager.refresh_from_db(&app_handle).await;
    });
}

#[tauri::command]
#[specta::specta]
pub fn get_notifications(
    db: State<'_, Database>,
    subscription_id: String,
) -> Result<Vec<Notification>, AppError> {
    db.get_notifications_by_subscription(&subscription_id)
}

#[tauri::command]
#[specta::specta]
pub fn mark_as_read(
    app_handle: AppHandle,
    db: State<'_, Database>,
    id: String,
) -> Result<(), AppError> {
    db.mark_notification_read(&id)?;
    refresh_tray(app_handle);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn mark_all_as_read(
    app_handle: AppHandle,
    db: State<'_, Database>,
    subscription_id: String,
) -> Result<(), AppError> {
    db.mark_all_notifications_read(&subscription_id)?;
    refresh_tray(app_handle);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_notification(
    app_handle: AppHandle,
    db: State<'_, Database>,
    id: String,
) -> Result<(), AppError> {
    // Check if we should also delete remotely
    let delete_local_only = db.get_delete_local_only()?;
    if !delete_local_only {
        if let Some((Some(ntfy_id), subscription_id)) = db.get_notification_meta(&id)? {
            // Look up subscription to get server_url and topic
            if let Some(subscription) = db.get_subscription_by_id(&subscription_id)? {
                // Find credentials for this server
                let servers = db.get_servers_with_credentials()?;
                let server = servers
                    .iter()
                    .find(|s| s.url_matches(&subscription.server_url));

                let (username, password) = server
                    .and_then(|s| s.credentials())
                    .map_or((None, None), |(u, p)| (Some(u), Some(p)));

                match NtfyClient::new() {
                    Ok(client) => {
                        if let Err(e) = client
                            .delete_message(
                                &subscription.server_url,
                                &subscription.topic,
                                &ntfy_id,
                                username,
                                password,
                            )
                            .await
                        {
                            log::warn!("Failed to delete message remotely: {e}");
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to create HTTP client for remote delete: {e}");
                    }
                }
            }
        }
    }

    // Always delete locally
    db.delete_notification(&id)?;
    refresh_tray(app_handle);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn set_notification_favorite(
    db: State<'_, Database>,
    id: String,
    favorite: bool,
) -> Result<(), AppError> {
    db.set_notification_favorite(&id, favorite)
}

#[tauri::command]
#[specta::specta]
pub fn get_favorite_notifications(
    db: State<'_, Database>,
) -> Result<Vec<Notification>, AppError> {
    db.get_favorite_notifications()
}

#[tauri::command]
#[specta::specta]
pub fn set_notification_expanded(
    db: State<'_, Database>,
    id: String,
    expanded: bool,
) -> Result<(), AppError> {
    db.set_notification_expanded(&id, expanded)
}

#[tauri::command]
#[specta::specta]
pub fn get_unread_count(db: State<'_, Database>, subscription_id: String) -> Result<i32, AppError> {
    db.get_unread_count(&subscription_id)
}

#[tauri::command]
#[specta::specta]
pub fn get_total_unread_count(db: State<'_, Database>) -> Result<i32, AppError> {
    db.get_total_unread_count()
}

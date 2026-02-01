use tauri::{AppHandle, Manager, State};

use crate::db::Database;
use crate::error::AppError;
use crate::models::Notification;
use crate::services::TrayManager;

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
pub fn delete_notification(
    app_handle: AppHandle,
    db: State<'_, Database>,
    id: String,
) -> Result<(), AppError> {
    db.delete_notification(&id)?;
    refresh_tray(app_handle);
    Ok(())
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

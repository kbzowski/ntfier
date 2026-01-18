//! Commands for application update functionality.

use tauri::AppHandle;

use crate::error::AppError;
use crate::services::{UpdateInfo, UpdateService};

/// Check for available updates.
///
/// Returns update information if an update is available, null otherwise.
#[tauri::command]
#[specta::specta]
pub async fn check_for_update(handle: AppHandle) -> Result<Option<UpdateInfo>, AppError> {
    UpdateService::check_for_update(&handle).await
}

/// Download and install an available update.
///
/// This will download the update and may restart the application.
#[tauri::command]
#[specta::specta]
pub async fn install_update(handle: AppHandle) -> Result<(), AppError> {
    UpdateService::install_update(&handle).await
}

/// Get the current application version.
#[tauri::command]
#[specta::specta]
pub fn get_app_version(handle: AppHandle) -> String {
    UpdateService::get_app_version(&handle)
}

/// Get the application version for display purposes.
///
/// Returns "dev" in debug builds, "vX.Y.Z" in release builds.
#[tauri::command]
#[specta::specta]
pub fn get_app_version_display(handle: AppHandle) -> String {
    if cfg!(debug_assertions) {
        "dev".to_string()
    } else {
        format!("v{}", UpdateService::get_app_version(&handle))
    }
}

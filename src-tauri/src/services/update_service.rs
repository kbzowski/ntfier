//! Update service for checking and installing application updates.
//!
//! Uses tauri-plugin-updater to check for updates from GitHub releases
//! and install them with user confirmation.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::error::AppError;

/// Information about an available update.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct UpdateInfo {
    /// The new version available.
    pub version: String,
    /// The current installed version.
    pub current_version: String,
    /// Release notes for the update.
    pub body: Option<String>,
    /// Release date.
    pub date: Option<String>,
}

/// Managed state: result of the latest successful update check, so a window opened later can show it.
#[derive(Default)]
pub struct LastUpdateCheck(Mutex<Option<UpdateInfo>>);

/// Service for managing application updates.
pub struct UpdateService;

impl UpdateService {
    /// Check for available updates.
    ///
    /// Returns `Some(UpdateInfo)` if an update is available, `None` otherwise.
    /// The result is stored and returned later by [`Self::last_check`].
    pub async fn check_for_update(handle: &AppHandle) -> Result<Option<UpdateInfo>, AppError> {
        let info = Self::fetch_update(handle).await?;
        handle
            .state::<LastUpdateCheck>()
            .0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone_from(&info);
        Ok(info)
    }

    /// Result of the latest successful update check, `None` if none ran or it found no update.
    pub fn last_check(handle: &AppHandle) -> Option<UpdateInfo> {
        handle
            .state::<LastUpdateCheck>()
            .0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    async fn fetch_update(handle: &AppHandle) -> Result<Option<UpdateInfo>, AppError> {
        let updater = handle
            .updater()
            .map_err(|e| AppError::Updater(e.to_string()))?;

        let update = updater
            .check()
            .await
            .map_err(|e| AppError::Updater(e.to_string()))?;

        if let Some(update) = update {
            log::info!(
                "Update available: {} -> {}",
                update.current_version,
                update.version
            );

            Ok(Some(UpdateInfo {
                version: update.version.clone(),
                current_version: update.current_version.clone(),
                body: update.body.clone(),
                date: update.date.map(|d| d.to_string()),
            }))
        } else {
            log::info!("No update available");
            Ok(None)
        }
    }

    /// Download and install an available update.
    ///
    /// This will download the update and restart the application.
    pub async fn install_update(handle: &AppHandle) -> Result<(), AppError> {
        let updater = handle
            .updater()
            .map_err(|e| AppError::Updater(e.to_string()))?;

        let update = updater
            .check()
            .await
            .map_err(|e| AppError::Updater(e.to_string()))?;

        if let Some(update) = update {
            log::info!("Downloading update {}...", update.version);

            // Download and install the update
            let mut downloaded = 0;
            update
                .download_and_install(
                    |chunk_length, content_length| {
                        downloaded += chunk_length;
                        log::info!(
                            "Downloaded {} / {}",
                            downloaded,
                            content_length.unwrap_or(0)
                        );
                    },
                    || {
                        log::info!("Download complete, installing...");
                    },
                )
                .await
                .map_err(|e| AppError::Updater(e.to_string()))?;

            log::info!("Update installed successfully, restart required");
            Ok(())
        } else {
            Err(AppError::Updater("No update available".to_string()))
        }
    }

    /// Get the current application version.
    pub fn get_app_version(handle: &AppHandle) -> String {
        handle.package_info().version.to_string()
    }
}

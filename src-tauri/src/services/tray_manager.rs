//! System tray icon management.
//!
//! Handles dynamic tray icon updates to show unread notification status.
//! Loads custom icons from the application's icons directory.

use std::sync::Arc;
use tauri::{image::Image, tray::TrayIcon, AppHandle, Manager};
use tokio::sync::RwLock;

use crate::db::Database;

/// Internal state for tray icon management.
#[derive(Default)]
struct TrayState {
    tray_icon: Option<TrayIcon>,
    icon_normal: Option<Image<'static>>,
    icon_unread: Option<Image<'static>>,
    has_unread: bool,
}


/// Manages system tray icon state and appearance.
///
/// Supports two icon states: normal and unread (notification badge).
/// Icon updates are debounced to prevent flickering.
#[derive(Clone)]
pub struct TrayManager {
    state: Arc<RwLock<TrayState>>,
}

impl TrayManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(TrayState::default())),
        }
    }

    /// Initialize with the tray icon handle
    pub async fn set_tray_icon(&self, tray: TrayIcon) {
        let mut state = self.state.write().await;
        state.tray_icon = Some(tray);
    }

    /// Load icon assets from the icons directory
    pub async fn load_icons(&self, app_handle: &AppHandle) -> Result<(), String> {
        // Get icons directory relative to executable
        let icons_dir = Self::get_icons_dir(app_handle)?;

        // Try to load tray.png, fall back to 32x32.png
        let normal_icon = Self::load_icon_from_dir(&icons_dir, "tray.png")
            .or_else(|_| Self::load_icon_from_dir(&icons_dir, "32x32.png"))
            .map_err(|e| format!("Failed to load normal icon: {e}"))?;

        // Try to load tray-unread.png, fall back to normal icon if not found
        let unread_icon = Self::load_icon_from_dir(&icons_dir, "tray-unread.png")
            .unwrap_or_else(|_| normal_icon.clone());

        let mut state = self.state.write().await;
        state.icon_normal = Some(normal_icon);
        state.icon_unread = Some(unread_icon);

        Ok(())
    }

    fn get_icons_dir(app_handle: &AppHandle) -> Result<std::path::PathBuf, String> {
        // Try multiple locations for icons directory

        // 1. Resource directory (production)
        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            let icons_path = resource_dir.join("icons");
            if icons_path.exists() {
                log::info!("Found icons at: {}", icons_path.display());
                return Ok(icons_path);
            }
        }

        // 2. Relative to executable
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let icons_path = exe_dir.join("icons");
                if icons_path.exists() {
                    log::info!("Found icons at: {}", icons_path.display());
                    return Ok(icons_path);
                }

                // 3. Development: src-tauri/icons (exe is in target/debug)
                // Go up from target/debug to src-tauri
                let dev_icons = exe_dir
                    .parent() // target
                    .and_then(|p| p.parent()) // src-tauri
                    .map(|p| p.join("icons"));

                if let Some(icons_path) = dev_icons {
                    if icons_path.exists() {
                        log::info!("Found icons at (dev): {}", icons_path.display());
                        return Ok(icons_path);
                    }
                }
            }
        }

        Err("Icons directory not found".to_string())
    }

    fn load_icon_from_dir(
        icons_dir: &std::path::Path,
        filename: &str,
    ) -> Result<Image<'static>, String> {
        let icon_path = icons_dir.join(filename);

        let img = image::open(&icon_path)
            .map_err(|e| format!("Failed to open image {}: {e}", icon_path.display()))?;

        let rgba = img.to_rgba8();
        let (width, height) = rgba.dimensions();
        let raw_data = rgba.into_raw();

        Ok(Image::new_owned(raw_data, width, height))
    }

    /// Update tray icon based on unread count
    pub async fn update_icon(&self, has_unread: bool) {
        let mut state = self.state.write().await;

        // Skip if no change needed
        if state.has_unread == has_unread {
            return;
        }
        state.has_unread = has_unread;

        Self::set_icon_from_state(&state, has_unread);
    }

    /// Force set the tray icon (used for initial setup)
    pub async fn force_update_icon(&self, has_unread: bool) {
        let mut state = self.state.write().await;
        state.has_unread = has_unread;

        Self::set_icon_from_state(&state, has_unread);
    }

    fn set_icon_from_state(state: &TrayState, has_unread: bool) {
        let Some(tray) = state.tray_icon.as_ref() else {
            log::warn!("Tray icon not initialized");
            return;
        };

        let icon = if has_unread {
            state.icon_unread.as_ref()
        } else {
            state.icon_normal.as_ref()
        };

        if let Some(icon) = icon {
            log::info!("Setting tray icon (has_unread: {has_unread})");
            if let Err(e) = tray.set_icon(Some(icon.clone())) {
                log::error!("Failed to set tray icon: {e}");
            }
        } else {
            log::warn!("Icon not loaded for has_unread: {has_unread}");
        }
    }

    /// Refresh tray icon based on current unread count from database
    pub async fn refresh_from_db(&self, app_handle: &AppHandle) {
        let db: tauri::State<Database> = app_handle.state();
        let has_unread = db
            .get_total_unread_count()
            .map(|count| count > 0)
            .unwrap_or(false);

        self.update_icon(has_unread).await;
    }

    /// Initial refresh - forces icon update even if state matches
    pub async fn initial_refresh(&self, app_handle: &AppHandle) {
        let db: tauri::State<Database> = app_handle.state();
        let has_unread = db
            .get_total_unread_count()
            .map(|count| count > 0)
            .unwrap_or(false);

        log::info!("Initial tray refresh, has_unread: {has_unread}");
        self.force_update_icon(has_unread).await;
    }
}

impl Default for TrayManager {
    fn default() -> Self {
        Self::new()
    }
}

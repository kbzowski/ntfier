//! The settings window: one get-or-create shared by the gear, the tray and the banner.

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::AppError;

pub const SETTINGS_WINDOW_LABEL: &str = "settings";

/// Raises the settings window, or builds it if it isn't open.
///
/// `edit_server_url` goes in the route query of a new window, or in a
/// `settings:edit-server` event to an open one. Building a window
/// deadlocks on Windows when called from a sync command or event handler, so call
/// this from an async command or `tauri::async_runtime::spawn`.
pub fn show_settings_window(app: &AppHandle, edit_server_url: Option<&str>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        window.unminimize()?;
        window.show()?;
        if let Some(url) = edit_server_url {
            window.emit_to(SETTINGS_WINDOW_LABEL, "settings:edit-server", url)?;
        }
        return window.set_focus();
    }

    let mut route = "settings".to_string();
    if let Some(url) = edit_server_url {
        route.push_str("?editServer=");
        route.extend(url::form_urlencoded::byte_serialize(url.as_bytes()));
    }

    // No parent: non-modal, with its own taskbar button. Window-state restores
    // the saved position and size over `center()` after the first open.
    WebviewWindowBuilder::new(app, SETTINGS_WINDOW_LABEL, WebviewUrl::App(route.into()))
        .title("Ntfier – Settings")
        .inner_size(720.0, 600.0)
        .min_inner_size(480.0, 400.0)
        .resizable(true)
        .center()
        .build()?;
    Ok(())
}

/// Opens the settings window, or raises it if it's already open.
#[tauri::command]
#[specta::specta]
pub async fn open_settings_window(
    app: AppHandle,
    edit_server_url: Option<String>,
) -> Result<(), AppError> {
    show_settings_window(&app, edit_server_url.as_deref())?;
    Ok(())
}

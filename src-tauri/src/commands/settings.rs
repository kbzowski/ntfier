use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::notifications::refresh_tray;

use crate::db::Database;
use crate::error::AppError;
use serde::Serialize;
use specta::Type;

use crate::models::{
    canonical_url, AppSettings, NotificationDisplayMethod, ServerConfig, ServerStatusEntry,
};
use crate::services::{ConnectionManager, NtfyClient, SyncService};

/// Tells every window to refetch the settings once a save went through.
fn changed(app_handle: &AppHandle, saved: Result<(), AppError>) -> Result<(), AppError> {
    saved?;
    let _ = app_handle.emit("settings:changed", ());
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_settings(db: State<'_, Database>) -> Result<AppSettings, AppError> {
    db.get_settings()
}

/// A saved server's canonical URL, plus a warning when the login wasn't kept.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SavedServer {
    pub url: String,
    pub warning: Option<String>,
}

/// Checks the credential with `/v1/account` before it's saved; a 401 is the error.
/// A server without user accounts answers anonymously: then the login is dropped.
async fn check_credential(
    mut server: ServerConfig,
) -> Result<(ServerConfig, Option<String>), AppError> {
    server.url = canonical_url(&server.url)?;
    let Some(auth) = server.auth_header() else {
        return Ok((server, None));
    };
    let account = NtfyClient::new()?
        .get_account(&server.url, Some(&auth))
        .await?;
    if account.is_signed_in() {
        return Ok((server, None));
    }
    server.username = None;
    server.password = None;
    server.token = None;
    Ok((
        server,
        Some("This server has no user accounts, so it was saved without the login.".to_string()),
    ))
}

#[tauri::command]
#[specta::specta]
pub async fn add_server(
    app_handle: AppHandle,
    db: State<'_, Database>,
    conn_manager: State<'_, ConnectionManager>,
    mut server: ServerConfig,
) -> Result<SavedServer, AppError> {
    server.url = canonical_url(&server.url)?;
    conn_manager
        .ensure_supported(&server.url, server.auth_header().as_deref())
        .await?;
    let (server, warning) = check_credential(server).await?;
    let url = db.add_server(server)?;
    let _ = app_handle.emit("settings:changed", ());
    Ok(SavedServer { url, warning })
}

/// Changes a server's login in place and reconnects its subscriptions with it.
#[tauri::command]
#[specta::specta]
pub async fn update_server(
    app_handle: AppHandle,
    db: State<'_, Database>,
    conn_manager: State<'_, ConnectionManager>,
    server: ServerConfig,
) -> Result<SavedServer, AppError> {
    let (server, warning) = check_credential(server).await?;
    db.update_server_credential(&server)?;
    let _ = app_handle.emit("settings:changed", ());
    conn_manager.reconnect_server(&server.url).await;
    // The (possibly new) account's topics come in with an account sync
    let url = server.url.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = SyncService::sync_account(&app_handle, &url).await {
            log::error!("Account sync for {url} failed: {e}");
        }
    });
    Ok(SavedServer {
        url: server.url,
        warning,
    })
}

/// Servers that are blocked from connecting (the `server:status` events so far).
#[tauri::command]
#[specta::specta]
pub async fn get_server_statuses(
    conn_manager: State<'_, ConnectionManager>,
) -> Result<Vec<ServerStatusEntry>, AppError> {
    Ok(conn_manager.server_statuses().await)
}

#[derive(Clone, Serialize)]
struct ServerRemoved {
    url: String,
}

#[tauri::command]
#[specta::specta]
pub async fn remove_server(
    app_handle: AppHandle,
    db: State<'_, Database>,
    conn_manager: State<'_, ConnectionManager>,
    url: String,
) -> Result<(), AppError> {
    conn_manager.disconnect_server(&url).await;
    db.remove_server(&url)?;
    let _ = app_handle.emit("settings:server-removed", ServerRemoved { url });
    let _ = app_handle.emit("settings:changed", ());
    refresh_tray(app_handle);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn set_default_server(
    app_handle: AppHandle,
    db: State<'_, Database>,
    url: String,
) -> Result<(), AppError> {
    changed(&app_handle, db.set_default_server(&url))
}

#[tauri::command]
#[specta::specta]
pub fn set_minimize_to_tray(
    app_handle: AppHandle,
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), AppError> {
    changed(
        &app_handle,
        db.set_setting("minimize_to_tray", if enabled { "true" } else { "false" }),
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_start_minimized(
    app_handle: AppHandle,
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), AppError> {
    changed(
        &app_handle,
        db.set_setting("start_minimized", if enabled { "true" } else { "false" }),
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_notification_method(
    app_handle: AppHandle,
    db: State<'_, Database>,
    method: NotificationDisplayMethod,
) -> Result<(), AppError> {
    let method_str = match method {
        NotificationDisplayMethod::Native => "native",
        NotificationDisplayMethod::WindowsEnhanced => "windows_enhanced",
    };
    changed(
        &app_handle,
        db.set_setting("notification_method", method_str),
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_notification_force_display(
    app_handle: AppHandle,
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), AppError> {
    changed(
        &app_handle,
        db.set_setting(
            "notification_force_display",
            if enabled { "true" } else { "false" },
        ),
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_notification_show_actions(
    app_handle: AppHandle,
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), AppError> {
    changed(
        &app_handle,
        db.set_setting(
            "notification_show_actions",
            if enabled { "true" } else { "false" },
        ),
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_notification_show_images(
    app_handle: AppHandle,
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), AppError> {
    changed(
        &app_handle,
        db.set_setting(
            "notification_show_images",
            if enabled { "true" } else { "false" },
        ),
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_notification_sound(
    app_handle: AppHandle,
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), AppError> {
    changed(
        &app_handle,
        db.set_setting("notification_sound", if enabled { "true" } else { "false" }),
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_compact_view(
    app_handle: AppHandle,
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), AppError> {
    changed(
        &app_handle,
        db.set_setting("compact_view", if enabled { "true" } else { "false" }),
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_expand_new_messages(
    app_handle: AppHandle,
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), AppError> {
    changed(
        &app_handle,
        db.set_setting(
            "expand_new_messages",
            if enabled { "true" } else { "false" },
        ),
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_delete_local_only(
    app_handle: AppHandle,
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), AppError> {
    changed(
        &app_handle,
        db.set_setting("delete_local_only", if enabled { "true" } else { "false" }),
    )
}

/// Sets the retention age limit (`None` = off) and applies retention right away.
#[tauri::command]
#[specta::specta]
pub fn set_retention_max_age_days(
    app_handle: AppHandle,
    db: State<'_, Database>,
    days: Option<u32>,
) -> Result<(), AppError> {
    set_retention_limit(&app_handle, &db, "retention_max_age_days", days, "days")
}

/// Sets the retention count limit per subscription (`None` = off) and applies retention right away.
#[tauri::command]
#[specta::specta]
pub fn set_retention_max_per_subscription(
    app_handle: AppHandle,
    db: State<'_, Database>,
    max: Option<u32>,
) -> Result<(), AppError> {
    set_retention_limit(
        &app_handle,
        &db,
        "retention_max_per_subscription",
        max,
        "count",
    )
}

/// Stores a retention limit (empty = off) and applies retention right away.
fn set_retention_limit(
    app_handle: &AppHandle,
    db: &Database,
    key: &str,
    limit: Option<u32>,
    what: &str,
) -> Result<(), AppError> {
    if limit == Some(0) {
        return Err(AppError::Validation(format!(
            "Retention {what} must be positive"
        )));
    }
    db.set_setting(key, &limit.map(|l| l.to_string()).unwrap_or_default())?;
    let _ = app_handle.emit("settings:changed", ());
    run_retention(app_handle)
}

/// Applies retention with the stored limits; tells the UI to reload when anything was removed.
pub fn run_retention(app_handle: &AppHandle) -> Result<(), AppError> {
    let db: State<Database> = app_handle.state();
    let removed = db.apply_retention(
        db.get_retention_max_age_days()?,
        db.get_retention_max_per_subscription()?,
    )?;
    if removed > 0 {
        log::info!("Retention removed {removed} notifications");
        let _ = app_handle.emit("notifications:retention-applied", ());
        refresh_tray(app_handle.clone());
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn set_favorites_enabled(
    app_handle: AppHandle,
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), AppError> {
    changed(
        &app_handle,
        db.set_setting("favorites_enabled", if enabled { "true" } else { "false" }),
    )
}

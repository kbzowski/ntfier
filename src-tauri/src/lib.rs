//! Ntfier - Desktop notification client for ntfy.
//!
//! This is the main entry point for the Tauri application. It handles:
//! - Application initialization and plugin setup
//! - Database and connection manager initialization
//! - System tray icon and menu configuration
//! - Startup synchronization of subscriptions and notifications
//!
//! # Startup Sequence
//! 1. Initialize database and managed state
//! 2. Set up system tray with menu
//! 3. Configure window close behavior (minimize to tray)
//! 4. Spawn async task for:
//!    - Syncing subscriptions from configured servers
//!    - Fetching missed notifications
//!    - Establishing WebSocket connections for real-time updates

mod commands;
mod config;
mod db;
mod error;
mod models;
mod services;

use db::Database;
use services::{ConnectionManager, SyncService, TrayManager};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

/// Generate TypeScript bindings for all commands and types.
///
/// This only runs in debug builds. If binding export fails, we want to
/// crash immediately to alert the developer.
#[cfg(debug_assertions)]
#[allow(clippy::expect_used)]
pub fn export_bindings() {
    use specta_typescript::{BigIntExportBehavior, Typescript};

    let builder =
        tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
            commands::get_subscriptions,
            commands::add_subscription,
            commands::remove_subscription,
            commands::toggle_mute,
            commands::get_notifications,
            commands::mark_as_read,
            commands::mark_all_as_read,
            commands::delete_notification,
            commands::set_notification_expanded,
            commands::get_unread_count,
            commands::get_total_unread_count,
            commands::get_settings,
            commands::set_theme,
            commands::add_server,
            commands::remove_server,
            commands::set_default_server,
            commands::set_minimize_to_tray,
            commands::set_start_minimized,
            commands::set_notification_method,
            commands::set_notification_force_display,
            commands::set_notification_show_actions,
            commands::set_notification_show_images,
            commands::set_notification_sound,
            commands::set_compact_view,
            commands::set_expand_new_messages,
            commands::set_delete_local_only,
            commands::set_favorites_enabled,
            commands::set_notification_favorite,
            commands::get_favorite_notifications,
            commands::sync_subscriptions,
            // Update
            commands::check_for_update,
            commands::install_update,
            commands::get_app_version,
            commands::get_app_version_display,
        ]);

    // Configure TypeScript export to handle i64 as number (safe for timestamps up to year 285,616)
    let ts_config = Typescript::default().bigint(BigIntExportBehavior::Number);

    let bindings_path = "../ui/src/types/bindings.ts";

    builder
        .export(ts_config, bindings_path)
        .expect("Failed to export TypeScript bindings");

    // Prepend @ts-nocheck to suppress errors in auto-generated code
    let contents =
        std::fs::read_to_string(bindings_path).expect("Failed to read generated bindings");
    std::fs::write(bindings_path, format!("// @ts-nocheck\n{contents}"))
        .expect("Failed to write @ts-nocheck to bindings");

    println!("TypeScript bindings exported to {bindings_path}");
}

/// Main application entry point.
///
/// Initializes the Tauri application with all required plugins and state,
/// then starts the event loop.
///
/// # Panics
/// Panics if Tauri fails to initialize. This is the standard pattern for
/// Tauri applications - if the app can't start, there's nothing to recover.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::expect_used)]
pub fn run() {
    // Export TypeScript bindings in debug mode
    #[cfg(debug_assertions)]
    export_bindings();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Initialize database
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("ntfier.db");
            let db = Database::new(&db_path)?;
            app.manage(db);

            // Initialize connection manager
            let conn_manager = ConnectionManager::new(app.handle().clone());
            app.manage(conn_manager);

            // Initialize tray manager
            let tray_manager = TrayManager::new();
            app.manage(tray_manager);

            // Logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Tray icon setup
            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let default_icon = app
                .default_window_icon()
                .ok_or("No default window icon configured")?
                .clone();

            let tray = TrayIconBuilder::new()
                .icon(default_icon)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app_handle = tray.app_handle();

                        // Show and focus window
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            // Notify frontend to scroll to top
                            let _ = app_handle.emit("window:shown", ());
                        }
                    }
                })
                .build(app)?;

            // Handle window close - minimize to tray or close based on setting
            if let Some(window) = app.get_webview_window("main") {
                // Check if should start minimized
                let db: tauri::State<Database> = app.state();
                let start_minimized = db.get_start_minimized().unwrap_or(false);

                // Also check for --minimized command line argument (from autostart)
                let args: Vec<String> = std::env::args().collect();
                let has_minimized_arg = args.iter().any(|arg| arg == "--minimized");

                // Window starts hidden (visible: false in tauri.conf.json)
                // Only show it if not starting minimized
                if !start_minimized && !has_minimized_arg {
                    let _ = window.show();
                }

                let win = window.clone();
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    let db: tauri::State<Database> = app_handle.state();
                    let minimize_to_tray = db.get_minimize_to_tray().unwrap_or(true);

                    match event {
                        tauri::WindowEvent::CloseRequested { api, .. } => {
                            if minimize_to_tray {
                                // Prevent close and hide to tray
                                api.prevent_close();
                                let _ = win.hide();
                            }
                            // If minimize_to_tray is false, allow normal close
                        }
                        tauri::WindowEvent::Resized(_) => {
                            if minimize_to_tray && win.is_minimized().unwrap_or(false) {
                                // Unminimize and hide to tray instead
                                let _ = win.unminimize();
                                let _ = win.hide();
                            }
                        }
                        _ => {}
                    }
                });
            }

            // Sync and connect on startup (deferred)
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Clean up old cached images (older than 24 hours)
                services::image_cache::cleanup_old_images(24 * 60 * 60).await;

                // Set up tray icon with custom icons
                let tray_manager: tauri::State<TrayManager> = handle.state();
                tray_manager.set_tray_icon(tray).await;

                // Load tray icons
                if let Err(e) = tray_manager.load_icons(&handle).await {
                    log::warn!("Failed to load tray icons: {e}");
                }

                // 1. First sync subscriptions from all servers (creates new subscriptions)
                SyncService::sync_subscriptions(&handle).await;

                // Notify frontend that subscriptions are synced
                log::info!("Emitting subscriptions:synced event");
                let _ = handle.emit("subscriptions:synced", ());

                // 2. Then sync notifications for all subscriptions (fetches missed messages)
                SyncService::sync_notifications(&handle).await;

                // 3. Finally connect WebSocket for all subscriptions (real-time updates)
                let conn_manager: tauri::State<ConnectionManager> = handle.state();
                conn_manager.connect_all().await;

                // 4. Update tray icon based on unread count (force initial update)
                tray_manager.initial_refresh(&handle).await;

                // 5. Check for updates (non-blocking)
                if let Ok(Some(update_info)) =
                    services::UpdateService::check_for_update(&handle).await
                {
                    let _ = handle.emit("update:available", update_info);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Subscriptions
            commands::get_subscriptions,
            commands::add_subscription,
            commands::remove_subscription,
            commands::toggle_mute,
            // Notifications
            commands::get_notifications,
            commands::mark_as_read,
            commands::mark_all_as_read,
            commands::delete_notification,
            commands::set_notification_expanded,
            commands::get_unread_count,
            commands::get_total_unread_count,
            // Settings
            commands::get_settings,
            commands::set_theme,
            commands::add_server,
            commands::remove_server,
            commands::set_default_server,
            commands::set_minimize_to_tray,
            commands::set_start_minimized,
            commands::set_notification_method,
            commands::set_notification_force_display,
            commands::set_notification_show_actions,
            commands::set_notification_show_images,
            commands::set_notification_sound,
            commands::set_compact_view,
            commands::set_expand_new_messages,
            commands::set_delete_local_only,
            commands::set_favorites_enabled,
            commands::set_notification_favorite,
            commands::get_favorite_notifications,
            // Sync
            commands::sync_subscriptions,
            // Update
            commands::check_for_update,
            commands::install_update,
            commands::get_app_version,
            commands::get_app_version_display,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ntfier");
}

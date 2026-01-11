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

/// Generate TypeScript bindings for all commands and types
#[cfg(debug_assertions)]
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
            commands::get_unread_count,
            commands::get_total_unread_count,
            commands::get_settings,
            commands::set_theme,
            commands::add_server,
            commands::remove_server,
            commands::set_default_server,
            commands::set_minimize_to_tray,
            commands::set_start_minimized,
            commands::sync_subscriptions,
        ]);

    // Configure TypeScript export to handle i64 as number (safe for timestamps up to year 285,616)
    let ts_config = Typescript::default().bigint(BigIntExportBehavior::Number);

    builder
        .export(ts_config, "../ui/src/types/bindings.ts")
        .expect("Failed to export TypeScript bindings");

    println!("TypeScript bindings exported to ../ui/src/types/bindings.ts");
}

/// Main application entry point.
///
/// Initializes the Tauri application with all required plugins and state,
/// then starts the event loop.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
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

            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
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

                        // Find first subscription with unread notifications
                        let db = app_handle.state::<Database>();
                        if let Ok(subscriptions) = db.get_all_subscriptions() {
                            if let Some(sub) = subscriptions
                                .iter()
                                .find(|s| !s.muted && s.unread_count > 0)
                            {
                                let _ = app_handle.emit("navigate:subscription", &sub.id);
                            }
                        }

                        // Show and focus window
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Handle window close - minimize to tray or close based on setting
            if let Some(window) = app.get_webview_window("main") {
                // Check if should start minimized
                let db: tauri::State<Database> = app.state();
                let start_minimized = db
                    .get_settings()
                    .map(|s| s.start_minimized)
                    .unwrap_or(false);

                // Also check for --minimized command line argument (from autostart)
                let args: Vec<String> = std::env::args().collect();
                let has_minimized_arg = args.iter().any(|arg| arg == "--minimized");

                if start_minimized || has_minimized_arg {
                    let _ = window.hide();
                }

                let win = window.clone();
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Check minimize_to_tray setting
                        let db: tauri::State<Database> = app_handle.state();
                        let minimize_to_tray = db
                            .get_settings()
                            .map(|s| s.minimize_to_tray)
                            .unwrap_or(true);

                        if minimize_to_tray {
                            // Prevent close and hide to tray
                            api.prevent_close();
                            let _ = win.hide();
                        }
                        // If minimize_to_tray is false, allow normal close
                    }
                });
            }

            // Sync and connect on startup (deferred)
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Small delay to ensure state is ready
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;

                // Set up tray icon with custom icons
                let tray_manager: tauri::State<TrayManager> = handle.state();
                tray_manager.set_tray_icon(tray).await;

                // Load tray icons
                if let Err(e) = tray_manager.load_icons(&handle).await {
                    log::warn!("Failed to load tray icons: {}", e);
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
            // Sync
            commands::sync_subscriptions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ntfier");
}

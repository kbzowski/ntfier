mod commands;
mod db;
mod error;
mod models;
mod services;

use db::Database;
use models::{Attachment, CreateSubscription, Notification, NotificationAction, Priority};
use services::{ConnectionManager, NtfyClient, TrayManager};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

/// Sync subscriptions from all configured servers
async fn sync_all_servers(handle: &tauri::AppHandle) {
    let db: tauri::State<Database> = handle.state();
    let conn_manager: tauri::State<ConnectionManager> = handle.state();

    let settings = match db.get_settings() {
        Ok(s) => s,
        Err(e) => {
            log::error!("Failed to get settings on startup: {}", e);
            return;
        }
    };

    for server in &settings.servers {
        let username = match &server.username {
            Some(u) if !u.is_empty() => u,
            _ => continue, // Skip servers without credentials
        };
        let password = match &server.password {
            Some(p) => p,
            None => continue,
        };

        log::info!("Syncing subscriptions from: {}", server.url);

        let client = match NtfyClient::new() {
            Ok(c) => c,
            Err(e) => {
                log::error!("Failed to create ntfy client: {}", e);
                continue;
            }
        };

        let account = match client.get_account(&server.url, username, password).await {
            Ok(a) => a,
            Err(e) => {
                log::error!("Failed to sync from {}: {}", server.url, e);
                continue;
            }
        };

        log::info!(
            "Got {} subscriptions from {}",
            account.subscriptions.len(),
            server.url
        );

        for ntfy_sub in account.subscriptions {
            let ntfy_base = ntfy_sub.base_url.trim_end_matches('/');
            let our_base = server.url.trim_end_matches('/');

            if ntfy_base != our_base {
                continue;
            }

            // Check if already exists
            let existing = match db.get_all_subscriptions() {
                Ok(s) => s,
                Err(_) => continue,
            };

            let already_exists = existing.iter().any(|s| {
                s.server_url.trim_end_matches('/') == our_base && s.topic == ntfy_sub.topic
            });

            if already_exists {
                continue;
            }

            // Create new subscription
            log::info!("Creating subscription on startup: {}", ntfy_sub.topic);
            if let Ok(new_sub) = db.create_subscription(CreateSubscription {
                topic: ntfy_sub.topic,
                server_url: server.url.clone(),
                display_name: ntfy_sub.display_name,
            }) {
                if let Err(e) = conn_manager.connect(&new_sub).await {
                    log::error!("Failed to connect to {}: {}", new_sub.id, e);
                }
            }
        }
    }
}

/// Sync notifications for all subscriptions from their respective servers
async fn sync_all_notifications(handle: &tauri::AppHandle) {
    let db: tauri::State<Database> = handle.state();

    let settings = match db.get_settings() {
        Ok(s) => s,
        Err(e) => {
            log::error!("Failed to get settings for notification sync: {}", e);
            return;
        }
    };

    let subscriptions = match db.get_all_subscriptions() {
        Ok(s) => s,
        Err(e) => {
            log::error!("Failed to get subscriptions for notification sync: {}", e);
            return;
        }
    };

    let client = match NtfyClient::new() {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to create ntfy client: {}", e);
            return;
        }
    };

    for sub in subscriptions {
        // Get last_sync timestamp for this subscription
        let last_sync = match db.get_subscription_with_last_sync(&sub.id) {
            Ok(Some((_, last_sync))) => last_sync,
            Ok(None) => {
                log::warn!("Subscription {} not found", sub.id);
                continue;
            }
            Err(e) => {
                log::error!("Failed to get last_sync for {}: {}", sub.id, e);
                continue;
            }
        };

        // Find server credentials
        let server = settings
            .servers
            .iter()
            .find(|s| s.url.trim_end_matches('/') == sub.server_url.trim_end_matches('/'));

        let (username, password) = match server {
            Some(s) => (s.username.as_deref(), s.password.as_deref()),
            None => (None, None),
        };

        log::info!(
            "Syncing notifications for {}/{} (since: {:?})",
            sub.server_url,
            sub.topic,
            last_sync
        );

        // Fetch messages from server
        let messages = match client
            .get_messages(&sub.server_url, &sub.topic, last_sync, username, password)
            .await
        {
            Ok(m) => m,
            Err(e) => {
                log::error!(
                    "Failed to fetch messages for {}/{}: {}",
                    sub.server_url,
                    sub.topic,
                    e
                );
                continue;
            }
        };

        if messages.is_empty() {
            log::info!("No new messages for {}/{}", sub.server_url, sub.topic);
        } else {
            log::info!(
                "Found {} new messages for {}/{}",
                messages.len(),
                sub.server_url,
                sub.topic
            );
        }

        let mut max_timestamp: i64 = last_sync.unwrap_or(0);

        // Insert new messages
        for msg in messages {
            // Check if already exists by ntfy_id
            if db.notification_exists_by_ntfy_id(&msg.id).unwrap_or(false) {
                continue;
            }

            // Convert ntfy actions to our NotificationAction format
            let actions: Vec<NotificationAction> = msg
                .actions
                .unwrap_or_default()
                .into_iter()
                .map(|a| NotificationAction {
                    id: a.id,
                    label: a.label,
                    url: a.url,
                    method: a.method,
                    clear: a.clear.unwrap_or(false),
                })
                .collect();

            // Convert ntfy attachment to our Attachment format
            let attachments: Vec<Attachment> = msg
                .attachment
                .map(|a| {
                    vec![Attachment {
                        id: uuid::Uuid::new_v4().to_string(),
                        name: a.name,
                        attachment_type: a.mime_type.unwrap_or_else(|| "application/octet-stream".to_string()),
                        url: a.url,
                        size: a.size,
                    }]
                })
                .unwrap_or_default();

            let notification = Notification {
                id: uuid::Uuid::new_v4().to_string(),
                topic_id: sub.id.clone(),
                title: msg.title.unwrap_or_default(),
                message: msg.message.unwrap_or_default(),
                priority: Priority::from(msg.priority.unwrap_or(3)),
                tags: msg.tags.unwrap_or_default(),
                timestamp: msg.time * 1000, // Convert to milliseconds
                actions,
                attachments,
                read: false,
            };

            if let Err(e) = db.insert_notification_with_ntfy_id(&notification, &msg.id) {
                log::error!("Failed to insert notification: {}", e);
            } else {
                log::info!("Inserted notification: {} - {}", notification.title, notification.message);
            }

            // Track max timestamp
            if msg.time > max_timestamp {
                max_timestamp = msg.time;
            }
        }

        // Update last_sync to current time (or max message time + 1 to avoid duplicates)
        let new_sync_time = std::cmp::max(max_timestamp + 1, chrono::Utc::now().timestamp());
        if let Err(e) = db.update_subscription_last_sync(&sub.id, new_sync_time) {
            log::error!("Failed to update last_sync for {}: {}", sub.id, e);
        }
    }

    log::info!("Notification sync completed");
}

/// Generate TypeScript bindings for all commands and types
#[cfg(debug_assertions)]
pub fn export_bindings() {
    use specta_typescript::{BigIntExportBehavior, Typescript};

    let builder = tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
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
    let ts_config = Typescript::default()
        .bigint(BigIntExportBehavior::Number);

    builder
        .export(ts_config, "../ui/src/types/bindings.ts")
        .expect("Failed to export TypeScript bindings");

    println!("TypeScript bindings exported to ../ui/src/types/bindings.ts");
}

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
                            if let Some(sub) = subscriptions.iter().find(|s| !s.muted && s.unread_count > 0) {
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
                sync_all_servers(&handle).await;

                // Notify frontend that subscriptions are synced
                log::info!("Emitting subscriptions:synced event");
                let _ = handle.emit("subscriptions:synced", ());

                // 2. Then sync notifications for all subscriptions (fetches missed messages)
                sync_all_notifications(&handle).await;

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

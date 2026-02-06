//! WebSocket connection management for real-time notifications.
//!
//! Maintains persistent WebSocket connections to ntfy servers for each subscription.
//! Handles automatic reconnection with exponential backoff on connection failures.

use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::StreamExt;
use pulldown_cmark::{Event, Parser, Tag, TagEnd};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{self, client::IntoClientRequest, http::HeaderValue, Message},
};

use crate::config::connection::{JITTER_MAX_SECS, RETRY_BACKOFF_SECS};
use crate::db::Database;
use crate::error::AppError;
#[cfg(windows)]
use crate::models::AppSettings;
use crate::models::{
    normalize_url, Notification, NotificationDisplayMethod, NtfyMessage, Subscription,
};
use crate::services::TrayManager;

/// Connection entry storing both the shutdown sender and a unique connection ID.
/// The ID is used to detect stale connections after a race condition.
struct ConnectionEntry {
    id: u64,
    shutdown_tx: mpsc::Sender<()>,
}

/// Manages WebSocket connections to ntfy servers.
///
/// Each subscription gets its own WebSocket connection that receives
/// real-time notifications. Connections automatically reconnect on failure
/// using exponential backoff with jitter.
pub struct ConnectionManager {
    app_handle: AppHandle,
    connections: Arc<RwLock<HashMap<String, ConnectionEntry>>>,
    next_connection_id: AtomicU64,
}

impl ConnectionManager {
    /// Creates a new connection manager.
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            connections: Arc::new(RwLock::new(HashMap::new())),
            next_connection_id: AtomicU64::new(1),
        }
    }

    /// Generates a unique connection ID.
    fn generate_connection_id(&self) -> u64 {
        self.next_connection_id.fetch_add(1, Ordering::Relaxed)
    }

    /// Builds HTTP Basic auth header for the given server URL if credentials exist.
    fn get_auth_header(&self, server_url: &str) -> Option<String> {
        let db: tauri::State<Database> = self.app_handle.state();
        let settings = db.get_settings().ok()?;

        // Normalize URLs for comparison (remove trailing slash)
        let normalized_url = normalize_url(server_url);
        let server = settings
            .servers
            .iter()
            .find(|s| s.url_matches(normalized_url));

        let Some(server) = server else {
            log::debug!(
                "No server found for URL '{}' (normalized: '{}'). Available servers: {:?}",
                server_url,
                normalized_url,
                settings.servers.iter().map(|s| &s.url).collect::<Vec<_>>()
            );
            return None;
        };

        let (Some(username), Some(password)) = (server.username.as_ref(), server.password.as_ref())
        else {
            log::debug!(
                "Server '{}' has no credentials (username: {}, password: {})",
                server.url,
                server.username.is_some(),
                server.password.is_some()
            );
            return None;
        };

        if username.is_empty() {
            log::debug!("Server '{}' has empty username", server.url);
            return None;
        }

        let credentials = format!("{username}:{password}");
        let encoded = STANDARD.encode(credentials.as_bytes());
        Some(format!("Basic {encoded}"))
    }

    /// Establishes a WebSocket connection for a subscription.
    ///
    /// If a connection already exists for this subscription, it will be closed first.
    /// The connection runs in a background task and automatically reconnects on failure.
    /// Uses connection IDs to detect and handle race conditions where multiple
    /// `connect()` calls happen in quick succession.
    pub async fn connect(&self, subscription: &Subscription) -> Result<(), AppError> {
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
        let connection_id = self.generate_connection_id();

        {
            let mut conns = self.connections.write().await;
            if let Some(old_entry) = conns.remove(&subscription.id) {
                let _ = old_entry.shutdown_tx.send(()).await;
            }
            conns.insert(
                subscription.id.clone(),
                ConnectionEntry {
                    id: connection_id,
                    shutdown_tx,
                },
            );
        }

        let ws_url = Self::build_ws_url(subscription)?;
        let sub_id = subscription.id.clone();
        let is_muted = subscription.muted;
        let app_handle = self.app_handle.clone();
        let connections = Arc::clone(&self.connections);

        let auth_header = self.get_auth_header(&subscription.server_url);

        tokio::spawn(async move {
            let mut reconnect_attempt: usize = 0;

            loop {
                // Check if this connection is still the current one (race condition protection)
                {
                    let conns = connections.read().await;
                    let is_current = conns
                        .get(&sub_id)
                        .is_some_and(|entry| entry.id == connection_id);
                    if !is_current {
                        log::info!(
                            "Connection {connection_id} for {sub_id} is no longer current, stopping"
                        );
                        return;
                    }
                }

                log::info!("Connecting to WebSocket: {ws_url}");

                let connect_result = if let Some(ref auth) = auth_header {
                    match ws_url.as_str().into_client_request() {
                        Ok(mut request) => match HeaderValue::from_str(auth) {
                            Ok(header_value) => {
                                request.headers_mut().insert("Authorization", header_value);
                                log::info!("Using auth header for WebSocket connection");
                                connect_async(request).await
                            }
                            Err(e) => {
                                log::error!("Invalid Authorization header: {e}");
                                Err(tungstenite::Error::Io(std::io::Error::new(
                                    std::io::ErrorKind::InvalidInput,
                                    "Invalid auth header",
                                )))
                            }
                        },
                        Err(e) => {
                            log::error!("Invalid WebSocket URL {ws_url}: {e}");
                            Err(tungstenite::Error::Io(std::io::Error::new(
                                std::io::ErrorKind::InvalidInput,
                                "Invalid WebSocket URL",
                            )))
                        }
                    }
                } else {
                    log::info!("No auth header for WebSocket connection");
                    connect_async(&ws_url).await
                };

                match connect_result {
                    Ok((ws_stream, _)) => {
                        log::info!("Connected to {ws_url}");
                        // Reset backoff on successful connection
                        reconnect_attempt = 0;
                        let (_write, mut read) = ws_stream.split();

                        loop {
                            tokio::select! {
                                msg = read.next() => {
                                    match msg {
                                        Some(Ok(Message::Text(text))) => {
                                            if let Ok(ntfy_msg) = serde_json::from_str::<NtfyMessage>(&text) {
                                                if ntfy_msg.event == "message" {
                                                    Self::handle_notification(
                                                        &app_handle,
                                                        &sub_id,
                                                        ntfy_msg,
                                                        is_muted,
                                                    ).await;
                                                }
                                            }
                                        }
                                        Some(Err(e)) => {
                                            log::error!("WebSocket error: {e}");
                                            break;
                                        }
                                        None => {
                                            log::info!("WebSocket closed");
                                            break;
                                        }
                                        _ => {}
                                    }
                                }
                                _ = shutdown_rx.recv() => {
                                    log::info!("Shutting down connection for {sub_id}");
                                    return;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to connect to {ws_url}: {e}");
                    }
                }

                // Exponential backoff with jitter
                let delay = RETRY_BACKOFF_SECS[reconnect_attempt.min(RETRY_BACKOFF_SECS.len() - 1)];
                let jitter = rand::random::<u64>() % JITTER_MAX_SECS;
                let total_delay = delay + jitter;

                log::info!(
                    "Reconnecting in {} seconds (attempt {})...",
                    total_delay,
                    reconnect_attempt + 1
                );
                tokio::time::sleep(std::time::Duration::from_secs(total_delay)).await;
                reconnect_attempt = (reconnect_attempt + 1).min(RETRY_BACKOFF_SECS.len() - 1);
            }
        });

        Ok(())
    }

    /// Closes the WebSocket connection for a subscription.
    pub async fn disconnect(&self, subscription_id: &str) {
        let mut conns = self.connections.write().await;
        if let Some(entry) = conns.remove(subscription_id) {
            let _ = entry.shutdown_tx.send(()).await;
        }
    }

    /// Closes all WebSocket connections for subscriptions on a given server.
    pub async fn disconnect_server(&self, server_url: &str) {
        let db: tauri::State<Database> = self.app_handle.state();
        if let Ok(subs) = db.get_all_subscriptions() {
            for sub in subs {
                if sub.server_url_matches(server_url) {
                    self.disconnect(&sub.id).await;
                }
            }
        }
    }

    /// Establishes WebSocket connections for all subscriptions.
    pub async fn connect_all(&self) {
        let db: tauri::State<Database> = self.app_handle.state();
        if let Ok(subscriptions) = db.get_all_subscriptions() {
            for sub in subscriptions {
                if let Err(e) = self.connect(&sub).await {
                    log::error!("Failed to connect subscription {}: {}", sub.id, e);
                }
            }
        }
    }

    /// Converts HTTP(S) URL to WebSocket URL for the subscription's topic.
    fn build_ws_url(subscription: &Subscription) -> Result<String, AppError> {
        let base_url = &subscription.server_url;
        let topic = &subscription.topic;

        let ws_url = if base_url.starts_with("https://") {
            format!("wss://{}/{}/ws", &base_url[8..], topic)
        } else if base_url.starts_with("http://") {
            format!("ws://{}/{}/ws", &base_url[7..], topic)
        } else {
            format!("wss://{base_url}/{topic}/ws")
        };

        Ok(ws_url)
    }

    async fn handle_notification(
        app_handle: &AppHandle,
        subscription_id: &str,
        ntfy_msg: NtfyMessage,
        is_muted: bool,
    ) {
        let db: tauri::State<Database> = app_handle.state();

        // Check if notification already exists by ntfy_id to prevent duplicates
        if db
            .notification_exists_by_ntfy_id(ntfy_msg.ntfy_id())
            .unwrap_or(false)
        {
            log::debug!(
                "Notification {} already exists, skipping",
                ntfy_msg.ntfy_id()
            );
            return;
        }

        let ntfy_id = ntfy_msg.ntfy_id().to_string();
        let notification = ntfy_msg.into_notification(subscription_id.to_string());

        if let Err(e) = db.insert_notification_with_ntfy_id(&notification, &ntfy_id) {
            log::error!("Failed to save notification: {e}");
        }

        if let Err(e) = app_handle.emit("notification:new", &notification) {
            log::error!("Failed to emit notification event: {e}");
        }

        // Update tray icon to show unread badge
        let tray_manager: tauri::State<TrayManager> = app_handle.state();
        tray_manager.refresh_from_db(app_handle).await;

        if !is_muted {
            let handle = app_handle.clone();
            let notif = notification.clone();
            tokio::spawn(async move {
                Self::show_notification(&handle, &notif).await;
            });
        }
    }

    /// Shows a notification using the configured display method.
    pub async fn show_notification(app_handle: &AppHandle, notification: &Notification) {
        let db: tauri::State<'_, Database> = app_handle.state();
        let Ok(settings) = db.get_settings() else {
            // Fallback to native if settings can't be read
            Self::show_native_notification(app_handle, notification, None);
            return;
        };

        match settings.notification_method {
            NotificationDisplayMethod::Native => {
                Self::show_native_notification(app_handle, notification, Some(&settings));
            }
            #[cfg(windows)]
            NotificationDisplayMethod::WindowsEnhanced => {
                Self::show_winrt_notification(app_handle, notification, &settings).await;
            }
            #[cfg(not(windows))]
            NotificationDisplayMethod::WindowsEnhanced => {
                // Fallback to native on non-Windows platforms
                Self::show_native_notification(app_handle, notification, Some(&settings));
            }
        }
    }

    /// Sanitizes text for Windows notification display by extracting plain text from markdown.
    ///
    /// Uses pulldown-cmark to parse markdown and extract only the text content,
    /// ignoring images and autolinks (URLs).
    fn sanitize_for_notification(text: &str) -> String {
        let parser = Parser::new(text);
        let mut result = String::new();
        let mut skip_until_end: Option<TagEnd> = None;

        for event in parser {
            // Skip content inside images (alt text)
            if let Some(ref end_tag) = skip_until_end {
                if let Event::End(tag) = &event {
                    if tag == end_tag {
                        skip_until_end = None;
                    }
                }
                continue;
            }

            match event {
                // Skip images entirely (including alt text)
                Event::Start(Tag::Image { .. }) => {
                    skip_until_end = Some(TagEnd::Image);
                }
                // Extract text content
                Event::Text(text) => {
                    if !result.is_empty() && !result.ends_with(' ') {
                        result.push(' ');
                    }
                    result.push_str(&text);
                }
                // Include inline code content
                Event::Code(code) => {
                    if !result.is_empty() && !result.ends_with(' ') {
                        result.push(' ');
                    }
                    result.push_str(&code);
                }
                // Add space after blocks
                Event::End(
                    TagEnd::Paragraph | TagEnd::Heading(_) | TagEnd::Item | TagEnd::BlockQuote(_),
                ) => {
                    if !result.is_empty() && !result.ends_with(' ') {
                        result.push(' ');
                    }
                }
                _ => {}
            }
        }

        // Normalize whitespace and trim
        result.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    fn show_native_notification(
        app_handle: &AppHandle,
        notification: &Notification,
        settings: Option<&AppSettings>,
    ) {
        use tauri_plugin_notification::NotificationExt;

        let title = if notification.title.is_empty() {
            "New notification".to_string()
        } else {
            Self::sanitize_for_notification(&notification.title)
        };

        let mut builder = app_handle
            .notification()
            .builder()
            .title(&title)
            .body(&notification.message);

        // Add sound for notifications with priority >= Default (3) to ensure Windows shows them as toast popups
        // Respect notification_sound setting (defaults to true if settings unavailable)
        let sound_enabled = settings.map_or(true, |s| s.notification_sound);
        if sound_enabled && notification.priority as i32 >= 3 {
            builder = builder.sound("Default");
        }

        let _ = builder.show();
    }

    /// Shows a Windows enhanced notification using `WinRT` APIs.
    ///
    /// Features:
    /// - Force display option (ignores Focus Assist)
    /// - Action buttons from ntfy
    /// - Priority-based duration and sound
    /// - Hero images from attachments or markdown (landscape images above text)
    /// - Inline images for portrait orientation (below text, properly centered)
    #[cfg(windows)]
    async fn show_winrt_notification(
        app_handle: &AppHandle,
        notification: &Notification,
        settings: &AppSettings,
    ) {
        use crate::services::image_cache::{self, CachedImage};

        // Download image first (async), before creating Toast (which is not Send)
        let cached_image: Option<CachedImage> = if settings.notification_show_images {
            image_cache::get_notification_image(&notification.attachments, &notification.message)
                .await
        } else {
            None
        };

        // Now create and show the toast (sync part)
        Self::show_winrt_notification_sync(app_handle, notification, settings, cached_image);
    }

    /// Synchronous part of `WinRT` notification display.
    ///
    /// Separated from async to avoid Send issues with Toast type.
    #[cfg(windows)]
    fn show_winrt_notification_sync(
        app_handle: &AppHandle,
        notification: &Notification,
        settings: &AppSettings,
        cached_image: Option<crate::services::image_cache::CachedImage>,
    ) {
        use crate::services::image_cache::ImageOrientation;
        use tauri_winrt_notification::{Duration, Scenario, Sound, Toast};

        let title = if notification.title.is_empty() {
            "New notification"
        } else {
            &notification.title
        };

        // Get the app's AUMID (Application User Model ID)
        // Tauri apps use the bundle identifier from tauri.conf.json
        let aumid = app_handle.config().identifier.as_str();

        let mut toast = Toast::new(aumid)
            .title(&Self::sanitize_for_notification(title))
            .text1(&Self::sanitize_for_notification(&notification.message));

        // Force display - ignores Focus Assist using Scenario::Alarm
        if settings.notification_force_display {
            toast = toast.scenario(Scenario::Alarm);
        }

        // Duration based on priority
        if notification.priority as i32 >= 4 {
            toast = toast.duration(Duration::Long);
        }

        // Sound based on priority (only if notification_sound is enabled)
        if settings.notification_sound {
            let sound = if notification.priority as i32 >= 4 {
                Some(Sound::SMS) // Louder sound for high priority
            } else if notification.priority as i32 >= 3 {
                Some(Sound::Default)
            } else {
                None
            };
            if let Some(s) = sound {
                toast = toast.sound(Some(s));
            }
        }

        // Action buttons from ntfy (max 3 buttons supported by Windows)
        if settings.notification_show_actions && !notification.actions.is_empty() {
            for action in notification.actions.iter().take(3) {
                if let Some(ref url) = action.url {
                    toast = toast.add_button(&action.label, url);
                }
            }
        }

        // Image display based on orientation:
        // - Landscape/square images: use hero() for prominent display above text
        // - Portrait images: use image() for inline display below text (avoids cropping)
        if let Some(ref cached) = cached_image {
            match cached.orientation {
                ImageOrientation::Landscape => {
                    // Hero image above text - ideal for landscape images
                    toast = toast.hero(&cached.path, "");
                }
                ImageOrientation::Portrait => {
                    // Inline image below text - better for portrait images
                    // Windows will display it centered and properly scaled
                    toast = toast.image(&cached.path, "");
                }
            }
        }

        if let Err(e) = toast.show() {
            log::error!("Failed to show WinRT notification: {e}");
            // Fallback to native notification on error
            Self::show_native_notification(app_handle, notification, Some(settings));
        }
    }
}

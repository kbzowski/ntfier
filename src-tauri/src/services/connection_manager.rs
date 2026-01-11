//! WebSocket connection management for real-time notifications.
//!
//! Maintains persistent WebSocket connections to ntfy servers for each subscription.
//! Handles automatic reconnection with exponential backoff on connection failures.

use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::StreamExt;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, Message},
};

use crate::config::connection::{JITTER_MAX_SECS, RETRY_BACKOFF_SECS};
use crate::db::Database;
use crate::error::AppError;
use crate::models::{normalize_url, Notification, NtfyMessage, Subscription};
use crate::services::TrayManager;

/// Manages WebSocket connections to ntfy servers.
///
/// Each subscription gets its own WebSocket connection that receives
/// real-time notifications. Connections automatically reconnect on failure
/// using exponential backoff with jitter.
pub struct ConnectionManager {
    app_handle: AppHandle,
    connections: Arc<RwLock<HashMap<String, mpsc::Sender<()>>>>,
}

impl ConnectionManager {
    /// Creates a new connection manager.
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
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

        let credentials = format!("{}:{}", username, password);
        let encoded = STANDARD.encode(credentials.as_bytes());
        Some(format!("Basic {}", encoded))
    }

    /// Establishes a WebSocket connection for a subscription.
    ///
    /// If a connection already exists for this subscription, it will be closed first.
    /// The connection runs in a background task and automatically reconnects on failure.
    pub async fn connect(&self, subscription: &Subscription) -> Result<(), AppError> {
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

        {
            let mut conns = self.connections.write().await;
            if let Some(old_tx) = conns.remove(&subscription.id) {
                let _ = old_tx.send(()).await;
            }
            conns.insert(subscription.id.clone(), shutdown_tx);
        }

        let ws_url = Self::build_ws_url(subscription)?;
        let sub_id = subscription.id.clone();
        let is_muted = subscription.muted;
        let app_handle = self.app_handle.clone();

        let auth_header = self.get_auth_header(&subscription.server_url);

        tokio::spawn(async move {
            let mut reconnect_attempt: usize = 0;

            loop {
                log::info!("Connecting to WebSocket: {}", ws_url);

                let connect_result = if let Some(ref auth) = auth_header {
                    let Ok(mut request) = ws_url.as_str().into_client_request() else {
                        log::error!("Failed to create WebSocket request for URL: {}", ws_url);
                        continue;
                    };
                    let Ok(header_value) = HeaderValue::from_str(auth) else {
                        log::error!("Failed to create Authorization header value");
                        continue;
                    };
                    request.headers_mut().insert("Authorization", header_value);
                    log::info!("Using auth header for WebSocket connection");
                    connect_async(request).await
                } else {
                    log::info!("No auth header for WebSocket connection");
                    connect_async(&ws_url).await
                };

                match connect_result {
                    Ok((ws_stream, _)) => {
                        log::info!("Connected to {}", ws_url);
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
                                            log::error!("WebSocket error: {}", e);
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
                                    log::info!("Shutting down connection for {}", sub_id);
                                    return;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to connect to {}: {}", ws_url, e);
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
        if let Some(tx) = conns.remove(subscription_id) {
            let _ = tx.send(()).await;
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
            format!("wss://{}/{}/ws", base_url, topic)
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
            log::error!("Failed to save notification: {}", e);
        }

        if let Err(e) = app_handle.emit("notification:new", &notification) {
            log::error!("Failed to emit notification event: {}", e);
        }

        // Update tray icon to show unread badge
        let tray_manager: tauri::State<TrayManager> = app_handle.state();
        tray_manager.refresh_from_db(app_handle).await;

        if !is_muted {
            Self::show_native_notification(app_handle, &notification);
        }
    }

    fn show_native_notification(app_handle: &AppHandle, notification: &Notification) {
        use tauri_plugin_notification::NotificationExt;

        let title = if notification.title.is_empty() {
            "New notification"
        } else {
            &notification.title
        };

        let _ = app_handle
            .notification()
            .builder()
            .title(title)
            .body(&notification.message)
            .show();
    }
}

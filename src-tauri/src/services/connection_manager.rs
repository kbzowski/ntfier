//! WebSocket connection management for real-time notifications.
//!
//! Maintains persistent WebSocket connections to ntfy servers for each subscription.
//! Handles automatic reconnection with exponential backoff on connection failures.

use futures_util::StreamExt;
use pulldown_cmark::{Event, Parser, Tag, TagEnd};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::ClientRequestBuilder, http::Uri, Error as WsError, Message},
};
use url::Url;

use crate::config::connection::{
    CATCH_UP_TOAST_MAX_AGE_SECS, FORBIDDEN_RETRY_SECS, JITTER_MAX_SECS, READ_TIMEOUT_SECS,
    RETRY_BACKOFF_SECS,
};
use crate::db::Database;
use crate::error::AppError;
use crate::models::{
    is_ignored, Notification, NotificationDisplayMethod, NotificationSettings, NtfyMessage,
    ServerStatus, ServerStatusEntry, Subscription, SubscriptionError,
};
use crate::services::ntfy_client::{VersionCheck, NO_TOPIC_ACCESS, RATE_LIMITED};
use crate::services::{text_attachment, url_opener, NtfyClient, SyncService, TrayManager};

/// Connection entry storing both the shutdown sender and a unique connection ID.
/// The ID is used to detect stale connections after a race condition.
struct ConnectionEntry {
    id: u64,
    shutdown_tx: mpsc::Sender<()>,
}

/// Key of a server's sync topic connection in the connection map, next to subscription ids.
fn sync_topic_key(server_url: &str) -> String {
    format!("sync-topic:{server_url}")
}

/// Whether a sync topic message is the server's "account changed" announcement:
/// a regular message whose body is `{"event":"sync"}`.
fn is_sync_announcement(text: &str) -> bool {
    serde_json::from_str::<NtfyMessage>(text)
        .ok()
        .filter(|m| m.event == "message")
        .and_then(|m| m.message)
        .and_then(|body| serde_json::from_str::<serde_json::Value>(&body).ok())
        .is_some_and(|body| body["event"] == "sync")
}

/// Servers that may not be connected to, keyed by canonical URL. Absent means ok.
type ServerStatuses = Arc<RwLock<HashMap<String, ServerStatus>>>;

/// Remembers each server's version check for this launch. Connection errors aren't
/// results, so they aren't cached and the caller retries.
#[derive(Clone, Default)]
struct VersionGate {
    results: Arc<RwLock<HashMap<String, VersionCheck>>>,
    /// One check per server at a time.
    locks: Arc<tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>>,
}

impl VersionGate {
    /// `Ok` when the server runs ntfy 2.17+, else `UnsupportedServer` with the reason.
    async fn ensure(&self, url: &str, auth: Option<&str>) -> Result<(), AppError> {
        if let Some(result) = self.results.read().await.get(url) {
            return Self::verdict(*result);
        }
        let lock = Arc::clone(self.locks.lock().await.entry(url.to_string()).or_default());
        let _guard = lock.lock().await;
        if let Some(result) = self.results.read().await.get(url) {
            return Self::verdict(*result);
        }

        let result = NtfyClient::new()?.check_server_version(url, auth).await?;
        self.results.write().await.insert(url.to_string(), result);
        Self::verdict(result)
    }

    fn verdict(result: VersionCheck) -> Result<(), AppError> {
        result
            .problem()
            .map_or(Ok(()), |m| Err(AppError::UnsupportedServer(m)))
    }

    async fn forget(&self, url: &str) {
        self.results.write().await.remove(url);
    }
}

/// Manages WebSocket connections to ntfy servers.
///
/// Each subscription gets its own WebSocket connection that receives
/// real-time notifications. Connections automatically reconnect on failure
/// using exponential backoff with jitter.
pub struct ConnectionManager {
    app_handle: AppHandle,
    connections: Arc<RwLock<HashMap<String, ConnectionEntry>>>,
    server_statuses: ServerStatuses,
    version_gate: VersionGate,
    next_connection_id: AtomicU64,
}

impl ConnectionManager {
    /// Creates a new connection manager.
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            connections: Arc::new(RwLock::new(HashMap::new())),
            server_statuses: Arc::new(RwLock::new(HashMap::new())),
            version_gate: VersionGate::default(),
            next_connection_id: AtomicU64::new(1),
        }
    }

    /// Generates a unique connection ID.
    fn generate_connection_id(&self) -> u64 {
        self.next_connection_id.fetch_add(1, Ordering::Relaxed)
    }

    /// The `Authorization` header for a server's current credential.
    fn auth_header(app_handle: &AppHandle, server_url: &str) -> Option<String> {
        let db: tauri::State<Database> = app_handle.state();
        db.get_servers_with_credentials()
            .ok()?
            .into_iter()
            .find(|s| s.url == server_url)?
            .auth_header()
    }

    /// Every server that is currently blocked from connecting.
    pub async fn server_statuses(&self) -> Vec<ServerStatusEntry> {
        self.server_statuses
            .read()
            .await
            .iter()
            .map(|(url, status)| ServerStatusEntry {
                url: url.clone(),
                status: status.clone(),
            })
            .collect()
    }

    /// Records a server's status and tells the UI.
    async fn set_server_status(
        app_handle: &AppHandle,
        statuses: &ServerStatuses,
        url: &str,
        status: ServerStatus,
    ) {
        {
            let mut map = statuses.write().await;
            if status == ServerStatus::Ok {
                map.remove(url);
            } else {
                map.insert(url.to_string(), status.clone());
            }
        }
        let entry = ServerStatusEntry {
            url: url.to_string(),
            status,
        };
        if let Err(e) = app_handle.emit("server:status", entry) {
            log::error!("Failed to emit server status: {e}");
        }
    }

    /// Flags a server so none of its subscriptions connect until it's edited.
    pub async fn block_server(&self, url: &str, status: ServerStatus) {
        Self::set_server_status(&self.app_handle, &self.server_statuses, url, status).await;
    }

    /// Fails with `UnsupportedServer` unless the server runs ntfy 2.17+, or is flagged.
    /// `auth` is the credential to check with (the server may not be saved yet).
    pub async fn ensure_supported(&self, url: &str, auth: Option<&str>) -> Result<(), AppError> {
        if let Some(ServerStatus::Unsupported { message }) =
            self.server_statuses.read().await.get(url)
        {
            return Err(AppError::UnsupportedServer(message.clone()));
        }
        self.version_gate.ensure(url, auth).await
    }

    /// Clears the server's status and reconnects all of its subscriptions, which picks up
    /// a changed credential. Each keeps its cursor.
    pub async fn reconnect_server(&self, url: &str) {
        self.version_gate.forget(url).await;
        // A new login may belong to another account; the next account sync re-watches
        self.disconnect(&sync_topic_key(url)).await;
        Self::set_server_status(
            &self.app_handle,
            &self.server_statuses,
            url,
            ServerStatus::Ok,
        )
        .await;
        let db: tauri::State<Database> = self.app_handle.state();
        if let Ok(subs) = db.get_all_subscriptions() {
            for sub in subs.iter().filter(|s| s.server_url == url) {
                if let Err(e) = self.connect(sub).await {
                    log::error!("Failed to reconnect {}: {e}", sub.id);
                }
            }
        }
    }

    /// Shows or clears the error on one subscription in the UI.
    fn report_subscription_error(app_handle: &AppHandle, id: &str, message: Option<String>) {
        let payload = SubscriptionError {
            id: id.to_string(),
            message,
        };
        if let Err(e) = app_handle.emit("subscription:error", payload) {
            log::error!("Failed to emit subscription error: {e}");
        }
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

        // Fail early on a bad URL; the loop rebuilds it with the current cursor
        Self::build_ws_url(&subscription.server_url, &subscription.topic, None)?;
        let sub_id = subscription.id.clone();
        let server_url = subscription.server_url.clone();
        let topic = subscription.topic.clone();
        let app_handle = self.app_handle.clone();
        let connections = Arc::clone(&self.connections);
        let statuses = Arc::clone(&self.server_statuses);
        let version_gate = self.version_gate.clone();

        tokio::spawn(async move {
            let mut reconnect_attempt: usize = 0;
            let read_timeout = Duration::from_secs(READ_TIMEOUT_SECS);
            let mut shown_error: Option<String> = None;
            let mut report = |message: Option<String>| {
                if message != shown_error {
                    Self::report_subscription_error(&app_handle, &sub_id, message.clone());
                    shown_error = message;
                }
            };

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

                // A flagged server (bad credential, too old) gets no retries until it's edited
                if statuses.read().await.contains_key(&server_url) {
                    log::info!("Server {server_url} is blocked, not connecting {sub_id}");
                    return;
                }

                // Resume from the newest stored message; a new subscription gets the whole cache
                let since = app_handle
                    .state::<Database>()
                    .get_message_cursor(&sub_id)
                    .ok()
                    .flatten();
                let ws_url = match Self::build_ws_url(&server_url, &topic, since) {
                    Ok(url) => url,
                    Err(e) => {
                        log::error!("Can't build WebSocket URL for {sub_id}: {e}");
                        return;
                    }
                };
                let ws_uri: Uri = match ws_url.parse() {
                    Ok(uri) => uri,
                    Err(e) => {
                        log::error!("Invalid WebSocket URL {ws_url}: {e}");
                        return;
                    }
                };

                log::info!("Connecting to WebSocket: {ws_url}");

                // Read every attempt so an edited credential applies on the next connect
                let auth = Self::auth_header(&app_handle, &server_url);
                let mut delay_secs = None;
                'attempt: {
                    // Runs once per server per launch (cached), before its first connect
                    match version_gate.ensure(&server_url, auth.as_deref()).await {
                        Ok(()) => {}
                        Err(AppError::UnsupportedServer(message)) => {
                            log::error!("{server_url}: {message}");
                            Self::set_server_status(
                                &app_handle,
                                &statuses,
                                &server_url,
                                ServerStatus::Unsupported { message },
                            )
                            .await;
                            return;
                        }
                        Err(AppError::Auth(_)) => {
                            Self::set_server_status(
                                &app_handle,
                                &statuses,
                                &server_url,
                                ServerStatus::NeedsCredentials,
                            )
                            .await;
                            return;
                        }
                        Err(e) => {
                            log::error!("Version check for {server_url} failed: {e}");
                            report(Some(format!("Can't connect: {e}")));
                            break 'attempt;
                        }
                    }

                    let mut request = ClientRequestBuilder::new(ws_uri);
                    if let Some(auth) = auth {
                        request = request.with_header("Authorization", auth);
                    }

                    match connect_async(request).await {
                        Ok((ws_stream, _)) => {
                            log::info!("Connected to {ws_url}");
                            report(None);
                            // Reset backoff on successful connection
                            reconnect_attempt = 0;
                            let (_write, mut read) = ws_stream.split();

                            loop {
                                tokio::select! {
                                    msg = tokio::time::timeout(read_timeout, read.next()) => {
                                        match msg {
                                            Err(_) => {
                                                log::warn!("Nothing from {ws_url} for {READ_TIMEOUT_SECS}s, reconnecting");
                                                break;
                                            }
                                            Ok(Some(Ok(Message::Text(text)))) => {
                                                if let Ok(ntfy_msg) = serde_json::from_str::<NtfyMessage>(&text) {
                                                    Self::receive_message(&app_handle, &sub_id, ntfy_msg).await;
                                                }
                                            }
                                            Ok(Some(Err(e))) => {
                                                log::error!("WebSocket error: {e}");
                                                break;
                                            }
                                            Ok(None) => {
                                                log::info!("WebSocket closed");
                                                break;
                                            }
                                            // Pings and other frames only prove the socket is alive
                                            Ok(Some(Ok(_))) => {}
                                        }
                                    }
                                    _ = shutdown_rx.recv() => {
                                        log::info!("Shutting down connection for {sub_id}");
                                        return;
                                    }
                                }
                            }
                        }
                        Err(WsError::Http(response)) if response.status() == 401 => {
                            // Retrying a bad credential gets the IP banned, so stop the whole server
                            log::error!(
                                "{server_url} rejected the credential, stopping its connections"
                            );
                            Self::set_server_status(
                                &app_handle,
                                &statuses,
                                &server_url,
                                ServerStatus::NeedsCredentials,
                            )
                            .await;
                            return;
                        }
                        Err(WsError::Http(response)) if response.status() == 403 => {
                            log::error!("No access to {ws_url}");
                            report(Some(NO_TOPIC_ACCESS.to_string()));
                            delay_secs = Some(FORBIDDEN_RETRY_SECS);
                        }
                        Err(WsError::Http(response)) if response.status() == 429 => {
                            log::error!("Rate limited by {server_url}");
                            report(Some(RATE_LIMITED.to_string()));
                        }
                        Err(e) => {
                            log::error!("Failed to connect to {ws_url}: {e}");
                            report(Some(format!("Can't connect: {e}")));
                        }
                    }
                }

                // Exponential backoff with jitter
                let delay = delay_secs.unwrap_or_else(|| {
                    RETRY_BACKOFF_SECS[reconnect_attempt.min(RETRY_BACKOFF_SECS.len() - 1)]
                });
                // ponytail: clock nanos are enough entropy to break up a thundering herd;
                // this is not a cryptographic path, so it doesn't warrant a rand dependency.
                let jitter = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_or(0, |d| u64::from(d.subsec_nanos()) % JITTER_MAX_SECS);
                let total_delay = delay + jitter;

                log::info!(
                    "Reconnecting in {} seconds (attempt {})...",
                    total_delay,
                    reconnect_attempt + 1
                );
                tokio::select! {
                    () = tokio::time::sleep(Duration::from_secs(total_delay)) => {}
                    _ = shutdown_rx.recv() => return,
                }
                reconnect_attempt = (reconnect_attempt + 1).min(RETRY_BACKOFF_SECS.len() - 1);
            }
        });

        Ok(())
    }

    /// Listens on the account's sync topic and runs an account sync whenever the server
    /// announces a change. A hidden connection, not a subscription: no messages are stored.
    /// Does nothing if the server is already being watched.
    pub fn watch_sync_topic(&self, server_url: &str, sync_topic: &str) {
        let key = sync_topic_key(server_url);
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
        let connection_id = self.generate_connection_id();
        let app_handle = self.app_handle.clone();
        let connections = Arc::clone(&self.connections);
        let statuses = Arc::clone(&self.server_statuses);
        let server_url = server_url.to_string();
        let sync_topic = sync_topic.to_string();

        // Not an async fn: account sync calls this and this task calls account sync,
        // and an async cycle like that can't be proven `Send`
        tokio::spawn(async move {
            {
                let mut conns = connections.write().await;
                if conns.contains_key(&key) {
                    return;
                }
                conns.insert(
                    key.clone(),
                    ConnectionEntry {
                        id: connection_id,
                        shutdown_tx,
                    },
                );
            }

            let mut attempt: usize = 0;
            loop {
                let is_current = connections
                    .read()
                    .await
                    .get(&key)
                    .is_some_and(|entry| entry.id == connection_id);
                if !is_current || statuses.read().await.contains_key(&server_url) {
                    return;
                }

                // Only announcements from now on matter, not old ones
                let since = chrono::Utc::now().timestamp();
                let Ok(ws_url) = Self::build_ws_url(&server_url, &sync_topic, Some(since)) else {
                    return;
                };
                let Ok(ws_uri) = ws_url.parse::<Uri>() else {
                    return;
                };
                let mut request = ClientRequestBuilder::new(ws_uri);
                if let Some(auth) = Self::auth_header(&app_handle, &server_url) {
                    request = request.with_header("Authorization", auth);
                }

                match connect_async(request).await {
                    Ok((ws_stream, _)) => {
                        attempt = 0;
                        let (_write, mut read) = ws_stream.split();
                        loop {
                            tokio::select! {
                                msg = tokio::time::timeout(Duration::from_secs(READ_TIMEOUT_SECS), read.next()) => {
                                    match msg {
                                        Ok(Some(Ok(Message::Text(text)))) => {
                                            if is_sync_announcement(&text) {
                                                let handle = app_handle.clone();
                                                let url = server_url.clone();
                                                tokio::spawn(async move {
                                                    if let Err(e) = SyncService::sync_account(&handle, &url).await {
                                                        log::error!("Account sync for {url} failed: {e}");
                                                    }
                                                });
                                            }
                                        }
                                        Ok(Some(Ok(_))) => {}
                                        _ => break,
                                    }
                                }
                                _ = shutdown_rx.recv() => return,
                            }
                        }
                    }
                    Err(e) => log::warn!("Can't watch the sync topic of {server_url}: {e}"),
                }

                let delay = RETRY_BACKOFF_SECS[attempt.min(RETRY_BACKOFF_SECS.len() - 1)];
                attempt += 1;
                tokio::select! {
                    () = tokio::time::sleep(Duration::from_secs(delay)) => {}
                    _ = shutdown_rx.recv() => return,
                }
            }
        });
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
                if sub.server_url == server_url {
                    self.disconnect(&sub.id).await;
                }
            }
        }
        self.disconnect(&sync_topic_key(server_url)).await;
        // Removed or edited: its old status no longer applies
        self.server_statuses.write().await.remove(server_url);
        self.version_gate.forget(server_url).await;
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

    /// Builds the topic's WebSocket URL, resuming at `since` (ntfy seconds, inclusive)
    /// or replaying everything the server has cached when there's no cursor yet.
    pub(crate) fn build_ws_url(
        server_url: &str,
        topic: &str,
        since: Option<i64>,
    ) -> Result<String, AppError> {
        let mut parsed = Url::parse(server_url)
            .map_err(|e| AppError::InvalidUrl(format!("Invalid server URL: {e}")))?;

        let ws_scheme = match parsed.scheme() {
            "https" => "wss",
            "http" => "ws",
            s => return Err(AppError::InvalidUrl(format!("Unsupported URL scheme: {s}"))),
        };
        parsed
            .set_scheme(ws_scheme)
            .map_err(|()| AppError::InvalidUrl("Failed to set WebSocket scheme".to_string()))?;

        let path = format!("{}/{topic}/ws", parsed.path().trim_end_matches('/'));
        parsed.set_path(&path);
        let since = since.map_or_else(|| "all".to_string(), |t| t.to_string());
        parsed.set_query(Some(&format!("since={since}")));

        Ok(parsed.to_string())
    }

    /// Whether a received message is recent enough to toast. Live messages always are;
    /// catch-up older than `CATCH_UP_TOAST_MAX_AGE_SECS` goes into the list silently.
    // shortcut: compares the server's message time with our clock, so a server clock more
    // than 10 min off also silences live toasts; tell live and replayed apart if that bites.
    const fn should_toast(msg_time: i64, now: i64) -> bool {
        now - msg_time < CATCH_UP_TOAST_MAX_AGE_SECS
    }

    /// The one receive path for every message: live, catch-up, backfill and manual sync.
    ///
    /// Stores it (ignoring duplicates and tombstones), moves the cursor, tells the UI
    /// and shows a toast when it's fresh, unmuted and not ignored. Server deletes and
    /// clears apply to the message's sequence and aren't stored.
    pub async fn receive_message(app_handle: &AppHandle, subscription_id: &str, msg: NtfyMessage) {
        let db: tauri::State<Database> = app_handle.state();

        let applied = match msg.event.as_str() {
            "message" => None,
            "message_delete" => {
                Some(db.delete_sequence(subscription_id, msg.sequence_id(), msg.time * 1000))
            }
            "message_clear" => {
                Some(db.clear_sequence(subscription_id, msg.sequence_id(), msg.time * 1000))
            }
            _ => return,
        };
        if let Some(result) = applied {
            if let Err(e) = result {
                log::error!("Failed to apply {} for {subscription_id}: {e}", msg.event);
                return;
            }
            Self::remove_toast(app_handle, subscription_id, msg.sequence_id());
            let _ = db.advance_message_cursor(subscription_id, msg.time);
            Self::subscription_changed(app_handle, subscription_id).await;
            return;
        }

        // An update (or a message with its own sequence id) can replace a shown version
        let is_update = msg.sequence_id.as_ref().is_some_and(|s| *s != msg.id);
        let sequence_id = msg.sequence_id().to_string();

        // Read per message so a mute toggled after connect applies right away
        let Some(subscription) = db.get_subscription_by_id(subscription_id).ok().flatten() else {
            return;
        };
        let is_muted = subscription.muted;

        let msg_time = msg.time;
        let ntfy_id = msg.ntfy_id().to_string();
        let mut notification = msg.into_notification(subscription_id.to_string());
        let own_files = format!("{}/file/", subscription.server_url);
        for attachment in &mut notification.attachments {
            attachment.external = !attachment.url.starts_with(&own_files);
        }

        // A body the server moved into a .txt file: fetch it once (not on replays)
        let now = chrono::Utc::now().timestamp();
        if let Some(url) =
            text_attachment::inline_candidate(&notification, &subscription.server_url, now)
                .map(str::to_string)
        {
            if !db.notification_exists(&ntfy_id).unwrap_or(true) {
                if let Some(text) = text_attachment::fetch(&url).await {
                    notification.message = text;
                    notification.attachments.clear();
                }
            }
        }

        // Auto-mark as read for muted topics
        if is_muted {
            notification.read = true;
        }

        let rules = db.get_ignore_rules().unwrap_or_default();
        let ignored = is_ignored(&notification.title, &notification.topic_id, &rules);
        notification.ignored = ignored;

        let inserted =
            match db.insert_notification_with_ntfy_id(&notification, &ntfy_id, &sequence_id) {
                Ok(inserted) => inserted,
                Err(e) => {
                    // Cursor stays put so the next connect asks for this message again
                    log::error!("Failed to save notification: {e}");
                    return;
                }
            };
        if let Err(e) = db.advance_message_cursor(subscription_id, msg_time) {
            log::error!("Failed to move cursor for {subscription_id}: {e}");
        }
        if !inserted {
            log::debug!("Notification {ntfy_id} already stored, skipping");
            return;
        }
        // Stored with all tags; the UI and toast get emoji tags as emoji
        let notification = notification.with_emojis();

        if is_update {
            Self::subscription_changed(app_handle, subscription_id).await;
        } else {
            if let Err(e) = app_handle.emit("notification:new", &notification) {
                log::error!("Failed to emit notification event: {e}");
            }
            // Update tray icon to show unread badge
            let tray_manager: tauri::State<TrayManager> = app_handle.state();
            tray_manager.refresh_from_db(app_handle).await;
        }

        if !is_muted && !ignored && Self::should_toast(msg_time, chrono::Utc::now().timestamp()) {
            let handle = app_handle.clone();
            tokio::spawn(async move {
                Self::show_notification(&handle, &notification).await;
            });
        }
    }

    /// Tells the UI to reload a subscription whose stored messages changed in place.
    async fn subscription_changed(app_handle: &AppHandle, subscription_id: &str) {
        if let Err(e) = app_handle.emit("subscription:changed", subscription_id) {
            log::error!("Failed to emit subscription change: {e}");
        }
        let tray_manager: tauri::State<TrayManager> = app_handle.state();
        tray_manager.refresh_from_db(app_handle).await;
    }

    /// Shows a notification using the configured display method.
    pub async fn show_notification(app_handle: &AppHandle, notification: &Notification) {
        let db: tauri::State<'_, Database> = app_handle.state();
        let topic_name = db
            .get_subscription_by_id(&notification.topic_id)
            .ok()
            .flatten()
            .map(|s| s.display_name.unwrap_or(s.topic))
            .unwrap_or_default();
        let text = ToastText {
            title: notification.display_title(&topic_name),
            body: if notification.markdown {
                Self::sanitize_for_notification(&notification.message)
            } else {
                notification.message.clone()
            },
        };

        let Ok(settings) = db.get_notification_settings() else {
            // Fallback to native if settings can't be read
            Self::show_native_notification(app_handle, notification, &text, None);
            return;
        };

        match settings.notification_method {
            NotificationDisplayMethod::Native => {
                Self::show_native_notification(app_handle, notification, &text, Some(&settings));
            }
            #[cfg(windows)]
            NotificationDisplayMethod::WindowsEnhanced => {
                Self::show_winrt_notification(app_handle, notification, &text, &settings).await;
            }
            #[cfg(not(windows))]
            NotificationDisplayMethod::WindowsEnhanced => {
                // Fallback to native on non-Windows platforms
                Self::show_native_notification(app_handle, notification, &text, Some(&settings));
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
        text: &ToastText,
        settings: Option<&NotificationSettings>,
    ) {
        use tauri_plugin_notification::NotificationExt;

        let mut builder = app_handle
            .notification()
            .builder()
            .title(&text.title)
            .body(&text.body);

        // Add sound for notifications with priority >= Default (3) to ensure Windows shows them as toast popups
        // Respect notification_sound setting (defaults to true if settings unavailable)
        let sound_enabled = settings.is_none_or(|s| s.notification_sound);
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
    /// - Hero image from an image attachment (landscape above text, portrait below)
    /// - The message's icon as the app logo
    #[cfg(windows)]
    async fn show_winrt_notification(
        app_handle: &AppHandle,
        notification: &Notification,
        text: &ToastText,
        settings: &NotificationSettings,
    ) {
        use crate::services::image_cache;

        // Download images first (async), before creating Toast (which is not Send)
        let (image, icon) = if settings.notification_show_images {
            let icon = match notification.icon.as_deref() {
                Some(url) => image_cache::download_and_cache_image(url).await,
                None => None,
            };
            (
                image_cache::get_notification_image(&notification.attachments).await,
                icon,
            )
        } else {
            (None, None)
        };

        // Now create and show the toast (sync part)
        Self::show_winrt_notification_sync(app_handle, notification, text, settings, image, icon);
    }

    /// The toast sound for a priority, or `None` for silence.
    #[cfg(windows)]
    const fn select_toast_sound(sound_enabled: bool, priority: i32) -> Option<&'static str> {
        if !sound_enabled {
            return None;
        }
        if priority >= 4 {
            Some("ms-winsoundevent:Notification.SMS")
        } else if priority >= 3 {
            Some("ms-winsoundevent:Notification.Default")
        } else {
            None
        }
    }

    /// Synchronous part of the Windows toast (the `WinRT` objects aren't `Send`).
    #[cfg(windows)]
    fn show_winrt_notification_sync(
        app_handle: &AppHandle,
        notification: &Notification,
        text: &ToastText,
        settings: &NotificationSettings,
        cached_image: Option<crate::services::image_cache::CachedImage>,
        icon: Option<crate::services::image_cache::CachedImage>,
    ) {
        use crate::services::image_cache::ImageOrientation;
        use crate::services::toast::{self, ToastButton, ToastContent};

        // Landscape images go above the text, portrait ones below it (no cropping)
        let (hero_image, inline_image) = match &cached_image {
            Some(c) if matches!(c.orientation, ImageOrientation::Landscape) => {
                (Some(c.path.as_path()), None)
            }
            Some(c) => (None, Some(c.path.as_path())),
            None => (None, None),
        };

        let buttons = if settings.notification_show_actions {
            notification
                .actions
                .iter()
                .filter_map(|a| {
                    a.url.as_ref().map(|url| ToastButton {
                        label: a.label.clone(),
                        arguments: url.clone(),
                        protocol: true,
                    })
                })
                .collect()
        } else {
            Vec::new()
        };

        let sequence_id = notification
            .sequence_id
            .as_deref()
            .unwrap_or(&notification.id);
        let content = ToastContent {
            tag: sequence_id,
            group: &notification.topic_id,
            title: &text.title,
            body: &text.body,
            hero_image,
            inline_image,
            app_logo: icon.as_ref().map(|i| i.path.as_path()),
            buttons,
            clickable: notification.click.is_some(),
            alarm: settings.notification_force_display,
            long: notification.priority as i32 >= 4,
            sound: Self::select_toast_sound(
                settings.notification_sound,
                notification.priority as i32,
            ),
        };

        let click = notification.click.clone();
        let on_activated = move |arguments: String| {
            if arguments == toast::CLICK_ARGUMENT {
                if let Some(url) = &click {
                    if let Err(e) = url_opener::open_url(url) {
                        log::error!("Toast click: {e}");
                    }
                }
            }
        };

        let aumid = app_handle.config().identifier.as_str();
        if let Err(e) = toast::show(aumid, &content, on_activated) {
            log::error!("Failed to show Windows toast: {e}");
            Self::show_native_notification(app_handle, notification, text, Some(settings));
        }
    }

    /// Removes the toast of a message's sequence, if one is shown.
    fn remove_toast(app_handle: &AppHandle, subscription_id: &str, sequence_id: &str) {
        #[cfg(windows)]
        if let Err(e) = crate::services::toast::remove(
            app_handle.config().identifier.as_str(),
            sequence_id,
            subscription_id,
        ) {
            log::debug!("No toast removed for {sequence_id}: {e}");
        }
        #[cfg(not(windows))]
        let _ = (app_handle, subscription_id, sequence_id);
    }
}

/// What a toast says, worked out once for both toast kinds.
struct ToastText {
    /// Tag emoji and the title, or the topic name when there's no title.
    title: String,
    /// Markdown messages as plain text, everything else as sent.
    body: String,
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::services::test_server;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;

    #[test]
    fn ws_url_resumes_from_cursor() {
        assert_eq!(
            ConnectionManager::build_ws_url("https://ntfy.sh", "alerts", Some(1_700_000_000))
                .unwrap(),
            "wss://ntfy.sh/alerts/ws?since=1700000000"
        );
        assert_eq!(
            ConnectionManager::build_ws_url("http://host:8080/ntfy", "a", None).unwrap(),
            "ws://host:8080/ntfy/a/ws?since=all"
        );
    }

    #[test]
    fn recognizes_sync_announcement() {
        let sync = r#"{"id":"a","time":1,"event":"message","topic":"st_x","message":"{\"event\":\"sync\"}"}"#;
        let other = r#"{"id":"b","time":1,"event":"message","topic":"st_x","message":"hello"}"#;
        assert!(is_sync_announcement(sync));
        assert!(!is_sync_announcement(other));
    }

    #[test]
    fn only_fresh_messages_toast() {
        let now = 1_000_000;
        assert!(ConnectionManager::should_toast(now, now));
        assert!(ConnectionManager::should_toast(now - 599, now));
        assert!(!ConnectionManager::should_toast(now - 600, now));
    }

    /// Reads the next `count` events other than open/keepalive from a topic's WebSocket.
    pub async fn read_ws(
        url: &str,
        topic: &str,
        since: Option<i64>,
        count: usize,
    ) -> Vec<NtfyMessage> {
        let ws_url = ConnectionManager::build_ws_url(url, topic, since).unwrap();
        let request = ws_url.into_client_request().unwrap();
        let (mut stream, _) = connect_async(request).await.unwrap();
        let mut got = Vec::new();
        while got.len() < count {
            let frame = tokio::time::timeout(std::time::Duration::from_secs(5), stream.next())
                .await
                .expect("timed out waiting for message")
                .unwrap()
                .unwrap();
            if let Message::Text(text) = frame {
                let msg: NtfyMessage = serde_json::from_str(&text).unwrap();
                if msg.event != "open" && msg.event != "keepalive" {
                    got.push(msg);
                }
            }
        }
        got
    }

    #[tokio::test]
    async fn ws_since_replays_inclusive() {
        let Some(url) = test_server::url() else {
            return;
        };
        let topic = test_server::unique_topic("resume");
        let first = test_server::publish(&url, &topic, "one", &[]).await;
        test_server::publish(&url, &topic, "two", &[]).await;
        let first_time = first["time"].as_i64().unwrap();

        for since in [Some(first_time), None] {
            let got = read_ws(&url, &topic, since, 2).await;
            let bodies: Vec<_> = got.iter().map(|m| m.message.as_deref().unwrap()).collect();
            assert_eq!(bodies, ["one", "two"], "since={since:?}");
        }
    }

    #[tokio::test]
    async fn locked_topic_is_403_on_ws_connect() {
        let Some(url) = test_server::url() else {
            return;
        };
        let ws_url =
            ConnectionManager::build_ws_url(&url, test_server::LOCKED_TOPIC, None).unwrap();
        let auth = crate::models::ServerConfig {
            url: url.clone(),
            username: Some(test_server::USER.to_string()),
            password: Some(test_server::PASS.to_string()),
            token: None,
            is_default: false,
        }
        .auth_header()
        .unwrap();
        let request =
            ClientRequestBuilder::new(ws_url.parse().unwrap()).with_header("Authorization", auth);
        match connect_async(request).await {
            Err(WsError::Http(response)) => assert_eq!(response.status(), 403),
            other => panic!("expected 403, got {:?}", other.map(|_| ())),
        }
    }

    #[tokio::test]
    async fn update_delete_and_clear_arrive_with_sequence_id() {
        let Some(url) = test_server::url() else {
            return;
        };
        let topic = test_server::unique_topic("seq");
        let first = test_server::publish(&url, &topic, "v1", &[]).await;
        let seq = first["id"].as_str().unwrap().to_string();
        test_server::publish(&url, &topic, "v2", &[("X-Sequence-ID", seq.as_str())]).await;

        let client = reqwest::Client::new();
        for req in [
            client.delete(format!("{url}/{topic}/{seq}")),
            client.put(format!("{url}/{topic}/{seq}/clear")),
        ] {
            let resp = req
                .basic_auth(test_server::USER, Some(test_server::PASS))
                .send()
                .await
                .unwrap();
            assert!(resp.status().is_success(), "{}", resp.status());
        }

        let got = read_ws(&url, &topic, None, 4).await;
        let events: Vec<_> = got.iter().map(|m| m.event.as_str()).collect();
        assert_eq!(
            events,
            ["message", "message", "message_delete", "message_clear"]
        );
        assert!(got.iter().all(|m| m.sequence_id() == seq));
    }
}

#[cfg(all(test, windows))]
mod toast_tests {
    use super::*;

    #[test]
    fn test_sound_disabled_is_silent_at_every_priority() {
        for priority in 1..=5 {
            assert!(
                ConnectionManager::select_toast_sound(false, priority).is_none(),
                "priority {priority} must be silent when sound is disabled"
            );
        }
    }

    #[test]
    fn test_sound_enabled_uses_priority() {
        let sms = Some("ms-winsoundevent:Notification.SMS");
        assert_eq!(ConnectionManager::select_toast_sound(true, 5), sms);
        assert_eq!(ConnectionManager::select_toast_sound(true, 4), sms);
        assert_eq!(
            ConnectionManager::select_toast_sound(true, 3),
            Some("ms-winsoundevent:Notification.Default")
        );
    }

    #[test]
    fn test_sound_enabled_low_priority_is_silent() {
        assert!(ConnectionManager::select_toast_sound(true, 2).is_none());
        assert!(ConnectionManager::select_toast_sound(true, 1).is_none());
    }
}

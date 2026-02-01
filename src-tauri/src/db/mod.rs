//! Database layer for persistent storage.
//!
//! Provides SQLite-based storage for subscriptions, notifications, and settings.
//! Uses Mutex-protected connection for thread-safe access from Tauri commands.

mod schema;

use rusqlite::Connection;
use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};

use crate::error::AppError;

impl<T> From<PoisonError<T>> for AppError {
    fn from(err: PoisonError<T>) -> Self {
        Self::Database(format!("Mutex poisoned: {err}"))
    }
}
use crate::models::{
    AppSettings, Attachment, CreateSubscription, Notification, NotificationAction,
    NotificationDisplayMethod, Priority, ServerConfig, Subscription, ThemeMode,
};
use crate::services::credential_manager;

/// `SQLite` database wrapper with thread-safe access.
///
/// Manages all persistent data including subscriptions, notifications, and settings.
/// Server credentials are stored securely in the OS keychain rather than in `SQLite`.
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Acquires a lock on the database connection.
    ///
    /// Returns an error if the mutex is poisoned (another thread panicked while holding the lock).
    fn lock_conn(&self) -> Result<MutexGuard<'_, Connection>, AppError> {
        Ok(self.conn.lock()?)
    }

    /// Gets a string setting from the database with a default fallback.
    fn get_setting_string(&self, key: &str, default: &str) -> Result<String, AppError> {
        let conn = self.lock_conn()?;
        Ok(conn
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .unwrap_or_else(|_| default.to_string()))
    }

    /// Gets a boolean setting from the database with a default fallback.
    fn get_setting_bool(&self, key: &str, default: bool) -> Result<bool, AppError> {
        let conn = self.lock_conn()?;
        Ok(conn
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                let val: String = row.get(0)?;
                Ok(val == "true")
            })
            .unwrap_or(default))
    }

    /// Creates a new database connection and initializes the schema.
    ///
    /// If the database file doesn't exist, it will be created.
    /// Runs schema initialization and any pending migrations.
    pub fn new(path: &Path) -> Result<Self, AppError> {
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init()?;
        db.run_migrations()?;
        Ok(db)
    }

    fn init(&self) -> Result<(), AppError> {
        let conn = self.lock_conn()?;
        conn.execute_batch(schema::SCHEMA)?;

        // Check and store schema version
        let stored_version: Option<i32> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'schema_version'",
                [],
                |row| {
                    let val: String = row.get(0)?;
                    Ok(val.parse().ok())
                },
            )
            .unwrap_or(None);

        match stored_version {
            Some(version) if version != schema::SCHEMA_VERSION => {
                log::warn!(
                    "Database schema version mismatch: stored={}, expected={}. \
                     Consider deleting the database file to recreate with the new schema.",
                    version,
                    schema::SCHEMA_VERSION
                );
            }
            None => {
                // First run - store the schema version
                conn.execute(
                    "INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?1)",
                    [&schema::SCHEMA_VERSION.to_string()],
                )?;
                log::info!(
                    "Initialized database with schema version {}",
                    schema::SCHEMA_VERSION
                );
            }
            _ => {}
        }

        // Insert default server if no servers exist
        let count: i32 = conn.query_row("SELECT COUNT(*) FROM servers", [], |row| row.get(0))?;

        if count == 0 {
            conn.execute(
                "INSERT INTO servers (id, url, is_default) VALUES (?1, ?2, 1)",
                [&uuid::Uuid::new_v4().to_string(), "https://ntfy.sh"],
            )?;
        }

        Ok(())
    }

    /// Applies pending database migrations.
    /// Migrations are tracked in the migrations table to ensure each runs only once.
    fn run_migrations(&self) -> Result<(), AppError> {
        if schema::MIGRATIONS.is_empty() {
            return Ok(());
        }

        let conn = self.lock_conn()?;

        let last_migration: i32 = conn
            .query_row("SELECT COALESCE(MAX(id), 0) FROM migrations", [], |row| {
                row.get(0)
            })
            .unwrap_or(0);

        for (i, migration) in schema::MIGRATIONS.iter().enumerate() {
            let migration_id = (i + 1) as i32;
            if migration_id > last_migration {
                log::info!("Applying migration {migration_id}");
                conn.execute(migration, [])?;
                conn.execute(
                    "INSERT INTO migrations (id, applied_at) VALUES (?1, ?2)",
                    rusqlite::params![migration_id, chrono::Utc::now().timestamp()],
                )?;
            }
        }

        Ok(())
    }

    // ===== Subscriptions =====

    /// Returns all subscriptions ordered by most recent notification.
    pub fn get_all_subscriptions(&self) -> Result<Vec<Subscription>, AppError> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT s.id, s.topic, srv.url, s.display_name, s.muted, s.last_sync,
                    (SELECT MAX(n.timestamp) FROM notifications n WHERE n.subscription_id = s.id) as last_notif,
                    (SELECT COUNT(*) FROM notifications n WHERE n.subscription_id = s.id AND n.read = 0) as unread
             FROM subscriptions s
             JOIN servers srv ON s.server_id = srv.id
             ORDER BY last_notif DESC NULLS LAST"
        )?;

        let subscriptions = stmt
            .query_map([], |row| {
                Ok(Subscription {
                    id: row.get(0)?,
                    topic: row.get(1)?,
                    server_url: row.get(2)?,
                    display_name: row.get(3)?,
                    muted: row.get::<_, i32>(4)? == 1,
                    last_notification: row.get(6)?,
                    unread_count: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(subscriptions)
    }

    pub fn get_subscription_with_last_sync(
        &self,
        id: &str,
    ) -> Result<Option<(Subscription, Option<i64>)>, AppError> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT s.id, s.topic, srv.url, s.display_name, s.muted, s.last_sync,
                    (SELECT MAX(n.timestamp) FROM notifications n WHERE n.subscription_id = s.id) as last_notif,
                    (SELECT COUNT(*) FROM notifications n WHERE n.subscription_id = s.id AND n.read = 0) as unread
             FROM subscriptions s
             JOIN servers srv ON s.server_id = srv.id
             WHERE s.id = ?1"
        )?;

        let result = stmt.query_row([id], |row| {
            let sub = Subscription {
                id: row.get(0)?,
                topic: row.get(1)?,
                server_url: row.get(2)?,
                display_name: row.get(3)?,
                muted: row.get::<_, i32>(4)? == 1,
                last_notification: row.get(6)?,
                unread_count: row.get(7)?,
            };
            let last_sync: Option<i64> = row.get(5)?;
            Ok((sub, last_sync))
        });

        match result {
            Ok(data) => Ok(Some(data)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn update_subscription_last_sync(&self, id: &str, timestamp: i64) -> Result<(), AppError> {
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE subscriptions SET last_sync = ?1 WHERE id = ?2",
            rusqlite::params![timestamp, id],
        )?;
        Ok(())
    }

    pub fn create_subscription(&self, sub: CreateSubscription) -> Result<Subscription, AppError> {
        sub.validate()?;
        let conn = self.lock_conn()?;

        // Get or create server
        let server_id: String = if let Ok(id) = conn.query_row(
            "SELECT id FROM servers WHERE url = ?1",
            [&sub.server_url],
            |row| row.get(0),
        ) {
            id
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO servers (id, url, is_default) VALUES (?1, ?2, 0)",
                [&id, &sub.server_url],
            )?;
            id
        };

        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO subscriptions (id, server_id, topic, display_name, muted)
             VALUES (?1, ?2, ?3, ?4, 0)",
            [
                &id,
                &server_id,
                &sub.topic,
                &sub.display_name.clone().unwrap_or_default(),
            ],
        )?;

        Ok(Subscription {
            id,
            topic: sub.topic,
            server_url: sub.server_url,
            display_name: sub.display_name,
            unread_count: 0,
            last_notification: None,
            muted: false,
        })
    }

    pub fn delete_subscription(&self, id: &str) -> Result<(), AppError> {
        let conn = self.lock_conn()?;
        // Delete notifications first (cascade)
        conn.execute("DELETE FROM notifications WHERE subscription_id = ?1", [id])?;
        conn.execute("DELETE FROM subscriptions WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn toggle_subscription_mute(&self, id: &str) -> Result<Subscription, AppError> {
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE subscriptions SET muted = NOT muted WHERE id = ?1",
            [id],
        )?;
        drop(conn);

        // Return updated subscription
        let subs = self.get_all_subscriptions()?;
        subs.into_iter()
            .find(|s| s.id == id)
            .ok_or_else(|| AppError::NotFound(format!("Subscription {id} not found")))
    }

    // ===== Notifications =====

    pub fn get_notifications_by_subscription(
        &self,
        subscription_id: &str,
    ) -> Result<Vec<Notification>, AppError> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, subscription_id, title, message, priority, tags, timestamp, read, actions, attachments, is_expanded
             FROM notifications
             WHERE subscription_id = ?1
             ORDER BY timestamp DESC"
        )?;

        let notifications = stmt
            .query_map([subscription_id], |row| {
                let tags_json: String = row.get::<_, String>(5).unwrap_or_default();
                let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

                let actions_json: String =
                    row.get::<_, String>(8).unwrap_or_else(|_| "[]".to_string());
                let actions: Vec<NotificationAction> =
                    serde_json::from_str(&actions_json).unwrap_or_default();

                let attachments_json: String =
                    row.get::<_, String>(9).unwrap_or_else(|_| "[]".to_string());
                let attachments: Vec<Attachment> =
                    serde_json::from_str(&attachments_json).unwrap_or_default();

                Ok(Notification {
                    id: row.get(0)?,
                    topic_id: row.get(1)?,
                    title: row.get::<_, String>(2).unwrap_or_default(),
                    message: row.get(3)?,
                    priority: Priority::from(row.get::<_, i8>(4)?),
                    tags,
                    timestamp: row.get(6)?,
                    actions,
                    attachments,
                    read: row.get::<_, i32>(7)? == 1,
                    is_expanded: row.get::<_, i32>(10).unwrap_or(0) == 1,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(notifications)
    }

    pub fn notification_exists_by_ntfy_id(&self, ntfy_id: &str) -> Result<bool, AppError> {
        let conn = self.lock_conn()?;
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM notifications WHERE ntfy_id = ?1",
            [ntfy_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    #[allow(dead_code)]
    pub fn insert_notification(&self, notification: &Notification) -> Result<(), AppError> {
        let conn = self.lock_conn()?;
        let tags_json = serde_json::to_string(&notification.tags)?;
        let actions_json = serde_json::to_string(&notification.actions)?;
        let attachments_json = serde_json::to_string(&notification.attachments)?;

        conn.execute(
            "INSERT OR REPLACE INTO notifications (id, subscription_id, title, message, priority, tags, timestamp, read, actions, attachments, is_expanded)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                notification.id,
                notification.topic_id,
                notification.title,
                notification.message,
                notification.priority as u8,
                tags_json,
                notification.timestamp,
                if notification.read { 1 } else { 0 },
                actions_json,
                attachments_json,
                if notification.is_expanded { 1 } else { 0 },
            ],
        )?;

        Ok(())
    }

    pub fn insert_notification_with_ntfy_id(
        &self,
        notification: &Notification,
        ntfy_id: &str,
    ) -> Result<(), AppError> {
        let conn = self.lock_conn()?;
        let tags_json = serde_json::to_string(&notification.tags)?;
        let actions_json = serde_json::to_string(&notification.actions)?;
        let attachments_json = serde_json::to_string(&notification.attachments)?;

        conn.execute(
            "INSERT OR IGNORE INTO notifications (id, subscription_id, ntfy_id, title, message, priority, tags, timestamp, read, actions, attachments, is_expanded)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                notification.id,
                notification.topic_id,
                ntfy_id,
                notification.title,
                notification.message,
                notification.priority as u8,
                tags_json,
                notification.timestamp,
                if notification.read { 1 } else { 0 },
                actions_json,
                attachments_json,
                if notification.is_expanded { 1 } else { 0 },
            ],
        )?;

        Ok(())
    }

    pub fn mark_notification_read(&self, id: &str) -> Result<(), AppError> {
        let conn = self.lock_conn()?;
        conn.execute("UPDATE notifications SET read = 1 WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn mark_all_notifications_read(&self, subscription_id: &str) -> Result<(), AppError> {
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE notifications SET read = 1 WHERE subscription_id = ?1",
            [subscription_id],
        )?;
        Ok(())
    }

    pub fn set_notification_expanded(&self, id: &str, expanded: bool) -> Result<(), AppError> {
        let conn = self.lock_conn()?;
        conn.execute(
            "UPDATE notifications SET is_expanded = ?1 WHERE id = ?2",
            rusqlite::params![if expanded { 1 } else { 0 }, id],
        )?;
        Ok(())
    }

    pub fn delete_notification(&self, id: &str) -> Result<(), AppError> {
        let conn = self.lock_conn()?;
        conn.execute("DELETE FROM notifications WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn get_unread_count(&self, subscription_id: &str) -> Result<i32, AppError> {
        let conn = self.lock_conn()?;
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM notifications WHERE subscription_id = ?1 AND read = 0",
            [subscription_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Get total unread count across all non-muted subscriptions
    pub fn get_total_unread_count(&self) -> Result<i32, AppError> {
        let conn = self.lock_conn()?;
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM notifications n
             JOIN subscriptions s ON n.subscription_id = s.id
             WHERE n.read = 0 AND s.muted = 0",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    // ===== Settings =====

    pub fn get_settings(&self) -> Result<AppSettings, AppError> {
        let theme_str = self.get_setting_string("theme", "system")?;
        let theme = match theme_str.as_str() {
            "light" => ThemeMode::Light,
            "dark" => ThemeMode::Dark,
            _ => ThemeMode::System,
        };
        let minimize_to_tray = self.get_setting_bool("minimize_to_tray", true)?;
        let start_minimized = self.get_setting_bool("start_minimized", false)?;

        // Notification settings
        let notification_method_str = self.get_setting_string("notification_method", "native")?;
        let notification_method = match notification_method_str.as_str() {
            "windows_enhanced" => NotificationDisplayMethod::WindowsEnhanced,
            _ => NotificationDisplayMethod::Native,
        };
        let notification_force_display =
            self.get_setting_bool("notification_force_display", false)?;
        let notification_show_actions = self.get_setting_bool("notification_show_actions", true)?;
        let notification_show_images = self.get_setting_bool("notification_show_images", true)?;
        let notification_sound = self.get_setting_bool("notification_sound", true)?;

        // Message display settings
        let compact_view = self.get_setting_bool("compact_view", false)?;
        let expand_new_messages = self.get_setting_bool("expand_new_messages", true)?;

        let servers = self.get_servers_with_credentials()?;
        let default_server = self.get_default_server_url()?;

        Ok(AppSettings {
            theme,
            servers,
            default_server,
            minimize_to_tray,
            start_minimized,
            notification_method,
            notification_force_display,
            notification_show_actions,
            notification_show_images,
            notification_sound,
            compact_view,
            expand_new_messages,
        })
    }

    /// Gets all configured servers with credentials from keychain.
    fn get_servers_with_credentials(&self) -> Result<Vec<ServerConfig>, AppError> {
        let conn = self.lock_conn()?;
        let mut stmt = conn.prepare("SELECT url, username, password, is_default FROM servers")?;
        let servers_from_db: Vec<(String, Option<String>, Option<String>, bool)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i32>(3)? == 1,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        drop(stmt);
        drop(conn);

        // Try to get passwords from OS keychain first, fall back to DB
        Ok(servers_from_db
            .into_iter()
            .map(|(url, username, db_password, is_default)| {
                let password = username
                    .as_ref()
                    .and_then(|u| credential_manager::get_password(u, &url).ok().flatten())
                    .or(db_password);
                ServerConfig {
                    url,
                    username,
                    password,
                    is_default,
                }
            })
            .collect())
    }

    /// Gets the URL of the default server.
    fn get_default_server_url(&self) -> Result<String, AppError> {
        let conn = self.lock_conn()?;
        Ok(conn
            .query_row("SELECT url FROM servers WHERE is_default = 1", [], |row| {
                row.get(0)
            })
            .unwrap_or_else(|_| "https://ntfy.sh".to_string()))
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), AppError> {
        let conn = self.lock_conn()?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            [key, value],
        )?;
        Ok(())
    }

    pub fn add_server(&self, server: ServerConfig) -> Result<(), AppError> {
        server.validate()?;
        // Store password in OS keychain if we have both username and password
        if let (Some(ref username), Some(ref password)) = (&server.username, &server.password) {
            credential_manager::store_password(username, &server.url, password)?;
        }

        let conn = self.lock_conn()?;
        let id = uuid::Uuid::new_v4().to_string();
        // Don't store password in database - it's in keychain
        conn.execute(
            "INSERT INTO servers (id, url, username, is_default)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                id,
                server.url,
                server.username,
                if server.is_default { 1 } else { 0 },
            ],
        )?;
        Ok(())
    }

    pub fn remove_server(&self, url: &str) -> Result<(), AppError> {
        // Get username before deleting to clean up keychain
        let conn = self.lock_conn()?;
        let username: Option<String> = conn
            .query_row(
                "SELECT username FROM servers WHERE url = ?1",
                [url],
                |row| row.get(0),
            )
            .ok();
        drop(conn);

        // Delete password from OS keychain if we have a username
        if let Some(ref username) = username {
            let _ = credential_manager::delete_password(username, url);
        }

        let conn = self.lock_conn()?;
        // First delete all subscriptions for this server
        conn.execute(
            "DELETE FROM subscriptions WHERE server_id IN (SELECT id FROM servers WHERE url = ?1)",
            [url],
        )?;
        conn.execute("DELETE FROM servers WHERE url = ?1", [url])?;
        Ok(())
    }

    pub fn set_default_server(&self, url: &str) -> Result<(), AppError> {
        let conn = self.lock_conn()?;
        conn.execute("UPDATE servers SET is_default = 0", [])?;
        conn.execute("UPDATE servers SET is_default = 1 WHERE url = ?1", [url])?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn get_subscription_by_id(&self, id: &str) -> Result<Option<Subscription>, AppError> {
        let subs = self.get_all_subscriptions()?;
        Ok(subs.into_iter().find(|s| s.id == id))
    }
}

mod schema;

use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

use crate::error::AppError;
use crate::models::{
    Attachment, CreateSubscription, NotificationAction, Notification, Priority,
    ServerConfig, Subscription, AppSettings,
};
use crate::services::credential_manager;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
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
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(schema::SCHEMA)?;

        // Insert default server if no servers exist
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM servers",
            [],
            |row| row.get(0),
        )?;

        if count == 0 {
            conn.execute(
                "INSERT INTO servers (id, url, is_default) VALUES (?1, ?2, 1)",
                [&uuid::Uuid::new_v4().to_string(), "https://ntfy.sh"],
            )?;
        }

        Ok(())
    }

    fn run_migrations(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();

        // Create migrations table if not exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, applied_at INTEGER)",
            [],
        )?;

        // Get last applied migration
        let last_migration: i32 = conn
            .query_row("SELECT COALESCE(MAX(id), 0) FROM migrations", [], |row| row.get(0))
            .unwrap_or(0);

        // Apply new migrations
        for (i, migration) in schema::MIGRATIONS.iter().enumerate() {
            let migration_id = (i + 1) as i32;
            if migration_id > last_migration {
                log::info!("Applying migration {}: {}", migration_id, migration);
                // Ignore errors for ALTER TABLE (column might already exist)
                if let Err(e) = conn.execute(migration, []) {
                    log::warn!("Migration {} warning (may be ok): {}", migration_id, e);
                }
                conn.execute(
                    "INSERT INTO migrations (id, applied_at) VALUES (?1, ?2)",
                    rusqlite::params![migration_id, chrono::Utc::now().timestamp()],
                )?;
            }
        }

        Ok(())
    }

    // ===== Subscriptions =====

    pub fn get_all_subscriptions(&self) -> Result<Vec<Subscription>, AppError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.topic, srv.url, s.display_name, s.muted, s.last_sync,
                    (SELECT MAX(n.timestamp) FROM notifications n WHERE n.subscription_id = s.id) as last_notif,
                    (SELECT COUNT(*) FROM notifications n WHERE n.subscription_id = s.id AND n.read = 0) as unread
             FROM subscriptions s
             JOIN servers srv ON s.server_id = srv.id
             ORDER BY last_notif DESC NULLS LAST"
        )?;

        let subscriptions = stmt.query_map([], |row| {
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

    pub fn get_subscription_with_last_sync(&self, id: &str) -> Result<Option<(Subscription, Option<i64>)>, AppError> {
        let conn = self.conn.lock().unwrap();
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
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE subscriptions SET last_sync = ?1 WHERE id = ?2",
            rusqlite::params![timestamp, id],
        )?;
        Ok(())
    }

    pub fn create_subscription(&self, sub: CreateSubscription) -> Result<Subscription, AppError> {
        let conn = self.conn.lock().unwrap();

        // Get or create server
        let server_id: String = match conn.query_row(
            "SELECT id FROM servers WHERE url = ?1",
            [&sub.server_url],
            |row| row.get(0),
        ) {
            Ok(id) => id,
            Err(_) => {
                let id = uuid::Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO servers (id, url, is_default) VALUES (?1, ?2, 0)",
                    [&id, &sub.server_url],
                )?;
                id
            }
        };

        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO subscriptions (id, server_id, topic, display_name, muted)
             VALUES (?1, ?2, ?3, ?4, 0)",
            [&id, &server_id, &sub.topic, &sub.display_name.clone().unwrap_or_default()],
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
        let conn = self.conn.lock().unwrap();
        // Delete notifications first (cascade)
        conn.execute("DELETE FROM notifications WHERE subscription_id = ?1", [id])?;
        conn.execute("DELETE FROM subscriptions WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn toggle_subscription_mute(&self, id: &str) -> Result<Subscription, AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE subscriptions SET muted = NOT muted WHERE id = ?1",
            [id],
        )?;
        drop(conn);

        // Return updated subscription
        let subs = self.get_all_subscriptions()?;
        subs.into_iter()
            .find(|s| s.id == id)
            .ok_or_else(|| AppError::NotFound(format!("Subscription {} not found", id)))
    }

    // ===== Notifications =====

    pub fn get_notifications_by_subscription(&self, subscription_id: &str) -> Result<Vec<Notification>, AppError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, subscription_id, title, message, priority, tags, timestamp, read, actions, attachments
             FROM notifications
             WHERE subscription_id = ?1
             ORDER BY timestamp DESC"
        )?;

        let notifications = stmt.query_map([subscription_id], |row| {
            let tags_json: String = row.get::<_, String>(5).unwrap_or_default();
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

            let actions_json: String = row.get::<_, String>(8).unwrap_or_else(|_| "[]".to_string());
            let actions: Vec<NotificationAction> = serde_json::from_str(&actions_json).unwrap_or_default();

            let attachments_json: String = row.get::<_, String>(9).unwrap_or_else(|_| "[]".to_string());
            let attachments: Vec<Attachment> = serde_json::from_str(&attachments_json).unwrap_or_default();

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
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

        Ok(notifications)
    }

    pub fn notification_exists_by_ntfy_id(&self, ntfy_id: &str) -> Result<bool, AppError> {
        let conn = self.conn.lock().unwrap();
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM notifications WHERE ntfy_id = ?1",
            [ntfy_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    #[allow(dead_code)]
    pub fn insert_notification(&self, notification: &Notification) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        let tags_json = serde_json::to_string(&notification.tags)?;
        let actions_json = serde_json::to_string(&notification.actions)?;
        let attachments_json = serde_json::to_string(&notification.attachments)?;

        conn.execute(
            "INSERT OR REPLACE INTO notifications (id, subscription_id, title, message, priority, tags, timestamp, read, actions, attachments)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
            ],
        )?;

        Ok(())
    }

    pub fn insert_notification_with_ntfy_id(&self, notification: &Notification, ntfy_id: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        let tags_json = serde_json::to_string(&notification.tags)?;
        let actions_json = serde_json::to_string(&notification.actions)?;
        let attachments_json = serde_json::to_string(&notification.attachments)?;

        conn.execute(
            "INSERT OR IGNORE INTO notifications (id, subscription_id, ntfy_id, title, message, priority, tags, timestamp, read, actions, attachments)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
            ],
        )?;

        Ok(())
    }

    pub fn mark_notification_read(&self, id: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE notifications SET read = 1 WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn mark_all_notifications_read(&self, subscription_id: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE notifications SET read = 1 WHERE subscription_id = ?1",
            [subscription_id],
        )?;
        Ok(())
    }

    pub fn delete_notification(&self, id: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM notifications WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn get_unread_count(&self, subscription_id: &str) -> Result<i32, AppError> {
        let conn = self.conn.lock().unwrap();
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM notifications WHERE subscription_id = ?1 AND read = 0",
            [subscription_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    /// Get total unread count across all non-muted subscriptions
    pub fn get_total_unread_count(&self) -> Result<i32, AppError> {
        let conn = self.conn.lock().unwrap();
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
        // First, get theme and servers data from DB
        let (theme, servers_from_db) = {
            let conn = self.conn.lock().unwrap();

            // Get theme
            let theme: String = conn
                .query_row("SELECT value FROM settings WHERE key = 'theme'", [], |row| row.get(0))
                .unwrap_or_else(|_| "system".to_string());

            // Get servers (password may be in DB for legacy data, or in OS keychain for new data)
            let mut stmt = conn.prepare("SELECT url, username, password, is_default FROM servers")?;
            let servers_from_db: Vec<(String, Option<String>, Option<String>, bool)> = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i32>(3)? == 1,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

            (theme, servers_from_db)
        }; // conn is dropped here

        // Try to get passwords from OS keychain first, fall back to DB (for migration)
        let servers: Vec<ServerConfig> = servers_from_db
            .into_iter()
            .map(|(url, username, db_password, is_default)| {
                // Try keyring first (only if we have a username), then fall back to DB password
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
            .collect();

        // Re-acquire connection for remaining queries
        let conn = self.conn.lock().unwrap();

        // Get default server
        let default_server: String = conn
            .query_row("SELECT url FROM servers WHERE is_default = 1", [], |row| row.get(0))
            .unwrap_or_else(|_| "https://ntfy.sh".to_string());

        // Get minimize_to_tray setting
        let minimize_to_tray: bool = conn
            .query_row("SELECT value FROM settings WHERE key = 'minimize_to_tray'", [], |row| {
                let val: String = row.get(0)?;
                Ok(val == "true")
            })
            .unwrap_or(true); // Default to true

        // Get start_minimized setting
        let start_minimized: bool = conn
            .query_row("SELECT value FROM settings WHERE key = 'start_minimized'", [], |row| {
                let val: String = row.get(0)?;
                Ok(val == "true")
            })
            .unwrap_or(false); // Default to false

        Ok(AppSettings {
            theme,
            servers,
            default_server,
            minimize_to_tray,
            start_minimized,
        })
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            [key, value],
        )?;
        Ok(())
    }

    pub fn add_server(&self, server: ServerConfig) -> Result<(), AppError> {
        // Store password in OS keychain if we have both username and password
        if let (Some(ref username), Some(ref password)) = (&server.username, &server.password) {
            credential_manager::store_password(username, &server.url, password)?;
        }

        let conn = self.conn.lock().unwrap();
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
        let conn = self.conn.lock().unwrap();
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

        let conn = self.conn.lock().unwrap();
        // First delete all subscriptions for this server
        conn.execute(
            "DELETE FROM subscriptions WHERE server_id IN (SELECT id FROM servers WHERE url = ?1)",
            [url],
        )?;
        conn.execute("DELETE FROM servers WHERE url = ?1", [url])?;
        Ok(())
    }

    pub fn set_default_server(&self, url: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();
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

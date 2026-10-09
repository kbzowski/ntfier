//! Database connection management with embedded migrations.

use diesel::connection::SimpleConnection;
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use super::models::{NewServer, ServerRow};
use super::schema::{ignore_rules, notifications, servers, subscriptions};
use crate::error::AppError;
use crate::models::canonical_url;
use crate::services::credential_manager;

/// Embedded database migrations.
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

/// Thread-safe `SQLite` database wrapper.
///
/// Uses a Mutex-protected connection for safe access from multiple Tauri commands.
/// Migrations are run automatically on initialization.
///
/// # Design note: `std::sync::Mutex` in async context
///
/// This intentionally uses `std::sync::Mutex` rather than `tokio::sync::Mutex` because:
/// - Diesel is synchronous and does not support async operations.
/// - `SQLite` queries are fast (microseconds), so lock hold times are short and
///   will not meaningfully block Tokio worker threads.
/// - `Database` does not implement `Clone`, which limits `spawn_blocking` usage.
/// - Desktop apps have low concurrency (single user, few concurrent commands).
///
/// If lock contention ever becomes measurable, consider wrapping DB access in
/// `spawn_blocking` or switching to `tokio::sync::Mutex`.
pub struct Database {
    conn: Mutex<SqliteConnection>,
}

impl Database {
    /// Creates a new database connection and runs pending migrations.
    ///
    /// If the database file doesn't exist, it will be created.
    /// A default ntfy.sh server is added if no servers exist.
    pub fn new(path: &Path) -> Result<Self, AppError> {
        let database_url = path.to_string_lossy().to_string();
        let mut conn = SqliteConnection::establish(&database_url)?;

        // Enable foreign key constraints (SQLite has them OFF by default)
        conn.batch_execute("PRAGMA foreign_keys = ON")?;

        // Run pending migrations
        conn.run_pending_migrations(MIGRATIONS)
            .map_err(|e| AppError::Database(format!("Migration failed: {e}")))?;

        log::info!("Database migrations completed");

        Self::canonicalize_server_urls(&mut conn)?;

        // Initialize default server if needed
        Self::init_default_server(&mut conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Acquires a lock on the database connection.
    pub fn conn(&self) -> Result<MutexGuard<'_, SqliteConnection>, AppError> {
        self.conn
            .lock()
            .map_err(|e| AppError::Database(format!("Mutex poisoned: {e}")))
    }

    /// Rewrites stored server URLs to their canonical form.
    ///
    /// Servers that become equal are merged into the one with a credential, and their
    /// subscriptions with them. Runs on every start; a no-op once all URLs are canonical.
    pub(crate) fn canonicalize_server_urls(conn: &mut SqliteConnection) -> Result<(), AppError> {
        let rows: Vec<ServerRow> = servers::table.load(conn)?;

        for row in rows {
            let canonical = match canonical_url(&row.url) {
                Ok(url) if url != row.url => url,
                Ok(_) => continue,
                Err(e) => {
                    log::warn!("Leaving server URL '{}' as is: {e}", row.url);
                    continue;
                }
            };

            // The row whose keychain entry needs to follow it to the new URL
            let renamed = conn.transaction::<_, diesel::result::Error, _>(|conn| {
                let target: Option<ServerRow> = servers::table
                    .filter(servers::url.eq(&canonical))
                    .first(conn)
                    .optional()?;

                let keep = match target {
                    None => row.clone(),
                    Some(target) => {
                        let (keep, gone) = if target.username.is_none() && row.username.is_some() {
                            (row.clone(), target)
                        } else {
                            (target, row.clone())
                        };
                        Self::merge_server_into(conn, &gone, &keep)?;
                        keep
                    }
                };

                diesel::update(servers::table.filter(servers::id.eq(&keep.id)))
                    .set(servers::url.eq(&canonical))
                    .execute(conn)?;

                Ok((keep.id == row.id)
                    .then_some(row.username.clone())
                    .flatten())
            })?;

            log::info!("Server URL '{}' is now '{canonical}'", row.url);

            if let Some(username) = renamed {
                Self::move_keychain_entry(&username, &row.url, &canonical);
            }
        }

        Ok(())
    }

    /// Moves `gone`'s subscriptions to `keep` and deletes `gone`.
    fn merge_server_into(
        conn: &mut SqliteConnection,
        gone: &ServerRow,
        keep: &ServerRow,
    ) -> Result<(), diesel::result::Error> {
        let subs: Vec<(String, String)> = subscriptions::table
            .filter(subscriptions::server_id.eq(&gone.id))
            .select((subscriptions::id, subscriptions::topic))
            .load(conn)?;

        for (sub_id, topic) in subs {
            let existing: Option<String> = subscriptions::table
                .filter(subscriptions::server_id.eq(&keep.id))
                .filter(subscriptions::topic.eq(&topic))
                .select(subscriptions::id)
                .first(conn)
                .optional()?;

            if let Some(keep_sub) = existing {
                diesel::update(
                    notifications::table.filter(notifications::subscription_id.eq(&sub_id)),
                )
                .set(notifications::subscription_id.eq(&keep_sub))
                .execute(conn)?;
                diesel::update(
                    ignore_rules::table.filter(ignore_rules::subscription_id.eq(&sub_id)),
                )
                .set(ignore_rules::subscription_id.eq(&keep_sub))
                .execute(conn)?;
                diesel::delete(subscriptions::table.filter(subscriptions::id.eq(&sub_id)))
                    .execute(conn)?;
            } else {
                diesel::update(subscriptions::table.filter(subscriptions::id.eq(&sub_id)))
                    .set(subscriptions::server_id.eq(&keep.id))
                    .execute(conn)?;
            }
        }

        diesel::delete(servers::table.filter(servers::id.eq(&gone.id))).execute(conn)?;
        if gone.is_default == 1 {
            diesel::update(servers::table.filter(servers::id.eq(&keep.id)))
                .set(servers::is_default.eq(1))
                .execute(conn)?;
        }
        Ok(())
    }

    /// Best-effort: a failure only means the user has to enter the password again.
    fn move_keychain_entry(username: &str, old_url: &str, new_url: &str) {
        match credential_manager::get_password(username, old_url) {
            Ok(Some(password)) => {
                if let Err(e) = credential_manager::store_password(username, new_url, &password) {
                    log::warn!("Failed to move credential to {new_url}: {e}");
                    return;
                }
                let _ = credential_manager::delete_password(username, old_url);
            }
            Ok(None) => {}
            Err(e) => log::warn!("Failed to read credential for {old_url}: {e}"),
        }
    }

    /// Inserts the default ntfy.sh server if no servers exist.
    fn init_default_server(conn: &mut SqliteConnection) -> Result<(), AppError> {
        use diesel::dsl::count_star;

        let server_count: i64 = servers::table.select(count_star()).first(conn)?;

        if server_count == 0 {
            let new_server = NewServer {
                id: &uuid::Uuid::new_v4().to_string(),
                url: "https://ntfy.sh",
                username: None,
                is_default: 1,
            };

            diesel::insert_into(servers::table)
                .values(&new_server)
                .execute(conn)?;

            log::info!("Initialized default ntfy.sh server");
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonicalize_merges_servers_that_become_equal() {
        let db = Database::new(Path::new(":memory:")).unwrap();
        {
            let mut conn = db.conn().unwrap();
            conn.batch_execute(
                "INSERT INTO servers (id, url, username, is_default) VALUES
                    ('b', 'https://NTFY.sh/', 'alice', 0),
                    ('c', 'http://Other.example:80/', NULL, 0);
                 INSERT INTO subscriptions (id, server_id, topic, muted) VALUES
                    ('s1', (SELECT id FROM servers WHERE url = 'https://ntfy.sh'), 'alerts', 0),
                    ('s2', 'b', 'alerts', 0),
                    ('s3', 'b', 'news', 0);
                 INSERT INTO notifications (id, subscription_id, message, timestamp)
                    VALUES ('n1', 's2', 'hi', 1);",
            )
            .unwrap();
            Database::canonicalize_server_urls(&mut conn).unwrap();
        }

        let servers = db.get_servers_with_credentials().unwrap();
        let mut urls: Vec<_> = servers.iter().map(|s| s.url.as_str()).collect();
        urls.sort_unstable();
        assert_eq!(urls, ["http://other.example", "https://ntfy.sh"]);

        // The server with a credential is kept, and it stays the default
        let ntfy = servers.iter().find(|s| s.url == "https://ntfy.sh").unwrap();
        assert_eq!(ntfy.username.as_deref(), Some("alice"));
        assert!(ntfy.is_default);

        // Same topic on both: one subscription left, holding the messages of both
        let subs = db.get_all_subscriptions().unwrap();
        let mut topics: Vec<_> = subs.iter().map(|s| s.topic.as_str()).collect();
        topics.sort_unstable();
        assert_eq!(topics, ["alerts", "news"]);
        let alerts = subs.iter().find(|s| s.topic == "alerts").unwrap();
        let mut conn = db.conn().unwrap();
        let moved: i64 = notifications::table
            .filter(notifications::subscription_id.eq(&alerts.id))
            .count()
            .get_result(&mut *conn)
            .unwrap();
        assert_eq!(moved, 1);
    }
}

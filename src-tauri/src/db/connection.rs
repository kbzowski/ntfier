//! Database connection management with embedded migrations.

use diesel::connection::SimpleConnection;
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use super::models::NewServer;
use super::schema::servers;
use crate::error::AppError;

/// Embedded database migrations.
pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

/// Thread-safe `SQLite` database wrapper.
///
/// Uses a Mutex-protected connection for safe access from multiple Tauri commands.
/// Migrations are run automatically on initialization.
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

    /// Inserts the default ntfy.sh server if no servers exist.
    fn init_default_server(conn: &mut SqliteConnection) -> Result<(), AppError> {
        use diesel::dsl::count_star;

        let server_count: i64 = servers::table.select(count_star()).first(conn)?;

        if server_count == 0 {
            let new_server = NewServer {
                id: &uuid::Uuid::new_v4().to_string(),
                url: "https://ntfy.sh",
                username: None,
                password: None,
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

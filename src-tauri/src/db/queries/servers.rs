//! Server-related database queries.

use diesel::prelude::*;
use diesel::Connection;

use crate::db::connection::Database;
use crate::db::models::{NewServer, ServerRow};
use crate::db::schema::{servers, subscriptions};
use crate::error::AppError;
use crate::models::ServerConfig;
use crate::services::credential_manager;

impl Database {
    /// Gets all configured servers with credentials from keychain.
    pub fn get_servers_with_credentials(&self) -> Result<Vec<ServerConfig>, AppError> {
        let mut conn = self.conn()?;

        let rows: Vec<ServerRow> = servers::table.load(&mut *conn)?;
        drop(conn);

        // Try to get passwords from OS keychain first, fall back to DB
        Ok(rows
            .into_iter()
            .map(|row| {
                let password = row
                    .username
                    .as_ref()
                    .and_then(|u| credential_manager::get_password(u, &row.url).ok().flatten())
                    .or(row.password);

                ServerConfig {
                    url: row.url,
                    username: row.username,
                    password,
                    is_default: row.is_default == 1,
                }
            })
            .collect())
    }

    /// Gets the URL of the default server.
    pub fn get_default_server_url(&self) -> Result<String, AppError> {
        let mut conn = self.conn()?;

        let result: Option<String> = servers::table
            .filter(servers::is_default.eq(1))
            .select(servers::url)
            .first(&mut *conn)
            .optional()?;

        Ok(result.unwrap_or_else(|| "https://ntfy.sh".to_string()))
    }

    /// Adds a new server.
    pub fn add_server(&self, server: ServerConfig) -> Result<(), AppError> {
        server.validate()?;

        // Store password in OS keychain if we have both username and password
        if let (Some(ref username), Some(ref password)) = (&server.username, &server.password) {
            credential_manager::store_password(username, &server.url, password)?;
        }

        let mut conn = self.conn()?;
        let id = uuid::Uuid::new_v4().to_string();

        // Don't store password in database - it's in keychain
        let new_server = NewServer {
            id: &id,
            url: &server.url,
            username: server.username.as_deref(),
            password: None, // Stored in keychain
            is_default: i32::from(server.is_default),
        };

        diesel::insert_into(servers::table)
            .values(&new_server)
            .execute(&mut *conn)?;

        Ok(())
    }

    /// Removes a server and all its subscriptions.
    pub fn remove_server(&self, url: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        // Run DB operations in a transaction
        let username: Option<String> = conn.transaction::<_, diesel::result::Error, _>(|conn| {
            let username: Option<String> = servers::table
                .filter(servers::url.eq(url))
                .select(servers::username)
                .first(conn)
                .optional()?
                .flatten();

            // Delete subscriptions for this server
            let server_ids: Vec<String> = servers::table
                .filter(servers::url.eq(url))
                .select(servers::id)
                .load(conn)?;

            for server_id in &server_ids {
                diesel::delete(subscriptions::table.filter(subscriptions::server_id.eq(server_id)))
                    .execute(conn)?;
            }

            diesel::delete(servers::table.filter(servers::url.eq(url))).execute(conn)?;

            Ok(username)
        })?;

        // Clean up keychain after successful transaction (best-effort)
        if let Some(ref username) = username {
            if let Err(e) = credential_manager::delete_password(username, url) {
                log::warn!("Failed to clean up keychain for {username}@{url}: {e}");
            }
        }

        Ok(())
    }

    /// Sets a server as the default.
    pub fn set_default_server(&self, url: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        conn.transaction::<_, diesel::result::Error, _>(|conn| {
            // Clear all defaults
            diesel::update(servers::table)
                .set(servers::is_default.eq(0))
                .execute(conn)?;

            // Set new default
            diesel::update(servers::table.filter(servers::url.eq(url)))
                .set(servers::is_default.eq(1))
                .execute(conn)?;

            Ok(())
        })?;

        Ok(())
    }
}

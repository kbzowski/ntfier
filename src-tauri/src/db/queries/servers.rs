//! Server-related database queries.

use diesel::prelude::*;

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
        // Get username before deleting to clean up keychain
        let username: Option<String> = {
            let mut conn = self.conn()?;
            servers::table
                .filter(servers::url.eq(url))
                .select(servers::username)
                .first(&mut *conn)
                .optional()?
                .flatten()
        };

        // Delete password from OS keychain if we have a username
        if let Some(ref username) = username {
            let _ = credential_manager::delete_password(username, url);
        }

        let mut conn = self.conn()?;

        // First delete all subscriptions for this server
        let server_ids: Vec<String> = servers::table
            .filter(servers::url.eq(url))
            .select(servers::id)
            .load(&mut *conn)?;

        for server_id in &server_ids {
            diesel::delete(subscriptions::table.filter(subscriptions::server_id.eq(server_id)))
                .execute(&mut *conn)?;
        }

        diesel::delete(servers::table.filter(servers::url.eq(url))).execute(&mut *conn)?;

        Ok(())
    }

    /// Sets a server as the default.
    pub fn set_default_server(&self, url: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        // Clear all defaults
        diesel::update(servers::table)
            .set(servers::is_default.eq(0))
            .execute(&mut *conn)?;

        // Set new default
        diesel::update(servers::table.filter(servers::url.eq(url)))
            .set(servers::is_default.eq(1))
            .execute(&mut *conn)?;

        Ok(())
    }
}

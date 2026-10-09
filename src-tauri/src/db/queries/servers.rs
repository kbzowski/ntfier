//! Server-related database queries.

use diesel::prelude::*;
use diesel::Connection;

use crate::db::connection::Database;
use crate::db::models::{NewServer, ServerRow};
use crate::db::schema::{servers, subscriptions};
use crate::error::AppError;
use crate::models::{canonical_url, ServerConfig};
use crate::services::credential_manager;

impl Database {
    /// Gets all configured servers with credentials from keychain.
    pub fn get_servers_with_credentials(&self) -> Result<Vec<ServerConfig>, AppError> {
        let mut conn = self.conn()?;

        let rows: Vec<ServerRow> = servers::table.load(&mut *conn)?;
        drop(conn);

        // The secret is a password with a username, an access token without one
        Ok(rows
            .into_iter()
            .map(|row| {
                let secret = credential_manager::get_secret(&row.url).ok().flatten();
                let username = row.username.filter(|u| !u.is_empty());
                let (password, token) = if username.is_some() {
                    (secret, None)
                } else {
                    (None, secret)
                };

                ServerConfig {
                    url: row.url,
                    username,
                    password,
                    token,
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
    pub fn add_server(&self, mut server: ServerConfig) -> Result<String, AppError> {
        server.url = canonical_url(&server.url)?;
        let username = Self::store_credential(&server)?;

        let mut conn = self.conn()?;
        let id = uuid::Uuid::new_v4().to_string();

        // Don't store password in database - it's in keychain
        let new_server = NewServer {
            id: &id,
            url: &server.url,
            username: username.as_deref(),
            is_default: i32::from(server.is_default),
        };

        diesel::insert_into(servers::table)
            .values(&new_server)
            .execute(&mut *conn)?;

        Ok(server.url)
    }

    /// Replaces a server's credential. The URL identifies the server and can't change.
    ///
    /// A different account (username or token) needs a fresh first sync, which merges
    /// local topics up instead of letting the account win.
    pub fn update_server_credential(&self, server: &ServerConfig) -> Result<(), AppError> {
        let old = self
            .get_servers_with_credentials()?
            .into_iter()
            .find(|s| s.url == server.url)
            .ok_or_else(|| AppError::NotFound(format!("Server {} not found", server.url)))?;
        let username = Self::store_credential(server)?;
        let token = server.token.clone().filter(|_| username.is_none());
        let same_account = old.username == username && (username.is_some() || old.token == token);

        let mut conn = self.conn()?;
        diesel::update(servers::table.filter(servers::url.eq(&server.url)))
            .set(servers::username.eq(username))
            .execute(&mut *conn)?;
        if !same_account {
            diesel::update(servers::table.filter(servers::url.eq(&server.url)))
                .set(servers::synced.eq(0))
                .execute(&mut *conn)?;
        }
        Ok(())
    }

    /// Whether the server's first account sync (the merge) has happened.
    pub fn is_server_synced(&self, url: &str) -> Result<bool, AppError> {
        let mut conn = self.conn()?;
        let synced: Option<i32> = servers::table
            .filter(servers::url.eq(url))
            .select(servers::synced)
            .first(&mut *conn)
            .optional()?;
        Ok(synced == Some(1))
    }

    pub fn set_server_synced(&self, url: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;
        diesel::update(servers::table.filter(servers::url.eq(url)))
            .set(servers::synced.eq(1))
            .execute(&mut *conn)?;
        Ok(())
    }

    /// Puts the server's secret in the keychain (or removes it) and returns the username
    /// to store: only a password login has one.
    fn store_credential(server: &ServerConfig) -> Result<Option<String>, AppError> {
        let username = server.username.as_deref().filter(|u| !u.is_empty());
        let secret = match username {
            Some(_) => server.password.as_deref(),
            None => server.token.as_deref(),
        }
        .filter(|s| !s.is_empty());

        match secret {
            Some(secret) => credential_manager::store_secret(&server.url, secret)?,
            None => credential_manager::delete_secret(&server.url)?,
        }
        Ok(username.filter(|_| secret.is_some()).map(str::to_string))
    }

    /// Removes a server and all its subscriptions.
    pub fn remove_server(&self, url: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        conn.transaction::<_, diesel::result::Error, _>(|conn| {
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

            // Keep a default server: promote the first remaining one if the default was removed
            let has_default: bool = diesel::select(diesel::dsl::exists(
                servers::table.filter(servers::is_default.eq(1)),
            ))
            .get_result(conn)?;
            if !has_default {
                if let Some(first_id) = servers::table
                    .select(servers::id)
                    .order(diesel::dsl::sql::<diesel::sql_types::BigInt>("rowid"))
                    .first::<String>(conn)
                    .optional()?
                {
                    diesel::update(servers::table.filter(servers::id.eq(first_id)))
                        .set(servers::is_default.eq(1))
                        .execute(conn)?;
                }
            }

            Ok(())
        })?;

        // Clean up keychain after successful transaction (best-effort)
        if let Err(e) = credential_manager::delete_secret(url) {
            log::warn!("Failed to clean up keychain for {url}: {e}");
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removing_default_server_promotes_another() {
        let db = Database::new(std::path::Path::new(":memory:")).unwrap();
        db.add_server(ServerConfig {
            url: "https://other.example".to_string(),
            username: None,
            password: None,
            token: None,
            is_default: false,
        })
        .unwrap();

        db.remove_server("https://ntfy.sh").unwrap();

        assert_eq!(
            db.get_default_server_url().unwrap(),
            "https://other.example"
        );
    }
}

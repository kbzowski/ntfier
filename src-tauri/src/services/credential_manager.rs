//! Server secrets (password or access token) in the OS keychain.
//!
//! A server has at most one credential, so the secret is keyed by its canonical URL.

use crate::error::AppError;
use keyring::Entry;
use log::{debug, info};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

const SERVICE_NAME: &str = "ntfier";

/// In-memory cache to avoid repeatedly accessing the OS keychain.
/// Key: server URL, value: secret.
static CREDENTIAL_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn get_cache() -> Result<std::sync::MutexGuard<'static, HashMap<String, String>>, AppError> {
    CREDENTIAL_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|e| AppError::Credential(format!("Failed to lock credential cache: {e}")))
}

fn create_entry(key: &str) -> Result<Entry, AppError> {
    Entry::new(SERVICE_NAME, key)
        .map_err(|e| AppError::Credential(format!("Failed to create keyring entry: {e}")))
}

fn read_entry(key: &str) -> Result<Option<String>, AppError> {
    match create_entry(key)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Credential(format!("Failed to get secret: {e}"))),
    }
}

fn delete_entry(key: &str) -> Result<(), AppError> {
    match create_entry(key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Credential(format!(
            "Failed to delete secret: {e}"
        ))),
    }
}

/// Stores a server's secret in the OS keychain and cache.
pub fn store_secret(server_url: &str, secret: &str) -> Result<(), AppError> {
    debug!("Storing credential for server");
    create_entry(server_url)?
        .set_password(secret)
        .map_err(|e| AppError::Credential(format!("Failed to store secret: {e}")))?;
    get_cache()?.insert(server_url.to_string(), secret.to_string());
    info!("Credential stored successfully");
    Ok(())
}

/// Gets a server's secret from the cache or OS keychain.
pub fn get_secret(server_url: &str) -> Result<Option<String>, AppError> {
    if let Some(secret) = get_cache()?.get(server_url) {
        return Ok(Some(secret.clone()));
    }
    let secret = read_entry(server_url)?;
    if let Some(ref s) = secret {
        get_cache()?.insert(server_url.to_string(), s.clone());
    }
    Ok(secret)
}

/// Deletes a server's secret from the OS keychain and cache.
pub fn delete_secret(server_url: &str) -> Result<(), AppError> {
    get_cache()?.remove(server_url);
    delete_entry(server_url)
}

/// Moves a password stored under the old `<username>_<url>` key to the URL-only key.
/// Best-effort: a failure only means the user has to enter the password again.
pub fn migrate_legacy_password(username: &str, server_url: &str) {
    let legacy_key = format!("{username}_{server_url}");
    match read_entry(&legacy_key) {
        Ok(Some(password)) => {
            if let Err(e) = store_secret(server_url, &password) {
                log::warn!("Failed to migrate credential for {server_url}: {e}");
                return;
            }
            let _ = delete_entry(&legacy_key);
            info!("Migrated credential for {server_url} to the URL-only key");
        }
        Ok(None) => {}
        Err(e) => log::warn!("Failed to read legacy credential for {server_url}: {e}"),
    }
}

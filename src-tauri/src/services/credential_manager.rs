use crate::error::AppError;
use keyring::Entry;
use log::info;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

const SERVICE_NAME: &str = "ntfier";

/// In-memory cache for credentials to avoid repeatedly accessing OS keychain
/// Key: (username, `server_url`), Value: password
static CREDENTIAL_CACHE: OnceLock<Mutex<HashMap<(String, String), String>>> = OnceLock::new();

fn get_cache() -> &'static Mutex<HashMap<(String, String), String>> {
    CREDENTIAL_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Create a keyring entry for the given username and server URL
/// Key format: ntfier_[username]_[server]
fn create_entry(username: &str, server_url: &str) -> Result<Entry, AppError> {
    let key = format!("{username}_{server_url}");
    Entry::new(SERVICE_NAME, &key)
        .map_err(|e| AppError::Credential(format!("Failed to create keyring entry: {e}")))
}

/// Store password in OS keychain and cache
pub fn store_password(username: &str, server_url: &str, password: &str) -> Result<(), AppError> {
    info!("Storing password for {username}@{server_url}");
    let entry = create_entry(username, server_url)?;
    entry
        .set_password(password)
        .map_err(|e| AppError::Credential(format!("Failed to store password: {e}")))?;

    // Update cache
    let cache_key = (username.to_string(), server_url.to_string());
    let mut cache = get_cache()
        .lock()
        .map_err(|e| AppError::Credential(format!("Failed to lock credential cache: {e}")))?;
    cache.insert(cache_key, password.to_string());

    info!("Password stored successfully");
    Ok(())
}

/// Get password from cache or OS keychain
pub fn get_password(username: &str, server_url: &str) -> Result<Option<String>, AppError> {
    let cache_key = (username.to_string(), server_url.to_string());

    // Check cache first
    {
        let cache = get_cache()
            .lock()
            .map_err(|e| AppError::Credential(format!("Failed to lock credential cache: {e}")))?;
        if let Some(password) = cache.get(&cache_key) {
            info!("Password retrieved from cache for {username}@{server_url}");
            return Ok(Some(password.clone()));
        }
    }

    // Cache miss - fetch from OS keychain
    let entry = create_entry(username, server_url)?;
    match entry.get_password() {
        Ok(password) => {
            info!("Password retrieved from keychain for {username}@{server_url}");

            // Store in cache for future use
            let mut cache = get_cache().lock().map_err(|e| {
                AppError::Credential(format!("Failed to lock credential cache: {e}"))
            })?;
            cache.insert(cache_key, password.clone());

            Ok(Some(password))
        }
        Err(keyring::Error::NoEntry) => {
            info!("No password found for {username}@{server_url}");
            Ok(None)
        }
        Err(e) => Err(AppError::Credential(format!("Failed to get password: {e}"))),
    }
}

/// Delete password from OS keychain and cache
pub fn delete_password(username: &str, server_url: &str) -> Result<(), AppError> {
    info!("Deleting password for {username}@{server_url}");

    // Remove from cache first
    let cache_key = (username.to_string(), server_url.to_string());
    let mut cache = get_cache()
        .lock()
        .map_err(|e| AppError::Credential(format!("Failed to lock credential cache: {e}")))?;
    cache.remove(&cache_key);
    drop(cache); // Release lock before calling keychain

    let entry = create_entry(username, server_url)?;
    match entry.delete_credential() {
        Ok(()) => {
            info!("Password deleted successfully");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            info!("No password to delete for {username}@{server_url}");
            Ok(())
        }
        Err(e) => Err(AppError::Credential(format!(
            "Failed to delete password: {e}"
        ))),
    }
}

/// Clear all cached credentials from memory
/// Useful for logout or security purposes
#[allow(dead_code)]
pub fn clear_cache() -> Result<(), AppError> {
    info!("Clearing credential cache");
    let mut cache = get_cache()
        .lock()
        .map_err(|e| AppError::Credential(format!("Failed to lock credential cache: {e}")))?;
    cache.clear();
    info!("Credential cache cleared");
    Ok(())
}

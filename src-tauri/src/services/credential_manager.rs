use crate::error::AppError;
use keyring::Entry;
use log::{debug, info};
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
    debug!("Storing credential for server");
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

    info!("Credential stored successfully");
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
            debug!("Credential retrieved from cache");
            return Ok(Some(password.clone()));
        }
    }

    // Cache miss - fetch from OS keychain
    let entry = create_entry(username, server_url)?;
    match entry.get_password() {
        Ok(password) => {
            debug!("Credential retrieved from keychain");

            // Store in cache for future use
            let mut cache = get_cache().lock().map_err(|e| {
                AppError::Credential(format!("Failed to lock credential cache: {e}"))
            })?;
            cache.insert(cache_key, password.clone());

            Ok(Some(password))
        }
        Err(keyring::Error::NoEntry) => {
            debug!("No credential found in keychain");
            Ok(None)
        }
        Err(e) => Err(AppError::Credential(format!("Failed to get password: {e}"))),
    }
}

/// Delete password from OS keychain and cache
pub fn delete_password(username: &str, server_url: &str) -> Result<(), AppError> {
    debug!("Deleting credential from keychain");

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
            info!("Credential deleted successfully");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            debug!("No credential to delete");
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
    debug!("Clearing credential cache");
    let mut cache = get_cache()
        .lock()
        .map_err(|e| AppError::Credential(format!("Failed to lock credential cache: {e}")))?;
    cache.clear();
    info!("Credential cache cleared");
    Ok(())
}

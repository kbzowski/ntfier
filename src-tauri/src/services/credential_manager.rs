use crate::error::AppError;
use keyring::Entry;
use log::info;

const SERVICE_NAME: &str = "ntfier";

/// Create a keyring entry for the given username and server URL
/// Key format: ntfier_[username]_[server]
fn create_entry(username: &str, server_url: &str) -> Result<Entry, AppError> {
    let key = format!("{}_{}", username, server_url);
    Entry::new(SERVICE_NAME, &key)
        .map_err(|e| AppError::Credential(format!("Failed to create keyring entry: {}", e)))
}

/// Store password in OS keychain
pub fn store_password(username: &str, server_url: &str, password: &str) -> Result<(), AppError> {
    info!("Storing password for {}@{}", username, server_url);
    let entry = create_entry(username, server_url)?;
    entry
        .set_password(password)
        .map_err(|e| AppError::Credential(format!("Failed to store password: {}", e)))?;
    info!("Password stored successfully");
    Ok(())
}

/// Get password from OS keychain
pub fn get_password(username: &str, server_url: &str) -> Result<Option<String>, AppError> {
    let entry = create_entry(username, server_url)?;
    match entry.get_password() {
        Ok(password) => {
            info!("Password retrieved for {}@{}", username, server_url);
            Ok(Some(password))
        }
        Err(keyring::Error::NoEntry) => {
            info!("No password found for {}@{}", username, server_url);
            Ok(None)
        }
        Err(e) => Err(AppError::Credential(format!(
            "Failed to get password: {}",
            e
        ))),
    }
}

/// Delete password from OS keychain
pub fn delete_password(username: &str, server_url: &str) -> Result<(), AppError> {
    info!("Deleting password for {}@{}", username, server_url);
    let entry = create_entry(username, server_url)?;
    match entry.delete_credential() {
        Ok(_) => {
            info!("Password deleted successfully");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            info!("No password to delete for {}@{}", username, server_url);
            Ok(())
        }
        Err(e) => Err(AppError::Credential(format!(
            "Failed to delete password: {}",
            e
        ))),
    }
}

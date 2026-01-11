use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use serde::Deserialize;
use std::error::Error as StdError;

use crate::error::AppError;
use crate::models::{normalize_url, NtfyMessage};

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct NtfyAccount {
    pub username: String,
    #[serde(default)]
    pub subscriptions: Vec<NtfySubscription>,
}

#[derive(Debug, Deserialize)]
pub struct NtfySubscription {
    pub base_url: String,
    pub topic: String,
    #[serde(default)]
    pub display_name: Option<String>,
}

pub struct NtfyClient {
    client: Client,
}

impl NtfyClient {
    pub fn new() -> Result<Self, AppError> {
        let client = Client::builder()
            .build()
            .map_err(|e| AppError::Connection(format!("Failed to create HTTP client: {e}")))?;

        Ok(Self { client })
    }

    fn create_auth_header(username: &str, password: &str) -> String {
        let credentials = format!("{username}:{password}");
        let encoded = STANDARD.encode(credentials.as_bytes());
        format!("Basic {encoded}")
    }

    /// Fetch account info including subscriptions from ntfy server
    pub async fn get_account(
        &self,
        server_url: &str,
        username: &str,
        password: &str,
    ) -> Result<NtfyAccount, AppError> {
        let url = format!("{}/v1/account", normalize_url(server_url));
        log::info!("Fetching account from: {url}");

        let auth_header = Self::create_auth_header(username, password);

        let response = self
            .client
            .get(&url)
            .header("Authorization", auth_header)
            .send()
            .await
            .map_err(|e| {
                log::error!(
                    "Failed to connect: {} (is_connect: {}, is_timeout: {}, is_request: {})",
                    e,
                    e.is_connect(),
                    e.is_timeout(),
                    e.is_request()
                );
                if let Some(source) = e.source() {
                    log::error!("Error source: {source:?}");
                }
                AppError::Connection(format!("Failed to connect to {server_url}: {e}"))
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            log::error!("Server returned {status}: {body}");
            return Err(AppError::Connection(format!(
                "Server returned {status}: {body}"
            )));
        }

        let text = response
            .text()
            .await
            .map_err(|e| AppError::Connection(format!("Failed to read response: {e}")))?;

        log::info!("ntfy account API response: {text}");

        let account: NtfyAccount = serde_json::from_str(&text).map_err(|e| {
            AppError::Connection(format!("Failed to parse response: {e} - body: {text}"))
        })?;

        log::info!(
            "Parsed account with {} subscriptions",
            account.subscriptions.len()
        );

        Ok(account)
    }

    /// Fetch messages from a topic since a given timestamp
    /// If since is None, fetches all available messages (up to server limit)
    pub async fn get_messages(
        &self,
        server_url: &str,
        topic: &str,
        since: Option<i64>,
        username: Option<&str>,
        password: Option<&str>,
    ) -> Result<Vec<NtfyMessage>, AppError> {
        let base = normalize_url(server_url);

        // Build URL with poll parameter to get historical messages
        // since=<timestamp> gets messages since that Unix timestamp
        // poll=1 returns immediately instead of keeping connection open
        let url = match since {
            Some(ts) => format!("{base}/{topic}/json?poll=1&since={ts}"),
            None => format!("{base}/{topic}/json?poll=1&since=all"),
        };

        log::info!("Fetching messages from: {url}");

        let mut request = self.client.get(&url);

        // Add auth header if credentials provided
        if let (Some(user), Some(pass)) = (username, password) {
            if !user.is_empty() {
                request = request.header("Authorization", Self::create_auth_header(user, pass));
            }
        }

        let response = request.send().await.map_err(|e| {
            log::error!("Failed to fetch messages: {e}");
            AppError::Connection(format!(
                "Failed to fetch messages from {server_url}: {e}"
            ))
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            log::error!("Server returned {status}: {body}");
            return Err(AppError::Connection(format!(
                "Failed to fetch messages: {status} - {body}"
            )));
        }

        let text = response
            .text()
            .await
            .map_err(|e| AppError::Connection(format!("Failed to read response: {e}")))?;

        // ntfy returns newline-delimited JSON
        let mut messages = Vec::new();
        for line in text.lines() {
            if line.trim().is_empty() {
                continue;
            }
            match serde_json::from_str::<NtfyMessage>(line) {
                Ok(msg) => {
                    // Only include actual messages, not open/keepalive events
                    if msg.event == "message" {
                        messages.push(msg);
                    }
                }
                Err(e) => {
                    log::warn!("Failed to parse message: {e} - line: {line}");
                }
            }
        }

        log::info!(
            "Fetched {} messages from {}/{}",
            messages.len(),
            server_url,
            topic
        );
        Ok(messages)
    }
}

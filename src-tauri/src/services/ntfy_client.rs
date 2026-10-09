use reqwest::{Client, Method, RequestBuilder, Response, StatusCode};
use serde::Deserialize;
use std::time::Duration;

use crate::error::AppError;
use crate::models::NtfyMessage;

/// REST timeouts: a dead server fails fast instead of hanging the UI.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const TOTAL_TIMEOUT: Duration = Duration::from_secs(30);

pub const WRONG_CREDENTIALS: &str = "Wrong username, password or token";
pub const NO_TOPIC_ACCESS: &str = "No access to this topic";
pub const RATE_LIMITED: &str = "Rate limited by the server, retrying later";

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct NtfyAccount {
    /// Missing or `*` when the server has no user accounts (anonymous access).
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub subscriptions: Vec<NtfySubscription>,
}

impl NtfyAccount {
    /// Whether the request was answered for a real account, not anonymously.
    pub fn is_signed_in(&self) -> bool {
        self.username
            .as_deref()
            .is_some_and(|u| !u.is_empty() && u != "*")
    }
}

#[derive(Debug, Deserialize)]
pub struct NtfySubscription {
    pub base_url: String,
    pub topic: String,
    #[serde(default)]
    pub display_name: Option<String>,
}

/// Maps an HTTP status from the server to the error the user sees.
pub fn status_error(status: StatusCode, context: &str) -> AppError {
    match status {
        StatusCode::UNAUTHORIZED => AppError::Auth(WRONG_CREDENTIALS.to_string()),
        StatusCode::FORBIDDEN => AppError::Forbidden(NO_TOPIC_ACCESS.to_string()),
        StatusCode::TOO_MANY_REQUESTS => AppError::RateLimited(RATE_LIMITED.to_string()),
        _ => AppError::Connection(format!("{context}: server returned {status}")),
    }
}

pub struct NtfyClient {
    client: Client,
}

impl NtfyClient {
    pub fn new() -> Result<Self, AppError> {
        let client = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(TOTAL_TIMEOUT)
            .build()
            .map_err(|e| AppError::Connection(format!("Failed to create HTTP client: {e}")))?;

        Ok(Self { client })
    }

    fn request(&self, method: Method, url: &str, auth: Option<&str>) -> RequestBuilder {
        let request = self.client.request(method, url);
        match auth {
            Some(auth) => request.header(reqwest::header::AUTHORIZATION, auth),
            None => request,
        }
    }

    /// Sends a request and turns network failures and error statuses into `AppError`s.
    async fn send(request: RequestBuilder, context: &str) -> Result<Response, AppError> {
        let response = request.send().await.map_err(|e| {
            log::error!("{context}: {e}");
            AppError::Connection(format!("{context}: {e}"))
        })?;
        if response.status().is_success() {
            return Ok(response);
        }
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        log::error!("{context}: server returned {status}: {body}");
        Err(status_error(status, context))
    }

    /// Fetches the account (and its subscriptions) the credential belongs to.
    /// Works anonymously too; then the account has no username.
    pub async fn get_account(
        &self,
        server_url: &str,
        auth: Option<&str>,
    ) -> Result<NtfyAccount, AppError> {
        let url = format!("{server_url}/v1/account");
        let response = Self::send(
            self.request(Method::GET, &url, auth),
            &format!("Failed to reach {server_url}"),
        )
        .await?;

        response
            .json()
            .await
            .map_err(|e| AppError::Connection(format!("Unexpected account response: {e}")))
    }

    /// Deletes a message (all versions of its sequence) on the server.
    pub async fn delete_message(
        &self,
        server_url: &str,
        topic: &str,
        sequence_id: &str,
        auth: Option<&str>,
    ) -> Result<(), AppError> {
        let url = format!("{server_url}/{topic}/{sequence_id}");
        log::info!("Deleting message from: {url}");
        Self::send(
            self.request(Method::DELETE, &url, auth),
            "Failed to delete message",
        )
        .await?;
        Ok(())
    }

    /// Polls a topic for messages since `since` (ntfy seconds, inclusive), or all cached
    /// messages when `None`. Returns every event; the receive path picks the messages.
    pub async fn get_messages(
        &self,
        server_url: &str,
        topic: &str,
        since: Option<i64>,
        auth: Option<&str>,
    ) -> Result<Vec<NtfyMessage>, AppError> {
        let since = since.map_or_else(|| "all".to_string(), |t| t.to_string());
        let url = format!("{server_url}/{topic}/json?poll=1&since={since}");
        log::info!("Fetching messages from: {url}");

        let response = Self::send(
            self.request(Method::GET, &url, auth),
            "Failed to fetch messages",
        )
        .await?;

        // The server keeps the newest messages that fit and drops older ones, so there's
        // nothing to page back to; only a huge `since=all` replay hits this.
        if response.headers().contains_key("x-messages-truncated") {
            log::warn!("{server_url}/{topic}: server dropped older messages from this poll");
        }

        let text = response
            .text()
            .await
            .map_err(|e| AppError::Connection(format!("Failed to read response: {e}")))?;

        // ntfy returns newline-delimited JSON
        Ok(text
            .lines()
            .filter(|line| !line.trim().is_empty())
            .filter_map(|line| {
                serde_json::from_str::<NtfyMessage>(line)
                    .map_err(|e| log::warn!("Failed to parse message: {e} - line: {line}"))
                    .ok()
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ServerConfig;
    use crate::services::test_server;

    fn server(username: Option<&str>, password: Option<&str>, token: Option<&str>) -> ServerConfig {
        ServerConfig {
            url: test_server::url().unwrap_or_default(),
            username: username.map(str::to_string),
            password: password.map(str::to_string),
            token: token.map(str::to_string),
            is_default: false,
        }
    }

    #[tokio::test]
    async fn account_with_password_token_and_wrong_password() {
        let Some(url) = test_server::url() else {
            return;
        };
        let client = NtfyClient::new().unwrap();

        for config in [
            server(Some(test_server::USER), Some(test_server::PASS), None),
            server(None, None, Some(test_server::TOKEN)),
        ] {
            let account = client
                .get_account(&url, config.auth_header().as_deref())
                .await
                .unwrap();
            assert!(account.is_signed_in());
            assert_eq!(account.username.as_deref(), Some(test_server::USER));
        }

        let wrong = server(Some(test_server::USER), Some("nope"), None);
        let err = client
            .get_account(&url, wrong.auth_header().as_deref())
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::Auth(_)), "{err:?}");

        let anonymous = client.get_account(&url, None).await.unwrap();
        assert!(!anonymous.is_signed_in());
    }

    #[tokio::test]
    async fn locked_topic_is_forbidden() {
        let Some(url) = test_server::url() else {
            return;
        };
        let config = server(Some(test_server::USER), Some(test_server::PASS), None);
        let err = NtfyClient::new()
            .unwrap()
            .get_messages(
                &url,
                test_server::LOCKED_TOPIC,
                None,
                config.auth_header().as_deref(),
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::Forbidden(_)), "{err:?}");
    }
}

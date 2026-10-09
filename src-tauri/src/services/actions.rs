//! Runs a message's action buttons, for the in-app button and the toast alike.

use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::db::Database;
use crate::error::AppError;
use crate::models::{ActionType, NotificationAction};
use crate::services::{url_opener, ConnectionManager, TrayManager};

const HTTP_TIMEOUT: Duration = Duration::from_secs(10);

/// Runs one action of a stored message. With `clear`, a successful action also marks the
/// message read and removes its toast (it never deletes the message).
pub async fn run_action(
    app: &AppHandle,
    notification_id: &str,
    action_id: &str,
) -> Result<(), AppError> {
    let db: tauri::State<Database> = app.state();
    let notification = db
        .get_notification(notification_id)?
        .ok_or_else(|| AppError::NotFound("The message is gone".to_string()))?;
    let action = notification
        .actions
        .iter()
        .find(|a| a.id == action_id)
        .ok_or_else(|| AppError::NotFound("The action is gone".to_string()))?;

    match action.action {
        ActionType::View => url_opener::open_url(action.url.as_deref().unwrap_or_default())?,
        ActionType::Http => send_http(action).await?,
        ActionType::Copy => app
            .clipboard()
            .write_text(action.value.clone().unwrap_or_default())
            .map_err(|e| AppError::Validation(format!("{} failed: {e}", action.label)))?,
        ActionType::Unknown => {
            return Err(AppError::Validation(format!(
                "{} isn't supported",
                action.label
            )))
        }
    }

    if action.clear {
        db.mark_notification_read(notification_id)?;
        if let Some(sequence_id) = &notification.sequence_id {
            ConnectionManager::remove_toast(app, &notification.topic_id, sequence_id);
        }
        let _ = app.emit("subscription:changed", &notification.topic_id);
        app.state::<TrayManager>().refresh_from_db(app).await;
    }
    Ok(())
}

/// Sends exactly the request the message describes (method, headers, body). Never adds
/// our server credentials: the URL can point anywhere.
pub async fn send_http(action: &NotificationAction) -> Result<(), AppError> {
    let failed =
        |reason: String| AppError::Connection(format!("{} failed: {reason}", action.label));

    let url = action
        .url
        .as_deref()
        .ok_or_else(|| failed("no URL".to_string()))?;
    let method = action.method.as_deref().unwrap_or("POST").to_uppercase();
    let method =
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| failed(e.to_string()))?;

    let mut request = reqwest::Client::builder()
        .timeout(HTTP_TIMEOUT)
        .build()
        .map_err(|e| failed(e.to_string()))?
        .request(method, url);
    for (name, value) in &action.headers {
        request = request.header(name, value);
    }
    if let Some(body) = &action.body {
        request = request.body(body.clone());
    }

    let response = request.send().await.map_err(|e| failed(e.to_string()))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(failed(response.status().as_u16().to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{NtfyMessage, ServerConfig};
    use crate::services::connection_manager::tests::read_ws;
    use crate::services::test_server;

    #[tokio::test]
    async fn http_and_copy_actions_parse_and_http_runs() {
        let Some(url) = test_server::url() else {
            return;
        };
        let topic = test_server::unique_topic("act");
        let target = test_server::unique_topic("act_target");
        let auth = ServerConfig {
            url: url.clone(),
            username: Some(test_server::USER.to_string()),
            password: Some(test_server::PASS.to_string()),
            token: None,
            is_default: false,
        }
        .auth_header()
        .unwrap();
        let actions = format!(
            "http, Ping, {url}/{target}, method=PUT, headers.Authorization={auth}, body=pong, clear=true; copy, Copy, value=abc"
        );
        let published =
            test_server::publish(&url, &topic, "hi", &[("X-Actions", actions.as_str())]).await;

        let n = serde_json::from_value::<NtfyMessage>(published)
            .unwrap()
            .into_notification("sub".to_string());
        let [http, copy] = n.actions.as_slice() else {
            panic!("expected two actions, got {:?}", n.actions);
        };
        assert_eq!(http.action, ActionType::Http);
        assert_eq!(http.method.as_deref(), Some("PUT"));
        assert_eq!(http.body.as_deref(), Some("pong"));
        assert!(http.clear);
        assert_eq!(copy.action, ActionType::Copy);
        assert_eq!(copy.value.as_deref(), Some("abc"));

        send_http(http).await.unwrap();
        let got = read_ws(&url, &target, None, 1).await;
        assert_eq!(got[0].message.as_deref(), Some("pong"));
    }
}

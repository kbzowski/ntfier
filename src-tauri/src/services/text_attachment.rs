//! Inlined text attachments: a message body the server stored as a `.txt` file because it
//! was too long (over `message-size-limit`, 4 KiB by default) or not UTF-8. The server then
//! sets the message to `You received a file: <name>`. Fetching the file on receive turns it
//! back into a normal message; the file itself expires after a few hours.

use std::time::Duration;

use crate::models::Notification;

/// Bigger files stay attachments.
const MAX_BYTES: usize = 64 * 1024;
const TIMEOUT: Duration = Duration::from_secs(10);

/// The URL to fetch when the message is an inlined text body, else `None`.
///
/// Only the server's own `/file/` URLs: an external `attach=` URL can produce the same
/// message text and is never fetched.
pub fn inline_candidate<'a>(
    notification: &'a Notification,
    server_url: &str,
    now: i64,
) -> Option<&'a str> {
    let [attachment] = notification.attachments.as_slice() else {
        return None;
    };
    let is_candidate = notification.message == format!("You received a file: {}", attachment.name)
        && attachment.url.starts_with(&format!("{server_url}/file/"))
        && attachment.attachment_type.starts_with("text/")
        && attachment
            .size
            .is_some_and(|s| usize::try_from(s).is_ok_and(|s| s <= MAX_BYTES))
        && attachment.expires.is_none_or(|e| e > now);
    is_candidate.then_some(attachment.url.as_str())
}

/// Downloads the text, without credentials (`/file/` needs none, and a wrong header gets
/// a 401). `None` on any failure: the message then keeps its file card.
pub async fn fetch(url: &str) -> Option<String> {
    let mut response = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .ok()?
        .get(url)
        .send()
        .await
        .ok()?
        .error_for_status()
        .map_err(|e| log::warn!("Couldn't fetch text attachment {url}: {e}"))
        .ok()?;

    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        body.extend_from_slice(&chunk);
        if body.len() > MAX_BYTES {
            return None;
        }
    }
    Some(String::from_utf8_lossy(&body).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::NtfyMessage;
    use crate::services::test_server;

    const SERVER: &str = "https://ntfy.example";

    fn received(attachment_url: &str, kind: &str, size: i64, expires: i64) -> Notification {
        serde_json::from_value::<NtfyMessage>(serde_json::json!({
            "id": "a", "time": 1, "event": "message", "topic": "t",
            "message": "You received a file: attachment.txt",
            "attachment": {
                "name": "attachment.txt", "type": kind, "size": size,
                "expires": expires, "url": attachment_url
            }
        }))
        .unwrap()
        .into_notification("sub".to_string())
    }

    #[test]
    fn detects_only_own_small_unexpired_text_files() {
        let own = format!("{SERVER}/file/a.txt");
        let ok = received(&own, "text/plain; charset=utf-8", 5000, 200);
        assert_eq!(inline_candidate(&ok, SERVER, 100), Some(own.as_str()));

        let external = received("https://elsewhere/file/a.txt", "text/plain", 5000, 200);
        let image = received(&own, "image/png", 5000, 200);
        let big = received(&own, "text/plain", 70_000, 200);
        let expired = received(&own, "text/plain", 5000, 50);
        for n in [external, image, big, expired] {
            assert_eq!(inline_candidate(&n, SERVER, 100), None);
        }

        let mut written = received(&own, "text/plain", 5000, 200);
        written.message = "Here is a file".to_string();
        assert_eq!(inline_candidate(&written, SERVER, 100), None);
    }

    #[tokio::test]
    async fn long_body_comes_back_from_the_file() {
        let Some(url) = test_server::url() else {
            return;
        };
        let topic = test_server::unique_topic("long");
        let body = "x".repeat(5000);
        let published = test_server::publish(&url, &topic, &body, &[]).await;
        let n = serde_json::from_value::<NtfyMessage>(published)
            .unwrap()
            .into_notification("sub".to_string());

        let file = inline_candidate(&n, &url, chrono::Utc::now().timestamp()).unwrap();
        assert!(n.attachments[0].expires.is_some());
        assert_eq!(fetch(file).await.as_deref(), Some(body.as_str()));
    }
}

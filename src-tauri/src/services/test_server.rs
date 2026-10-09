//! Gate and helpers for integration tests against a real ntfy server.
//!
//! Start the servers with `scripts/ntfy-test-servers.sh`, then run `cargo test` with
//! `NTFY_TEST_URL` (and `NTFY_TEST_OLD_URL` for the v2.16 server). Without them the
//! integration tests return early, so plain `cargo test` stays offline.

// Shared by every integration test; not all of them use every helper.
#![allow(dead_code)]

pub const USER: &str = "tester";
pub const PASS: &str = "testpass";
pub const TOKEN: &str = "tk_ntfiertestaccesstoken00000001";
/// Denied to everyone on the test server.
pub const LOCKED_TOPIC: &str = "locked";

fn env_url(name: &str) -> Option<String> {
    let url = std::env::var(name).ok()?;
    // reqwest is built without a default TLS provider, see lib.rs::run()
    let _ = rustls::crypto::ring::default_provider().install_default();
    Some(url)
}

/// URL of the current ntfy test server, or `None` to skip the test.
pub fn url() -> Option<String> {
    env_url("NTFY_TEST_URL")
}

/// URL of the old (v2.16) ntfy test server, or `None` to skip the test.
pub fn old_url() -> Option<String> {
    env_url("NTFY_TEST_OLD_URL")
}

/// A topic no other test run has used.
pub fn unique_topic(prefix: &str) -> String {
    format!("{prefix}_{}", uuid::Uuid::new_v4().simple())
}

/// Publishes a message as the test user and returns the server's JSON reply.
pub async fn publish(
    url: &str,
    topic: &str,
    body: &str,
    headers: &[(&str, &str)],
) -> serde_json::Value {
    let mut req = reqwest::Client::new()
        .post(format!("{url}/{topic}"))
        .basic_auth(USER, Some(PASS))
        .body(body.to_string());
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    let resp = req.send().await.expect("publish request");
    assert!(
        resp.status().is_success(),
        "publish failed: {}",
        resp.status()
    );
    resp.json().await.expect("publish reply")
}

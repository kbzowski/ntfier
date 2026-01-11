//! Server URL newtype and utilities for consistent URL handling.

use serde::{Deserialize, Serialize};

/// Normalizes a URL by removing trailing slashes.
///
/// This is useful for consistent URL comparison since "https://ntfy.sh"
/// and "https://ntfy.sh/" should be treated as equivalent.
pub fn normalize_url(url: &str) -> &str {
    url.trim_end_matches('/')
}

/// Checks if two URLs match (ignoring trailing slashes).
#[allow(dead_code)]
pub fn urls_match(url1: &str, url2: &str) -> bool {
    normalize_url(url1) == normalize_url(url2)
}

/// A normalized server URL that ensures consistent trailing slash handling.
///
/// URLs are stored without trailing slashes to enable reliable comparison.
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ServerUrl(String);

#[allow(dead_code)]
impl ServerUrl {
    /// Creates a new ServerUrl, normalizing the input by removing trailing slashes.
    pub fn new(url: impl Into<String>) -> Self {
        let url = url.into();
        Self(url.trim_end_matches('/').to_string())
    }

    /// Returns the normalized URL as a string slice.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Checks if this URL matches another URL string (ignoring trailing slashes).
    pub fn matches(&self, other: &str) -> bool {
        self.0 == other.trim_end_matches('/')
    }

    /// Creates a full URL path by joining with a path segment.
    pub fn join(&self, path: &str) -> String {
        format!("{}/{}", self.0, path.trim_start_matches('/'))
    }
}

impl AsRef<str> for ServerUrl {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for ServerUrl {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<String> for ServerUrl {
    fn from(s: String) -> Self {
        Self::new(s)
    }
}

impl From<&str> for ServerUrl {
    fn from(s: &str) -> Self {
        Self::new(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalizes_trailing_slash() {
        let url = ServerUrl::new("https://ntfy.sh/");
        assert_eq!(url.as_str(), "https://ntfy.sh");
    }

    #[test]
    fn test_matches_with_trailing_slash() {
        let url = ServerUrl::new("https://ntfy.sh");
        assert!(url.matches("https://ntfy.sh/"));
        assert!(url.matches("https://ntfy.sh"));
    }

    #[test]
    fn test_join_path() {
        let url = ServerUrl::new("https://ntfy.sh/");
        assert_eq!(url.join("v1/account"), "https://ntfy.sh/v1/account");
        assert_eq!(url.join("/v1/account"), "https://ntfy.sh/v1/account");
    }
}

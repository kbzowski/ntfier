//! Server URL utilities for consistent URL handling.

/// Normalizes a URL by removing trailing slashes.
///
/// This is useful for consistent URL comparison since "<https://ntfy.sh>"
/// and "<https://ntfy.sh>/" should be treated as equivalent.
pub fn normalize_url(url: &str) -> &str {
    url.trim_end_matches('/')
}

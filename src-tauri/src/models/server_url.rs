//! Canonical server URLs: the single written form of a server address.

use url::Url;

use crate::error::AppError;

/// Parses a server URL into its canonical form.
///
/// Lowercase scheme and host, no default port, no trailing slash, path kept.
/// Only http(s), and no credentials, query or fragment. Two servers are the same
/// server exactly when their canonical URLs are equal.
pub fn canonical_url(input: &str) -> Result<String, AppError> {
    let parsed = Url::parse(input.trim())
        .map_err(|e| AppError::InvalidUrl(format!("Invalid server URL: {e}")))?;

    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AppError::InvalidUrl(
            "Server URL must use http or https".to_string(),
        ));
    }
    let Some(host) = parsed.host_str() else {
        return Err(AppError::InvalidUrl(
            "Server URL must have a host".to_string(),
        ));
    };
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(AppError::InvalidUrl(
            "Server URL can't have a query or fragment".to_string(),
        ));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(AppError::InvalidUrl(
            "Put the login in the username and password fields, not the URL".to_string(),
        ));
    }

    let port = parsed.port().map(|p| format!(":{p}")).unwrap_or_default();
    let path = parsed.path().trim_end_matches('/');
    Ok(format!("{}://{host}{port}{path}", parsed.scheme()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_server_written_differently_is_equal() {
        for input in [
            "https://ntfy.sh",
            "https://ntfy.sh/",
            "HTTPS://NTFY.sh",
            "https://ntfy.sh:443/",
            " https://ntfy.sh ",
        ] {
            assert_eq!(canonical_url(input).unwrap(), "https://ntfy.sh", "{input}");
        }
    }

    #[test]
    fn keeps_path_and_non_default_port() {
        assert_eq!(
            canonical_url("http://10.0.0.5:8080/ntfy/").unwrap(),
            "http://10.0.0.5:8080/ntfy"
        );
        assert_eq!(canonical_url("http://x:80").unwrap(), "http://x");
        assert_eq!(canonical_url("http://[::1]:81").unwrap(), "http://[::1]:81");
    }

    #[test]
    fn rejects_other_forms() {
        for input in [
            "ftp://x",
            "https://x/?a=1",
            "https://x/#f",
            "https://u:p@x",
            "not a url",
        ] {
            assert!(canonical_url(input).is_err(), "{input}");
        }
    }
}

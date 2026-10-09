//! Opening URLs that come from messages (click, view actions).

use url::Url;

use crate::error::AppError;

/// Opens a publisher-supplied URL in the default app. Only web and mail links: a `file:`
/// or custom-scheme URL from a message must never start a program.
pub fn open_url(url: &str) -> Result<(), AppError> {
    let parsed = Url::parse(url).map_err(|e| AppError::InvalidUrl(format!("{url}: {e}")))?;
    if !matches!(parsed.scheme(), "http" | "https" | "mailto") {
        return Err(AppError::InvalidUrl(format!(
            "Won't open {} links",
            parsed.scheme()
        )));
    }
    open::that_detached(url).map_err(|e| AppError::Connection(format!("Can't open {url}: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_non_web_schemes() {
        for url in [
            "file:///C:/Windows/System32/calc.exe",
            "ms-settings:",
            "not a url",
        ] {
            assert!(open_url(url).is_err(), "{url}");
        }
    }
}

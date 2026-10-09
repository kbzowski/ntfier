//! Tags that are emoji shortcodes, shown as emoji in front of the title.
//!
//! `emoji_map.json` is ntfy's own list (`mail/mailer_emoji_map.json` in the ntfy repo,
//! generated from GitHub's gemoji), so tags render the way the ntfy apps show them.

use std::collections::HashMap;
use std::sync::OnceLock;

static EMOJI: OnceLock<HashMap<String, String>> = OnceLock::new();

/// The emoji for a tag like `warning` or `tada`, if it is one.
pub fn emoji_for_tag(tag: &str) -> Option<&'static str> {
    EMOJI
        .get_or_init(|| serde_json::from_str(include_str!("emoji_map.json")).unwrap_or_default())
        .get(tag)
        .map(String::as_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_tags_map_to_emoji() {
        assert_eq!(emoji_for_tag("tada"), Some("\u{1f389}"));
        assert_eq!(emoji_for_tag("backup"), None);
    }
}

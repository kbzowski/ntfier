//! Ignore rules: hide notifications whose title contains a given fragment.

use serde::{Deserialize, Serialize};
use specta::Type;

/// A rule hiding notifications whose title contains `pattern`.
///
/// `subscription_id` of `None` means the rule applies to every topic.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreRule {
    pub id: String,
    pub pattern: String,
    pub subscription_id: Option<String>,
    /// Unix timestamp in milliseconds.
    #[specta(type = specta_typescript::Number)]
    pub created_at: i64,
}

impl IgnoreRule {
    fn matches(&self, title_lower: &str, topic_id: &str) -> bool {
        self.subscription_id
            .as_ref()
            .is_none_or(|id| id == topic_id)
            && title_lower.contains(&self.pattern.to_lowercase())
    }
}

/// Returns whether a notification title is hidden by any rule.
#[allow(dead_code)]
pub fn is_ignored(title: &str, topic_id: &str, rules: &[IgnoreRule]) -> bool {
    if rules.is_empty() {
        return false;
    }

    let title_lower = title.to_lowercase();
    rules.iter().any(|r| r.matches(&title_lower, topic_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(pattern: &str, subscription_id: Option<&str>) -> IgnoreRule {
        IgnoreRule {
            id: "rule-1".to_string(),
            pattern: pattern.to_string(),
            subscription_id: subscription_id.map(str::to_string),
            created_at: 0,
        }
    }

    #[test]
    fn global_rule_matches_any_topic() {
        let rules = vec![rule("backup", None)];
        assert!(is_ignored("Nightly backup done", "topic-a", &rules));
        assert!(is_ignored("Nightly backup done", "topic-b", &rules));
    }

    #[test]
    fn scoped_rule_does_not_match_other_topic() {
        let rules = vec![rule("backup", Some("topic-a"))];
        assert!(is_ignored("Nightly backup done", "topic-a", &rules));
        assert!(!is_ignored("Nightly backup done", "topic-b", &rules));
    }

    #[test]
    fn matching_is_case_insensitive() {
        let rules = vec![rule("BaCkUp", None)];
        assert!(is_ignored("nightly BACKUP done", "topic-a", &rules));
    }

    #[test]
    fn non_matching_title_is_not_ignored() {
        let rules = vec![rule("backup", None)];
        assert!(!is_ignored("Deploy finished", "topic-a", &rules));
    }

    #[test]
    fn empty_rules_ignore_nothing() {
        assert!(!is_ignored("anything at all", "topic-a", &[]));
    }

    #[test]
    fn empty_title_does_not_match() {
        let rules = vec![rule("backup", None)];
        assert!(!is_ignored("", "topic-a", &rules));
    }
}

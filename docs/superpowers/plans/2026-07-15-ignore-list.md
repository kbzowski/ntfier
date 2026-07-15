# Ignore List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user hide recurring junk notifications by matching a fragment of the message title.

**Architecture:** A new `ignore_rules` table holds title fragments, each global or scoped to one topic. `ignored` is never stored — it is computed on read by a single predicate, so rules apply retroactively and deleting a rule fully restores prior state. The predicate gates the system toast on arrival, annotates notifications on read, and is subtracted from every unread count.

**Tech Stack:** Rust, Tauri v2, Diesel + SQLite, specta (TS bindings), React 19, vitest, biome.

## Global Constraints

- Rust MSRV is `rust-version = "1.88"` (`src-tauri/Cargo.toml`). `Option::is_none_or` (stable 1.82) is available; do not use anything newer.
- No new dependencies. Everything needed is present: `uuid`, `chrono`, and the shadcn primitives in `ui/src/components/ui/`.
- There is no `switch.tsx`. Use `checkbox.tsx`, `setting-checkbox.tsx`, or `button.tsx`.
- Repo language is English: code, comments, log messages, UI copy.
- No explanatory comments. Comment only a non-obvious *why*, a known ceiling, or a public API contract.
- Commit messages must be terse — subject line, at most a short why. A `commit-msg` hook rejects long bodies.
- `pnpm` only, never `npm`. Rust commands run from `src-tauri/`.
- There is no root `ui:typecheck` script. Typecheck with `pnpm --filter ui typecheck` — the same command lefthook's `ui-typecheck` hook runs. `ui:lint` and `ui:test` do exist at the root.
- Never commit to `main`. Work happens on `feat/ignore-list`.
- A lefthook `pre-commit` hook runs `rust-fmt`, `rust-clippy`, `ui-typecheck`, and `ui-lint` on matching staged files. Do not bypass it.

## Spec

`docs/superpowers/specs/2026-07-15-ignore-list-design.md`

## File Structure

Rust:

| File | Responsibility |
| --- | --- |
| `migrations/2026-07-15-000000_add_ignore_rules/{up,down}.sql` | table DDL |
| `src/db/schema.rs` | Diesel table macro (hand-edited; the repo has no diesel CLI step) |
| `src/db/models.rs` | `IgnoreRuleRow`, `NewIgnoreRule` |
| `src/models/ignore_rule.rs` | domain `IgnoreRule` + `is_ignored` predicate + its tests |
| `src/db/queries/ignore_rules.rs` | rules CRUD |
| `src/db/queries/notifications.rs` | `ignored` on list; unread counts exclude ignored |
| `src/db/queries/subscriptions.rs` | override the raw-SQL `unread` when rules exist |
| `src/commands/ignore_rules.rs` | three Tauri commands |
| `src/error.rs` | new `Validation` variant |
| `src/services/{connection_manager,sync_service}.rs` | suppress toast on arrival |

UI:

| File | Responsibility |
| --- | --- |
| `ui/src/components/dialogs/settings/IgnoredTab.tsx` | rules management surface |
| `ui/src/components/dialogs/SettingsDialog.tsx` | fifth tab |
| `ui/src/components/notifications/IgnoreRuleDialog.tsx` | "Ignore similar" prompt |
| `ui/src/components/notifications/NotificationCard.tsx` | context menu item |
| `ui/src/components/notifications/NotificationList.tsx` | toggle, filter, unread count |
| `ui/src/hooks/useNotifications.ts` | `getUnreadCount` excludes ignored |
| `ui/src/context/AppContext.tsx` | rules state + CRUD wiring |

---

### Task 1: Data model and the predicate

The foundation: the table, the domain type, and the single matching function with its tests. Nothing consumes it yet.

**Files:**
- Create: `src-tauri/migrations/2026-07-15-000000_add_ignore_rules/up.sql`
- Create: `src-tauri/migrations/2026-07-15-000000_add_ignore_rules/down.sql`
- Create: `src-tauri/src/models/ignore_rule.rs`
- Modify: `src-tauri/src/models/mod.rs`
- Modify: `src-tauri/src/db/schema.rs`
- Modify: `src-tauri/src/db/models.rs`

**Interfaces:**
- Produces: `models::IgnoreRule { id: String, pattern: String, subscription_id: Option<String>, created_at: i64 }`; `models::is_ignored(title: &str, topic_id: &str, rules: &[IgnoreRule]) -> bool`; `db::models::{IgnoreRuleRow, NewIgnoreRule}`; `db::schema::ignore_rules`.

Note the predicate takes `(title, topic_id)` rather than `&Notification`. Task 4 counts unread messages from `(subscription_id, title)` tuples where no `Notification` exists, and must call the same function.

- [ ] **Step 1: Write the migration**

`up.sql`:

```sql
CREATE TABLE ignore_rules (
    id TEXT PRIMARY KEY NOT NULL,
    pattern TEXT NOT NULL,
    subscription_id TEXT REFERENCES subscriptions(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL
);
```

`down.sql`:

```sql
DROP TABLE ignore_rules;
```

- [ ] **Step 2: Add the Diesel table to `src/db/schema.rs`**

Append after the `settings` table macro:

```rust
diesel::table! {
    ignore_rules (id) {
        id -> Text,
        pattern -> Text,
        subscription_id -> Nullable<Text>,
        created_at -> BigInt,
    }
}
```

Add the join, next to the existing `joinable!` lines:

```rust
diesel::joinable!(ignore_rules -> subscriptions (subscription_id));
```

Replace the existing `allow_tables_to_appear_in_same_query!` line with:

```rust
diesel::allow_tables_to_appear_in_same_query!(
    ignore_rules,
    notifications,
    servers,
    settings,
    subscriptions,
);
```

- [ ] **Step 3: Add the Diesel row structs to `src/db/models.rs`**

Extend the `use super::schema::{...}` line to include `ignore_rules`. Append at the end of the file:

```rust
// ===== Ignore rule =====

/// An ignore rule row from the database (for querying).
#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = ignore_rules)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct IgnoreRuleRow {
    pub id: String,
    pub pattern: String,
    pub subscription_id: Option<String>,
    pub created_at: i64,
}

/// A new ignore rule to insert.
#[derive(Debug, Insertable)]
#[diesel(table_name = ignore_rules)]
pub struct NewIgnoreRule<'a> {
    pub id: &'a str,
    pub pattern: &'a str,
    pub subscription_id: Option<&'a str>,
    pub created_at: i64,
}
```

- [ ] **Step 4: Write the failing test**

Create `src-tauri/src/models/ignore_rule.rs` containing ONLY the test module for now, so the test fails to compile against a missing predicate:

```rust
//! Ignore rules: hide notifications whose title contains a given fragment.

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
```

Register the module in `src/models/mod.rs`:

```rust
mod ignore_rule;
mod notification;
mod server_url;
mod settings;
mod subscription;

pub use ignore_rule::*;
pub use notification::*;
pub use server_url::normalize_url;
pub use settings::*;
pub use subscription::*;
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd src-tauri && cargo test ignore_rule`
Expected: FAIL — compile error, `cannot find type IgnoreRule in this scope` and `cannot find function is_ignored in this scope`.

- [ ] **Step 6: Write the implementation**

Insert above the `#[cfg(test)]` module in `src/models/ignore_rule.rs`:

```rust
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
pub fn is_ignored(title: &str, topic_id: &str, rules: &[IgnoreRule]) -> bool {
    if rules.is_empty() {
        return false;
    }

    let title_lower = title.to_lowercase();
    rules.iter().any(|r| r.matches(&title_lower, topic_id))
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test ignore_rule`
Expected: PASS — 6 passed.

- [ ] **Step 8: Verify the migration applies**

Run: `cd src-tauri && cargo build`
Expected: builds clean. The migration runs on next app start via `diesel_migrations`; nothing queries the table yet.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/migrations src-tauri/src/models src-tauri/src/db/schema.rs src-tauri/src/db/models.rs
git commit -m "feat: add ignore rule model and matching predicate"
```

---

### Task 2: Rules CRUD and Tauri commands

**Files:**
- Create: `src-tauri/src/db/queries/ignore_rules.rs`
- Create: `src-tauri/src/commands/ignore_rules.rs`
- Modify: `src-tauri/src/db/queries/mod.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `ui/src/types/bindings.ts` (generated)

**Interfaces:**
- Consumes: `models::IgnoreRule`, `db::models::{IgnoreRuleRow, NewIgnoreRule}`, `db::schema::ignore_rules` (Task 1).
- Produces: `Database::get_ignore_rules() -> Result<Vec<IgnoreRule>, AppError>`; `Database::add_ignore_rule(pattern: &str, subscription_id: Option<&str>) -> Result<IgnoreRule, AppError>`; `Database::delete_ignore_rule(id: &str) -> Result<(), AppError>`; TS `commands.getIgnoreRules()`, `commands.addIgnoreRule(pattern, subscriptionId)`, `commands.deleteIgnoreRule(id)`; `AppError::Validation`.

- [ ] **Step 1: Add the `Validation` error variant**

In `src-tauri/src/error.rs`, add to the `AppError` enum after `NotFound`:

```rust
    #[error("Validation error: {0}")]
    Validation(String),
```

The existing code reuses `InvalidUrl` for non-URL validation (`models/subscription.rs:55`). Do not follow that precedent here — a blank title fragment is not a URL problem.

- [ ] **Step 2: Write the rules query layer**

Create `src-tauri/src/db/queries/ignore_rules.rs`:

```rust
//! Ignore rule database queries.

use diesel::prelude::*;

use crate::db::connection::Database;
use crate::db::models::{IgnoreRuleRow, NewIgnoreRule};
use crate::db::schema::ignore_rules;
use crate::error::AppError;
use crate::models::IgnoreRule;

impl From<IgnoreRuleRow> for IgnoreRule {
    fn from(row: IgnoreRuleRow) -> Self {
        Self {
            id: row.id,
            pattern: row.pattern,
            subscription_id: row.subscription_id,
            created_at: row.created_at,
        }
    }
}

impl Database {
    /// Returns all ignore rules, oldest first.
    pub fn get_ignore_rules(&self) -> Result<Vec<IgnoreRule>, AppError> {
        let mut conn = self.conn()?;

        let rows: Vec<IgnoreRuleRow> = ignore_rules::table
            .order(ignore_rules::created_at.asc())
            .load(&mut *conn)?;

        Ok(rows.into_iter().map(IgnoreRule::from).collect())
    }

    /// Creates an ignore rule. A `subscription_id` of `None` makes it global.
    pub fn add_ignore_rule(
        &self,
        pattern: &str,
        subscription_id: Option<&str>,
    ) -> Result<IgnoreRule, AppError> {
        let pattern = pattern.trim();
        if pattern.is_empty() {
            return Err(AppError::Validation(
                "Ignore pattern cannot be empty".to_string(),
            ));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let created_at = chrono::Utc::now().timestamp_millis();

        {
            let mut conn = self.conn()?;
            let new_rule = NewIgnoreRule {
                id: &id,
                pattern,
                subscription_id,
                created_at,
            };

            diesel::insert_into(ignore_rules::table)
                .values(&new_rule)
                .execute(&mut *conn)?;
        }

        Ok(IgnoreRule {
            id,
            pattern: pattern.to_string(),
            subscription_id: subscription_id.map(str::to_string),
            created_at,
        })
    }

    /// Deletes an ignore rule by id.
    pub fn delete_ignore_rule(&self, id: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        diesel::delete(ignore_rules::table.filter(ignore_rules::id.eq(id)))
            .execute(&mut *conn)?;

        Ok(())
    }
}
```

Register it in `src-tauri/src/db/queries/mod.rs`:

```rust
mod ignore_rules;
mod notifications;
mod servers;
mod settings;
mod subscriptions;
```

- [ ] **Step 3: Write the commands**

Create `src-tauri/src/commands/ignore_rules.rs`:

```rust
use tauri::State;

use crate::db::connection::Database;
use crate::error::AppError;
use crate::models::IgnoreRule;

#[tauri::command]
#[specta::specta]
pub fn get_ignore_rules(db: State<'_, Database>) -> Result<Vec<IgnoreRule>, AppError> {
    db.get_ignore_rules()
}

#[tauri::command]
#[specta::specta]
pub fn add_ignore_rule(
    db: State<'_, Database>,
    pattern: String,
    subscription_id: Option<String>,
) -> Result<IgnoreRule, AppError> {
    db.add_ignore_rule(&pattern, subscription_id.as_deref())
}

#[tauri::command]
#[specta::specta]
pub fn delete_ignore_rule(db: State<'_, Database>, id: String) -> Result<(), AppError> {
    db.delete_ignore_rule(&id)
}
```

Register in `src-tauri/src/commands/mod.rs`:

```rust
pub mod ignore_rules;
pub mod notifications;
pub mod settings;
pub mod subscriptions;
pub mod sync;
pub mod update;

pub use ignore_rules::*;
pub use notifications::*;
pub use settings::*;
pub use subscriptions::*;
pub use sync::*;
pub use update::*;
```

- [ ] **Step 4: Register the commands with specta**

In `src-tauri/src/lib.rs`, inside `collect_commands![...]`, add after the `// Notifications` block:

```rust
        // Ignore rules
        commands::get_ignore_rules,
        commands::add_ignore_rule,
        commands::delete_ignore_rule,
```

`specta_builder()` feeds both the invoke handler and the binding export, so this one edit covers both.

- [ ] **Step 5: Regenerate the TypeScript bindings**

Run: `pnpm types:create`
Expected: `TypeScript bindings exported to ../ui/src/types/bindings.ts`. `git diff ui/src/types/bindings.ts` shows a new `IgnoreRule` type, the three commands, and `Validation` added to the `AppError` union.

- [ ] **Step 6: Verify it compiles and typechecks**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test`
Expected: no warnings, tests pass.

Run: `pnpm --filter ui typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src ui/src/types/bindings.ts
git commit -m "feat: add ignore rule CRUD commands"
```

---

### Task 3: Compute `ignored` on read and suppress the toast

**Files:**
- Modify: `src-tauri/src/models/notification.rs`
- Modify: `src-tauri/src/db/models.rs:85-103`
- Modify: `src-tauri/src/db/queries/notifications.rs:14-29`
- Modify: `src-tauri/src/services/connection_manager.rs:290-337`
- Modify: `src-tauri/src/services/sync_service.rs:217-259`
- Modify: `ui/src/types/bindings.ts` (generated)

**Interfaces:**
- Consumes: `models::is_ignored`, `Database::get_ignore_rules` (Tasks 1-2).
- Produces: `Notification.ignored: bool` (TS: `ignored: boolean`), present on `get_notifications`, `get_favorite_notifications`, and the `notification:new` event payload.

`ignored` is a computed field. `NotificationRow::into_notification` cannot compute it — it has no rules — so it defaults the field to `false` and callers that have rules overwrite it.

- [ ] **Step 1: Add the field to the domain model**

In `src-tauri/src/models/notification.rs`, add to `Notification` after `is_favorite`:

```rust
    /// Whether an ignore rule currently hides this notification.
    /// Computed on read, never stored.
    pub ignored: bool,
```

- [ ] **Step 2: Default it in the row conversion**

In `src-tauri/src/db/models.rs`, in `NotificationRow::into_notification`, add after `is_favorite`:

```rust
            ignored: false,
```

- [ ] **Step 3: Fix the other construction site**

`src-tauri/src/models/notification.rs` also builds a `Notification` in `into_notification` (around line 171). Add `ignored: false,` there too. Run `cargo build` and fix any remaining struct-literal sites the compiler reports — it will list every one.

- [ ] **Step 4: Compute it on the list query**

In `src-tauri/src/db/queries/notifications.rs`, replace `get_notifications_by_subscription`:

```rust
    /// Gets all notifications for a subscription, ordered by timestamp descending.
    pub fn get_notifications_by_subscription(
        &self,
        subscription_id: &str,
    ) -> Result<Vec<Notification>, AppError> {
        let rules = self.get_ignore_rules()?;

        let mut conn = self.conn()?;

        let rows: Vec<NotificationRow> = notifications::table
            .filter(notifications::subscription_id.eq(subscription_id))
            .order(notifications::timestamp.desc())
            .load(&mut *conn)?;

        Ok(rows
            .into_iter()
            .map(NotificationRow::into_notification)
            .map(|mut n| {
                n.ignored = is_ignored(&n.title, &n.topic_id, &rules);
                n
            })
            .collect())
    }
```

Add `is_ignored` to the `use crate::models::...` line at the top of the file.

Apply the same `.map(...)` to `get_favorite_notifications` in this file, so a favorited-but-ignored notification carries a truthful flag.

- [ ] **Step 5: Suppress the toast on the live path**

In `src-tauri/src/services/connection_manager.rs`, in `handle_notification`, after the notification is built and before the insert:

```rust
        let rules = db.get_ignore_rules().unwrap_or_default();
        let ignored = is_ignored(&notification.title, &notification.topic_id, &rules);
        notification.ignored = ignored;
```

Then change the toast guard from `if !is_muted {` to:

```rust
        if !is_muted && !ignored {
```

The database insert and the `notification:new` emit stay exactly as they are. The event carries `ignored` so the UI can honour the "show ignored" toggle live.

Add `is_ignored` to the crate imports at the top of the file.

- [ ] **Step 6: Suppress the toast on the sync path**

In `src-tauri/src/services/sync_service.rs`, load the rules once before the `for msg in messages` loop:

```rust
        let rules = db.get_ignore_rules().unwrap_or_default();
```

Inside the loop, after `let mut notification = msg.into_notification(sub.id.clone());`:

```rust
            notification.ignored = is_ignored(&notification.title, &notification.topic_id, &rules);
```

Then change the toast guard in the emit loop from `if !sub.muted {` to:

```rust
            if !sub.muted && !notification.ignored {
```

Add `is_ignored` to the crate imports at the top of the file.

- [ ] **Step 7: Regenerate bindings and verify**

Run: `pnpm types:create`
Expected: `Notification` in `bindings.ts` gains `ignored: boolean`.

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test`
Expected: clean.

Run: `pnpm --filter ui typecheck`
Expected: errors in `ui/src/data/mock-data.ts` if it constructs `Notification` literals — add `ignored: false` to each. Fix until clean.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src ui/src
git commit -m "feat: compute ignored flag and suppress toast for ignored messages"
```

---

### Task 4: Unread counts exclude ignored messages

The tray icon must not light up for a message the user cannot find. Both Rust-side counts are computed in Rust rather than SQL — see the spec's flow section 4 for why dynamic SQL is not viable here.

**Files:**
- Modify: `src-tauri/src/db/queries/notifications.rs:203-232`
- Modify: `src-tauri/src/db/queries/subscriptions.rs:21-30`

**Interfaces:**
- Consumes: `models::is_ignored`, `Database::get_ignore_rules`.
- Produces: no signature changes. `get_unread_count`, `get_total_unread_count`, and `get_all_subscriptions` keep their types and gain ignore-aware semantics.

Every change here short-circuits on an empty rules list, so the default install behaves byte-identically to today.

- [ ] **Step 1: Make `get_unread_count` ignore-aware**

In `src-tauri/src/db/queries/notifications.rs`, replace `get_unread_count`:

```rust
    /// Gets the unread count for a subscription, excluding ignored notifications.
    pub fn get_unread_count(&self, subscription_id: &str) -> Result<i32, AppError> {
        use diesel::dsl::count_star;

        let rules = self.get_ignore_rules()?;

        let mut conn = self.conn()?;

        if rules.is_empty() {
            let count: i64 = notifications::table
                .filter(notifications::subscription_id.eq(subscription_id))
                .filter(notifications::read.eq(0))
                .select(count_star())
                .first(&mut *conn)?;

            return Ok(count as i32);
        }

        let titles: Vec<Option<String>> = notifications::table
            .filter(notifications::subscription_id.eq(subscription_id))
            .filter(notifications::read.eq(0))
            .select(notifications::title)
            .load(&mut *conn)?;

        let count = titles
            .into_iter()
            .filter(|t| {
                !is_ignored(t.as_deref().unwrap_or(""), subscription_id, &rules)
            })
            .count();

        Ok(count as i32)
    }
```

- [ ] **Step 2: Make `get_total_unread_count` ignore-aware**

Replace `get_total_unread_count` in the same file:

```rust
    /// Gets the total unread count across all non-muted subscriptions,
    /// excluding ignored notifications.
    pub fn get_total_unread_count(&self) -> Result<i32, AppError> {
        use diesel::dsl::count_star;

        let rules = self.get_ignore_rules()?;

        let mut conn = self.conn()?;

        if rules.is_empty() {
            let count: i64 = notifications::table
                .inner_join(subscriptions::table)
                .filter(notifications::read.eq(0))
                .filter(subscriptions::muted.eq(0))
                .select(count_star())
                .first(&mut *conn)?;

            return Ok(count as i32);
        }

        let rows: Vec<(String, Option<String>)> = notifications::table
            .inner_join(subscriptions::table)
            .filter(notifications::read.eq(0))
            .filter(subscriptions::muted.eq(0))
            .select((notifications::subscription_id, notifications::title))
            .load(&mut *conn)?;

        let count = rows
            .into_iter()
            .filter(|(sub_id, title)| {
                !is_ignored(title.as_deref().unwrap_or(""), sub_id, &rules)
            })
            .count();

        Ok(count as i32)
    }
```

- [ ] **Step 3: Make the subscription list's `unread` ignore-aware**

`get_all_subscriptions` gets `unread` from the raw-SQL subquery in `SUBSCRIPTION_BASE_QUERY`. Override it after loading rather than touching the SQL.

In `src-tauri/src/db/queries/subscriptions.rs`, add `use std::collections::HashMap;` at the top. The file already imports `use crate::db::schema::{servers, subscriptions};` and `use crate::models::{CreateSubscription, Subscription};` — extend those two lines rather than adding duplicates:

```rust
use crate::db::schema::{notifications, servers, subscriptions};
use crate::models::{is_ignored, CreateSubscription, Subscription};
```

Replace `get_all_subscriptions`:

```rust
    /// Returns all subscriptions ordered by most recent notification.
    pub fn get_all_subscriptions(&self) -> Result<Vec<Subscription>, AppError> {
        let rules = self.get_ignore_rules()?;

        let mut conn = self.conn()?;

        let query = format!("{SUBSCRIPTION_BASE_QUERY} ORDER BY last_notif DESC NULLS LAST");
        let rows: Vec<SubscriptionQueryRow> = sql_query(query).load(&mut *conn)?;
        let mut subs: Vec<Subscription> = rows.into_iter().map(Subscription::from).collect();

        if rules.is_empty() {
            return Ok(subs);
        }

        let unread_rows: Vec<(String, Option<String>)> = notifications::table
            .filter(notifications::read.eq(0))
            .select((notifications::subscription_id, notifications::title))
            .load(&mut *conn)?;

        let mut counts: HashMap<String, i32> = HashMap::new();
        for (sub_id, title) in unread_rows {
            if !is_ignored(title.as_deref().unwrap_or(""), &sub_id, &rules) {
                *counts.entry(sub_id).or_default() += 1;
            }
        }

        for sub in &mut subs {
            sub.unread_count = counts.get(&sub.id).copied().unwrap_or(0);
        }

        Ok(subs)
    }
```

`get_subscription_with_last_sync` and `get_subscription_by_id` are left alone: their `unread_count` feeds no badge. `get_subscription_by_id` is already `#[allow(dead_code)]`.

- [ ] **Step 4: Verify**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test`
Expected: clean, tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src
git commit -m "feat: exclude ignored messages from unread counts"
```

---

### Task 5: Rules state in AppContext

Wire the rules into React state so every UI surface reads one source.

**Files:**
- Modify: `ui/src/context/AppContext.tsx`
- Modify: `ui/src/lib/tauri.ts`

**Interfaces:**
- Consumes: `commands.getIgnoreRules`, `commands.addIgnoreRule`, `commands.deleteIgnoreRule` (Task 2).
- Produces: on the context value — `ignoreRules: IgnoreRule[]`, `addIgnoreRule: (pattern: string, subscriptionId: string | null) => Promise<void>`, `deleteIgnoreRule: (id: string) => Promise<void>`.

- [ ] **Step 1: Add the API wrapper**

In `ui/src/lib/tauri.ts`, follow the existing `subscriptionsApi` shape and add:

```ts
export const ignoreRulesApi = {
	getAll: () => commands.getIgnoreRules(),
	add: (pattern: string, subscriptionId: string | null) =>
		commands.addIgnoreRule(pattern, subscriptionId),
	delete: (id: string) => commands.deleteIgnoreRule(id),
};
```

Add `type IgnoreRule` to the existing import list from `@/types/bindings`, and re-export it alongside the other types.

- [ ] **Step 2: Hold the rules in context state**

In `ui/src/context/AppContext.tsx`, alongside the existing `subscriptions` state:

```tsx
const [ignoreRules, setIgnoreRules] = useState<IgnoreRule[]>([]);

const refreshIgnoreRules = useCallback(async () => {
	try {
		if (isTauri()) {
			setIgnoreRules(await ignoreRulesApi.getAll());
		}
	} catch (err) {
		console.error("Failed to refresh ignore rules:", err);
	}
}, []);
```

Call `refreshIgnoreRules()` from the same effect that loads subscriptions on mount.

- [ ] **Step 3: Add the mutations**

Both mutations refresh subscriptions afterwards, because a rule changes every unread count the backend reports:

```tsx
const addIgnoreRule = useCallback(
	async (pattern: string, subscriptionId: string | null) => {
		await ignoreRulesApi.add(pattern, subscriptionId);
		await refreshIgnoreRules();
		await refreshSubscriptions();
	},
	[refreshIgnoreRules, refreshSubscriptions],
);

const deleteIgnoreRule = useCallback(
	async (id: string) => {
		await ignoreRulesApi.delete(id);
		await refreshIgnoreRules();
		await refreshSubscriptions();
	},
	[refreshIgnoreRules, refreshSubscriptions],
);
```

- [ ] **Step 4: Expose them**

Add `ignoreRules`, `addIgnoreRule`, and `deleteIgnoreRule` to the `AppContextValue` interface and to the `useMemo` value object, including them in its dependency array.

- [ ] **Step 5: Verify**

Run: `pnpm --filter ui typecheck && pnpm ui:lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add ui/src
git commit -m "feat: hold ignore rules in app context"
```

---

### Task 6: Ignored settings tab

**Files:**
- Create: `ui/src/components/dialogs/settings/IgnoredTab.tsx`
- Modify: `ui/src/components/dialogs/settings/index.ts`
- Modify: `ui/src/components/dialogs/SettingsDialog.tsx`

**Interfaces:**
- Consumes: `ignoreRules`, `addIgnoreRule`, `deleteIgnoreRule` from context (Task 5); `subscriptions` for scope labels.
- Produces: `<IgnoredTab />`, self-contained — it reads context directly rather than taking props, deliberately avoiding the prop drilling that `NotificationsTab` already suffers from.

- [ ] **Step 1: Write the tab**

Create `ui/src/components/dialogs/settings/IgnoredTab.tsx`:

```tsx
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/context/AppContext";

export function IgnoredTab() {
	const { ignoreRules, addIgnoreRule, deleteIgnoreRule, subscriptions } = useApp();
	const [pattern, setPattern] = useState("");

	const topicNames = useMemo(() => {
		const map = new Map<string, string>();
		for (const sub of subscriptions) {
			map.set(sub.id, sub.displayName || sub.topic);
		}
		return map;
	}, [subscriptions]);

	const handleAdd = async () => {
		const trimmed = pattern.trim();
		if (!trimmed) return;
		await addIgnoreRule(trimmed, null);
		setPattern("");
	};

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				Messages whose title contains one of these fragments are hidden from the
				list and never raise a notification. Matching ignores letter case.
				Removing a rule brings its messages back.
			</p>

			<div className="flex gap-2">
				<Input
					value={pattern}
					onChange={(e) => setPattern(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleAdd();
					}}
					placeholder="Title fragment to ignore"
					aria-label="Title fragment to ignore"
				/>
				<Button onClick={handleAdd} disabled={!pattern.trim()}>
					Add
				</Button>
			</div>

			{ignoreRules.length === 0 ? (
				<p className="text-sm text-muted-foreground">No ignore rules yet.</p>
			) : (
				<ul className="space-y-1">
					{ignoreRules.map((rule) => (
						<li
							key={rule.id}
							className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
						>
							<div className="min-w-0">
								<div className="truncate text-sm">{rule.pattern}</div>
								<div className="text-xs text-muted-foreground">
									{rule.subscriptionId
										? topicNames.get(rule.subscriptionId) ?? "Unknown topic"
										: "All topics"}
								</div>
							</div>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => deleteIgnoreRule(rule.id)}
								aria-label={`Delete rule ${rule.pattern}`}
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
```

Export it from `ui/src/components/dialogs/settings/index.ts` following the existing lines.

- [ ] **Step 2: Add the tab to the dialog**

In `ui/src/components/dialogs/SettingsDialog.tsx`, import `EyeOff` from `lucide-react` and add a trigger after the `notifications` one:

```tsx
						<TabsTrigger value="ignored">
							<EyeOff className="h-4 w-4" />
							Ignored
						</TabsTrigger>
```

And the content after the `notifications` content:

```tsx
					<TabsContent value="ignored" className="mt-4">
						<IgnoredTab />
					</TabsContent>
```

Check the `TabsList` layout: if it uses a fixed `grid-cols-4`, change it to `grid-cols-5`.

- [ ] **Step 3: Verify**

Run: `pnpm --filter ui typecheck && pnpm ui:lint`
Expected: clean.

- [ ] **Step 4: Verify in the running app**

Run: `pnpm dev`. Open Settings → Ignored. Add the fragment `backup`. Confirm it appears with scope "All topics", then delete it and confirm it disappears.

- [ ] **Step 5: Commit**

```bash
git add ui/src
git commit -m "feat: add ignored rules settings tab"
```

---

### Task 7: Ignore similar, the toggle, and UI-side counts

The last task closes the loop: creating a rule from a message, seeing what a rule hides, and keeping in-memory counts honest.

**Files:**
- Create: `ui/src/components/notifications/IgnoreRuleDialog.tsx`
- Modify: `ui/src/components/notifications/NotificationCard.tsx:150-165`
- Modify: `ui/src/components/notifications/NotificationList.tsx:26-60,156-183`
- Modify: `ui/src/hooks/useNotifications.ts:304-314`

**Interfaces:**
- Consumes: `addIgnoreRule` from context (Task 5); `notification.ignored` (Task 3).
- Produces: `<IgnoreRuleDialog notification={...} open={...} onOpenChange={...} />`.

- [ ] **Step 1: Make in-memory unread counts ignore-aware**

In `ui/src/hooks/useNotifications.ts`, in `getUnreadCount`, change the loop body:

```ts
			for (const n of notifs) {
				if (!n.read && !n.ignored) count++;
			}
```

Apply the same `&& !n.ignored` guard to `getTotalUnread` in the same file. Without this, a hidden message keeps inflating the sidebar badge.

`AppLayout.tsx:63-69` sums `s.unreadCount` and `AppContext.tsx:617-624` picks between the in-memory count and `sub.unreadCount`. Neither needs editing: both read from sources this step and Task 4 Step 3 already fixed. Do not add a filter there — it would be a second implementation of the same rule.

- [ ] **Step 2: Write the dialog**

Create `ui/src/components/notifications/IgnoreRuleDialog.tsx`:

```tsx
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/context/AppContext";
import type { Notification } from "@/types/bindings";

interface IgnoreRuleDialogProps {
	notification: Notification;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function IgnoreRuleDialog({
	notification,
	open,
	onOpenChange,
}: IgnoreRuleDialogProps) {
	const { addIgnoreRule } = useApp();
	const [pattern, setPattern] = useState(notification.title);
	const [thisTopicOnly, setThisTopicOnly] = useState(false);

	useEffect(() => {
		if (open) {
			setPattern(notification.title);
			setThisTopicOnly(false);
		}
	}, [open, notification.title]);

	const handleSave = async () => {
		const trimmed = pattern.trim();
		if (!trimmed) return;
		await addIgnoreRule(trimmed, thisTopicOnly ? notification.topicId : null);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Ignore similar messages</DialogTitle>
					<DialogDescription>
						Trim this down to the part that repeats. Messages whose title
						contains it are hidden from the list.
					</DialogDescription>
				</DialogHeader>

				<Input
					value={pattern}
					onChange={(e) => setPattern(e.target.value)}
					aria-label="Title fragment to ignore"
				/>

				<div className="flex items-center gap-2">
					<Checkbox
						id="ignore-this-topic-only"
						checked={thisTopicOnly}
						onCheckedChange={(checked) => setThisTopicOnly(checked === true)}
					/>
					<Label htmlFor="ignore-this-topic-only">Only in this topic</Label>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={!pattern.trim()}>
						Ignore
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 3: Add the context menu item**

In `ui/src/components/notifications/NotificationCard.tsx`, add state near the other hooks:

```tsx
	const [ignoreDialogOpen, setIgnoreDialogOpen] = useState(false);
```

Add an item to `contextMenuContent` after the copy items:

```tsx
			<ContextMenuItem
				disabled={!notification.title}
				onClick={() => setIgnoreDialogOpen(true)}
			>
				<EyeOff />
				Ignore similar
			</ContextMenuItem>
```

Render the dialog alongside the card in both return branches (the collapsible one and the plain one), as a sibling of `<ContextMenu>`:

```tsx
			<IgnoreRuleDialog
				notification={notification}
				open={ignoreDialogOpen}
				onOpenChange={setIgnoreDialogOpen}
			/>
```

Wrap each branch's existing root in a fragment if needed. Do not nest the dialog inside `ContextMenuTrigger` — it would unmount with the menu.

- [ ] **Step 4: Add the toggle and the filter**

In `ui/src/components/notifications/NotificationList.tsx`, add to `NotificationListHeaderProps`:

```ts
	showIgnored: boolean;
	onShowIgnoredChange: (show: boolean) => void;
	hasIgnored: boolean;
```

In `NotificationListHeader`, render a button only when there is something to reveal:

```tsx
			{hasIgnored ? (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onShowIgnoredChange(!showIgnored)}
				>
					{showIgnored ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
					{showIgnored ? "Hide ignored" : "Show ignored"}
				</Button>
			) : null}
```

In `NotificationList`, add the state and derive the list:

```tsx
	const [showIgnored, setShowIgnored] = useState(false);

	const hasIgnored = useMemo(
		() => notifications.some((n) => n.ignored),
		[notifications],
	);

	const visibleNotifications = useMemo(
		() => (showIgnored ? notifications : notifications.filter((n) => !n.ignored)),
		[notifications, showIgnored],
	);
```

Change the unread count to ignore hidden messages regardless of the toggle:

```tsx
	const unreadCount = useMemo(() => {
		let count = 0;
		for (const n of notifications) {
			if (!n.read && !n.ignored) count++;
		}
		return count;
	}, [notifications]);
```

Pass `showIgnored`, `onShowIgnoredChange={setShowIgnored}`, and `hasIgnored` to `NotificationListHeader`. Replace every downstream use of `notifications` — the `length === 0` empty-state check and the render loop — with `visibleNotifications`.

Dim ignored cards. In the render loop, wrap each `<NotificationCard>` in a div carrying the dim class, so no new prop threads through the card:

```tsx
	<div key={notification.id} className={notification.ignored ? "opacity-50" : undefined}>
		<NotificationCard ... />
	</div>
```

Move the existing `key` up to the wrapper if the card currently carries it.

- [ ] **Step 5: Verify**

Run: `pnpm --filter ui typecheck && pnpm ui:lint`
Expected: clean.

- [ ] **Step 6: Verify the whole feature in the running app**

Run: `pnpm dev`. Then:

1. Pick a message with a recurring title. Right-click → Ignore similar. Trim the title to a fragment. Click Ignore.
2. The message disappears from the list. The sidebar badge for that topic drops. The tray icon clears if that was the only unread message.
3. "Show ignored" appears in the header. Click it — the message returns, dimmed. The unread count in the header does NOT include it.
4. Settings → Ignored shows the rule. Delete it.
5. The message reappears in the normal list, still unread, and the badge goes back up.

Step 5 is the load-bearing one: it proves nothing was mutated.

- [ ] **Step 7: Commit**

```bash
git add ui/src
git commit -m "feat: add ignore similar action and show ignored toggle"
```

---

## Definition of Done

- [ ] `cd src-tauri && cargo test` passes.
- [ ] `cd src-tauri && cargo clippy --all-targets -- -D warnings` is clean.
- [ ] `pnpm --filter ui typecheck`, `pnpm ui:lint`, and `pnpm ui:test` pass.
- [ ] The Task 7 Step 6 walkthrough was performed against the running app and behaved as described.
- [ ] `git diff main --stat` touches no file outside the spec's "Files touched" list.

## Out of Scope

Per the spec: regular expressions; matching on body, tags, or priority; disabling a rule without deleting it; import/export; a per-rule match counter.

Also out of scope: the pre-existing nested-`<button>` hydration error in `NotificationCard` (the favorites button sits inside `CollapsibleTrigger`). It logs on every card render and is visible in `pnpm dev` output. It is unrelated to this feature and deserves its own commit — do not fold it in.

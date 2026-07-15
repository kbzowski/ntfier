# Ignore List — Design

Status: approved, ready for implementation planning
Date: 2026-07-15

## Goal

Let the user suppress recurring junk notifications by matching a fragment of the
message title. Deliberately a simple tool: substring matching only, no regular
expressions, no query language.

## Semantics

An ignored message is **hidden from the list**, not dropped and not deleted.

- It is still written to the database exactly as it arrives.
- It is filtered out of the notification list.
- It does not raise a system toast.
- It is not counted toward unread badges or the tray icon.

Consequences that follow from this choice, both intentional:

1. Rules apply **retroactively**. Adding a rule hides matching messages that are
   already stored, not just future ones.
2. Removing a rule **fully restores** the previous state, including unread
   status, because nothing is ever mutated or destroyed. A mistaken rule costs
   nothing.

### Rejected alternative

Marking ignored messages as read on arrival (reusing the existing `muted`
mechanic at `connection_manager.rs:313`) would produce a smaller diff: unread
counts would exclude them automatically and no count query would change.

It was rejected because it is destructive. A mistaken rule would permanently
clear the "new message" signal on messages it matched, and deleting the rule
would bring them back already-read. The derived approach below keeps every
message's state recoverable.

## Data model

New table `ignore_rules`, via Diesel migration
`migrations/2026-07-15-000000_add_ignore_rules/`, following the shape of the
existing `2026-02-19-000000_add_favorites` migration.

| column            | type                                                  | role                                     |
| ----------------- | ----------------------------------------------------- | ---------------------------------------- |
| `id`              | TEXT PRIMARY KEY NOT NULL                             | UUID                                     |
| `pattern`         | TEXT NOT NULL                                         | title fragment; blank rejected on input  |
| `subscription_id` | TEXT NULL REFERENCES `subscriptions(id)` ON DELETE CASCADE | NULL = global rule                  |
| `created_at`      | BIGINT NOT NULL                                        | list ordering                            |

`NULL` as "global" expresses the chosen scope (global by default, optionally
narrowed to one topic) without a second flag. `ON DELETE CASCADE` cleans up
topic-scoped rules when a subscription is removed, for free.

`ignored` is **not** a column. It is computed on read. See "Flow" below.

## Matching

One predicate, the single place this logic exists:

```rust
fn is_ignored(notif: &Notification, rules: &[IgnoreRule]) -> bool {
    let title = notif.title.to_lowercase();
    rules.iter().any(|r| {
        r.subscription_id.as_ref().is_none_or(|id| *id == notif.topic_id)
            && title.contains(&r.pattern.to_lowercase())
    })
}
```

- Case-insensitive substring match on the title only.
- A rule with `subscription_id = NULL` matches in any topic; otherwise it
  matches only its own topic.
- Blank or whitespace-only patterns are rejected at the command boundary, since
  an empty pattern would match every message.
- An empty title simply never matches a non-blank pattern.

## Flow

The filter applies in four places.

1. **Arrival** — `connection_manager.rs:290` (`handle_notification`) and
   `sync_service.rs:217` (poll catch-up). The database write is unchanged. Only
   the toast is suppressed, under the same condition that `muted` already uses.

2. **Event emit** — `notification:new` is emitted as before, with a computed
   `ignored: bool` on the payload. Emitting unconditionally is what lets the
   "show ignored" toggle work live; carrying the flag is what keeps the
   predicate from being duplicated in TypeScript.

3. **List** — `get_notifications_by_subscription` returns every row with
   `ignored` computed; the UI decides what to render. This makes the toggle
   free: no query parameter, no refetch, just a `filter` over data already in
   memory. Safe because the list is not paginated.

4. **Unread counts** — `get_unread_count` and `get_total_unread_count` must
   exclude ignored messages **regardless of the toggle**. Otherwise the tray
   icon lights up for a message the user cannot find. This is the only place
   where `count_star()` gives way to counting in Rust; with rules numbering in
   the tens, the cost is irrelevant.

Point 4 has a visible consequence worth stating explicitly: with "show ignored"
on, a dimmed message may appear unread yet not be counted in the badge. This is
intended — the badge reflects what the user needs to act on.

## UI

**Settings tab "Ignored"** — a fifth tab in `SettingsDialog.tsx`, alongside
appearance / behavior / notifications / servers. Kept separate rather than
folded into `NotificationsTab` because it is a standalone management surface,
and because `NotificationsTab` already carries a dozen props that should not
grow.

Contents: rules listed with their pattern and scope ("All topics" or the topic
name), a delete button per rule, and an add field.

**"Ignore similar"** — one more `ContextMenuItem` in
`NotificationCard.tsx:151`, disabled when the title is empty (mirroring the
existing "Copy title" item). It opens a small dialog with a text field
**prefilled with the full title** and a hint to trim it down to a fragment.
This is the point of the feature: the user deletes the variable part of what
they can see rather than typing a fragment from memory. Below the field, a
checkbox "Only in this topic", unchecked by default — global is the default,
narrowing is deliberate.

**"Show ignored" toggle** — in `NotificationListHeader`, which lives inside
`NotificationList.tsx:33` rather than in its own file, so the toggle and the
`filter` that honours it land in the same file. UI-local state, not persisted;
it resets on restart. This is intentional: it is a tool for checking a rule
right after creating it, not a working mode. Ignored messages render dimmed.

## Tauri commands

`get_ignore_rules`, `add_ignore_rule`, `delete_ignore_rule`.

No update command. With a single text field, editing a rule is deleting and
re-adding it; in-place editing does not earn its code.

## Testing

One test, next to `is_ignored`, inline as `#[cfg(test)] mod tests` — matching
the convention in `services/image_cache.rs`, the only Rust file in the repo that
currently has tests. `is_ignored` is the only non-trivial logic in the feature.

Cases:

- a global rule matches in any topic
- a topic-scoped rule does not match in another topic
- matching ignores letter case
- an empty rule list ignores nothing
- an empty title does not panic

## Files touched

Rust:

- `migrations/2026-07-15-000000_add_ignore_rules/{up,down}.sql` (new)
- `src/db/schema.rs` — `ignore_rules` table, joinable to `subscriptions`
- `src/db/models.rs` — `IgnoreRuleRow`, `NewIgnoreRule`
- `src/db/queries/ignore_rules.rs` (new) + `src/db/queries/mod.rs`
- `src/db/queries/notifications.rs` — `ignored` on list, counts exclude ignored
- `src/models/notification.rs` — computed `ignored` field
- `src/commands/ignore_rules.rs` (new) + `src/commands/mod.rs` + specta registration
- `src/services/connection_manager.rs` — suppress toast
- `src/services/sync_service.rs` — suppress toast

UI:

- `ui/src/types/bindings.ts` — regenerated via `pnpm types:create`
- `ui/src/components/dialogs/SettingsDialog.tsx` — fifth tab
- `ui/src/components/dialogs/settings/IgnoredTab.tsx` (new)
- `ui/src/components/notifications/NotificationCard.tsx` — menu item + dialog
- `ui/src/components/notifications/NotificationList.tsx` — toggle in the inline
  `NotificationListHeader`, plus the `filter` it drives

## Out of scope

Deliberately excluded. Each can be added later on the same table without
changing the model:

- regular expressions
- matching on body, tags, or priority
- disabling a rule without deleting it
- import / export of rules
- a match counter per rule

Also out of scope, and **not** to be folded into this work: `NotificationCard`
currently renders the favorites `<button>` inside the `CollapsibleTrigger`
`<button>`, which is invalid HTML and logs a React hydration error on every
card render. Pre-existing, unrelated, deserves its own commit.

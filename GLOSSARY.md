# ntfier

Desktop client for ntfy servers: subscribes to topics and shows their messages as a list and as system notifications.

## Language

**Subscription**:
One topic on one server that the user follows.
_Avoid_: Topic (when meaning the user's subscription), channel

**Credential**:
The single login a server is used with: a username and password, or an access token. A server has at most one.
_Avoid_: Auth, account (when meaning the login)

**Cursor**:
The time of the newest message stored for a subscription; the point the server is asked to resume from.
_Avoid_: Last sync, sync time

**Catch-up**:
Messages the server replays for the gap between the cursor and now, as opposed to messages received live.
_Avoid_: Backlog, history sync

**Backfill**:
The catch-up of a newly added subscription, covering everything the server still has cached.

**Tombstone**:
A notification deleted by the user or by a server `message_delete`, kept hidden so a replay cannot bring it back.
_Avoid_: Soft-deleted row

**Retention**:
Automatic local removal of notifications older than a set age or beyond a set count per subscription. Unlike a tombstone, nothing is kept; favorites are never removed.
_Avoid_: Cleanup, auto-delete

**Sequence**:
All versions of one message on a topic, sharing a `sequence_id` (equal to the message id when the publisher sets none). Updates, server deletes and clears target a sequence.

**Superseded**:
An older version of a sequence, hidden because a newer version arrived. Distinct from a tombstone, which the user or server deleted.

**Account sync**:
Keeping a server's subscriptions in step with the subscription list stored on the user's ntfy account. The account is the source of truth, except on the first sync, which merges local topics up.
_Avoid_: Sync (on its own: ambiguous with catch-up)

**Sync topic**:
A private topic belonging to the account. The server announces account changes on it, which triggers an account sync.

**Canonical URL**:
The single written form of a server address. Two servers are the same server exactly when their canonical URLs are equal.
_Avoid_: Base URL, normalized URL

**Action**:
A button the publisher attaches to a message: `view` opens a URL, `http` sends a request, `copy` puts text on the clipboard. Other types (like `broadcast`) are hidden. Shown in the list and on the toast.
_Avoid_: Button (for the ntfy concept)

**Clear (action flag)**:
After an action succeeds, mark its message read and remove its toast. Never deletes the message.

**Server status**:
A per-server flag worked out at runtime and never stored: ok, needs credentials, or too old. Anything other than ok stops every connection to that server until it's resolved.
_Avoid_: Connection state (that is per subscription)

**Inlined text attachment**:
A message body the server stored as a `.txt` file because it was too long. The client fetches it on receive and stores it as the message text.
_Avoid_: Long message, file message

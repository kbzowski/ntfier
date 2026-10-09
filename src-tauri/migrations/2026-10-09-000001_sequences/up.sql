-- All versions of one message share a sequence_id (the message id when the publisher sets none)
ALTER TABLE notifications ADD COLUMN sequence_id TEXT;
UPDATE notifications SET sequence_id = ntfy_id;
-- Older version of a sequence, hidden because a newer one arrived
ALTER TABLE notifications ADD COLUMN superseded INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_notifications_sequence ON notifications(subscription_id, sequence_id);

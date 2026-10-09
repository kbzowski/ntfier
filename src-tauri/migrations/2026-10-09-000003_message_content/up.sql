-- Rendered as markdown only when the publisher sent content_type text/markdown
ALTER TABLE notifications ADD COLUMN markdown INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN click TEXT;
ALTER TABLE notifications ADD COLUMN icon TEXT;

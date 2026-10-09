-- Set after the first account sync, which merges local topics up; reset when the login changes
ALTER TABLE servers ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;

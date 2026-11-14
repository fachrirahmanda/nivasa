-- The mail settings of the app. One row, id 'admin': how many days a mail stays in the Requests list before it moves
-- to the Archive (0 means never). Default 7 days.
CREATE TABLE IF NOT EXISTS email_settings (
  id TEXT PRIMARY KEY,
  archive_after_days INTEGER NOT NULL DEFAULT 7
);

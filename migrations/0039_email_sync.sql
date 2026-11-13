-- Gmail sync configuration and inbox emails.
CREATE TABLE IF NOT EXISTS gmail_config (
  id TEXT PRIMARY KEY DEFAULT 'admin',
  gmail_email TEXT,
  gmail_refresh_token TEXT,
  gmail_access_token TEXT,
  token_expires_at TEXT,
  connected_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  body TEXT,
  html_body TEXT,
  received_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_emails_subject ON emails(subject);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);
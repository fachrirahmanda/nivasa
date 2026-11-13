-- Username and password login (non-Google accounts).
-- google_sub stays NOT NULL (SQLite can't drop NOT NULL), so password-based
-- accounts get a unique placeholder value like 'pwd:<id>'.
ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_salt TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
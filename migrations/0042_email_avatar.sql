-- The avatar of the sender, taken from the first image in the mail during sync, so the list never loads mail bodies.
-- Empty when the mail has no image; NULL until a sync has looked at the mail.
ALTER TABLE emails ADD COLUMN avatar_url TEXT;

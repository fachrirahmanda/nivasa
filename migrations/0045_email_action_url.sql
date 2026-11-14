-- The link of the request card's button ("Ya, Itu Saya"), shown on the list row so the mail can be confirmed from the list.
-- Empty when the mail has no such button; NULL until a sync has looked at the mail.
ALTER TABLE emails ADD COLUMN action_url TEXT;

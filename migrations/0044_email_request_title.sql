-- The title of the list row for a request mail: "Diminta dari <device>", in place of the mail subject.
-- Empty when the mail has no request sentence; NULL until a sync has looked at the mail.
ALTER TABLE emails ADD COLUMN request_title TEXT;

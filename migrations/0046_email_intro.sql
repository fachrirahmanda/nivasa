-- The first sentence under the mail's title ("Kami menerima permintaan untuk …"), shown on the list card under the title.
-- Empty when the mail has no such sentence; NULL until a sync has looked at the mail.
ALTER TABLE emails ADD COLUMN intro TEXT;

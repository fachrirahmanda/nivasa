-- The preview line for the inbox list: the request sentence from the mail ("Diminta oleh … pada …"), or the start of
-- the text. Filled during sync from the message already fetched, so the list never calls Gmail. Mail synced before
-- this is NULL until the next sync fills it in.
ALTER TABLE emails ADD COLUMN snippet TEXT;

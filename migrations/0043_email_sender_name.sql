-- The name of the person in the request sentence ("Diminta oleh … dari …"), shown in the list instead of the sender
-- address. Empty when the mail has no such sentence; NULL until a sync has looked at the mail.
ALTER TABLE emails ADD COLUMN sender_name TEXT;

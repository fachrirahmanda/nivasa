-- The device named in the request ("Diminta … dari Apple TV"), used to filter the list by device.
-- Empty when the mail has no request; NULL until a sync has looked at the mail.
ALTER TABLE emails ADD COLUMN device TEXT;

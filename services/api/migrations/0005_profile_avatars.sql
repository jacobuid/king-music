ALTER TABLE profiles ADD COLUMN avatar TEXT CHECK (avatar IS NULL OR avatar IN ('ember','aurora','midnight','penguin'));

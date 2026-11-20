ALTER TABLE profiles RENAME COLUMN avatar TO avatar_previous;
ALTER TABLE profiles ADD COLUMN avatar TEXT CHECK (avatar IS NULL OR avatar IN ('ember','aurora','midnight','penguin','monkey','coyote','cat','rabbit','goat','chicken','hippo','alligator','gorilla','panda','dusty','auburn','slate','copper','willow','pearl'));
UPDATE profiles SET avatar=avatar_previous;
ALTER TABLE profiles DROP COLUMN avatar_previous;

-- Add whisper_text to goblin_pick so admins can attach a brief editorial note
-- ("The Goblin Whispers") that surfaces as a popup on the /home sidebar card.
ALTER TABLE goblin_pick ADD COLUMN whisper_text TEXT;

-- 0153_rename_class_to_social_class.sql
--
-- Renames the `class` theme tag to `social class` for clarity.
-- "class" reads ambiguously (could be social class OR school class);
-- "social class" pins the meaning. The tag's UUID stays the same, so
-- existing film_tags references migrate automatically.

UPDATE tags
SET name = 'social class'
WHERE name = 'class' AND type = 'theme';

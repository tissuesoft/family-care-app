-- Remove group_type; group display name is required on family_groups.name

UPDATE family_groups
SET name = CASE group_type
  WHEN 'family' THEN '우리 가족'
  WHEN 'couple' THEN '나와 아내'
  WHEN 'friends' THEN '친구들'
  ELSE COALESCE(NULLIF(trim(name), ''), '그룹')
END
WHERE name IS NULL OR trim(name) = '';

ALTER TABLE family_groups
  DROP COLUMN group_type;

ALTER TABLE family_groups
  ALTER COLUMN name SET NOT NULL;

DROP TYPE group_type;

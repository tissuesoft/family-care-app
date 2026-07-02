-- Allow free-text member_role (e.g. manager, parent, caregiver)

ALTER TABLE family_group_members
  ALTER COLUMN member_role TYPE TEXT USING member_role::text;

DROP TYPE member_role;

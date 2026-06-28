-- 가족안심 initial schema (see docs/BACKEND_ARCHITECTURE.md)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE group_type AS ENUM ('family', 'couple', 'friends');
CREATE TYPE member_role AS ENUM ('parent', 'caregiver');
CREATE TYPE meal_time AS ENUM ('morning', 'lunch', 'evening');
CREATE TYPE intake_status AS ENUM ('taken', 'missed', 'pending', 'scheduled');
CREATE TYPE safety_status AS ENUM ('completed', 'incomplete');
CREATE TYPE privacy_data_type AS ENUM ('steps', 'medication', 'mood', 'health_score');
CREATE TYPE privacy_visibility AS ENUM ('family', 'only_me');

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  birth_year SMALLINT,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  step_daily_goal INTEGER NOT NULL DEFAULT 10000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE family_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_type group_type NOT NULL,
  name TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE family_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_group_id UUID NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship_label TEXT NOT NULL,
  member_role member_role,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_group_id, user_id)
);

CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  last_active_group_id UUID REFERENCES family_groups(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE family_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_group_id UUID NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES profiles(id),
  UNIQUE (invite_code)
);

CREATE TABLE medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dosage_text TEXT,
  meal_time meal_time NOT NULL,
  scheduled_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE medication_intake_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  intake_date DATE NOT NULL,
  status intake_status NOT NULL DEFAULT 'pending',
  taken_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  UNIQUE (medication_id, intake_date)
);

CREATE TABLE safety_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  check_date DATE NOT NULL,
  status safety_status NOT NULL,
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, check_date)
);

CREATE TABLE safety_check_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_group_id UUID NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES profiles(id),
  requester_user_id UUID NOT NULL REFERENCES profiles(id),
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mood_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  mood_level SMALLINT NOT NULL CHECK (mood_level BETWEEN 1 AND 5),
  UNIQUE (user_id, log_date)
);

CREATE TABLE daily_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  step_date DATE NOT NULL,
  total_steps INTEGER NOT NULL DEFAULT 0,
  calories_kcal NUMERIC(8,2),
  distance_km NUMERIC(8,2),
  duration_minutes INTEGER,
  UNIQUE (user_id, step_date)
);

CREATE TABLE hourly_step_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL,
  steps INTEGER NOT NULL
);

CREATE TABLE daily_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score_date DATE NOT NULL,
  total_score SMALLINT NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  metric_1_pct NUMERIC(5,2) NOT NULL,
  metric_2_pct NUMERIC(5,2) NOT NULL,
  metric_3_pct NUMERIC(5,2) NOT NULL,
  metric_4_pct NUMERIC(5,2) NOT NULL,
  UNIQUE (user_id, score_date)
);

CREATE TABLE user_notification_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  safety_check_incomplete BOOLEAN NOT NULL DEFAULT true,
  medication_missed BOOLEAN NOT NULL DEFAULT true,
  step_decrease BOOLEAN NOT NULL DEFAULT true,
  health_score_drop BOOLEAN NOT NULL DEFAULT true,
  family_sos BOOLEAN NOT NULL DEFAULT true,
  daily_health_summary BOOLEAN NOT NULL DEFAULT false,
  daily_summary_time TIME NOT NULL DEFAULT '21:00',
  medication_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  medication_reminder_minutes_before SMALLINT NOT NULL DEFAULT 30
);

CREATE TABLE user_privacy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  data_type privacy_data_type NOT NULL,
  visibility privacy_visibility NOT NULL DEFAULT 'family',
  UNIQUE (user_id, data_type)
);

-- indexes
CREATE INDEX idx_fgm_group_id ON family_group_members (family_group_id);
CREATE INDEX idx_fgm_user_id ON family_group_members (user_id);
CREATE INDEX idx_mil_medication_date ON medication_intake_logs (medication_id, intake_date DESC);
CREATE INDEX idx_mil_date_status ON medication_intake_logs (intake_date, status);
CREATE UNIQUE INDEX idx_safety_checks_user_date ON safety_checks (user_id, check_date);
CREATE INDEX idx_safety_checks_date ON safety_checks (check_date DESC);
CREATE UNIQUE INDEX idx_daily_steps_user_date ON daily_steps (user_id, step_date);
CREATE INDEX idx_daily_steps_date ON daily_steps (step_date DESC);
CREATE INDEX idx_hourly_steps_user_time ON hourly_step_counts (user_id, recorded_at DESC);
CREATE UNIQUE INDEX idx_health_scores_user_date ON daily_health_scores (user_id, score_date);
CREATE UNIQUE INDEX idx_mood_logs_user_date ON mood_logs (user_id, log_date);
CREATE UNIQUE INDEX idx_invitations_code ON family_invitations (invite_code) WHERE accepted_at IS NULL;
CREATE INDEX idx_medications_user_active ON medications (user_id) WHERE is_active = true;
CREATE INDEX idx_user_prefs_group ON user_preferences (last_active_group_id);
CREATE INDEX idx_scr_group_date ON safety_check_requests (family_group_id, request_date DESC);

-- auth signup → profile + defaults
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', '사용자')
  );
  INSERT INTO public.user_notification_settings (user_id) VALUES (NEW.id);
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id);
  INSERT INTO public.user_privacy_settings (user_id, data_type, visibility) VALUES
    (NEW.id, 'steps', 'family'),
    (NEW.id, 'medication', 'family'),
    (NEW.id, 'mood', 'family'),
    (NEW.id, 'health_score', 'only_me');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS helpers
CREATE OR REPLACE FUNCTION public.is_group_member(check_user UUID, check_group UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_group_members
    WHERE user_id = check_user AND family_group_id = check_group
  );
$$;

CREATE OR REPLACE FUNCTION public.is_same_family_group(viewer UUID, target UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM family_group_members a
    JOIN family_group_members b ON a.family_group_id = b.family_group_id
    WHERE a.user_id = viewer AND b.user_id = target
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_data(viewer UUID, owner UUID, dtype privacy_data_type)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    viewer = owner
    OR (
      public.is_same_family_group(viewer, owner)
      AND COALESCE(
        (SELECT visibility FROM user_privacy_settings
         WHERE user_id = owner AND data_type = dtype),
        'family'::privacy_visibility
      ) = 'family'
    );
$$;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_intake_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_check_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE hourly_step_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_privacy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_same_family_group(auth.uid(), id));
CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY family_groups_select ON family_groups FOR SELECT TO authenticated
  USING (public.is_group_member(auth.uid(), id));
CREATE POLICY family_groups_insert ON family_groups FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY fgm_select ON family_group_members FOR SELECT TO authenticated
  USING (public.is_group_member(auth.uid(), family_group_id));
CREATE POLICY fgm_insert ON family_group_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_group_member(auth.uid(), family_group_id));

CREATE POLICY user_prefs_all ON user_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY medications_select ON medications FOR SELECT TO authenticated
  USING (public.can_view_data(auth.uid(), user_id, 'medication'));
CREATE POLICY medications_mutate ON medications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY mil_select ON medication_intake_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM medications m
      WHERE m.id = medication_id
        AND public.can_view_data(auth.uid(), m.user_id, 'medication')
    )
  );
CREATE POLICY mil_mutate ON medication_intake_logs FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM medications m WHERE m.id = medication_id AND m.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM medications m WHERE m.id = medication_id AND m.user_id = auth.uid())
  );

CREATE POLICY safety_checks_select ON safety_checks FOR SELECT TO authenticated
  USING (public.can_view_data(auth.uid(), user_id, 'steps'));
CREATE POLICY safety_checks_mutate ON safety_checks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY mood_select ON mood_logs FOR SELECT TO authenticated
  USING (public.can_view_data(auth.uid(), user_id, 'mood'));
CREATE POLICY mood_mutate ON mood_logs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY steps_select ON daily_steps FOR SELECT TO authenticated
  USING (public.can_view_data(auth.uid(), user_id, 'steps'));
CREATE POLICY steps_mutate ON daily_steps FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY hourly_steps_mutate ON hourly_step_counts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY hourly_steps_select ON hourly_step_counts FOR SELECT TO authenticated
  USING (public.can_view_data(auth.uid(), user_id, 'steps'));

CREATE POLICY health_scores_select ON daily_health_scores FOR SELECT TO authenticated
  USING (public.can_view_data(auth.uid(), user_id, 'health_score'));

CREATE POLICY notif_settings ON user_notification_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY privacy_settings ON user_privacy_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

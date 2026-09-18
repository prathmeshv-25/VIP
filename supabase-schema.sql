-- EventHub — Phase 3 & 3.1 Schema Migration
-- Run in full in Supabase SQL Editor (safe to re-run anytime).

-- ─────────────────────────────────────────────────────────────
-- 1. EVENTS TABLE
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.events (
  id          INT          PRIMARY KEY,
  name        TEXT         NOT NULL,
  description TEXT         DEFAULT '',
  date        TEXT         NOT NULL,    -- display format e.g. "10 Sept 2026"
  raw_date    DATE,                     -- ISO date for sorting/filtering
  start_time  TEXT         DEFAULT '09:00 AM',
  end_time    TEXT         DEFAULT '05:00 PM',
  venue       TEXT         DEFAULT 'Main Auditorium',
  seats       INT          NOT NULL DEFAULT 30 CHECK (seats > 0),
  registered  INT          NOT NULL DEFAULT 0  CHECK (registered >= 0 AND registered <= seats),
  status      TEXT         NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed', 'completed', 'cancelled')),
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Migration helpers for events table
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS raw_date DATE;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS start_time TEXT DEFAULT '09:00 AM';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_time TEXT DEFAULT '05:00 PM';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue TEXT DEFAULT 'Main Auditorium';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

-- ─────────────────────────────────────────────────────────────
-- 2. PROFILES TABLE (links auth.users → metadata & role)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID   PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name   TEXT   NOT NULL DEFAULT '',
  email       TEXT   NOT NULL DEFAULT '',
  roll_number TEXT   UNIQUE,
  role        TEXT   NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Migration helpers: add missing columns if profiles table already existed from earlier schema
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS roll_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ─────────────────────────────────────────────────────────────
-- 3. REGISTRATIONS TABLE (Phase 3 Schema)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.registrations (
  id              TEXT         PRIMARY KEY,
  event_id        INT          NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_name      TEXT         NOT NULL,
  event_date      TEXT         NOT NULL,
  student_name    TEXT         NOT NULL,
  roll_number     TEXT         NOT NULL,
  "timestamp"     TEXT         NOT NULL,
  seats_left_after INT         NOT NULL,
  user_id         UUID         REFERENCES auth.users ON DELETE CASCADE,
  ticket_code     TEXT,
  status          TEXT         NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'active', 'cancelled')),
  registered_at   TIMESTAMPTZ  DEFAULT NOW(),
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- Migration helpers: add Phase 3 columns if registrations table already existed
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS ticket_code TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────
-- 4. GRANTS
-- ─────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Events: public read, authenticated admin write
GRANT SELECT                        ON public.events       TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON public.events       TO authenticated;

-- Profiles: authenticated read/insert/update of own row; admin reads all
GRANT SELECT, INSERT, UPDATE        ON public.profiles     TO authenticated;

-- Registrations: authenticated read/insert; admin manages all
GRANT SELECT, INSERT, UPDATE        ON public.registrations TO anon, authenticated;
GRANT DELETE                        ON public.registrations TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. UNIQUE INDEXES — Phase 3.1 Duplicate Registration Guards
-- ─────────────────────────────────────────────────────────────

-- Guard 1: One registration per authenticated student per event
CREATE UNIQUE INDEX IF NOT EXISTS registrations_event_user_unique
  ON public.registrations (event_id, user_id)
  WHERE user_id IS NOT NULL;

-- Guard 2: One registration per roll number per event
CREATE UNIQUE INDEX IF NOT EXISTS registrations_event_roll_unique
  ON public.registrations (event_id, lower(roll_number));

-- ─────────────────────────────────────────────────────────────
-- 6. SEED EVENTS
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.events (id, name, date, raw_date, seats, registered)
VALUES
  (1, 'Code Clash',  '10 Sept 2026', '2026-09-10', 30, 0),
  (2, 'Web Warfare', '10 Sept 2026', '2026-09-10', 25, 0),
  (3, 'Tech Quiz',   '10 Sept 2026', '2026-09-10', 40, 0)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Drop old permissive & outdated policies
DROP POLICY IF EXISTS "Public Read Events"          ON public.events;
DROP POLICY IF EXISTS "Public All Events"           ON public.events;
DROP POLICY IF EXISTS "events_read_public"          ON public.events;
DROP POLICY IF EXISTS "events_write_admin"          ON public.events;

DROP POLICY IF EXISTS "Own profile read"            ON public.profiles;
DROP POLICY IF EXISTS "Own profile update"          ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_read"           ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_insert"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_update"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_read_all"     ON public.profiles;

DROP POLICY IF EXISTS "Public Read Registrations"   ON public.registrations;
DROP POLICY IF EXISTS "Public Insert Registrations" ON public.registrations;
DROP POLICY IF EXISTS "Public Delete Registrations" ON public.registrations;
DROP POLICY IF EXISTS "registrations_student_insert" ON public.registrations;
DROP POLICY IF EXISTS "registrations_read"          ON public.registrations;
DROP POLICY IF EXISTS "registrations_admin_delete"  ON public.registrations;

-- ── EVENTS policies ────────────────────────────────────────────
CREATE POLICY "events_read_public" ON public.events
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "events_write_admin" ON public.events
  FOR ALL TO authenticated
  USING     ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ── PROFILES policies ──────────────────────────────────────────
CREATE POLICY "profiles_own_read" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_self_insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_own_update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_admin_read_all" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ── REGISTRATIONS policies ─────────────────────────────────────
CREATE POLICY "registrations_student_insert" ON public.registrations
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "registrations_read" ON public.registrations
  FOR SELECT TO anon, authenticated
  USING (
    user_id IS NULL OR
    auth.uid() = user_id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "registrations_admin_delete" ON public.registrations
  FOR DELETE TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 8. REALTIME PUBLICATION
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'registrations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.registrations;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 9. ATOMIC SEAT BOOKING FUNCTION (Phase 3.2 Row-Locking Workflow)
-- ─────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.register_for_event(TEXT, INT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.register_for_event(TEXT, INT, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.register_for_event(TEXT, INT, TEXT, TEXT, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.register_for_event(
  p_registration_id TEXT,
  p_event_id        INT,
  p_student_name    TEXT,
  p_roll_number     TEXT,
  p_timestamp       TEXT,
  p_user_id         UUID DEFAULT NULL,
  p_ticket_code     TEXT DEFAULT NULL
)
RETURNS TABLE (
  id               TEXT,
  event_id         INT,
  event_name       TEXT,
  event_date       TEXT,
  student_name     TEXT,
  roll_number      TEXT,
  "timestamp"      TEXT,
  seats_left_after INT,
  registered       INT,
  ticket_code      TEXT,
  user_id          UUID,
  status           TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_ticket TEXT;
  v_already_registered BOOLEAN;
BEGIN
  -- 1. Check event exists and lock row for concurrent transactions
  SELECT * INTO v_event
  FROM public.events
  WHERE public.events.id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND';
  END IF;

  -- 1b. Check event is open for registration (Phase 5.1 Lifecycle Guard)
  IF v_event.status IS NOT NULL AND LOWER(v_event.status) != 'open' THEN
    RAISE EXCEPTION 'EVENT_NOT_OPEN';
  END IF;

  -- 2. Check student isn't already registered for this event
  SELECT EXISTS (
    SELECT 1 FROM public.registrations
    WHERE public.registrations.event_id = p_event_id
      AND (
        (p_user_id IS NOT NULL AND public.registrations.user_id = p_user_id)
        OR LOWER(public.registrations.roll_number) = LOWER(p_roll_number)
      )
  ) INTO v_already_registered;

  IF v_already_registered THEN
    RAISE EXCEPTION 'ALREADY_REGISTERED';
  END IF;

  -- 3. Check seats available
  IF v_event.registered >= v_event.seats THEN
    RAISE EXCEPTION 'EVENT_FULL';
  END IF;

  -- 4. Increment seat count
  UPDATE public.events
  SET registered = public.events.registered + 1
  WHERE public.events.id = p_event_id;

  -- 5. Generate ticket code
  v_ticket := COALESCE(p_ticket_code, 'EVT-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6)));

  -- 6. Create registration record
  RETURN QUERY
  INSERT INTO public.registrations (
    id,
    event_id,
    event_name,
    event_date,
    student_name,
    roll_number,
    "timestamp",
    seats_left_after,
    user_id,
    ticket_code,
    status
  )
  VALUES (
    p_registration_id,
    v_event.id,
    v_event.name,
    v_event.date,
    p_student_name,
    p_roll_number,
    p_timestamp,
    v_event.seats - (v_event.registered + 1),
    p_user_id,
    v_ticket,
    'confirmed'
  )
  RETURNING
    public.registrations.id,
    public.registrations.event_id,
    public.registrations.event_name,
    public.registrations.event_date,
    public.registrations.student_name,
    public.registrations.roll_number,
    public.registrations."timestamp",
    public.registrations.seats_left_after,
    (v_event.registered + 1)::INT,
    public.registrations.ticket_code,
    public.registrations.user_id,
    public.registrations.status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_for_event(TEXT, INT, TEXT, TEXT, TEXT, UUID, TEXT)
  TO anon, authenticated;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────
-- 10. ADMIN ACCOUNT SETUP INSTRUCTIONS
-- ─────────────────────────────────────────────────────────────
-- Step 1: Create an Admin user in Supabase Dashboard:
--         Authentication → Users → Add User → Create User
--         (e.g., Email: admin@example.com, Password: adminpassword123)
--
-- Step 2: Copy the newly created User ID (UUID) from the Users list.
--
-- Step 3: Run this SQL query in Supabase SQL Editor (replace <ADMIN-UUID> & email):
--
-- INSERT INTO public.profiles (id, full_name, email, role)
-- VALUES ('<YOUR-ADMIN-USER-UUID>', 'System Administrator', 'admin@example.com', 'admin')
-- ON CONFLICT (id) DO UPDATE SET role = 'admin';

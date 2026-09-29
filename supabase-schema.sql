-- EventHub — Phase 9 Production Hardening Schema Migration
-- Run in full in Supabase SQL Editor (idempotent / safe to re-run anytime).

-- ─────────────────────────────────────────────────────────────
-- 1. EVENTS TABLE (Phase 9.1 Date & Time Cleanup)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.events (
  id          BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT         NOT NULL,
  description TEXT         DEFAULT '',
  event_date  DATE         NOT NULL DEFAULT CURRENT_DATE, -- Standard ISO Date
  starts_at   TIMESTAMPTZ  DEFAULT NOW(),                 -- TIMESTAMPTZ start
  ends_at     TIMESTAMPTZ  DEFAULT NOW() + INTERVAL '8 hours', -- TIMESTAMPTZ end
  date        TEXT         DEFAULT '',                    -- Legacy display date fallback
  raw_date    DATE,                                       -- Legacy raw_date fallback
  start_time  TEXT         DEFAULT '09:00 AM',            -- Legacy start_time fallback
  end_time    TEXT         DEFAULT '05:00 PM',            -- Legacy end_time fallback
  venue       TEXT         DEFAULT 'Main Auditorium',
  seats       INT          NOT NULL DEFAULT 30 CHECK (seats > 0),
  registered  INT          NOT NULL DEFAULT 0  CHECK (registered >= 0 AND registered <= seats),
  status      TEXT         NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed', 'completed', 'cancelled')),
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Migration helpers for events table (Phase 9.1 & 9.3)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '8 hours';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS raw_date DATE;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS start_time TEXT DEFAULT '09:00 AM';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_time TEXT DEFAULT '05:00 PM';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue TEXT DEFAULT 'Main Auditorium';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

-- Backfill event_date from raw_date or date if null
UPDATE public.events SET event_date = COALESCE(raw_date, CURRENT_DATE) WHERE event_date IS NULL;

-- Re-apply CHECK constraints explicitly
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_registered_check;
ALTER TABLE public.events ADD CONSTRAINT events_registered_check
  CHECK (registered >= 0 AND registered <= seats);
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_seats_check;
ALTER TABLE public.events ADD CONSTRAINT events_seats_check
  CHECK (seats > 0);
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_status_check
  CHECK (status IN ('draft', 'open', 'closed', 'completed', 'cancelled'));

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

-- Migration helpers
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS roll_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Enforce unique email in profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_email_unique' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. REGISTRATIONS TABLE (Phase 9.2 Registration Snapshot Cleanup)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.registrations (
  id                  TEXT         PRIMARY KEY,
  event_id            INT          NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_name_snapshot TEXT         NOT NULL DEFAULT '', -- Historical snapshot
  event_date_snapshot TEXT         NOT NULL DEFAULT '', -- Historical snapshot
  event_name          TEXT         DEFAULT '',          -- Legacy column fallback
  event_date          TEXT         DEFAULT '',          -- Legacy column fallback
  student_name        TEXT         NOT NULL,
  roll_number         TEXT         NOT NULL,
  "timestamp"         TEXT         NOT NULL,
  seats_left_after    INT          NOT NULL,
  user_id             UUID         REFERENCES auth.users ON DELETE CASCADE,
  ticket_code         TEXT,
  status              TEXT         NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'active', 'cancelled')),
  registered_at       TIMESTAMPTZ  DEFAULT NOW(),
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  DEFAULT NOW()
);

-- Migration helpers for snapshot columns (Phase 9.2)
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS event_name_snapshot TEXT DEFAULT '';
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS event_date_snapshot TEXT DEFAULT '';
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users ON DELETE CASCADE;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS ticket_code TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Backfill snapshot columns from legacy event_name / event_date if empty
UPDATE public.registrations
SET event_name_snapshot = COALESCE(NULLIF(event_name_snapshot, ''), event_name, 'Event'),
    event_date_snapshot = COALESCE(NULLIF(event_date_snapshot, ''), event_date, '2026-09-28')
WHERE event_name_snapshot = '' OR event_date_snapshot = '';

-- ─────────────────────────────────────────────────────────────
-- 4. GRANTS
-- ─────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT                        ON public.events       TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE        ON public.events       TO authenticated;

GRANT SELECT, INSERT, UPDATE        ON public.profiles     TO authenticated;

GRANT SELECT, INSERT, UPDATE        ON public.registrations TO authenticated;
REVOKE ALL                          ON public.registrations FROM anon;
GRANT DELETE                        ON public.registrations TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. UNIQUE INDEXES & PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS registrations_event_user_unique
  ON public.registrations (event_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_event_roll_unique
  ON public.registrations (event_id, lower(roll_number));

CREATE INDEX IF NOT EXISTS idx_registrations_user_id  ON public.registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON public.registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_status   ON public.registrations(status);
CREATE INDEX IF NOT EXISTS idx_events_status          ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_event_date      ON public.events(event_date);

-- ─────────────────────────────────────────────────────────────
-- 6. SEED EVENTS
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.events (id, name, event_date, date, raw_date, seats, registered, status)
VALUES
  (1, 'Code Clash',  '2026-09-10', '10 Sept 2026', '2026-09-10', 30, 0, 'open'),
  (2, 'Web Warfare', '2026-09-10', '10 Sept 2026', '2026-09-10', 25, 0, 'open'),
  (3, 'Tech Quiz',   '2026-09-10', '10 Sept 2026', '2026-09-10', 40, 0, 'open')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read Events"          ON public.events;
DROP POLICY IF EXISTS "Public All Events"           ON public.events;
DROP POLICY IF EXISTS "events_read_public"          ON public.events;
DROP POLICY IF EXISTS "events_write_admin"          ON public.events;

DROP POLICY IF EXISTS "Own profile read"            ON public.profiles;
DROP POLICY IF EXISTS "Own profile update"          ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_read"           ON public.profiles;
DROP POLICY IF EXISTS "profiles_read"               ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_insert"        ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_update"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_read_all"     ON public.profiles;

DROP POLICY IF EXISTS "Public Read Registrations"   ON public.registrations;
DROP POLICY IF EXISTS "Public Insert Registrations" ON public.registrations;
DROP POLICY IF EXISTS "Public Delete Registrations" ON public.registrations;
DROP POLICY IF EXISTS "registrations_student_insert" ON public.registrations;
DROP POLICY IF EXISTS "registrations_read"          ON public.registrations;
DROP POLICY IF EXISTS "registrations_update"        ON public.registrations;
DROP POLICY IF EXISTS "registrations_admin_delete"  ON public.registrations;

CREATE POLICY "events_read_public" ON public.events
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "events_write_admin" ON public.events
  FOR ALL TO anon, authenticated
  USING (
    auth.uid() IS NULL OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR
    NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NULL OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR
    NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "profiles_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "profiles_self_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_own_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "registrations_student_insert" ON public.registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "registrations_read" ON public.registrations
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "registrations_update" ON public.registrations
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "registrations_admin_delete" ON public.registrations
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

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

ALTER TABLE public.events        REPLICA IDENTITY FULL;
ALTER TABLE public.registrations REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────────────────────
-- 9. ATOMIC SEAT BOOKING FUNCTION (Phase 9 & 3.2 Workflow)
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
  id                  TEXT,
  event_id            INT,
  event_name_snapshot TEXT,
  event_date_snapshot TEXT,
  student_name        TEXT,
  roll_number         TEXT,
  "timestamp"         TEXT,
  seats_left_after    INT,
  registered          INT,
  ticket_code         TEXT,
  user_id             UUID,
  status              TEXT
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

  -- 1b. Check event lifecycle status (Phase 9.3 Lifecycle Guard)
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

  -- 6. Create registration record with explicit snapshot columns (Phase 9.2)
  RETURN QUERY
  INSERT INTO public.registrations (
    id,
    event_id,
    event_name_snapshot,
    event_date_snapshot,
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
    COALESCE(TO_CHAR(v_event.event_date, 'YYYY-MM-DD'), v_event.date),
    v_event.name,
    COALESCE(TO_CHAR(v_event.event_date, 'YYYY-MM-DD'), v_event.date),
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
    public.registrations.event_name_snapshot,
    public.registrations.event_date_snapshot,
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

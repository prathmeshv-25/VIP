-- EventHub Supabase setup
-- Run once in Supabase SQL Editor, then reload the app.

CREATE TABLE IF NOT EXISTS public.events (
  id INT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  raw_date DATE,
  seats INT NOT NULL DEFAULT 30 CHECK (seats > 0),
  registered INT NOT NULL DEFAULT 0 CHECK (registered >= 0 AND registered <= seats),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.registrations (
  id TEXT PRIMARY KEY,
  event_id INT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  student_name TEXT NOT NULL,
  roll_number TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  seats_left_after INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Explicit Data API access (required by projects with restricted default grants).
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_event_roll_unique
  ON public.registrations (event_id, lower(roll_number));

INSERT INTO public.events (id, name, date, raw_date, seats, registered)
VALUES
  (1, 'Code Clash', '10 Sept 2026', '2026-09-10', 30, 0),
  (2, 'Web Warfare', '10 Sept 2026', '2026-09-10', 25, 0),
  (3, 'Tech Quiz', '10 Sept 2026', '2026-09-10', 40, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read Events" ON public.events;
DROP POLICY IF EXISTS "Public All Events" ON public.events;
DROP POLICY IF EXISTS "Public Read Registrations" ON public.registrations;
DROP POLICY IF EXISTS "Public Insert Registrations" ON public.registrations;
DROP POLICY IF EXISTS "Public Delete Registrations" ON public.registrations;

CREATE POLICY "Public Read Events" ON public.events FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public All Events" ON public.events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public Read Registrations" ON public.registrations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public Insert Registrations" ON public.registrations FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public Delete Registrations" ON public.registrations FOR DELETE TO anon, authenticated USING (true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'registrations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.registrations;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.register_for_event(
  p_registration_id TEXT,
  p_event_id INT,
  p_student_name TEXT,
  p_roll_number TEXT,
  p_timestamp TEXT
)
RETURNS TABLE (
  id TEXT,
  event_id INT,
  event_name TEXT,
  event_date TEXT,
  student_name TEXT,
  roll_number TEXT,
  "timestamp" TEXT,
  seats_left_after INT,
  registered INT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_event public.events%ROWTYPE;
BEGIN
  UPDATE public.events AS e
  SET registered = e.registered + 1
  WHERE e.id = p_event_id AND e.registered < e.seats
  RETURNING e.* INTO v_event;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVENT_FULL';
  END IF;

  RETURN QUERY
  INSERT INTO public.registrations
    (id, event_id, event_name, event_date, student_name, roll_number, "timestamp", seats_left_after)
  VALUES
    (p_registration_id, v_event.id, v_event.name, v_event.date, p_student_name, p_roll_number,
     p_timestamp, v_event.seats - v_event.registered)
  RETURNING registrations.id, registrations.event_id, registrations.event_name, registrations.event_date,
    registrations.student_name, registrations.roll_number, registrations."timestamp",
    registrations.seats_left_after, v_event.registered;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_for_event(TEXT, INT, TEXT, TEXT, TEXT) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

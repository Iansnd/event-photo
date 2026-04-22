-- Enable RLS on guests and guest_extras.
--
-- App architecture: every Supabase read/write happens server-side via
-- supabaseAdmin (service role), either in API routes or Server Components.
-- No browser code imports the Supabase client. Service role bypasses RLS,
-- so enabling RLS with no policies locks out the public anon key while
-- keeping the app fully functional.

ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_extras ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STAGE 5 — LIVE UPDATES (Supabase Realtime)
-- Run in Supabase Dashboard -> SQL Editor. Safe to run more than once.
--
-- Adds the tables to the realtime publication so the app receives
-- change notifications. Row Level Security still applies: each user only
-- receives changes for rows they are allowed to read.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array['attendance', 'events', 'profiles'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

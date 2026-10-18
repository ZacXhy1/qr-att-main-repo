-- ============================================================
-- STAGE 1 — SECURITY HARDENING
-- Run the ENTIRE file in Supabase Dashboard -> SQL Editor.
-- Safe to run more than once (idempotent).
--
-- Fixes:
--  1. Nobody can promote themselves to admin/teacher (profile role is locked).
--  2. Sign-up metadata can no longer request the 'admin' role.
--  3. Only teachers/admins can create events.
--  4. Attendance can only be recorded by a STUDENT, for an event that is
--     open and inside its start/end time (enforced in the database,
--     so it cannot be bypassed by calling the API directly).
-- ============================================================

-- ------------------------------------------------------------
-- Helper functions (SECURITY DEFINER avoids RLS recursion)
-- ------------------------------------------------------------
create or replace function public.my_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.my_role() in ('teacher', 'admin'), false);
$$;

create or replace function public.is_event_open(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and e.status = 'open'
      and (e.start_time is null or now() >= e.start_time)
      and (e.end_time   is null or now() <= e.end_time)
  );
$$;

-- ------------------------------------------------------------
-- 1 & 2. PROFILES: lock the role column
-- ------------------------------------------------------------

-- New users may only sign up as student or teacher (never admin).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    case
      when new.raw_user_meta_data->>'role' = 'teacher' then 'teacher'
      else 'student'
    end
  );
  return new;
end;
$$;

-- Only an admin can change a role. (The Supabase SQL editor has no
-- logged-in user, so you can still promote an admin from there.)
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only administrators can change roles.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute procedure public.protect_profile_role();

-- Profiles are created by the sign-up trigger only; clients may not insert
-- their own row (that would let them choose any role).
drop policy if exists "Users can insert their own profile" on public.profiles;

-- Users can only update their own row (and cannot hand it to someone else).
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ------------------------------------------------------------
-- 3. EVENTS: only teachers/admins create events
-- ------------------------------------------------------------
drop policy if exists "Users can insert events" on public.events;
drop policy if exists "Teachers and admins can insert events" on public.events;
create policy "Teachers and admins can insert events"
  on public.events for insert
  with check (
    auth.uid() = created_by
    and public.is_staff()
  );

-- Creator can edit their own events, but cannot reassign ownership.
drop policy if exists "Users can update their own events" on public.events;
create policy "Users can update their own events"
  on public.events for update
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- ------------------------------------------------------------
-- 4. ATTENDANCE: students only, open events only, inside the time window
-- ------------------------------------------------------------
drop policy if exists "Students can insert their own attendance" on public.attendance;
create policy "Students can insert their own attendance"
  on public.attendance for insert
  with check (
    auth.uid() = student_id
    and public.my_role() = 'student'
    and public.is_event_open(event_id)
  );

-- ------------------------------------------------------------
-- OPTIONAL one-time fix for events created BEFORE this update.
-- Older versions saved times without a timezone, so they were stored as
-- UTC and are shifted by your timezone (Philippines = +8 hours).
-- If you have old test events with wrong times, either re-create them or
-- uncomment and run ONCE:
--
-- update public.events
--   set start_time = start_time - interval '8 hours',
--       end_time   = end_time   - interval '8 hours';
-- ------------------------------------------------------------

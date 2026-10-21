-- ============================================================
-- QR-ATT — CONSOLIDATED SCHEMA (final state, includes hardening)
-- Sections
--   1. Tables
--   2. Columns added over time (no-op on a fresh install)
--   3. Constraints
--   4. Helper functions
--   5. Triggers
--   6. Row Level Security policies
--   7. QR secret + record_attendance() RPC
--   8. Realtime
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  title text not null,
  start_time timestamptz,
  end_time timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  unique (student_id, event_id)
);

create table if not exists public.event_secrets (
  event_id uuid primary key references public.events (id) on delete cascade,
  secret text not null
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);

alter table public.profiles       enable row level security;
alter table public.events         enable row level security;
alter table public.attendance     enable row level security;
alter table public.event_secrets  enable row level security;

-- ------------------------------------------------------------
-- 2. COLUMNS ADDED OVER TIME (no-op if they already exist)
-- ------------------------------------------------------------
alter table public.events
  add column if not exists venue text,
  add column if not exists description text,
  add column if not exists status text not null default 'open',
  add column if not exists grace_minutes integer not null default 15;

alter table public.attendance
  add column if not exists status text not null default 'present';

alter table public.profiles
  add column if not exists student_number text,
  add column if not exists section text,
  add column if not exists program text;

-- ------------------------------------------------------------
-- 3. CONSTRAINTS
-- ------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'teacher', 'admin'));

alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('open', 'closed'));

alter table public.events drop constraint if exists events_grace_minutes_check;
alter table public.events add constraint events_grace_minutes_check
  check (grace_minutes >= 0);

alter table public.events drop constraint if exists events_time_order_check;
alter table public.events add constraint events_time_order_check
  check (start_time is null or end_time is null or end_time > start_time) not valid;

alter table public.events drop constraint if exists events_title_check;
alter table public.events add constraint events_title_check
  check (char_length(btrim(title)) between 1 and 120) not valid;

alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('present', 'late'));

create index if not exists attendance_event_id_idx on public.attendance (event_id);
create index if not exists events_created_by_idx   on public.events (created_by);

-- ------------------------------------------------------------
-- 4. HELPER FUNCTIONS (SECURITY DEFINER avoids RLS recursion)
-- ------------------------------------------------------------
create or replace function public.my_role()
returns text
language sql security definer set search_path = public stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql security definer set search_path = public stable
as $$
  select coalesce(public.my_role() = 'admin', false);
$$;

create or replace function public.is_staff()
returns boolean
language sql security definer set search_path = public stable
as $$
  select coalesce(public.my_role() in ('teacher', 'admin'), false);
$$;

-- ------------------------------------------------------------
-- 5. TRIGGERS
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    left(btrim(new.raw_user_meta_data->>'full_name'), 100),
    'student'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.protect_profile_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role then
      if not public.is_admin() then
        raise exception 'Only administrators can change roles.' using errcode = '42501';
      end if;
      if old.role = 'admin' and new.role <> 'admin'
         and (select count(*) from public.profiles where role = 'admin') <= 1 then
        raise exception 'You cannot remove the last administrator.' using errcode = '42501';
      end if;
    end if;
    new.id := old.id;
    new.email := old.email;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute procedure public.protect_profile_role();

create or replace function public.set_attendance_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_start timestamptz;
  v_grace integer;
begin
  select start_time, grace_minutes into v_start, v_grace
  from public.events where id = new.event_id;

  new.scanned_at := now();

  if v_start is not null and now() > v_start + make_interval(mins => v_grace) then
    new.status := 'late';
  else
    new.status := 'present';
  end if;
  return new;
end;
$$;

drop trigger if exists set_attendance_status on public.attendance;
create trigger set_attendance_status
  before insert on public.attendance
  for each row execute procedure public.set_attendance_status();

create or replace function public.create_event_secret()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.event_secrets (event_id) values (new.id)
  on conflict (event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_event_secret on public.events;
create trigger create_event_secret
  after insert on public.events
  for each row execute procedure public.create_event_secret();

insert into public.event_secrets (event_id)
select id from public.events
on conflict (event_id) do nothing;

-- ------------------------------------------------------------
-- 6. ROW LEVEL SECURITY POLICIES
-- ------------------------------------------------------------

-- ---- profiles ------------------------------------------------
drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "Teachers can view profiles of their attendees" on public.profiles;
create policy "Teachers can view profiles of their attendees"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id
        and e.created_by = auth.uid()
    )
  );

drop policy if exists "Users can insert their own profile" on public.profiles;

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- ---- events --------------------------------------------------
drop policy if exists "Events are readable by any authenticated user" on public.events;
create policy "Events are readable by any authenticated user"
  on public.events for select
  using (auth.uid() is not null);

drop policy if exists "Admins can view all events" on public.events;

drop policy if exists "Users can insert events" on public.events;
drop policy if exists "Teachers and admins can insert events" on public.events;
create policy "Teachers and admins can insert events"
  on public.events for insert
  with check (auth.uid() = created_by and public.is_staff());

drop policy if exists "Users can update their own events" on public.events;
create policy "Users can update their own events"
  on public.events for update
  using (auth.uid() = created_by and public.is_staff())
  with check (auth.uid() = created_by and public.is_staff());

drop policy if exists "Admins can update all events" on public.events;
create policy "Admins can update all events"
  on public.events for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete events" on public.events;
create policy "Admins can delete events"
  on public.events for delete
  using (public.is_admin());

-- ---- attendance ----------------------------------------------
drop policy if exists "Students can view their own attendance" on public.attendance;
create policy "Students can view their own attendance"
  on public.attendance for select
  using (auth.uid() = student_id);

drop policy if exists "Teachers can view attendance for their events" on public.attendance;
create policy "Teachers can view attendance for their events"
  on public.attendance for select
  using (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id and e.created_by = auth.uid()
    )
  );

drop policy if exists "Admins can view all attendance" on public.attendance;
create policy "Admins can view all attendance"
  on public.attendance for select
  using (public.is_admin());

drop policy if exists "Students can insert their own attendance" on public.attendance;

drop policy if exists "Admins can update all attendance" on public.attendance;
create policy "Admins can update all attendance"
  on public.attendance for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete attendance" on public.attendance;
create policy "Admins can delete attendance"
  on public.attendance for delete
  using (public.is_admin());

-- ---- event_secrets -------------------------------------------
drop policy if exists "Creators and admins can read event secrets" on public.event_secrets;
create policy "Creators and admins can read event secrets"
  on public.event_secrets for select
  using (
    public.is_admin()
    or (
      public.is_staff()
      and exists (
        select 1 from public.events e
        where e.id = event_secrets.event_id and e.created_by = auth.uid()
      )
    )
  );

-- ------------------------------------------------------------
-- 7. record_attendance(): the ONLY way to record attendance
-- ------------------------------------------------------------
create or replace function public.record_attendance(p_event_code text, p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_event  public.events%rowtype;
  v_secret text;
  v_status text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'unauthorized',
                              'message', 'Please sign in again.');
  end if;

  if public.my_role() is distinct from 'student' then
    return jsonb_build_object('ok', false, 'code', 'forbidden',
                              'message', 'Only students can record attendance.');
  end if;

  select * into v_event from public.events where event_code = p_event_code;
  if found then
    select secret into v_secret from public.event_secrets where event_id = v_event.id;
  end if;

  if not found or v_secret is null or p_token is null or p_token <> v_secret then
    return jsonb_build_object('ok', false, 'code', 'invalid_qr',
                              'message', 'Invalid QR code.');
  end if;

  if v_event.status <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'closed',
                              'message', 'This event is closed.', 'title', v_event.title);
  end if;
  if v_event.start_time is not null and now() < v_event.start_time then
    return jsonb_build_object('ok', false, 'code', 'not_started',
                              'message', 'Event has not started yet.', 'title', v_event.title);
  end if;
  if v_event.end_time is not null and now() > v_event.end_time then
    return jsonb_build_object('ok', false, 'code', 'ended',
                              'message', 'Event has already ended.', 'title', v_event.title);
  end if;

  begin
    insert into public.attendance (student_id, event_id)
    values (v_uid, v_event.id)
    returning status into v_status;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'duplicate',
                              'message', 'Already registered for this event.',
                              'title', v_event.title);
  end;

  return jsonb_build_object(
    'ok', true, 'code', 'ok', 'title', v_event.title, 'status', v_status,
    'message', case when v_status = 'late'
                    then 'Attendance recorded, but you were marked LATE.'
                    else 'Attendance recorded!' end
  );
end;
$$;

create or replace function public.rotate_event_secret(p_event_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.events e
    where e.id = p_event_id
      and ((e.created_by = auth.uid() and public.is_staff()) or public.is_admin())
  ) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  update public.event_secrets
     set secret = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
   where event_id = p_event_id;
end;
$$;

revoke all on function public.record_attendance(text, text) from public, anon;
grant execute on function public.record_attendance(text, text) to authenticated;
revoke all on function public.rotate_event_secret(uuid) from public, anon;
grant execute on function public.rotate_event_secret(uuid) to authenticated;

-- ------------------------------------------------------------
-- 8. REALTIME (RLS still applies to what each user receives)
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['attendance', 'events', 'profiles'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- END OF SCHEMA
-- ============================================================

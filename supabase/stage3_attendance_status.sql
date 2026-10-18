-- ============================================================
-- STAGE 3 — ATTENDANCE STATUS (present / late)
-- Run the ENTIRE file in Supabase Dashboard -> SQL Editor.
-- Safe to run more than once (idempotent).
--
--  * events.grace_minutes : how many minutes after the start time a student
--    can still scan and count as "present" (default 15).
--  * attendance.status    : 'present' or 'late'.
--  * A trigger sets the status automatically on insert, so a student
--    cannot choose or fake their own status.
--  * Admins may correct a record's status (update policy).
-- Existing attendance rows become 'present'.
-- ============================================================

alter table public.events
  add column if not exists grace_minutes integer not null default 15;

alter table public.events drop constraint if exists events_grace_minutes_check;
alter table public.events add constraint events_grace_minutes_check
  check (grace_minutes >= 0);

alter table public.attendance
  add column if not exists status text not null default 'present';

alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('present', 'late'));

create or replace function public.set_attendance_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_grace integer;
begin
  select start_time, grace_minutes
    into v_start, v_grace
  from public.events
  where id = new.event_id;

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

-- Admins can correct attendance (e.g. change late -> present).
drop policy if exists "Admins can update all attendance" on public.attendance;
create policy "Admins can update all attendance"
  on public.attendance for update
  using (public.is_admin())
  with check (public.is_admin());

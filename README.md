# ZIB QR Attendance

A mobile app for managing school event attendance with QR codes. Teachers and
admins create events and show a QR code; students scan it to record their
attendance. Built for the Event-Driven Programming final project (QR-ATT).

**Stack:** Expo (React Native, expo-router, TypeScript) · Supabase (Auth,
PostgreSQL, Row Level Security, Realtime) · expo-camera

---

## Features

| Role | What they can do |
|---|---|
| **Student** | Register / log in, edit profile (name, student number, section, program), browse events, scan a QR (camera or gallery), see a confirmation (present or late), view personal attendance history |
| **Teacher** | Create, edit, close and reopen events, show the event QR, regenerate the QR if it leaks, view attendance per event with present / late counts |
| **Admin** | Everything a teacher can do on any event, plus manage users and roles, view all attendance, correct a record (present ↔ late) or delete it, delete events, see system stats |

Other behaviour:

- **Late detection.** Each event has a "late after" grace period; the database
  marks a scan `present` or `late` automatically.
- **Live updates.** Lists refresh through Supabase Realtime, and event badges
  (Upcoming / Open now / Ended / Closed) update on a 30-second timer.
- **Feedback states.** Loading, success, errors, empty lists, invalid QR,
  duplicate attendance, closed / not started / ended event, and locked screens
  for the wrong role.
- **Password reset** with an emailed code, and email confirmation on sign-up.

---

## How attendance works

1. A teacher creates an event. The database generates a random **QR secret**
   for it (stored in its own table, readable only by the creator and admins).
2. The app shows a QR containing the event code and that secret.
3. A student scans it. The app calls one database function,
   `record_attendance(event_code, token)`.
4. The function checks, in this order: signed in → student role → event
   exists and the secret matches → event is open → inside its time window →
   not a duplicate. It then inserts the record; a trigger stamps the time and
   sets `present` / `late`.
5. The student sees a green or red result card.

Students have **no direct INSERT permission** on `attendance`, so the checks
cannot be skipped by calling the API directly.

---

## Project structure

```
app/
  _layout.tsx          Root layout; routes guarded by login state
  login.tsx  register.tsx  forgot-password.tsx
  (tabs)/
    _layout.tsx        Role-based tab bar + redirect guard
    index.tsx          Home
    events.tsx         Student: browse events
    scan.tsx           Student: QR scanner
    history.tsx        Student history / teacher attendance sheets
    teacher.tsx        Teacher & admin: create / manage events, show QR
    admin.tsx          Admin: users, events, attendance, stats
    profile.tsx        Profile, sign out
components/            Header, AppButton, PasswordInput, KeyboardAvoid
constants/colors.ts    Color palette
lib/
  supabase.ts          Supabase client (session in SecureStore)
  auth.ts              signUp, signIn, signOut, password reset, session state
  role.ts              Role lookup + which tabs each role can open
  events.ts  attendance.ts  admin.ts  profiles.ts   Data access
  qr.ts                Build / parse the QR payload
  realtime.ts          useRealtimeRefresh (Supabase Realtime, debounced)
  validation.ts  format.ts
supabase/schema.sql    Full database schema, policies, functions, triggers
EVENT_FLOW.md          Event → Handler → Action → Result map (for the defense)
```

---

## Database

Defined in [`supabase/schema.sql`](supabase/schema.sql), which is safe to re-run.

| Table | Purpose | Key relationships |
|---|---|---|
| `profiles` | One row per user: name, email, role, student number, section, program | `id` → `auth.users` |
| `events` | Event name, code, venue, description, start/end, status (open/closed), grace minutes | `created_by` → `auth.users` |
| `attendance` | One scan: student, event, time, status | `student_id` → `auth.users`, `event_id` → `events`; **unique (student_id, event_id)** |
| `event_secrets` | The QR secret per event | `event_id` → `events` |

Functions and triggers:

- `handle_new_user` — every sign-up becomes a **student**; the role in sign-up
  data is ignored.
- `protect_profile_role` — only admins can change roles; the last admin cannot
  be demoted; users cannot change their own id or email.
- `set_attendance_status` — sets scan time and present / late on the server.
- `create_event_secret` — creates the QR secret for each new event.
- `record_attendance` / `rotate_event_secret` — the only way to record
  attendance and to invalidate an old QR.
- `my_role`, `is_admin`, `is_staff` — helpers used by the policies.

---

## Security

- **Authentication:** Supabase Auth; the session is stored in the device's
  SecureStore; sign-out clears it.
- **Authorization:** enforced by Row Level Security on every table, not only
  in the UI. Hiding a tab is a convenience; the database is the real gate.
- **Roles can't be self-assigned:** sign-up always creates a student; only an
  admin can promote someone (trigger-enforced).
- **Attendance integrity:** server-side function, unique constraint against
  duplicates, server-set time and status.
- **QR secret:** unreadable by students; can be regenerated at any time.
- **Credentials:** only the public anon key is in the app (`.env`, not
  committed). Never put the service-role key in this project.
- **Input validation:** email / password rules in `lib/validation.ts`,
  length and time-order checks in the database.

---

## Setup

**Requirements:** Node.js LTS, a Supabase project, and either an Android
device with a development build or the Expo Go version that matches the
project's Expo SDK (see `package.json`).

1. **Install**
   ```bash
   npm install
   ```
2. **Environment** — copy `.env.example` to `.env` and fill in your project's
   values (Supabase → Project Settings → API):
   ```
   EXPO_PUBLIC_SUPABASE_URL=...
   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
   ```
3. **Database** — open Supabase → SQL Editor, paste all of
   `supabase/schema.sql`, and run it.
4. **Auth settings** (Supabase → Authentication):
   - URL Configuration → **Site URL:** `qr-attendance://login`
   - URL Configuration → **Redirect URLs:** add `qr-attendance://**`
   - Email Templates → **Reset Password** must include `{{ .Token }}` so the
     emailed code works.
5. **First admin** — register an account in the app, then in the SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
   After that, promote teachers from the Admin tab.
6. **Run**
   ```bash
   npx expo start -c
   ```
   For an installable build: `eas build --platform android --profile preview`.

---

## Known limitations

- The QR is a fixed secret per event, so a photo or screenshot of it can be
  shared. A teacher can regenerate it; a rotating QR would remove the risk.
- No offline mode: scanning needs an internet connection.
- No push notifications or analytics dashboard yet.

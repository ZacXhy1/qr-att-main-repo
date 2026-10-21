import { supabase } from './supabase';
import type { Role } from './profiles';

export type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};

export type AdminEvent = {
  id: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  createdBy: string | null;
  status: 'open' | 'closed';
  attendeeCount: number;
};

export type AdminStats = {
  totalUsers: number;
  totalEvents: number;
  totalAttendance: number;
};

export async function getAllUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .order('email', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUser[];
}

export async function setUserRole(
  userId: string,
  role: Role
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  return { error: error?.message ?? null };
}

export async function getAllEvents(): Promise<AdminEvent[]> {
  const { data: events, error } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time, created_by, status')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!events) return [];

  const eventIds = events.map((e: any) => e.id);
  const counts: Record<string, number> = {};

  if (eventIds.length > 0) {
    const { data: attRows } = await supabase
      .from('attendance')
      .select('event_id')
      .in('event_id', eventIds);

    (attRows ?? []).forEach((r: any) => {
      counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
    });
  }

  return events.map((e: any) => ({
    id: e.id,
    eventCode: e.event_code,
    title: e.title,
    startTime: e.start_time,
    endTime: e.end_time,
    createdBy: e.created_by,
    status: e.status === 'closed' ? 'closed' : 'open',
    attendeeCount: counts[e.id] ?? 0,
  }));
}

export async function deleteEvent(eventId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  return { error: error?.message ?? null };
}

export async function deleteAttendanceRecord(
  attendanceId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('attendance').delete().eq('id', attendanceId);
  return { error: error?.message ?? null };
}

export async function getStats(): Promise<AdminStats> {
  const [usersRes, eventsRes, attendanceRes] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('events').select('*', { count: 'exact', head: true }),
    supabase.from('attendance').select('*', { count: 'exact', head: true }),
  ]);

  return {
    totalUsers: usersRes.count ?? 0,
    totalEvents: eventsRes.count ?? 0,
    totalAttendance: attendanceRes.count ?? 0,
  };
}

/* ----------------------- Attendance records (admin) ----------------------- */

export type AdminAttendance = {
  id: string;
  studentId: string;
  eventId: string;
  scannedAt: string;
  status: 'present' | 'late';
};

export async function getAllAttendance(limit = 100): Promise<AdminAttendance[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, student_id, event_id, scanned_at, status')
    .order('scanned_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    id: r.id,
    studentId: r.student_id,
    eventId: r.event_id,
    scannedAt: r.scanned_at,
    status: r.status === 'late' ? 'late' : 'present',
  }));
}

export async function setAttendanceStatus(
  attendanceId: string,
  status: 'present' | 'late'
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('attendance')
    .update({ status })
    .eq('id', attendanceId);
  return { error: error?.message ?? null };
}

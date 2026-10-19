import { supabase } from './supabase';
import { parseQRPayload } from './qr';

/* ------------------------------------------------------------------ */
/* Student: scan a QR code and record attendance                       */
/* ------------------------------------------------------------------ */

export type AttendanceStatus = 'present' | 'late';

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
  status: AttendanceStatus;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
  status?: AttendanceStatus;
};

export async function registerAttendance(
  rawPayload: string,
  _studentId?: string // kept so existing callers still compile; the DB uses the signed-in user
): Promise<RegisterResult> {
  // 1. Quick local check so obviously wrong QR codes never hit the network.
  const parsed = parseQRPayload(rawPayload);
  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }

  // 2. The database does ALL the real checks inside record_attendance():
  //    signed in, student role, valid event + secret, open, time window,
  //    duplicate. It also sets the time and present/late status.
  const { data, error } = await supabase.rpc('record_attendance', {
    p_event_code: parsed.payload.event,
    p_token: parsed.payload.t,
  });

  if (error) {
    return { success: false, message: 'Could not record attendance. Check your connection and try again.' };
  }

  const res = data as {
    ok: boolean;
    code: string;
    message: string;
    title?: string;
    status?: AttendanceStatus;
  };

  return {
    success: res.ok,
    message: res.message,
    eventTitle: res.title,
    status: res.ok ? (res.status === 'late' ? 'late' : 'present') : undefined,
  };
}

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, scanned_at, status, events ( event_code, title )')
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    eventId: row.events?.event_code ?? '',
    eventTitle: row.events?.title ?? '',
    scannedAt: row.scanned_at,
    status: (row.status === 'late' ? 'late' : 'present') as AttendanceStatus,
  }));
}

/* ------------------------------------------------------------------ */
/* Teacher: my events + who attended                                   */
/* ------------------------------------------------------------------ */

export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  status: 'open' | 'closed';
  attendeeCount: number;
  presentCount: number;
  lateCount: number;
  attendees: {
    studentId: string;
    studentName: string | null;
    scannedAt: string;
    status: AttendanceStatus;
  }[];
};

export type TeacherEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  status: 'open' | 'closed';
  attendeeCount: number;
};

// Teachers see the events they created. Admins pass allEvents = true to see
// every event (the database allows this through the admin RLS policies).
export async function getTeacherEventAttendance(
  userId: string,
  allEvents: boolean = false
): Promise<TeacherEventAttendance[]> {
  let query = supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time, venue, status')
    .order('created_at', { ascending: false });
  if (!allEvents) query = query.eq('created_by', userId);

  const { data: events, error: eventError } = await query;

  if (eventError) throw new Error(eventError.message);
  if (!events) return [];

  const eventIds = events.map((e: any) => e.id);
  if (eventIds.length === 0) return [];

  const { data: attendance, error: attError } = await supabase
    .from('attendance')
    .select('student_id, scanned_at, event_id, status')
    .in('event_id', eventIds)
    .order('scanned_at', { ascending: false });

  if (attError) throw new Error(attError.message);
  if (!attendance) return [];

  // Look up student names (teachers may read profiles of their attendees).
  const studentIds = Array.from(new Set(attendance.map((a: any) => a.student_id as string)));
  const names: Record<string, string> = {};
  if (studentIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', studentIds);
    (profs ?? []).forEach((p: any) => {
      names[p.id] = p.full_name || p.email;
    });
  }

  return events.map((e: any) => {
    const rows = attendance.filter((a: any) => a.event_id === e.id);
    return {
      eventId: e.id,
      eventCode: e.event_code,
      title: e.title,
      startTime: e.start_time,
      endTime: e.end_time,
      venue: e.venue,
      status: e.status,
      attendeeCount: rows.length,
      presentCount: rows.filter((a: any) => a.status !== 'late').length,
      lateCount: rows.filter((a: any) => a.status === 'late').length,
      attendees: rows.map((a: any) => ({
        studentId: a.student_id,
        studentName: names[a.student_id] ?? null,
        scannedAt: a.scanned_at,
        status: (a.status === 'late' ? 'late' : 'present') as AttendanceStatus,
      })),
    };
  });
}

export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  const full = await getTeacherEventAttendance(teacherId);
  return full.map((e) => ({
    eventId: e.eventId,
    eventCode: e.eventCode,
    title: e.title,
    status: e.status,
    attendeeCount: e.attendeeCount,
  }));
}
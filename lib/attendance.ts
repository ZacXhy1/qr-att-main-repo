import { supabase } from './supabase';
import { getEventByCode } from './events';
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
  studentId: string
): Promise<RegisterResult> {
  // 1. The QR must be a valid attendance QR.
  const parsed = parseQRPayload(rawPayload);
  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }

  // 2. The event must already exist. Scanning never creates events, and the
  //    time window / status come from the database, not from the QR text
  //    (the QR could have been edited).
  const event = await getEventByCode(parsed.payload.event);
  if (!event) {
    return {
      success: false,
      message: 'Event not found. This QR code is not valid.',
    };
  }

  if (event.status === 'closed') {
    return { success: false, message: 'This event is closed.', eventTitle: event.title };
  }

  const now = Date.now();
  const start = event.start_time ? new Date(event.start_time).getTime() : null;
  const end = event.end_time ? new Date(event.end_time).getTime() : null;

  if (start && now < start) {
    return { success: false, message: 'Event has not started yet.', eventTitle: event.title };
  }
  if (end && now > end) {
    return { success: false, message: 'Event has already ended.', eventTitle: event.title };
  }

  // 3. Record attendance. The database enforces the same rules again
  //    (student role, open event, time window, one record per student/event).
  // The database decides present/late (trigger), so it can't be faked.
  const { data: inserted, error: attError } = await supabase
    .from('attendance')
    .insert([
      {
        student_id: studentId,
        event_id: event.id,
      },
    ])
    .select('status')
    .single();

  if (attError) {
    if (attError.code === '23505') {
      return {
        success: false,
        message: 'Already registered for this event.',
        eventTitle: event.title,
      };
    }
    if (attError.code === '42501') {
      return {
        success: false,
        message: 'You are not allowed to record attendance for this event right now.',
        eventTitle: event.title,
      };
    }
    return { success: false, message: attError.message };
  }

  const status: AttendanceStatus = inserted?.status === 'late' ? 'late' : 'present';
  return {
    success: true,
    message:
      status === 'late'
        ? 'Attendance recorded, but you were marked LATE.'
        : 'Attendance recorded!',
    eventTitle: event.title,
    status,
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

  if (error || !data) {
    return [];
  }

  return data.map((row: any) => ({
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

export async function getTeacherEventAttendance(
  teacherId: string
): Promise<TeacherEventAttendance[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time, venue, status')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError || !events) return [];

  const eventIds = events.map((e: any) => e.id);
  if (eventIds.length === 0) return [];

  const { data: attendance, error: attError } = await supabase
    .from('attendance')
    .select('student_id, scanned_at, event_id, status')
    .in('event_id', eventIds)
    .order('scanned_at', { ascending: false });

  if (attError || !attendance) return [];

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
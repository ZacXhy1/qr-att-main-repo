import { supabase } from './supabase';

export type EventStatus = 'open' | 'closed';

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  venue?: string;
  description?: string;
  graceMinutes?: number;
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  description: string | null;
  grace_minutes: number;
  status: EventStatus;
  created_by: string | null;
  created_at: string;
};

function toUtcISO(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function createEvent(
  event: Event
): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('events').insert(
    {
      event_code: event.eventId,
      title: event.title,
      start_time: toUtcISO(event.start),
      end_time: toUtcISO(event.end),
      venue: event.venue?.trim() || null,
      description: event.description?.trim() || null,
      grace_minutes: event.graceMinutes ?? 15,
      created_by: user?.id ?? null,
    }
  );

  if (error?.code === '23505') {
    return { error: 'That event code is already taken. Please save again.' };
  }
  return { error: error?.message ?? null };
}

export type EventUpdate = {
  title?: string;
  start?: string;
  end?: string;
  venue?: string;
  description?: string;
  graceMinutes?: number;
};

export async function updateEvent(
  eventId: string,
  updates: EventUpdate
): Promise<{ error: string | null }> {
  const payload: Record<string, any> = {};
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.start !== undefined) payload.start_time = toUtcISO(updates.start);
  if (updates.end !== undefined) payload.end_time = toUtcISO(updates.end);
  if (updates.venue !== undefined) payload.venue = updates.venue.trim() || null;
  if (updates.description !== undefined) {
    payload.description = updates.description.trim() || null;
  }

  if (updates.graceMinutes !== undefined) payload.grace_minutes = updates.graceMinutes;

  const { error } = await supabase.from('events').update(payload).eq('id', eventId);
  return { error: error?.message ?? null };
}

export async function setEventStatus(
  eventId: string,
  status: EventStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('events').update({ status }).eq('id', eventId);
  return { error: error?.message ?? null };
}

export async function getEventsByTeacher(
  teacherId: string
): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CloudEvent[];
}

export async function rotateEventSecret(eventId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('rotate_event_secret', { p_event_id: eventId });
  return { error: error?.message ?? null };
}

export async function getEventSecret(code: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('events')
    .select('event_secrets ( secret )')
    .eq('event_code', code)
    .maybeSingle();

  if (error || !data) return null;
  const row: any = (data as any).event_secrets;
  const secret = Array.isArray(row) ? row[0]?.secret : row?.secret;
  return secret ?? null;
}

export async function getEventByCode(
  code: string
): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('event_code', code)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CloudEvent;
}

/* ------------------------------------------------------------------ */
/* Student: browse events                                              */
/* ------------------------------------------------------------------ */

export type EventState = 'ongoing' | 'upcoming' | 'ended' | 'closed';

export function getEventState(
  event: Pick<CloudEvent, 'status' | 'start_time' | 'end_time'>,
  now: number = Date.now()
): EventState {
  if (event.status === 'closed') return 'closed';
  const start = event.start_time ? new Date(event.start_time).getTime() : null;
  const end = event.end_time ? new Date(event.end_time).getTime() : null;
  if (end !== null && now > end) return 'ended';
  if (start !== null && now < start) return 'upcoming';
  return 'ongoing';
}

export async function getEventsForStudent(studentId: string): Promise<{
  events: CloudEvent[];
  attendedIds: string[];
  error: string | null;
}> {
  const [eventsRes, attendanceRes] = await Promise.all([
    supabase.from('events').select('*').order('start_time', { ascending: true }),
    supabase.from('attendance').select('event_id').eq('student_id', studentId),
  ]);

  if (eventsRes.error) {
    return { events: [], attendedIds: [], error: eventsRes.error.message };
  }

  return {
    events: (eventsRes.data ?? []) as CloudEvent[],
    attendedIds: (attendanceRes.data ?? []).map((r: any) => r.event_id as string),
    error: null,
  };
}

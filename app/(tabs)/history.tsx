import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { getTeacherEventAttendance, type TeacherEventAttendance } from '@/lib/attendance';
import { useAuth } from '@/lib/auth';
import { getAttendanceHistory, type AttendanceRecord } from '@/lib/attendance';
import { getEventState, type EventState } from '@/lib/events';
import { formatDateOnly, formatDateTime12, formatTime12 } from '@/lib/format';
import { getProfile, type Role } from '@/lib/profiles';
import { useRealtimeRefresh } from '@/lib/realtime';

export default function HistoryScreen() {
  const { user } = useAuth();

  const [role, setRole] = useState<Role | null>(null);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // Re-render every 30 s so Upcoming / Open now / Ended badges stay current.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const profile = await getProfile(user.id);
    const currentRole: Role = profile?.role ?? 'student';
    setRole(currentRole);

    if (currentRole === 'teacher' || currentRole === 'admin') {
      const events = await getTeacherEventAttendance(user.id);
      setTeacherEvents(events);
      setStudentRecords([]);
    } else {
      const records = await getAttendanceHistory(user.id);
      setStudentRecords(records);
      setTeacherEvents([]);
    }

    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Live updates: refresh when attendance or events change.
  useRealtimeRefresh('history', ['attendance', 'events'], load);

  const toggle = (eventId: string) =>
    setCollapsed((prev) => ({ ...prev, [eventId]: !prev[eventId] }));

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Attendance History</Text>
        <Text style={styles.subtitle}>Loading records...</Text>
      </View>
    );
  }

  /* ---------------- Teacher / Admin view (their own events) ---------------- */
  if (role === 'teacher' || role === 'admin') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Event Attendance</Text>

        {teacherEvents.length === 0 ? (
          <Text style={styles.subtitle}>
            You haven't created any events yet. Use the Teacher tab to create one.
          </Text>
        ) : (
          <FlatList
            data={teacherEvents}
            keyExtractor={(item) => item.eventId}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const isCollapsed = !!collapsed[item.eventId];
              return (
                <View style={styles.card}>
                  <Pressable style={styles.cardHeader} onPress={() => toggle(item.eventId)}>
                    <View style={styles.cardHeaderText}>
                      <View style={styles.titleRow}>
                        <Text style={styles.eventTitle}>{item.title}</Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: STATE_COLOR[getEventState(toCloud(item), now)] },
                          ]}
                        >
                          <Text style={styles.statusBadgeText}>
                            {STATE_LABEL[getEventState(toCloud(item), now)]}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.eventMeta}>{item.eventCode}</Text>
                      <Text style={styles.eventMeta}>
                        {item.presentCount} present · {item.lateCount} late
                      </Text>
                      {item.startTime && (
                        <Text style={styles.eventMeta}>{formatDateTime12(item.startTime)}</Text>
                      )}
                    </View>
                    <View style={styles.countBadge}>
                      <Text style={styles.countText}>{item.attendeeCount}</Text>
                    </View>
                  </Pressable>

                  {!isCollapsed &&
                    (item.attendees.length === 0 ? (
                      <Text style={styles.emptyAttendees}>No one has scanned yet.</Text>
                    ) : (
                      <View style={styles.table}>
                        <View style={styles.tableHeader}>
                          <Text style={[styles.th, styles.colName]}>Student</Text>
                          <Text style={[styles.th, styles.colTime]}>Time</Text>
                          <Text style={[styles.th, styles.colStatus]}>Status</Text>
                        </View>
                        {item.attendees.map((a, i) => (
                          <View
                            key={a.studentId + a.scannedAt}
                            style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}
                          >
                            <Text style={[styles.tdName, styles.colName]} numberOfLines={2}>
                              {a.studentName ?? shortId(a.studentId)}
                            </Text>
                            <View style={styles.colTime}>
                              <Text style={styles.tdTime}>{formatTime12(a.scannedAt)}</Text>
                              <Text style={styles.tdDate}>{formatDateOnly(a.scannedAt)}</Text>
                            </View>
                            <View style={styles.colStatus}>
                              <View
                                style={[
                                  styles.statusPill,
                                  a.status === 'late' ? styles.pillLate : styles.pillPresent,
                                ]}
                              >
                                <Text style={styles.statusPillText}>
                                  {a.status === 'late' ? 'Late' : 'Present'}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))}
                </View>
              );
            }}
          />
        )}
      </View>
    );
  }

  /* -------------------------- Student view -------------------------- */
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance History</Text>

      {studentRecords.length === 0 ? (
        <Text style={styles.subtitle}>
          No records yet. Scan a QR code to register your attendance.
        </Text>
      ) : (
        <FlatList
          data={studentRecords}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.titleRow}>
                <Text style={styles.eventTitle}>{item.eventTitle}</Text>
                <View
                  style={[
                    styles.statusPill,
                    item.status === 'late' ? styles.pillLate : styles.pillPresent,
                  ]}
                >
                  <Text style={styles.statusPillText}>
                    {item.status === 'late' ? 'Late' : 'Present'}
                  </Text>
                </View>
              </View>
              <Text style={styles.eventMeta}>{item.eventId}</Text>
              <Text style={styles.eventMeta}>{formatDateTime12(item.scannedAt)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const STATE_LABEL: Record<EventState, string> = {
  ongoing: 'Open now',
  upcoming: 'Upcoming',
  ended: 'Ended',
  closed: 'Closed',
};

const STATE_COLOR: Record<EventState, string> = {
  ongoing: '#2E7D5B',
  upcoming: COLORS.primary,
  ended: COLORS.textSecondary,
  closed: COLORS.danger,
};

// getEventState only needs the status and the start/end times.
function toCloud(e: TeacherEventAttendance) {
  return { status: e.status, start_time: e.startTime, end_time: e.endTime } as any;
}

// Last 8 characters of a uuid - names come in a later phase.
function shortId(id: string) {
  return id ? `…${id.slice(-8)}` : 'unknown';
}

const styles = StyleSheet.create({
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginHorizontal: 6,
    alignSelf: 'flex-start',
  },
  pillPresent: { backgroundColor: '#2E7D5B' },
  pillLate: { backgroundColor: '#C77700' },
  statusPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 32,
  },
  list: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardHeaderText: { flex: 1, paddingRight: 12 },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  eventTitle: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusOpen: {
    backgroundColor: '#2E7D5B',
  },
  statusClosed: {
    backgroundColor: COLORS.textSecondary,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  eventMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  countBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  emptyAttendees: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  attendeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.background,
    marginTop: 10,
    paddingTop: 10,
  },
  attendeeName: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  attendeeTime: { fontSize: 12, color: COLORS.textSecondary },
  table: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  th: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  tableRowAlt: { backgroundColor: '#00000008' },
  colName: { flex: 1, paddingRight: 8 },
  colTime: { width: 96, paddingRight: 8 },
  colStatus: { width: 72, alignItems: 'flex-start' },
  tdName: { fontSize: 14, fontWeight: '500', color: COLORS.textPrimary },
  tdTime: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  tdDate: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
});
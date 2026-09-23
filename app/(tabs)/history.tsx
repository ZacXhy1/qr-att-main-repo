import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { getTeacherEventAttendance, type TeacherEventAttendance } from '@/lib/attendance';
import { useAuth } from '@/lib/auth';
import { getAttendanceHistory, type AttendanceRecord } from '@/lib/attendance';
import { getProfile, type Role } from '@/lib/profiles';

export default function HistoryScreen() {
  const { user } = useAuth();

  const [role, setRole] = useState<Role | null>(null);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const profile = await getProfile(user.id);
    const currentRole: Role = profile?.role ?? 'student';
    setRole(currentRole);

    if (currentRole === 'teacher') {
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

  /* -------------------------- Teacher view -------------------------- */
  if (role === 'teacher') {
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
                      <Text style={styles.eventTitle}>{item.title}</Text>
                      <Text style={styles.eventMeta}>{item.eventCode}</Text>
                      {item.startTime && (
                        <Text style={styles.eventMeta}>{formatDate(item.startTime)}</Text>
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
                      item.attendees.map((a) => (
                        <View key={a.studentId + a.scannedAt} style={styles.attendeeRow}>
                          <Text style={styles.attendeeName}>{shortId(a.studentId)}</Text>
                          <Text style={styles.attendeeTime}>{formatDate(a.scannedAt)}</Text>
                        </View>
                      ))
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
              <Text style={styles.eventTitle}>{item.eventTitle}</Text>
              <Text style={styles.eventMeta}>{item.eventId}</Text>
              <Text style={styles.eventMeta}>{formatDate(item.scannedAt)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

// Last 8 characters of a uuid - names come in a later phase.
function shortId(id: string) {
  return id ? `…${id.slice(-8)}` : 'unknown';
}

const styles = StyleSheet.create({
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
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
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
});
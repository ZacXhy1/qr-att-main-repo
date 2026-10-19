import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '@/constants/colors';
import {
  deleteAttendanceRecord,
  deleteEvent,
  getAllAttendance,
  getAllEvents,
  getAllUsers,
  getStats,
  setAttendanceStatus,
  setUserRole,
  type AdminAttendance,
  type AdminEvent,
  type AdminStats,
  type AdminUser,
} from '@/lib/admin';
import { useRealtimeRefresh } from '@/lib/realtime';
import { useRole } from '@/lib/role';
import type { Role } from '@/lib/profiles';
import { formatDateTime12 } from '@/lib/format';

const ROLES: Role[] = ['student', 'teacher', 'admin'];

export default function AdminScreen() {
  const { role, loading: roleLoading } = useRole();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [records, setRecords] = useState<AdminAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, u, e, a] = await Promise.all([
      getStats(),
      getAllUsers(),
      getAllEvents(),
      getAllAttendance(),
    ]);
    setStats(s);
    setUsers(u);
    setEvents(e);
    setRecords(a);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (role === 'admin') {
        load();
      }
    }, [role, load])
  );

  // Live updates: attendance, events and users.
  useRealtimeRefresh('admin', ['attendance', 'events', 'profiles'], load, role === 'admin');

  const handleSetRole = async (userId: string, newRole: Role) => {
    setSavingUserId(userId);
    const { error } = await setUserRole(userId, newRole);
    setSavingUserId(null);

    if (error) {
      Alert.alert('Error', error);
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
  };

  const handleDeleteEvent = (event: AdminEvent) => {
    Alert.alert(
      'Delete event?',
      `"${event.title}" and its ${event.attendeeCount} attendance record(s) will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteEvent(event.id);
            if (error) {
              Alert.alert('Error', error);
              return;
            }
            setEvents((prev) => prev.filter((e) => e.id !== event.id));
            setStats((prev) =>
              prev
                ? {
                    ...prev,
                    totalEvents: prev.totalEvents - 1,
                    totalAttendance: prev.totalAttendance - event.attendeeCount,
                  }
                : prev
            );
          },
        },
      ]
    );
  };

  const handleToggleStatus = async (rec: AdminAttendance) => {
    const next = rec.status === 'late' ? 'present' : 'late';
    const { error } = await setAttendanceStatus(rec.id, next);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    setRecords((prev) => prev.map((r) => (r.id === rec.id ? { ...r, status: next } : r)));
  };

  const handleDeleteRecord = (rec: AdminAttendance) => {
    Alert.alert('Delete attendance record?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteAttendanceRecord(rec.id);
          if (error) {
            Alert.alert('Error', error);
            return;
          }
          setRecords((prev) => prev.filter((r) => r.id !== rec.id));
          setStats((prev) =>
            prev ? { ...prev, totalAttendance: prev.totalAttendance - 1 } : prev
          );
          setEvents((prev) =>
            prev.map((e) =>
              e.id === rec.eventId ? { ...e, attendeeCount: Math.max(0, e.attendeeCount - 1) } : e
            )
          );
        },
      },
    ]);
  };

  if (roleLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subtitle}>Checking your account...</Text>
      </View>
    );
  }

  if (role !== 'admin') {
    return (
      <View style={styles.centered}>
        <Ionicons name="shield-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.lockTitle}>Admins Only</Text>
        <Text style={styles.lockText}>Only administrator accounts can access this page.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subtitle}>Loading admin data...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Admin Dashboard</Text>

      {stats && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalUsers}</Text>
            <Text style={styles.statLabel}>Users</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalEvents}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalAttendance}</Text>
            <Text style={styles.statLabel}>Scans</Text>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Manage Users</Text>
      {users.length === 0 ? (
        <Text style={styles.subtitle}>No users found.</Text>
      ) : (
        users.map((u) => (
          <View key={u.id} style={styles.card}>
            <Text style={styles.userName}>{u.full_name || u.email}</Text>
            <Text style={styles.userMeta}>{u.email}</Text>
            <View style={styles.roleRow}>
              {ROLES.map((r) => (
                <Pressable
                  key={r}
                  style={[styles.roleChip, u.role === r && styles.roleChipActive]}
                  onPress={() => handleSetRole(u.id, r)}
                  disabled={savingUserId === u.id}
                >
                  <Text
                    style={[styles.roleChipText, u.role === r && styles.roleChipTextActive]}
                  >
                    {savingUserId === u.id && u.role !== r ? '...' : r}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Manage Events</Text>
      {events.length === 0 ? (
        <Text style={styles.subtitle}>No events have been created yet.</Text>
      ) : (
        events.map((e) => (
          <View key={e.id} style={styles.card}>
            <View style={styles.eventRow}>
              <View style={styles.eventInfo}>
                <Text style={styles.userName}>{e.title}</Text>
                <Text style={styles.userMeta}>{e.eventCode}</Text>
                <Text style={styles.userMeta}>{e.attendeeCount} attendee(s)</Text>
              </View>
              <Pressable style={styles.deleteButton} onPress={() => handleDeleteEvent(e)}>
                <Ionicons name="trash-outline" size={20} color={COLORS.danger ?? '#B3261E'} />
              </Pressable>
            </View>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Attendance Records</Text>
      {records.length === 0 ? (
        <Text style={styles.subtitle}>No attendance has been recorded yet.</Text>
      ) : (
        records.map((r) => {
          const student = users.find((u) => u.id === r.studentId);
          const event = events.find((e) => e.id === r.eventId);
          return (
            <View key={r.id} style={styles.card}>
              <View style={styles.eventRow}>
                <View style={styles.eventInfo}>
                  <Text style={styles.userName}>
                    {student?.full_name || student?.email || 'Unknown student'}
                  </Text>
                  <Text style={styles.userMeta}>{event?.title ?? 'Unknown event'}</Text>
                  <Text style={styles.userMeta}>{formatDateTime12(r.scannedAt)}</Text>
                  <Pressable
                    style={[
                      styles.statusPill,
                      r.status === 'late' ? styles.pillLate : styles.pillPresent,
                    ]}
                    onPress={() => handleToggleStatus(r)}
                  >
                    <Text style={styles.statusPillText}>
                      {r.status === 'late' ? 'Late' : 'Present'} · tap to change
                    </Text>
                  </Pressable>
                </View>
                <Pressable style={styles.deleteButton} onPress={() => handleDeleteRecord(r)}>
                  <Ionicons name="trash-outline" size={20} color={COLORS.danger ?? '#B3261E'} />
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 6,
  },
  pillPresent: { backgroundColor: '#2E7D5B' },
  pillLate: { backgroundColor: '#C77700' },
  statusPillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
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
  },
  lockTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 12,
    marginBottom: 6,
  },
  lockText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 20,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
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
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  userMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  roleChip: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    alignItems: 'center',
  },
  roleChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  roleChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  roleChipTextActive: {
    color: '#FFFFFF',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventInfo: {
    flex: 1,
    paddingRight: 12,
  },
  deleteButton: {
    padding: 8,
  },
});
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '@/constants/colors';
import KeyboardAvoid from '@/components/KeyboardAvoid';
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
import { getEventState, type EventState } from '@/lib/events';
import { useRealtimeRefresh } from '@/lib/realtime';
import { useRole } from '@/lib/role';
import type { Role } from '@/lib/profiles';
import { formatDateTime12 } from '@/lib/format';

const ROLES: Role[] = ['student', 'teacher', 'admin'];

type Tab = 'users' | 'events' | 'records';

// How many rows are shown at once; "Show more" adds another page.
const PAGE_SIZE = 15;

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

export default function AdminScreen() {
  const { role, loading: roleLoading } = useRole();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [records, setRecords] = useState<AdminAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  // View state: which list is showing, search, filters, paging.
  const [tab, setTab] = useState<Tab>('users');
  const [query, setQuery] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | Role>('all');
  const [eventFilter, setEventFilter] = useState<'all' | EventState>('all');
  const [recordFilter, setRecordFilter] = useState<'all' | 'present' | 'late'>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Re-evaluate event badges every 30 s (Upcoming -> Open now -> Ended).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const [s, u, e, a] = await Promise.all([
        getStats(),
        getAllUsers(),
        getAllEvents(),
        getAllAttendance(500),
      ]);
      setStats(s);
      setUsers(u);
      setEvents(e);
      setRecords(a);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Something went wrong.');
    }
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

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const q = query.trim().toLowerCase();

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          (userFilter === 'all' || u.role === userFilter) &&
          (!q || `${u.full_name ?? ''} ${u.email}`.toLowerCase().includes(q))
      ),
    [users, userFilter, q]
  );

  // Filter by the real state (open now / upcoming / ended / closed), the same
  // one shown on each row's badge, not just the saved open/closed status.
  const filteredEvents = useMemo(
    () =>
      events.filter((e) => {
        if (eventFilter !== 'all') {
          const state = getEventState(
            { status: e.status, start_time: e.startTime, end_time: e.endTime },
            now
          );
          if (state !== eventFilter) return false;
        }
        return !q || `${e.title} ${e.eventCode}`.toLowerCase().includes(q);
      }),
    [events, eventFilter, q, now]
  );

  const filteredRecords = useMemo(
    () =>
      records.filter((r) => {
        if (recordFilter !== 'all' && r.status !== recordFilter) return false;
        if (!q) return true;
        const student = userById.get(r.studentId);
        const event = eventById.get(r.eventId);
        const text = `${student?.full_name ?? ''} ${student?.email ?? ''} ${event?.title ?? ''}`;
        return text.toLowerCase().includes(q);
      }),
    [records, recordFilter, q, userById, eventById]
  );

  const selectTab = (next: Tab) => {
    setTab(next);
    setQuery('');
    setLimit(PAGE_SIZE);
    setExpandedUserId(null);
  };

  const onSearch = (text: string) => {
    setQuery(text);
    setLimit(PAGE_SIZE);
  };

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

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.subtitle, { color: COLORS.danger }]}>
          Could not load admin data: {loadError}
        </Text>
        <Pressable onPress={load}>
          <Text style={[styles.subtitle, { color: COLORS.primary, fontWeight: '600' }]}>
            Tap to retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const total =
    tab === 'users' ? filteredUsers.length : tab === 'events' ? filteredEvents.length : filteredRecords.length;
  const shown = Math.min(limit, total);

  const tiles: { key: Tab; label: string; value: number | undefined; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'users', label: 'Users', value: stats?.totalUsers, icon: 'people-outline' },
    { key: 'events', label: 'Events', value: stats?.totalEvents, icon: 'calendar-outline' },
    { key: 'records', label: 'Scans', value: stats?.totalAttendance, icon: 'checkmark-done-outline' },
  ];

  const chips: { value: string; label: string }[] =
    tab === 'users'
      ? [{ value: 'all', label: 'All' }, ...ROLES.map((r) => ({ value: r, label: r }))]
      : tab === 'events'
      ? [
          { value: 'all', label: 'All' },
          { value: 'ongoing', label: STATE_LABEL.ongoing },
          { value: 'upcoming', label: STATE_LABEL.upcoming },
          { value: 'ended', label: STATE_LABEL.ended },
          { value: 'closed', label: STATE_LABEL.closed },
        ]
      : [
          { value: 'all', label: 'All' },
          { value: 'present', label: 'Present' },
          { value: 'late', label: 'Late' },
        ];
  const activeChip = tab === 'users' ? userFilter : tab === 'events' ? eventFilter : recordFilter;

  const pickChip = (value: string) => {
    setLimit(PAGE_SIZE);
    if (tab === 'users') setUserFilter(value as 'all' | Role);
    else if (tab === 'events') setEventFilter(value as 'all' | EventState);
    else setRecordFilter(value as 'all' | 'present' | 'late');
  };

  const emptyText =
    q || activeChip !== 'all'
      ? 'No results match your search or filter.'
      : tab === 'users'
      ? 'No users found.'
      : tab === 'events'
      ? 'No events have been created yet.'
      : 'No attendance has been recorded yet.';

  return (
    <KeyboardAvoid>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Admin Dashboard</Text>

      {/* Stat tiles double as the section switcher */}
      <View style={styles.statsRow}>
        {tiles.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.statCard, tab === t.key && styles.statCardActive]}
            onPress={() => selectTab(t.key)}
          >
            <Ionicons
              name={t.icon}
              size={18}
              color={tab === t.key ? COLORS.textOnPrimary : COLORS.primary}
            />
            <Text style={[styles.statValue, tab === t.key && styles.statTextActive]}>
              {t.value ?? 0}
            </Text>
            <Text style={[styles.statLabel, tab === t.key && styles.statTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={onSearch}
          placeholder={
            tab === 'users'
              ? 'Search name or email'
              : tab === 'events'
              ? 'Search event title or code'
              : 'Search student or event'
          }
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => onSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        {chips.map((c) => (
          <Pressable
            key={c.value}
            style={[styles.chip, activeChip === c.value && styles.chipActive]}
            onPress={() => pickChip(c.value)}
          >
            <Text style={[styles.chipText, activeChip === c.value && styles.chipTextActive]}>
              {c.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.countText}>
        {total === 0 ? '0 results' : `Showing ${shown} of ${total}`}
      </Text>

      {total === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        <View style={styles.listCard}>
          {/* ------------------------------ Users ------------------------------ */}
          {tab === 'users' &&
            filteredUsers.slice(0, limit).map((u, i) => {
              const open = expandedUserId === u.id;
              const name = u.full_name || u.email;
              return (
                <View key={u.id} style={i > 0 && styles.rowDivider}>
                  <Pressable
                    style={styles.row}
                    onPress={() => setExpandedUserId(open ? null : u.id)}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {u.email}
                      </Text>
                    </View>
                    <View style={[styles.rolePill, u.role === 'admin' && styles.rolePillAdmin]}>
                      <Text
                        style={[styles.rolePillText, u.role === 'admin' && styles.rolePillTextAdmin]}
                      >
                        {u.role}
                      </Text>
                    </View>
                    <Ionicons
                      name={open ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={COLORS.textSecondary}
                      style={styles.chevron}
                    />
                  </Pressable>

                  {open && (
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
                  )}
                </View>
              );
            })}

          {/* ----------------------------- Events ----------------------------- */}
          {tab === 'events' &&
            filteredEvents.slice(0, limit).map((e, i) => {
              const state = getEventState(
                { status: e.status, start_time: e.startTime, end_time: e.endTime },
                now
              );
              return (
                <View key={e.id} style={[styles.row, i > 0 && styles.rowDivider]}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {e.title}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {e.eventCode} · {e.attendeeCount} attendee{e.attendeeCount === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View style={[styles.statePill, { backgroundColor: STATE_COLOR[state] }]}>
                    <Text style={styles.statePillText}>{STATE_LABEL[state]}</Text>
                  </View>
                  <Pressable style={styles.deleteButton} onPress={() => handleDeleteEvent(e)} hitSlop={6}>
                    <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                  </Pressable>
                </View>
              );
            })}

          {/* ----------------------------- Records ---------------------------- */}
          {tab === 'records' &&
            filteredRecords.slice(0, limit).map((r, i) => {
              const student = userById.get(r.studentId);
              const event = eventById.get(r.eventId);
              return (
                <View key={r.id} style={[styles.row, i > 0 && styles.rowDivider]}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {student?.full_name || student?.email || 'Unknown student'}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {event?.title ?? 'Unknown event'}
                    </Text>
                    <Text style={styles.rowMeta}>{formatDateTime12(r.scannedAt)}</Text>
                  </View>
                  <Pressable
                    style={[
                      styles.statePill,
                      r.status === 'late' ? styles.pillLate : styles.pillPresent,
                    ]}
                    onPress={() => handleToggleStatus(r)}
                    hitSlop={6}
                  >
                    <Text style={styles.statePillText}>
                      {r.status === 'late' ? 'Late' : 'Present'}
                    </Text>
                    <Ionicons name="swap-horizontal" size={12} color="#FFFFFF" />
                  </Pressable>
                  <Pressable style={styles.deleteButton} onPress={() => handleDeleteRecord(r)} hitSlop={6}>
                    <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                  </Pressable>
                </View>
              );
            })}
        </View>
      )}

      {shown < total && (
        <Pressable style={styles.moreButton} onPress={() => setLimit((l) => l + PAGE_SIZE)}>
          <Text style={styles.moreText}>Show {Math.min(PAGE_SIZE, total - shown)} more</Text>
        </Pressable>
      )}
      {tab === 'records' && stats && stats.totalAttendance > records.length && (
        <Text style={styles.footnote}>
          Showing the {records.length} most recent scans out of {stats.totalAttendance}.
        </Text>
      )}
    </ScrollView>
    </KeyboardAvoid>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: { fontSize: 20, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 14 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary },
  lockTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 12,
    marginBottom: 6,
  },
  lockText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Stat tiles (also the section switcher)
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statCardActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  statValue: { fontSize: 20, fontWeight: '700', color: COLORS.primary, marginTop: 2 },
  statLabel: { fontSize: 12, color: COLORS.textSecondary },
  statTextActive: { color: COLORS.textOnPrimary },

  // Search + filters
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: COLORS.textPrimary },
  chipRow: { flexDirection: 'row', gap: 8, paddingTop: 10, paddingRight: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  chipTextActive: { color: COLORS.textOnPrimary },
  countText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 12, marginBottom: 8 },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 24,
  },

  // Compact list
  listCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  rowBody: { flex: 1, minWidth: 0, paddingRight: 8 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  rowMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: { color: COLORS.textOnPrimary, fontSize: 14, fontWeight: '700' },
  chevron: { marginLeft: 6 },
  rolePill: {
    backgroundColor: '#EBDAC6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  rolePillAdmin: { backgroundColor: COLORS.textPrimary },
  rolePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  rolePillTextAdmin: { color: COLORS.textOnPrimary },
  roleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  roleChip: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    alignItems: 'center',
  },
  roleChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  roleChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  roleChipTextActive: { color: '#FFFFFF' },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statePillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  pillPresent: { backgroundColor: '#2E7D5B' },
  pillLate: { backgroundColor: '#C77700' },
  deleteButton: { padding: 6, marginLeft: 4 },

  moreButton: {
    marginTop: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingVertical: 12,
  },
  moreText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  footnote: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12 },
});

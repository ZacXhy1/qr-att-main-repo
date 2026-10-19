import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();

  const [role, setRole] = useState<Role | null>(null);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>([]);
  // Staff view: the event list is searchable/filterable/paged, and attendees
  // open in their own sheet so the main list stays short.
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | EventState>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attQuery, setAttQuery] = useState('');
  const [attFilter, setAttFilter] = useState<'all' | 'present' | 'late'>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

    try {
      const profile = await getProfile(user.id);
      const currentRole: Role = profile?.role ?? 'student';
      setRole(currentRole);

      if (currentRole === 'teacher' || currentRole === 'admin') {
        // Teachers: their own events. Admins: every event.
        const events = await getTeacherEventAttendance(user.id, currentRole === 'admin');
        setTeacherEvents(events);
        setStudentRecords([]);
      } else {
        const records = await getAttendanceHistory(user.id);
        setStudentRecords(records);
        setTeacherEvents([]);
      }
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message ?? 'Something went wrong.');
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

  const q = query.trim().toLowerCase();

  const filteredEvents = useMemo(
    () =>
      teacherEvents.filter((e) => {
        if (filter !== 'all' && getEventState(toCloud(e), now) !== filter) return false;
        return !q || `${e.title} ${e.eventCode}`.toLowerCase().includes(q);
      }),
    [teacherEvents, filter, q, now]
  );

  // Looked up by id so the open sheet updates live when attendance changes.
  const selected = useMemo(
    () => teacherEvents.find((e) => e.eventId === selectedId) ?? null,
    [teacherEvents, selectedId]
  );

  const selectedAttendees = useMemo(() => {
    if (!selected) return [];
    const aq = attQuery.trim().toLowerCase();
    return [...selected.attendees]
      .filter((a) => attFilter === 'all' || a.status === attFilter)
      .filter((a) => !aq || (a.studentName ?? '').toLowerCase().includes(aq))
      .sort((a, b) => (a.studentName ?? '').localeCompare(b.studentName ?? ''));
  }, [selected, attQuery, attFilter]);

  const openEvent = (id: string) => {
    setAttQuery('');
    setAttFilter('all');
    setSelectedId(id);
  };

  const onSearch = (text: string) => {
    setQuery(text);
    setLimit(PAGE_SIZE);
  };

  const pickFilter = (value: 'all' | EventState) => {
    setFilter(value);
    setLimit(PAGE_SIZE);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Attendance History</Text>
        <Text style={styles.subtitle}>Loading records...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Attendance History</Text>
        <Text style={[styles.subtitle, { color: COLORS.danger }]}>
          Could not load records: {loadError}
        </Text>
        <Pressable onPress={load}>
          <Text style={[styles.subtitle, { color: COLORS.primary, fontWeight: '600' }]}>
            Tap to retry
          </Text>
        </Pressable>
      </View>
    );
  }

  /* ---------------- Teacher view (own events) / Admin view (all events) ---------------- */
  if (role === 'teacher' || role === 'admin') {
    const shown = Math.min(limit, filteredEvents.length);
    const chips: { value: 'all' | EventState; label: string }[] = [
      { value: 'all', label: 'All' },
      { value: 'ongoing', label: STATE_LABEL.ongoing },
      { value: 'upcoming', label: STATE_LABEL.upcoming },
      { value: 'ended', label: STATE_LABEL.ended },
      { value: 'closed', label: STATE_LABEL.closed },
    ];
    const selectedState = selected ? getEventState(toCloud(selected), now) : null;
    const presentTotal = selected?.presentCount ?? 0;
    const lateTotal = selected?.lateCount ?? 0;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Event Attendance</Text>

        {teacherEvents.length === 0 ? (
          <Text style={styles.subtitle}>
            {role === 'admin'
              ? 'No events have been created yet.'
              : "You haven't created any events yet. Use the Teacher tab to create one."}
          </Text>
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {role === 'admin' && (
              <Text style={styles.evNote}>Showing every event on campus.</Text>
            )}

            <View style={styles.evSearchBox}>
              <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
              <TextInput
                style={styles.evSearchInput}
                value={query}
                onChangeText={onSearch}
                placeholder="Search event title or code"
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

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.evChipRow}
              keyboardShouldPersistTaps="handled"
            >
              {chips.map((c) => (
                <Pressable
                  key={c.value}
                  style={[styles.evChip, filter === c.value && styles.evChipActive]}
                  onPress={() => pickFilter(c.value)}
                >
                  <Text style={[styles.evChipText, filter === c.value && styles.evChipTextActive]}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.evResultCount}>
              {filteredEvents.length === 0
                ? '0 results'
                : `Showing ${shown} of ${filteredEvents.length}`}
            </Text>

            {filteredEvents.length === 0 ? (
              <Text style={styles.evEmpty}>No events match your search or filter.</Text>
            ) : (
              <View style={styles.evListCard}>
                {filteredEvents.slice(0, limit).map((item, i) => {
                  const state = getEventState(toCloud(item), now);
                  return (
                    <Pressable
                      key={item.eventId}
                      style={[styles.evRow, i > 0 && styles.evRowDivider]}
                      onPress={() => openEvent(item.eventId)}
                    >
                      <View style={styles.evBody}>
                        <Text style={styles.evTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.evMeta} numberOfLines={1}>
                          {item.startTime ? formatDateTime12(item.startTime) : item.eventCode}
                        </Text>
                        <Text style={styles.evMeta}>
                          {item.presentCount} present · {item.lateCount} late
                        </Text>
                      </View>
                      <View style={styles.evRight}>
                        <View style={[styles.evPill, { backgroundColor: STATE_COLOR[state] }]}>
                          <Text style={styles.evPillText}>{STATE_LABEL[state]}</Text>
                        </View>
                        <View style={styles.evCount}>
                          <Ionicons name="people-outline" size={14} color={COLORS.primary} />
                          <Text style={styles.evCountText}>{item.attendeeCount}</Text>
                        </View>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={COLORS.textSecondary}
                        style={styles.evChevron}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {shown < filteredEvents.length && (
              <Pressable style={styles.evMore} onPress={() => setLimit((l) => l + PAGE_SIZE)}>
                <Text style={styles.evMoreText}>
                  Show {Math.min(PAGE_SIZE, filteredEvents.length - shown)} more
                </Text>
              </Pressable>
            )}
          </ScrollView>
        )}

        {/* ------------- Attendee sheet (own scroll, own search) ------------- */}
        <Modal
          visible={!!selected}
          animationType="slide"
          onRequestClose={() => setSelectedId(null)}
        >
          {selected && selectedState && (
            <View style={[styles.shContainer, { paddingTop: insets.top + 12 }]}>
              <View style={styles.shHeader}>
                <Pressable style={styles.shClose} onPress={() => setSelectedId(null)} hitSlop={8}>
                  <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
                </Pressable>
                <View style={styles.shHeaderText}>
                  <Text style={styles.shTitle} numberOfLines={2}>
                    {selected.title}
                  </Text>
                  <View style={styles.shMetaRow}>
                    <View style={[styles.evPill, { backgroundColor: STATE_COLOR[selectedState] }]}>
                      <Text style={styles.evPillText}>{STATE_LABEL[selectedState]}</Text>
                    </View>
                    <Text style={styles.evMeta}>Code {selected.eventCode}</Text>
                  </View>
                  {selected.startTime && (
                    <Text style={styles.evMeta}>{formatDateTime12(selected.startTime)}</Text>
                  )}
                  {selected.venue && <Text style={styles.evMeta}>{selected.venue}</Text>}
                </View>
              </View>

              <View style={styles.evChipRow}>
                {(
                  [
                    { value: 'all', label: `All (${selected.attendeeCount})` },
                    { value: 'present', label: `Present (${presentTotal})` },
                    { value: 'late', label: `Late (${lateTotal})` },
                  ] as const
                ).map((c) => (
                  <Pressable
                    key={c.value}
                    style={[styles.evChip, attFilter === c.value && styles.evChipActive]}
                    onPress={() => setAttFilter(c.value)}
                  >
                    <Text
                      style={[styles.evChipText, attFilter === c.value && styles.evChipTextActive]}
                    >
                      {c.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={[styles.evSearchBox, { marginTop: 10 }]}>
                <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.evSearchInput}
                  value={attQuery}
                  onChangeText={setAttQuery}
                  placeholder="Search student"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {attQuery.length > 0 && (
                  <Pressable onPress={() => setAttQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
                  </Pressable>
                )}
              </View>

              <FlatList
                data={selectedAttendees}
                keyExtractor={(a) => a.studentId + a.scannedAt}
                style={styles.shList}
                contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={styles.evEmpty}>
                    {selected.attendees.length === 0
                      ? 'No one has scanned yet.'
                      : 'No students match your search or filter.'}
                  </Text>
                }
                renderItem={({ item: a, index }) => (
                  <View style={[styles.shRow, index > 0 && styles.evRowDivider]}>
                    <View style={styles.evBody}>
                      <Text style={styles.shName} numberOfLines={2}>
                        {a.studentName ?? shortId(a.studentId)}
                      </Text>
                      <Text style={styles.evMeta}>
                        {formatTime12(a.scannedAt)} · {formatDateOnly(a.scannedAt)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.evPill,
                        a.status === 'late' ? styles.pillLate : styles.pillPresent,
                      ]}
                    >
                      <Text style={styles.evPillText}>
                        {a.status === 'late' ? 'Late' : 'Present'}
                      </Text>
                    </View>
                  </View>
                )}
              />
            </View>
          )}
        </Modal>
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
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.statusPill,
                    { marginHorizontal: 0 },
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

// How many events show at once; "Show more" adds another page.
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

// getEventState only needs the status and the start/end times.
function toCloud(e: TeacherEventAttendance) {
  return { status: e.status, start_time: e.startTime, end_time: e.endTime } as any;
}

// Last 8 characters of a uuid - names come in a later phase.
function shortId(id: string) {
  return id ? `…${id.slice(-8)}` : 'unknown';
}

const styles = StyleSheet.create({
  // ---- staff event list ----
  evNote: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 10 },
  evSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
  },
  evSearchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: COLORS.textPrimary },
  evChipRow: { flexDirection: 'row', gap: 8, paddingTop: 10 },
  evChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  evChipActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  evChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  evChipTextActive: { color: COLORS.textOnPrimary },
  evResultCount: { fontSize: 12, color: COLORS.textSecondary, marginTop: 12, marginBottom: 8 },
  evEmpty: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 24,
  },
  evListCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  evRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  evRowDivider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  evBody: { flex: 1, minWidth: 0, paddingRight: 8 },
  evTitle: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  evMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  evRight: { alignItems: 'flex-end', gap: 6 },
  evPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  evPillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  evCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  evCountText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  evChevron: { marginLeft: 6 },
  evMore: {
    marginTop: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingVertical: 12,
  },
  evMoreText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },

  // ---- attendee sheet ----
  shContainer: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 20 },
  shHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  shClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shHeaderText: { flex: 1 },
  shTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  shMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  shList: {
    marginTop: 12,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  shRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  shName: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },

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
  badgeRow: {
    flexDirection: 'row',
    marginTop: 6,
    marginBottom: 2,
  },
  headerRight: {
    alignItems: 'center',
  },
  chevron: {
    marginTop: 6,
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
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { useRealtimeRefresh } from '@/lib/realtime';
import {
  getEventsForStudent,
  getEventState,
  type CloudEvent,
  type EventState,
} from '@/lib/events';
import { formatDateTime12 } from '@/lib/format';

type Filter = 'available' | 'past';

const STATE_LABEL: Record<EventState, string> = {
  ongoing: 'Open now',
  upcoming: 'Upcoming',
  ended: 'Ended',
  closed: 'Closed',
};

const STATE_COLOR: Record<EventState, string> = {
  ongoing: '#2E7D32',
  upcoming: COLORS.primary,
  ended: COLORS.textSecondary,
  closed: COLORS.danger,
};

function formatDateTime(iso: string | null) {
  if (!iso) return null;
  return formatDateTime12(iso);
}

export default function EventsScreen() {
  const { user } = useAuth();

  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [attended, setAttended] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('available');

  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const result = await getEventsForStudent(user.id);
    setEvents(result.events);
    setAttended(new Set(result.attendedIds));
    setError(result.error);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useRealtimeRefresh('student-events', ['events', 'attendance'], load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const visible = useMemo(() => {
    const now = tick;
    const withState = events.map((event) => ({ event, state: getEventState(event, now) }));

    if (filter === 'available') {
      return withState
        .filter((x) => x.state === 'ongoing' || x.state === 'upcoming')
        .sort((a, b) => {
          if (a.state !== b.state) return a.state === 'ongoing' ? -1 : 1;
          const at = a.event.start_time ? new Date(a.event.start_time).getTime() : 0;
          const bt = b.event.start_time ? new Date(b.event.start_time).getTime() : 0;
          return at - bt;
        });
    }

    return withState
      .filter((x) => x.state === 'ended' || x.state === 'closed')
      .sort((a, b) => {
        const at = a.event.start_time ? new Date(a.event.start_time).getTime() : 0;
        const bt = b.event.start_time ? new Date(b.event.start_time).getTime() : 0;
        return bt - at;
      });
  }, [events, filter, tick]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Events</Text>

      <View style={styles.filterRow}>
        {(['available', 'past'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === 'available' ? 'Available' : 'Past & Closed'}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <Text style={styles.subtitle}>Loading events...</Text>
      ) : error ? (
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={40} color={COLORS.danger} />
          <Text style={styles.errorText}>Could not load events: {error}</Text>
          <AppButton title="Try Again" icon="refresh" onPress={load} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.event.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Ionicons name="calendar-outline" size={40} color={COLORS.textSecondary} />
              <Text style={styles.subtitle}>
                {filter === 'available'
                  ? 'No open or upcoming events right now.'
                  : 'No past or closed events yet.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const { event, state } = item;
            const didAttend = attended.has(event.id);
            const start = formatDateTime(event.start_time);
            const end = formatDateTime(event.end_time);

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {event.title}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: STATE_COLOR[state] }]}>
                    <Text style={styles.badgeText}>{STATE_LABEL[state]}</Text>
                  </View>
                </View>

                {start && (
                  <Text style={styles.meta}>
                    <Ionicons name="time-outline" size={13} /> {start}
                    {end ? `  →  ${end}` : ''}
                  </Text>
                )}
                {event.venue && (
                  <Text style={styles.meta}>
                    <Ionicons name="location-outline" size={13} /> {event.venue}
                  </Text>
                )}
                {event.description && <Text style={styles.description}>{event.description}</Text>}

                {didAttend ? (
                  <View style={styles.attendedRow}>
                    <Ionicons name="checkmark-circle" size={18} color="#2E7D32" />
                    <Text style={styles.attendedText}>You attended this event</Text>
                  </View>
                ) : state === 'ongoing' ? (
                  <View style={styles.action}>
                    <AppButton
                      theme="primary"
                      title="Scan to Attend"
                      icon="qr-code-outline"
                      onPress={() => router.push('/scan')}
                    />
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: 16 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginTop: 8,
  },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  chipTextActive: { color: COLORS.textOnPrimary },
  list: { padding: 20, paddingTop: 8, gap: 12, flexGrow: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  errorText: { fontSize: 14, color: COLORS.danger, textAlign: 'center', marginBottom: 8 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  badge: { borderRadius: 10, paddingVertical: 3, paddingHorizontal: 9 },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  meta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 3 },
  description: { fontSize: 14, color: COLORS.textPrimary, marginTop: 8, lineHeight: 20 },
  attendedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  attendedText: { fontSize: 14, fontWeight: '600', color: '#2E7D32' },
  action: { marginTop: 12 },
});

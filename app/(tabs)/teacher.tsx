import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  createEvent,
  getEventsByTeacher,
  setEventStatus,
  updateEvent,
  type CloudEvent,
} from '@/lib/events';
import { buildQRPayload } from '@/lib/qr';
import { useRole } from '@/lib/role';

function toLocalISO(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
  );
}

function formatDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${month} ${pad(date.getDate())}, ${date.getFullYear()} at ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function formatShort(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString();
}

const QUICK_END_OPTIONS = [
  { label: '+30 min', ms: 30 * 60 * 1000 },
  { label: '+1 hour', ms: 60 * 60 * 1000 },
  { label: '+2 hours', ms: 2 * 60 * 60 * 1000 },
];

type EditTarget = 'start' | 'end';

export default function TeacherScreen() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();

  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(
    () => new Date(Date.now() + 60 * 60 * 1000)
  );
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');
  const [payload, setPayload] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Editing an existing event instead of creating a new one.
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // "My Events" - the teacher's own events, so they can edit/close/reopen.
  const [myEvents, setMyEvents] = useState<CloudEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  const loadMyEvents = useCallback(async () => {
    if (!user) {
      setEventsLoading(false);
      return;
    }
    const events = await getEventsByTeacher(user.id);
    setMyEvents(events);
    setEventsLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (role === 'teacher' || role === 'admin') {
        loadMyEvents();
      }
    }, [role, loadMyEvents])
  );

  const isAndroid = Platform.OS === 'android';

  const openPicker = (target: EditTarget) => {
    setMessage(null);
    setEditTarget(target);
    setEditingPart('date');
  };

  const onPickerChange = (
    event: DateTimePickerEvent,
    selected?: Date
  ) => {
    if (!editTarget) return;
    if (event.type === 'dismissed' || !selected) {
      setEditTarget(null);
      setEditingPart('date');
      return;
    }

    const current = editTarget === 'start' ? startDate : endDate;
    const next = new Date(current);
    next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);

    if (editTarget === 'start') setStartDate(next);
    else setEndDate(next);

    if (isAndroid && editingPart === 'date') {
      setEditingPart('time');
    } else {
      setEditTarget(null);
      setEditingPart('date');
    }
  };

  const handleQuickEnd = (ms: number) => {
    setMessage(null);
    setEndDate(new Date(startDate.getTime() + ms));
  };

  const resetForm = () => {
    setEditingEventId(null);
    setTitle('');
    setEventId('');
    setVenue('');
    setDescription('');
    setStartDate(new Date());
    setEndDate(new Date(Date.now() + 60 * 60 * 1000));
    setPayload(null);
    setMessage(null);
  };

  const startEditing = (event: CloudEvent) => {
    setEditingEventId(event.id);
    setTitle(event.title);
    setEventId(event.event_code);
    setVenue(event.venue ?? '');
    setDescription(event.description ?? '');
    setStartDate(event.start_time ? new Date(event.start_time) : new Date());
    setEndDate(
      event.end_time ? new Date(event.end_time) : new Date(Date.now() + 60 * 60 * 1000)
    );
    setPayload(null);
    setMessage(null);
  };

  const handleSubmit = () => {
    const event = {
      eventId: eventId.trim(),
      title: title.trim(),
      start: toLocalISO(startDate),
      end: toLocalISO(endDate),
      venue: venue.trim(),
      description: description.trim(),
    };

    if (!event.eventId || !event.title) {
      setMessage('Event title and code are required.');
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setMessage('End time must be after start time.');
      return;
    }

    if (editingEventId) {
      updateEvent(editingEventId, {
        title: event.title,
        start: event.start,
        end: event.end,
        venue: event.venue,
        description: event.description,
      }).then(({ error }) => {
        if (error) {
          setMessage(`Could not update the event: ${error}`);
          return;
        }
        setMessage('Event updated.');
        setPayload(buildQRPayload(event));
        loadMyEvents();
      });
      return;
    }

    createEvent(event).then(({ error }) => {
      if (error) {
        setMessage(`Could not save the event: ${error}`);
        return;
      }
      setMessage('Event saved! Scan the QR with the Scan tab to test it.');
      setPayload(buildQRPayload(event));
      loadMyEvents();
    });
  };

  const handleToggleStatus = (event: CloudEvent) => {
    const nextStatus = event.status === 'open' ? 'closed' : 'open';
    const verb = nextStatus === 'closed' ? 'Close' : 'Reopen';

    Alert.alert(
      `${verb} this event?`,
      nextStatus === 'closed'
        ? 'Students will no longer be able to scan the QR for this event.'
        : 'Students will be able to scan the QR for this event again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: verb,
          onPress: async () => {
            setBusyEventId(event.id);
            const { error } = await setEventStatus(event.id, nextStatus);
            setBusyEventId(null);
            if (error) {
              Alert.alert('Error', error);
              return;
            }
            setMyEvents((prev) =>
              prev.map((e) => (e.id === event.id ? { ...e, status: nextStatus } : e))
            );
          },
        },
      ]
    );
  };

  if (roleLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subtitle}>Checking your account...</Text>
      </View>
    );
  }

  if (role !== 'teacher' && role !== 'admin') {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.lockTitle}>Teachers and Admins Only</Text>
        <Text style={styles.lockText}>Only teacher and admin accounts can create events.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>
        {editingEventId ? 'Edit Event' : 'Create Event QR'}
      </Text>
      <Text style={styles.subtitle}>
        {editingEventId
          ? 'Update the event details below.'
          : 'Fill in the event details, then scan the generated QR with the Scan tab.'}
      </Text>

      <Text style={styles.label}>Event Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Founders Day Assembly"
        placeholderTextColor={COLORS.textSecondary}
      />

      <Text style={styles.label}>Event Code</Text>
      <TextInput
        style={[styles.input, !!editingEventId && styles.inputDisabled]}
        value={eventId}
        onChangeText={setEventId}
        placeholder="e.g. EVT-2026-0002"
        placeholderTextColor={COLORS.textSecondary}
        autoCapitalize="characters"
        editable={!editingEventId}
      />
      {editingEventId && (
        <Text style={styles.hint}>The event code can't be changed once created.</Text>
      )}

      <Text style={styles.label}>Venue</Text>
      <TextInput
        style={styles.input}
        value={venue}
        onChangeText={setVenue}
        placeholder="e.g. Main Gymnasium"
        placeholderTextColor={COLORS.textSecondary}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional details about the event"
        placeholderTextColor={COLORS.textSecondary}
        multiline
        numberOfLines={3}
      />

      <Text style={styles.label}>Starts</Text>
      <PickerField
        value={formatDateTime(startDate)}
        icon="sunny-outline"
        onPress={() => openPicker('start')}
      />

      <Text style={styles.label}>Ends</Text>
      <PickerField
        value={formatDateTime(endDate)}
        icon="moon-outline"
        onPress={() => openPicker('end')}
      />
      <View style={styles.chipRow}>
        {QUICK_END_OPTIONS.map((option) => (
          <Pressable
            key={option.label}
            style={styles.chip}
            onPress={() => handleQuickEnd(option.ms)}
          >
            <Text style={styles.chipText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>Tap a chip to set the end time from start.</Text>

      {message && <Text style={styles.message}>{message}</Text>}

      <AppButton
        theme="primary"
        title={editingEventId ? 'Save Changes' : 'Create Event'}
        icon={editingEventId ? 'checkmark-circle-outline' : 'add-circle-outline'}
        onPress={handleSubmit}
      />

      {editingEventId && (
        <Pressable style={styles.cancelLink} onPress={resetForm}>
          <Text style={styles.cancelLinkText}>Cancel editing</Text>
        </Pressable>
      )}

      {editTarget && (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={editTarget === 'start' ? startDate : endDate}
            mode={isAndroid ? editingPart : 'datetime'}
            display={isAndroid ? 'default' : 'spinner'}
            onChange={onPickerChange}
          />
        </View>
      )}

      {payload && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>
            Scan this QR code with the Scan tab:
          </Text>
          <View style={styles.qrBox}>
            <QRCode value={payload} size={200} />
          </View>
          <Text style={styles.payloadText}>{payload}</Text>
        </View>
      )}

      <View style={styles.sectionDivider} />
      <Text style={styles.title}>My Events</Text>

      {eventsLoading ? (
        <Text style={styles.subtitle}>Loading your events...</Text>
      ) : myEvents.length === 0 ? (
        <Text style={styles.subtitle}>
          You haven't created any events yet. Use the form above.
        </Text>
      ) : (
        myEvents.map((event) => (
          <View key={event.id} style={styles.eventCard}>
            <View style={styles.eventCardHeader}>
              <View style={styles.eventCardInfo}>
                <Text style={styles.eventCardTitle}>{event.title}</Text>
                <Text style={styles.eventMeta}>{event.event_code}</Text>
                {event.venue && <Text style={styles.eventMeta}>{event.venue}</Text>}
                {event.start_time && (
                  <Text style={styles.eventMeta}>{formatShort(event.start_time)}</Text>
                )}
              </View>
              <View
                style={[
                  styles.statusBadge,
                  event.status === 'closed' ? styles.statusClosed : styles.statusOpen,
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {event.status === 'closed' ? 'Closed' : 'Open'}
                </Text>
              </View>
            </View>

            <View style={styles.eventCardActions}>
              <Pressable style={styles.smallButton} onPress={() => startEditing(event)}>
                <Ionicons name="create-outline" size={16} color={COLORS.primary} />
                <Text style={styles.smallButtonText}>Edit</Text>
              </Pressable>
              <Pressable
                style={styles.smallButton}
                onPress={() => handleToggleStatus(event)}
                disabled={busyEventId === event.id}
              >
                <Ionicons
                  name={event.status === 'open' ? 'lock-closed-outline' : 'lock-open-outline'}
                  size={16}
                  color={COLORS.primary}
                />
                <Text style={styles.smallButtonText}>
                  {busyEventId === event.id
                    ? '...'
                    : event.status === 'open'
                    ? 'Close'
                    : 'Reopen'}
                </Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

type PickerFieldProps = {
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function PickerField({ value, icon, onPress }: PickerFieldProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.pickerField, pressed && styles.pickerFieldPressed]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={COLORS.primary} />
      <Text style={styles.pickerValue}>{value}</Text>
      <Ionicons name="calendar-outline" size={18} color={COLORS.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  pickerField: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerFieldPressed: {
    backgroundColor: COLORS.surface,
  },
  pickerValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textPrimary,
    marginHorizontal: 10,
  },
  chipRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  chip: {
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  pickerContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  message: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    marginTop: 12,
  },
  cancelLink: {
    marginTop: 12,
    alignItems: 'center',
  },
  cancelLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  resultCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
    alignItems: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  qrBox: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  payloadText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
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
  sectionDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 24,
  },
  eventCard: {
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
  eventCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  eventCardInfo: {
    flex: 1,
    paddingRight: 12,
  },
  eventCardTitle: {
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
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusOpen: {
    backgroundColor: '#2E7D5B',
  },
  statusClosed: {
    backgroundColor: COLORS.textSecondary,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  eventCardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.background,
    paddingTop: 12,
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
});

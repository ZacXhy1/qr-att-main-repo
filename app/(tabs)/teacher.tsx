import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Alert,
  Modal,
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
import FullscreenQRModal from '@/components/FullscreenQRModal';
import KeyboardAvoid from '@/components/KeyboardAvoid';
import { getAllUsers } from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import {
  createEvent,
  getAllEventsForAdmin,
  getEventByCode,
  getEventSecret,
  getEventsByTeacher,
  getEventState,
  rotateEventSecret,
  setEventStatus,
  updateEvent,
  type CloudEvent,
  type EventState,
} from '@/lib/events';
import { formatDateOnly, formatDateTime12, formatTime12 } from '@/lib/format';
import { buildQRPayload } from '@/lib/qr';
import { useRealtimeRefresh } from '@/lib/realtime';
import { useRole } from '@/lib/role';

function generateEventCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `EVT-${new Date().getFullYear()}-${suffix}`;
}

function toLocalISO(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
  );
}

function formatDateTime(date: Date) {
  return `${formatDateOnly(date)} at ${formatTime12(date)}`;
}

function formatShort(iso: string | null) {
  if (!iso) return null;
  return formatDateTime12(iso);
}

const QUICK_END_OPTIONS = [
  { label: '+30 min', ms: 30 * 60 * 1000 },
  { label: '+1 hour', ms: 60 * 60 * 1000 },
  { label: '+2 hours', ms: 2 * 60 * 60 * 1000 },
];

type EditTarget = 'start' | 'end';

const ALL_PAGE_SIZE = 20;

export default function TeacherScreen() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const [title, setTitle] = useState('');
  const [eventId, setEventId] = useState('');
  const [venue, setVenue] = useState('');
  const [graceMinutes, setGraceMinutes] = useState('15');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(
    () => new Date(Date.now() + 60 * 60 * 1000)
  );
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');
  const [payload, setPayload] = useState<string | null>(null);

  const [qrModal, setQrModal] = useState<{ event: CloudEvent; payload: string } | null>(null);
  const [fullscreenQR, setFullscreenQR] = useState<{
    payload: string;
    title?: string;
    code?: string;
  } | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [view, setView] = useState<'list' | 'form' | 'all'>('list');
  const [returnView, setReturnView] = useState<'list' | 'all'>('list');
  const [editingCreatorId, setEditingCreatorId] = useState<string | null>(null);

  const [myEvents, setMyEvents] = useState<CloudEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  const loadMyEvents = useCallback(async () => {
    if (!user) {
      setEventsLoading(false);
      return;
    }
    try {
      const events = await getEventsByTeacher(user.id);
      setMyEvents(events);
      setEventsError(null);
    } catch (e: any) {
      setEventsError(e?.message ?? 'Something went wrong.');
    }
    setEventsLoading(false);
  }, [user]);

  const [allEvents, setAllEvents] = useState<CloudEvent[]>([]);
  const [allLoading, setAllLoading] = useState(true);
  const [allError, setAllError] = useState<string | null>(null);
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
  const [allSearch, setAllSearch] = useState('');
  const [allLimit, setAllLimit] = useState(ALL_PAGE_SIZE);

  const loadAllEvents = useCallback(async () => {
    try {
      const [events, users] = await Promise.all([getAllEventsForAdmin(), getAllUsers()]);
      const names: Record<string, string> = {};
      users.forEach((u) => {
        names[u.id] = u.full_name?.trim() || u.email;
      });
      setCreatorNames(names);
      setAllEvents(events);
      setAllError(null);
    } catch (e: any) {
      setAllError(e?.message ?? 'Something went wrong.');
    }
    setAllLoading(false);
  }, []);

  const refreshEvents = useCallback(() => {
    loadMyEvents();
    if (role === 'admin') loadAllEvents();
  }, [loadMyEvents, loadAllEvents, role]);

  useFocusEffect(
    useCallback(() => {
      if (role === 'teacher' || role === 'admin') {
        refreshEvents();
      }
    }, [role, refreshEvents])
  );

  useRealtimeRefresh(
    'teacher-events',
    ['events'],
    refreshEvents,
    role === 'teacher' || role === 'admin'
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
    setEditingCreatorId(null);
    setTitle('');
    setEventId('');
    setVenue('');
    setGraceMinutes('15');
    setDescription('');
    setStartDate(new Date());
    setEndDate(new Date(Date.now() + 60 * 60 * 1000));
    setPayload(null);
    setMessage(null);
  };

  const startEditing = (event: CloudEvent, from: 'list' | 'all' = 'list') => {
    setReturnView(from);
    setEditingCreatorId(event.created_by);
    setEditingEventId(event.id);
    setTitle(event.title);
    setEventId(event.event_code);
    setVenue(event.venue ?? '');
    setGraceMinutes(String(event.grace_minutes ?? 15));
    setDescription(event.description ?? '');
    setStartDate(event.start_time ? new Date(event.start_time) : new Date());
    setEndDate(
      event.end_time ? new Date(event.end_time) : new Date(Date.now() + 60 * 60 * 1000)
    );
    setPayload(null);
    setMessage(null);
    setView('form');
  };

  const showQR = async (event: { eventId: string; title: string; start: string; end: string }) => {
    const token = await getEventSecret(event.eventId);
    if (!token) {
      setPayload(null);
      setMessage('Saved, but the QR secret could not be loaded. Pull to refresh and try again.');
      return;
    }
    setPayload(buildQRPayload({ ...event, token }));
  };

  const buildEventQR = async (event: CloudEvent): Promise<string | null> => {
    const token = await getEventSecret(event.event_code);
    if (!token) return null;
    return buildQRPayload({
      eventId: event.event_code,
      title: event.title,
      token,
      start: event.start_time ?? undefined,
      end: event.end_time ?? undefined,
    });
  };

  const handleShowQR = async (event: CloudEvent) => {
    setBusyEventId(event.id);
    const qr = await buildEventQR(event);
    setBusyEventId(null);
    if (!qr) {
      Alert.alert('Error', 'Could not load the QR code for this event.');
      return;
    }
    setQrModal({ event, payload: qr });
  };

  const handleRegenerateQR = () => {
    if (!qrModal) return;
    const { event } = qrModal;
    Alert.alert(
      'Regenerate QR code?',
      'Every QR code already printed or shared for this event will stop working. Students must scan the new one.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            setQrBusy(true);
            const { error } = await rotateEventSecret(event.id);
            if (error) {
              setQrBusy(false);
              Alert.alert('Error', error);
              return;
            }
            const qr = await buildEventQR(event);
            setQrBusy(false);
            if (!qr) {
              setQrModal(null);
              Alert.alert('Error', 'The QR was regenerated but could not be loaded. Tap Show QR again.');
              return;
            }
            setPayload(null);
            setQrModal({ event, payload: qr });
          },
        },
      ]
    );
  };

  const handleSubmit = () => {
    const event = {
      eventId: editingEventId ? eventId.trim() : generateEventCode(),
      title: title.trim(),
      start: toLocalISO(startDate),
      end: toLocalISO(endDate),
      venue: venue.trim(),
      description: description.trim(),
    };

    if (!/^\d+$/.test(graceMinutes.trim()) || Number(graceMinutes) > 1440) {
      setMessage('"Late after" must be a whole number of minutes from 0 to 1440.');
      return;
    }
    const grace = Number(graceMinutes);

    if (!event.title) {
      setMessage('Event title is required.');
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
        graceMinutes: grace,
      }).then(({ error }) => {
        if (error) {
          setMessage(`Could not update the event: ${error}`);
          return;
        }
        setMessage('Event updated.');
        showQR(event);
        refreshEvents();
      });
      return;
    }

    createEvent({ ...event, graceMinutes: grace }).then(({ error }) => {
      if (error) {
        setMessage(`Could not save the event: ${error}`);
        return;
      }
      setMessage('Event saved! Scan the QR with the Scan tab to test it.');
      showQR(event);
      getEventByCode(event.eventId).then((created) => {
        if (created) {
          setEditingEventId(created.id);
          setEventId(created.event_code);
        }
      });
      refreshEvents();
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
            const apply = (list: CloudEvent[]) =>
              list.map((e) => (e.id === event.id ? { ...e, status: nextStatus } : e));
            setMyEvents(apply);
            setAllEvents(apply);
          },
        },
      ]
    );
  };

  const creatorName = (id: string | null) => (id ? creatorNames[id] ?? 'Unknown user' : 'Unknown user');

  const renderEventCard = (event: CloudEvent, from: 'list' | 'all') => (
          <View key={event.id} style={styles.eventCard}>
            <View style={styles.eventCardHeader}>
              <View style={styles.eventCardInfo}>
                <Text style={styles.eventCardTitle}>{event.title}</Text>
                <Text style={styles.eventMeta}>{event.event_code}</Text>
                {from === 'all' && (
                  <Text style={styles.eventMeta}>
                    By {event.created_by === user?.id ? 'you' : creatorName(event.created_by)}
                  </Text>
                )}
                {event.venue && <Text style={styles.eventMeta}>{event.venue}</Text>}
                {event.start_time && (
                  <Text style={styles.eventMeta}>{formatShort(event.start_time)}</Text>
                )}
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: STATE_COLOR[getEventState(event, now)] },
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {STATE_LABEL[getEventState(event, now)]}
                </Text>
              </View>
            </View>

            <View style={styles.eventCardActions}>
              <Pressable
                style={styles.smallButton}
                onPress={() => handleShowQR(event)}
                disabled={busyEventId === event.id}
              >
                <Ionicons name="qr-code-outline" size={16} color={COLORS.primary} />
                <Text style={styles.smallButtonText}>QR</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={() => startEditing(event, from)}>
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
  );

  const filteredAll = (() => {
    const q = allSearch.trim().toLowerCase();
    if (!q) return allEvents;
    return allEvents.filter((e) =>
      `${e.title} ${e.event_code} ${e.venue ?? ''} ${creatorName(e.created_by)}`
        .toLowerCase()
        .includes(q)
    );
  })();

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
    <KeyboardAvoid>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.segmentRow}>
        <Pressable
          style={[styles.segment, view === 'list' && styles.segmentActive]}
          onPress={() => setView('list')}
        >
          <Text style={[styles.segmentText, view === 'list' && styles.segmentTextActive]}>
            My Events
          </Text>
        </Pressable>
        {role === 'admin' && (
          <Pressable
            style={[styles.segment, view === 'all' && styles.segmentActive]}
            onPress={() => setView('all')}
          >
            <Text style={[styles.segmentText, view === 'all' && styles.segmentTextActive]}>
              All Events
            </Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.segment, view === 'form' && styles.segmentActive]}
          onPress={() => {
            resetForm();
            setReturnView('list');
            setView('form');
          }}
        >
          <Text style={[styles.segmentText, view === 'form' && styles.segmentTextActive]}>
            + New Event
          </Text>
        </Pressable>
      </View>

      {view === 'form' && (
        <>
      <Text style={styles.title}>
        {editingEventId ? 'Edit Event' : 'Create Event QR'}
      </Text>
      <Text style={styles.subtitle}>
        {editingEventId
          ? editingCreatorId && editingCreatorId !== user?.id
            ? `Editing an event created by ${creatorName(editingCreatorId)}.`
            : 'Update the event details below.'
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

      {editingEventId ? (
        <>
          <Text style={styles.label}>Event Code</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={eventId}
            editable={false}
          />
          <Text style={styles.hint}>The event code can't be changed once created.</Text>
        </>
      ) : (
        <Text style={styles.hint}>An event code is generated automatically when you save.</Text>
      )}

      <Text style={styles.label}>Late After (minutes)</Text>
      <TextInput
        style={styles.input}
        value={graceMinutes}
        onChangeText={(t) => setGraceMinutes(t.replace(/[^0-9]/g, ''))}
        placeholder="15"
        placeholderTextColor={COLORS.textSecondary}
        keyboardType="number-pad"
        maxLength={4}
      />
      <Text style={styles.hint}>
        Students who scan more than this many minutes after the start time are marked Late.
      </Text>

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

      <Pressable
        style={styles.cancelLink}
        onPress={() => {
          resetForm();
          setView(returnView);
        }}
      >
        <Text style={styles.cancelLinkText}>
          {editingEventId
            ? 'Cancel editing'
            : returnView === 'all'
            ? 'Back to All Events'
            : 'Back to My Events'}
        </Text>
      </Pressable>

      {editTarget && (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={editTarget === 'start' ? startDate : endDate}
            mode={isAndroid ? editingPart : 'datetime'}
            display={isAndroid ? 'default' : 'spinner'}
            is24Hour={false}
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
          {(() => {
            try {
              const p = JSON.parse(payload);
              return (
                <Text style={[styles.qrCaption, styles.qrCaptionForm]}>
                  {p.title} · {p.event}
                </Text>
              );
            } catch {
              return null;
            }
          })()}
          <Pressable
            style={[styles.qrBtn, styles.qrBtnPrimary, styles.qrBtnFormFullscreen]}
            onPress={() => {
              let title: string | undefined;
              let code: string | undefined;
              try {
                const p = JSON.parse(payload);
                title = p.title;
                code = p.event;
              } catch {}
              setFullscreenQR({ payload, title, code });
            }}
          >
            <Ionicons name="expand-outline" size={20} color="#FFFFFF" />
            <Text style={[styles.qrBtnText, styles.qrBtnTextPrimary]}>View Fullscreen</Text>
          </Pressable>
        </View>
      )}

        </>
      )}

      {view === 'list' && (
        <>
      <Text style={styles.title}>My Events</Text>

      {eventsLoading ? (
        <Text style={styles.subtitle}>Loading your events...</Text>
      ) : eventsError ? (
        <Pressable onPress={loadMyEvents}>
          <Text style={[styles.subtitle, { color: COLORS.danger }]}>
            Could not load your events: {eventsError}. Tap to retry.
          </Text>
        </Pressable>
      ) : myEvents.length === 0 ? (
        <Text style={styles.subtitle}>
          You haven't created any events yet. Use the form above.
        </Text>
      ) : (
        myEvents.map((event) => renderEventCard(event, 'list'))
      )}
        </>
      )}

      {view === 'all' && role === 'admin' && (
        <>
          <Text style={styles.title}>All Events</Text>
          <Text style={styles.subtitle}>
            Manage events created by any teacher or admin.
          </Text>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={allSearch}
              onChangeText={(t) => {
                setAllSearch(t);
                setAllLimit(ALL_PAGE_SIZE);
              }}
              placeholder="Search title, code, venue or creator"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {allLoading ? (
            <Text style={styles.subtitle}>Loading events...</Text>
          ) : allError ? (
            <Pressable onPress={loadAllEvents}>
              <Text style={[styles.subtitle, { color: COLORS.danger }]}>
                Could not load events: {allError}. Tap to retry.
              </Text>
            </Pressable>
          ) : filteredAll.length === 0 ? (
            <Text style={styles.subtitle}>No events found.</Text>
          ) : (
            <>
              {filteredAll.slice(0, allLimit).map((event) => renderEventCard(event, 'all'))}
              {filteredAll.length > allLimit && (
                <Pressable
                  style={styles.showMoreButton}
                  onPress={() => setAllLimit((n) => n + ALL_PAGE_SIZE)}
                >
                  <Text style={styles.showMoreText}>
                    Show more ({filteredAll.length - allLimit} left)
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </>
      )}

      <Modal
        visible={!!qrModal}
        transparent
        animationType="fade"
        onRequestClose={() => setQrModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {qrModal && (
              <>
                <Text style={styles.modalTitle}>{qrModal.event.title}</Text>
                <Text style={[styles.qrCaption, styles.qrCaptionModal]}>{qrModal.event.event_code}</Text>
                <View style={styles.qrBox}>
                  <QRCode value={qrModal.payload} size={220} />
                </View>
                <View style={styles.modalActions}>
                  <Pressable
                    style={[styles.qrBtn, styles.qrBtnPrimary]}
                    onPress={() =>
                      setFullscreenQR({
                        payload: qrModal.payload,
                        title: qrModal.event.title,
                        code: qrModal.event.event_code,
                      })
                    }
                  >
                    <Ionicons name="expand-outline" size={20} color="#FFFFFF" />
                    <Text style={[styles.qrBtnText, styles.qrBtnTextPrimary]}>Fullscreen</Text>
                  </Pressable>
                  <View style={styles.modalActionsRow}>
                    <Pressable
                      style={[styles.qrBtn, styles.qrBtnHalf]}
                      onPress={handleRegenerateQR}
                      disabled={qrBusy}
                    >
                      <Ionicons name="refresh-outline" size={20} color={COLORS.danger} />
                      <Text style={[styles.qrBtnText, { color: COLORS.danger }]}>
                        {qrBusy ? '...' : 'Regenerate'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.qrBtn, styles.qrBtnHalf]}
                      onPress={() => setQrModal(null)}
                    >
                      <Ionicons name="close-outline" size={22} color={COLORS.primary} />
                      <Text style={styles.qrBtnText}>Close</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <FullscreenQRModal
        visible={!!fullscreenQR}
        payload={fullscreenQR?.payload ?? null}
        title={fullscreenQR?.title}
        code={fullscreenQR?.code}
        onClose={() => setFullscreenQR(null)}
      />
    </ScrollView>
    </KeyboardAvoid>
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

const styles = StyleSheet.create({
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  segment: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  showMoreButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  qrCaption: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  modalActions: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
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
  qrCaptionModal: {
    marginBottom: 14,
  },
  qrCaptionForm: {
    marginTop: 4,
  },
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  qrBtnHalf: {
    flex: 1,
  },
  qrBtnPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  qrBtnFormFullscreen: {
    alignSelf: 'stretch',
    marginTop: 20,
  },
  qrBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  qrBtnTextPrimary: {
    color: '#FFFFFF',
  },
});

import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth, signOut } from '@/lib/auth';
import { getProfile, updateProfile, type Profile } from '@/lib/profiles';

export default function ProfileScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);

  // Student details (student number, section, program).
  const [editingDetails, setEditingDetails] = useState(false);
  const [draftNumber, setDraftNumber] = useState('');
  const [draftSection, setDraftSection] = useState('');
  const [draftProgram, setDraftProgram] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const p = await getProfile(user.id);
    setProfile(p);
    setDraftName(p?.full_name ?? '');
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleSaveName = async () => {
    if (!user) return;
    const name = draftName.trim();
    if (!name) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }

    setSaving(true);
    const { error } = await updateProfile(user.id, { full_name: name });
    setSaving(false);

    if (error) {
      Alert.alert('Error', error);
    } else {
      setProfile((prev) => (prev ? { ...prev, full_name: name } : prev));
      setEditing(false);
    }
  };

  const startEditingDetails = () => {
    setDraftNumber(profile?.student_number ?? '');
    setDraftSection(profile?.section ?? '');
    setDraftProgram(profile?.program ?? '');
    setEditingDetails(true);
  };

  const handleSaveDetails = async () => {
    if (!user) return;
    const number = draftNumber.trim();
    const section = draftSection.trim();
    const program = draftProgram.trim();

    if (number && !/^[A-Za-z0-9-]{1,30}$/.test(number)) {
      Alert.alert('Invalid student number', 'Use only letters, numbers and dashes (max 30 characters).');
      return;
    }
    if (section.length > 50 || program.length > 50) {
      Alert.alert('Too long', 'Section and program can be at most 50 characters.');
      return;
    }

    const updates = {
      student_number: number || null,
      section: section || null,
      program: program || null,
    };

    setSavingDetails(true);
    const { error } = await updateProfile(user.id, updates);
    setSavingDetails(false);

    if (error) {
      Alert.alert('Error', error);
      return;
    }
    setProfile((prev) => (prev ? { ...prev, ...updates } : prev));
    setEditingDetails(false);
  };

  const cancelEditName = () => {
    setDraftName(profile?.full_name ?? '');
    setEditing(false);
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to sign out.');
    } finally {
      setLoading(false);
    }
  };

  const role = profile?.role ?? 'student';
  const roleLabel = role === 'admin' ? 'Admin' : role === 'teacher' ? 'Teacher' : 'Student';
  const roleStyle =
    role === 'admin' ? styles.roleAdmin : role === 'teacher' ? styles.roleTeacher : styles.roleStudent;
  const roleTextStyle =
    role === 'admin'
      ? styles.roleTextAdmin
      : role === 'teacher'
      ? styles.roleTextTeacher
      : styles.roleTextStudent;

  const displayName = profile?.full_name?.trim() || 'Add your name';
  const initial = (profile?.full_name?.trim() || user?.email || '?').charAt(0).toUpperCase();
  const detailsEmpty = !profile?.student_number && !profile?.section && !profile?.program;

  const detailRows = [
    { icon: 'card-outline', label: 'Student Number', value: profile?.student_number },
    { icon: 'people-outline', label: 'Section', value: profile?.section },
    { icon: 'school-outline', label: 'Program', value: profile?.program },
  ] as const;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {user && (
        <>
          {/* ------------------------- Header ------------------------- */}
          <View style={styles.hero}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <Text style={styles.heroName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.heroEmail} numberOfLines={1}>
              {user.email}
            </Text>
            <View style={[styles.roleBadge, roleStyle]}>
              <Text style={[styles.roleBadgeText, roleTextStyle]}>{roleLabel}</Text>
            </View>
          </View>

          {/* ------------------------- Account ------------------------- */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account</Text>

            <View style={styles.row}>
              <Ionicons name="person-outline" size={20} color={COLORS.primary} style={styles.rowIcon} />
              <View style={styles.rowBody}>
                <Text style={styles.label}>Full Name</Text>
                {editing ? (
                  <TextInput
                    style={styles.input}
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder="Your full name"
                    placeholderTextColor={COLORS.textSecondary}
                    autoCapitalize="words"
                    editable={!saving}
                    autoFocus
                  />
                ) : (
                  <Text style={profile?.full_name ? styles.value : styles.valueEmpty}>
                    {profile?.full_name || 'Not set'}
                  </Text>
                )}
              </View>
              {!editing && (
                <Pressable onPress={() => setEditing(true)} hitSlop={8} style={styles.editButton}>
                  <Ionicons name="create-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.editText}>Edit</Text>
                </Pressable>
              )}
            </View>

            {editing && (
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.saveButton, saving && styles.disabled]}
                  onPress={handleSaveName}
                  disabled={saving}
                >
                  <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
                </Pressable>
                <Pressable style={styles.cancelButton} onPress={cancelEditName} disabled={saving}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.divider} />

            <View style={styles.row}>
              <Ionicons name="mail-outline" size={20} color={COLORS.primary} style={styles.rowIcon} />
              <View style={styles.rowBody}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value} numberOfLines={1}>
                  {user.email}
                </Text>
              </View>
            </View>
          </View>

          {/* --------------------- Student details --------------------- */}
          {profile?.role === 'student' && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Student Details</Text>
                {!editingDetails && (
                  <Pressable onPress={startEditingDetails} hitSlop={8} style={styles.editButton}>
                    <Ionicons name="create-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.editText}>Edit</Text>
                  </Pressable>
                )}
              </View>

              {editingDetails ? (
                <>
                  <Text style={styles.fieldLabel}>Student Number</Text>
                  <TextInput
                    style={styles.input}
                    value={draftNumber}
                    onChangeText={setDraftNumber}
                    placeholder="e.g. 2026-00123"
                    placeholderTextColor={COLORS.textSecondary}
                    autoCapitalize="characters"
                    editable={!savingDetails}
                  />

                  <Text style={styles.fieldLabel}>Section</Text>
                  <TextInput
                    style={styles.input}
                    value={draftSection}
                    onChangeText={setDraftSection}
                    placeholder="e.g. BSIT 3-A"
                    placeholderTextColor={COLORS.textSecondary}
                    editable={!savingDetails}
                  />

                  <Text style={styles.fieldLabel}>Program</Text>
                  <TextInput
                    style={styles.input}
                    value={draftProgram}
                    onChangeText={setDraftProgram}
                    placeholder="e.g. BS Information Technology"
                    placeholderTextColor={COLORS.textSecondary}
                    editable={!savingDetails}
                  />

                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.saveButton, savingDetails && styles.disabled]}
                      onPress={handleSaveDetails}
                      disabled={savingDetails}
                    >
                      <Text style={styles.saveButtonText}>
                        {savingDetails ? 'Saving...' : 'Save'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.cancelButton}
                      onPress={() => setEditingDetails(false)}
                      disabled={savingDetails}
                    >
                      <Text style={styles.cancelText}>Cancel</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  {detailsEmpty && (
                    <Text style={styles.hint}>
                      Add your student number, section and program so your teachers can identify you.
                    </Text>
                  )}
                  {detailRows.map((r, i) => (
                    <View key={r.label}>
                      {i > 0 && <View style={styles.divider} />}
                      <View style={styles.row}>
                        <Ionicons name={r.icon} size={20} color={COLORS.primary} style={styles.rowIcon} />
                        <View style={styles.rowBody}>
                          <Text style={styles.label}>{r.label}</Text>
                          <Text style={r.value ? styles.value : styles.valueEmpty}>
                            {r.value || 'Not set'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* ------------------------ User ID ------------------------ */}
          <Text style={styles.idText} selectable>
            User ID: {user.id}
          </Text>
        </>
      )}

      <AppButton
        title="Sign Out"
        icon="log-out-outline"
        onPress={handleSignOut}
        disabled={loading}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },

  // Header
  hero: { alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 3,
    borderColor: COLORS.border,
  },
  avatarText: { color: COLORS.textOnPrimary, fontSize: 36, fontWeight: '700' },
  heroName: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary, maxWidth: '90%' },
  heroEmail: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2, maxWidth: '90%' },
  roleBadge: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginTop: 10,
  },
  roleStudent: { backgroundColor: '#EBDAC6' },
  roleTeacher: { backgroundColor: '#F1DADA' },
  roleAdmin: { backgroundColor: COLORS.textPrimary },
  roleBadgeText: { fontSize: 12, fontWeight: '700' },
  roleTextStudent: { color: COLORS.textSecondary },
  roleTextTeacher: { color: COLORS.primary },
  roleTextAdmin: { color: COLORS.textOnPrimary },

  // Cards
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  // Rows
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowIcon: { width: 28 },
  rowBody: { flex: 1, paddingRight: 8 },
  label: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 2 },
  value: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  valueEmpty: { fontSize: 16, fontStyle: 'italic', color: COLORS.surface },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: 28, opacity: 0.6 },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },

  // Editing
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  saveButtonText: { color: COLORS.textOnPrimary, fontWeight: '700', fontSize: 15 },
  cancelButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  cancelText: { color: COLORS.textPrimary, fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.6 },

  idText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 20,
  },
});

import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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

  const roleLabel =
    profile?.role === 'admin' ? 'Admin' : profile?.role === 'teacher' ? 'Teacher' : 'Student';
  const roleBadgeStyle =
    profile?.role === 'admin'
      ? styles.roleBadgeAdmin
      : profile?.role === 'teacher'
      ? undefined
      : styles.roleBadgeStudent;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>My Profile</Text>

      {user && (
        <View style={styles.infoCard}>
          <View style={[styles.roleBadge, roleBadgeStyle]}>
            <Text style={styles.roleBadgeText}>{roleLabel}</Text>
          </View>

          <Text style={styles.label}>Full Name</Text>
          {editing ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.nameInput}
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Your full name"
                placeholderTextColor={COLORS.textSecondary}
                autoCapitalize="words"
                editable={!saving}
              />
              <Pressable
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSaveName}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>{saving ? '...' : 'Save'}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setEditing(true)} style={styles.nameRow}>
              <Text style={styles.value}>{profile?.full_name || 'Tap to add your name'}</Text>
              <Text style={styles.editHint}>Edit</Text>
            </Pressable>
          )}

          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user.email}</Text>

          {profile?.role === 'student' && (
            <>
              <View style={styles.nameRow}>
                <Text style={[styles.label, { marginBottom: 0 }]}>Student Details</Text>
                {!editingDetails && (
                  <Pressable onPress={startEditingDetails}>
                    <Text style={styles.editHint}>Edit</Text>
                  </Pressable>
                )}
              </View>

              {editingDetails ? (
                <>
                  <Text style={styles.label}>Student Number</Text>
                  <TextInput
                    style={styles.nameInput}
                    value={draftNumber}
                    onChangeText={setDraftNumber}
                    placeholder="e.g. 2026-00123"
                    placeholderTextColor={COLORS.textSecondary}
                    autoCapitalize="characters"
                    editable={!savingDetails}
                  />
                  <Text style={styles.label}>Section</Text>
                  <TextInput
                    style={styles.nameInput}
                    value={draftSection}
                    onChangeText={setDraftSection}
                    placeholder="e.g. BSIT 3-A"
                    placeholderTextColor={COLORS.textSecondary}
                    editable={!savingDetails}
                  />
                  <Text style={styles.label}>Program</Text>
                  <TextInput
                    style={styles.nameInput}
                    value={draftProgram}
                    onChangeText={setDraftProgram}
                    placeholder="e.g. BS Information Technology"
                    placeholderTextColor={COLORS.textSecondary}
                    editable={!savingDetails}
                  />
                  <View style={[styles.nameEditRow, { marginTop: 12 }]}>
                    <Pressable
                      style={[styles.saveButton, savingDetails && styles.saveButtonDisabled]}
                      onPress={handleSaveDetails}
                      disabled={savingDetails}
                    >
                      <Text style={styles.saveButtonText}>{savingDetails ? '...' : 'Save'}</Text>
                    </Pressable>
                    <Pressable onPress={() => setEditingDetails(false)} disabled={savingDetails}>
                      <Text style={styles.editHint}>Cancel</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.label}>Student Number</Text>
                  <Text style={styles.value}>{profile.student_number || 'Not set'}</Text>
                  <Text style={styles.label}>Section</Text>
                  <Text style={styles.value}>{profile.section || 'Not set'}</Text>
                  <Text style={styles.label}>Program</Text>
                  <Text style={styles.value}>{profile.program || 'Not set'}</Text>
                </>
              )}
            </>
          )}

          <Text style={styles.label}>User ID</Text>
          <Text style={styles.valueSmall}>{user.id}</Text>
        </View>
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
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 4,
  },
  roleBadgeStudent: {
    backgroundColor: COLORS.textSecondary,
  },
  roleBadgeAdmin: {
    backgroundColor: '#5B3A9E',
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: 12,
  },
  value: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  valueSmall: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editHint: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
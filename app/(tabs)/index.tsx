import { router } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import { COLORS } from '@/constants/colors';
import { canAccessTab, useRole } from '@/lib/role';

export default function Index() {
  const { role } = useRole();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Header title="QR Attendance" />
      </View>

      <View style={styles.bodyContainer}>
        <Text style={styles.mainTitle}>School Event Attendance</Text>
        <Text style={styles.subtitle}>
          Scan QR Codes to record attendance during school activities.
        </Text>
      </View>

      <View style={styles.footerContainer}>
        {canAccessTab(role, 'events') && (
          <AppButton
            title="Available Events"
            icon="calendar-outline"
            onPress={() => router.push('/events')}
          />
        )}
        {canAccessTab(role, 'scan') && (
          <AppButton
            theme="primary"
            title="Scan QR Code"
            icon="qr-code-outline"
            onPress={() => router.push('/scan')}
          />
        )}
        {canAccessTab(role, 'teacher') && (
          <AppButton
            theme={role === 'teacher' ? 'primary' : undefined}
            title="Create Event QR"
            icon="clipboard-outline"
            onPress={() => router.push('/teacher')}
          />
        )}
        {canAccessTab(role, 'admin') && (
          <AppButton
            theme="primary"
            title="Admin Dashboard"
            icon="shield-outline"
            onPress={() => router.push('/admin')}
          />
        )}
        {canAccessTab(role, 'history') && (
          <AppButton
            title={role === 'student' ? 'Attendance History' : 'Event Attendance'}
            icon="time-outline"
            onPress={() => router.push('/history')}
          />
        )}
        <AppButton
          title="Profile"
          icon="person-outline"
          onPress={() => router.push('/profile')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bodyContainer: { paddingHorizontal: 24, marginBottom: 24 },
  mainTitle: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 15, lineHeight: 21, color: COLORS.textSecondary },
  footerContainer: { paddingHorizontal: 24, paddingBottom: 12, width: '100%' },
});
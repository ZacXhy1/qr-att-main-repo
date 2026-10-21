import { Redirect, Tabs, useSegments } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { canAccessTab, useNavRole, type TabName } from '@/lib/role';

export default function TabLayout() {
  const { role, loading } = useNavRole();
  const segments = useSegments() as string[];

  if (loading || !role) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const current = (segments[1] ?? 'index') as TabName;
  if (segments[0] === '(tabs)' && !canAccessTab(role, current)) {
    return <Redirect href="/" />;
  }

  const visible = (tab: TabName) => (canAccessTab(role, tab) ? undefined : null);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        headerStyle: { backgroundColor: COLORS.background },
        headerShadowVisible: false,
        headerTintColor: COLORS.textPrimary,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          href: visible('index'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home-sharp' : 'home-outline'} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          href: visible('events'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          href: visible('scan'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'qr-code' : 'qr-code-outline'} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          href: visible('history'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="teacher"
        options={{
          title: 'Events',
          href: visible('teacher'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'clipboard' : 'clipboard-outline'} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          href: visible('admin'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'shield' : 'shield-outline'} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          href: visible('profile'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

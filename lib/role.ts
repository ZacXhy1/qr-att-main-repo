import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAuth } from './auth';
import { getProfile, type Role } from './profiles';

/**
 * Which tabs each role is allowed to see. This is the single source of truth
 * for role-based navigation: the tab bar, the redirect guard and the Home
 * screen all read from here.
 */
export type TabName = 'index' | 'events' | 'scan' | 'history' | 'teacher' | 'admin' | 'profile';

export const ALL_TABS: TabName[] = ['index', 'events', 'scan', 'history', 'teacher', 'admin', 'profile'];

export const TAB_ACCESS: Record<Role, TabName[]> = {
  student: ['index', 'events', 'scan', 'history', 'profile'],
  teacher: ['index', 'history', 'teacher', 'profile'],
  admin: ['index', 'history', 'teacher', 'admin', 'profile'],
};

export function canAccessTab(role: Role | null, tab: TabName): boolean {
  if (!role) return false;
  return TAB_ACCESS[role].includes(tab);
}

/** Role used by individual screens (re-checks whenever the screen is focused). */
export function useRole(): { role: Role | null; loading: boolean } {
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      if (!user) {
        setRole(null);
        setLoading(false);
        return () => {
          active = false;
        };
      }

      setLoading(true);
      getProfile(user.id).then((profile) => {
        if (!active) return;
        setRole(profile?.role ?? 'student');
        setLoading(false);
      });

      return () => {
        active = false;
      };
    }, [user])
  );

  return { role, loading };
}

/**
 * Role used by the tab layout. It isn't tied to screen focus (the layout is
 * always mounted); instead it refreshes when the user changes and whenever the
 * app returns to the foreground, so a role change by an admin shows up.
 */
export function useNavRole(): { role: Role | null; loading: boolean } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const fetchRole = (showLoading: boolean) => {
      if (!userId) {
        setRole(null);
        setLoading(false);
        return;
      }
      if (showLoading) setLoading(true);
      getProfile(userId).then((profile) => {
        if (!active) return;
        setRole(profile?.role ?? 'student');
        setLoading(false);
      });
    };

    setRole(null);
    fetchRole(true);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchRole(false);
    });

    return () => {
      active = false;
      sub.remove();
    };
  }, [userId]);

  return { role, loading };
}

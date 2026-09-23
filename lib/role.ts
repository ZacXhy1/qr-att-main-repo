import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useAuth } from './auth';
import { getProfile, type Role } from './profiles';

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
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { supabase } from './supabase';

/**
 * Re-runs `onChange` whenever a row in one of `tables` is inserted, updated or
 * deleted (Supabase Realtime). Supabase only sends changes the signed-in user
 * is allowed to read (RLS), so each role only reacts to its own data.
 *
 * - Subscribes only while the screen is focused, and unsubscribes on blur.
 * - Bursts of changes are merged into a single refresh (400 ms debounce).
 * - Set `enabled` to false to skip subscribing (e.g. wrong role).
 */
export function useRealtimeRefresh(
  name: string,
  tables: string[],
  onChange: () => void,
  enabled: boolean = true
) {
  const handler = useRef(onChange);
  useEffect(() => {
    handler.current = onChange;
  }, [onChange]);

  const tablesKey = tables.join(',');

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      let timer: ReturnType<typeof setTimeout> | undefined;
      const trigger = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => handler.current(), 400);
      };

      let channel = supabase.channel(`${name}-${Date.now()}`);
      tablesKey.split(',').forEach((table) => {
        channel = channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          trigger
        );
      });
      channel.subscribe();

      return () => {
        if (timer) clearTimeout(timer);
        supabase.removeChannel(channel);
      };
    }, [name, tablesKey, enabled])
  );
}

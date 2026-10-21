import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { supabase } from './supabase';

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

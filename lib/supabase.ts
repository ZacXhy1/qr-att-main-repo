import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Session storage.
 * On phones the session (access + refresh token) is kept in the device's
 * encrypted secure storage (iOS Keychain / Android Keystore). SecureStore
 * limits each value to ~2 KB and a session is bigger, so the value is split
 * into small chunks. On web we fall back to localStorage.
 */
const CHUNK_SIZE = 1000;

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (!count) return null;

    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null; // incomplete -> treat as signed out
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const previous = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    const chunks = Math.ceil(value.length / CHUNK_SIZE);

    for (let i = 0; i < chunks; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(`${key}.n`, String(chunks));

    // Remove leftover chunks from a previously longer value.
    for (let i = chunks; i < previous; i++) {
      await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
  },

  async removeItem(key: string): Promise<void> {
    const previous = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    for (let i = 0; i < previous; i++) {
      await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

const webStorage = {
  getItem: async (key: string) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  setItem: async (key: string, value: string) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? webStorage : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// On phones, only refresh tokens while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = true;
let listeners: Set<() => void> = new Set();
let snapshot: AuthState = { session: null, user: null, loading: true };

function notify() {
  listeners.forEach((l) => l());
}

export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;
  snapshot = { session: globalSession, user: globalUser, loading: globalLoading };
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AuthState {
  return snapshot;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export type SignUpProfile = {
  full_name: string;
  role: 'student' | 'teacher';
};

export async function signUp(
  email: string,
  password: string,
  profile?: SignUpProfile
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: profile ? { full_name: profile.full_name, role: profile.role } : undefined,
      emailRedirectTo: Linking.createURL('login'),
    },
  });

  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}

async function clearSupabaseSession() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: 'local' });
  } catch {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }
}

export async function signOut() {
  await clearSupabaseSession();
  setAuth(null);
  return { error: null };
}

/* ----------------------- Restore session on app start ----------------------- */

async function initAuth() {
  try {
    const { data } = await supabase.auth.getSession();
    setAuth(data.session ?? null);
  } catch {
    setAuth(null);
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      setAuth(null);
    } else if (event === 'TOKEN_REFRESHED' && globalSession && session) {
      setAuth(session);
    }
  });
}

void initAuth();

/* ----------------------- Password reset (email code) ----------------------- */

// NOTE: the "Reset Password" email template in Supabase must include {{ .Token }}.
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error };
}

export async function resetPasswordWithCode(
  email: string,
  code: string,
  newPassword: string
) {
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'recovery',
  });
  if (verifyError) return { error: verifyError };

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  await clearSupabaseSession();
  return { error: updateError };
}

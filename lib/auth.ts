import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = true; // true until the saved session has been restored
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

// Ends the Supabase session and wipes the saved copy. If the server can't be
// reached (offline), fall back to clearing only this device's session so the
// user is never left half signed in.
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

// Reads the saved session (secure storage) so users stay logged in after
// closing the app. Until it finishes, the app shows a loading spinner.
async function initAuth() {
  try {
    const { data } = await supabase.auth.getSession();
    setAuth(data.session ?? null);
  } catch {
    setAuth(null);
  }

  // Keep the app in sync when Supabase refreshes or invalidates the session.
  // SIGNED_IN / USER_UPDATED are deliberately ignored: they also fire during
  // the password-reset code flow and must not log the user in.
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

// Step 1: email the user a recovery code.
// NOTE: the "Reset Password" email template in Supabase must include {{ .Token }}.
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error };
}

// Step 2: verify the code and set the new password.
// verifyOtp briefly creates a recovery session on the Supabase client (we do NOT
// call setAuth, so the app doesn't navigate). We sign out right after, so the
// user logs in with the new password.
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

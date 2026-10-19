import type { ReactNode } from 'react';
import { KeyboardAvoidingView } from 'react-native';

import { COLORS } from '@/constants/colors';

// Pushes its content up when the keyboard opens so inputs stay visible.
// Android is edge-to-edge (app.json), so the system no longer resizes the
// screen for the keyboard; 'padding' handles it on both Android and iOS.
export default function KeyboardAvoid({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior="padding"
    >
      {children}
    </KeyboardAvoidingView>
  );
}

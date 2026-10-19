import type { ReactNode } from 'react';
import { KeyboardAvoidingView } from 'react-native';

import { COLORS } from '@/constants/colors';

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

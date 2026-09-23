import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

type Props = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  theme?: 'primary';
  disabled?: boolean;
  onPress: () => void;
};

export default function AppButton({ title, icon, theme, disabled, onPress }: Props) {
  const isPrimary = theme === 'primary';

  return (
    <View style={[styles.buttonOuter, disabled && styles.disabled]}>
      <Pressable
        style={[styles.buttonInner, isPrimary ? styles.primaryFill : styles.secondaryFill]}
        onPress={onPress}
        disabled={disabled}
      >
        <Ionicons
          name={icon}
          size={22}
          color={isPrimary ? COLORS.textOnPrimary : COLORS.textSecondary}
          style={styles.icon}
        />
        <Text
          style={[
            styles.label,
            isPrimary
              ? { color: COLORS.textOnPrimary, fontWeight: '700' }
              : { color: COLORS.textPrimary },
          ]}
        >
          {title}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonOuter: {
    width: '100%',
    marginBottom: 14,
  },
  buttonInner: {
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
  },
  primaryFill: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  secondaryFill: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
  },
  disabled: {
    opacity: 0.5,
  },
  icon: { paddingRight: 10 },
  label: { fontSize: 17, fontWeight: '600' },
});
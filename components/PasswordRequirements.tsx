import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { getPasswordChecks, type PasswordContext } from '@/lib/validation';

type Props = {
  password: string;
  context?: PasswordContext;
};

const OK_COLOR = '#2E7D32';

export default function PasswordRequirements({ password, context }: Props) {
  const checks = getPasswordChecks(password, context);
  const passed = checks.filter((c) => c.ok).length;

  return (
    <View style={styles.box}>
      <View style={styles.meter}>
        {checks.map((c) => (
          <View
            key={c.id}
            style={[styles.segment, c.ok && styles.segmentOk]}
          />
        ))}
      </View>
      <Text style={styles.summary}>
        {passed === checks.length ? 'Strong password' : `${passed} of ${checks.length} requirements met`}
      </Text>
      {checks.map((c) => (
        <View key={c.id} style={styles.row}>
          <Ionicons
            name={c.ok ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={c.ok ? OK_COLOR : COLORS.textSecondary}
          />
          <Text style={[styles.label, c.ok && styles.labelOk]}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 10,
    gap: 4,
  },
  meter: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  segment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
  },
  segmentOk: {
    backgroundColor: OK_COLOR,
  },
  summary: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  labelOk: {
    color: OK_COLOR,
  },
});

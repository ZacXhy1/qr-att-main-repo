import { Image, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

type Props = { title: string };

export default function Header({ title }: Props) {
  return (
    <View style={styles.container}>
      <Image
        source={require('@/assets/images/zib-logo.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="ZIB logo"
      />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  
  logo: {
    width: 150,
    height: 80,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});

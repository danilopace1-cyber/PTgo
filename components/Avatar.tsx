import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../lib/theme';

// Initials on a pale semantic-hue circle; hue chosen deterministically per user.
export function Avatar({ userId, name, size = 40 }: { userId: string; name: string; size?: number }) {
  const theme = useTheme();
  const hues: (keyof Pick<Theme, 'success' | 'warning' | 'accent' | 'purple'>)[] = [
    'success',
    'warning',
    'accent',
    'purple',
  ];
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  const pair = theme[hues[hash % hues.length]];

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: pair.bg },
      ]}
    >
      <Text style={{ color: pair.text, fontSize: size * 0.4, fontWeight: '500' }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { Stack } from 'expo-router';
import { useTheme } from '../../lib/theme';

export default function AppLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.surface0 } }}
    />
  );
}

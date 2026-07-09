import { Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { ClientHome } from '../../components/home/ClientHome';
import { TrainerHome } from '../../components/home/TrainerHome';
import { useAuth } from '../../lib/auth';
import { type as typeScale, useTheme } from '../../lib/theme';

export default function HomeScreen() {
  const { profile, refreshProfile, signOut } = useAuth();
  const theme = useTheme();

  if (!profile) {
    return (
      <Screen>
        <View style={{ marginTop: 48, gap: 12 }}>
          <Text style={[typeScale.body, { color: theme.textSecondary }]}>
            Your profile could not be loaded.
          </Text>
          <Button title="Try again" variant="outline" onPress={refreshProfile} />
          <Button title="Sign out" variant="ghost" onPress={signOut} />
        </View>
      </Screen>
    );
  }

  return profile.role === 'trainer' ? <TrainerHome /> : <ClientHome />;
}

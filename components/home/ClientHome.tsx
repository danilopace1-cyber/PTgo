import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { radius, type as typeScale, useTheme } from '../../lib/theme';
import type { ConnectionWithProfile } from '../../lib/types';
import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { Screen } from '../Screen';
import { TextField } from '../TextField';

type ConnectionRow = Omit<ConnectionWithProfile, 'profile'> & {
  trainer: ConnectionWithProfile['profile'];
};

export function ClientHome() {
  const { profile, signOut } = useAuth();
  const theme = useTheme();
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const loadConnections = useCallback(async () => {
    const { data } = await supabase
      .from('trainer_clients')
      .select('id, status, started_at, trainer:profiles!trainer_clients_trainer_id_fkey(id, name)')
      .eq('status', 'active')
      .returns<ConnectionRow[]>();
    setConnections(data ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  async function joinTrainer() {
    setJoinError(null);
    setJoining(true);
    const { error } = await supabase.rpc('redeem_invite_code', { code: code.trim() });
    setJoining(false);
    if (error) {
      setJoinError(error.message);
      return;
    }
    setCode('');
    loadConnections();
  }

  const firstName = profile?.name.split(/\s+/)[0] || 'there';

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {profile && <Avatar userId={profile.id} name={profile.name} />}
          <Text style={[typeScale.screenTitle, { color: theme.textPrimary }]}>
            Hi {firstName}
          </Text>
        </View>
        <Pressable onPress={signOut} hitSlop={8}>
          <Text style={[typeScale.body, { color: theme.textSecondary }]}>Sign out</Text>
        </Pressable>
      </View>

      <View
        style={{
          backgroundColor: theme.surface2,
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          padding: 16,
          gap: 4,
        }}
      >
        <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>Today</Text>
        <Text style={[typeScale.body, { color: theme.textSecondary }]}>
          No workout programmed yet. Programs your trainer assigns will appear here.
        </Text>
      </View>

      {loaded && connections.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={[typeScale.metadata, { color: theme.textMuted }]}>Your trainer</Text>
          <View
            style={{
              backgroundColor: theme.surface2,
              borderRadius: radius.card,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
            }}
          >
            {connections.map((connection, index) => (
              <View
                key={connection.id}
                style={[
                  styles.listRow,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.border,
                  },
                ]}
              >
                <Avatar userId={connection.trainer.id} name={connection.trainer.name} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>
                    {connection.trainer.name || 'Your trainer'}
                  </Text>
                  <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
                    Connected {new Date(connection.started_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {loaded && connections.length === 0 && (
        <View
          style={{
            backgroundColor: theme.surface1,
            borderRadius: radius.card,
            padding: 16,
            gap: 12,
          }}
        >
          <View style={{ gap: 4 }}>
            <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>
              Have a trainer?
            </Text>
            <Text style={[typeScale.secondary, { color: theme.textSecondary }]}>
              Enter the invite code they shared with you.
            </Text>
          </View>
          <TextField
            label="Invite code"
            value={code}
            onChangeText={(next) => setCode(next.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            placeholder="ABC123"
          />
          {joinError && (
            <Text style={[typeScale.body, { color: theme.danger.text }]}>{joinError}</Text>
          )}
          <Button
            title="Connect"
            onPress={joinTrainer}
            loading={joining}
            disabled={code.trim().length < 6}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
});

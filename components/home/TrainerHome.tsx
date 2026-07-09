import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { confirmAsync } from '../../lib/confirm';
import { supabase } from '../../lib/supabase';
import { radius, type as typeScale, useTheme } from '../../lib/theme';
import type { ConnectionWithProfile } from '../../lib/types';
import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { Screen } from '../Screen';

type ConnectionRow = Omit<ConnectionWithProfile, 'profile'> & {
  client: ConnectionWithProfile['profile'];
};

export function TrainerHome() {
  const { profile, signOut } = useAuth();
  const theme = useTheme();
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    const { data, error } = await supabase
      .from('trainer_clients')
      .select('id, status, started_at, client:profiles!trainer_clients_client_id_fkey(id, name)')
      .neq('status', 'ended')
      .order('started_at', { ascending: false })
      .returns<ConnectionRow[]>();
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError(null);
    setConnections(data ?? []);
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  async function shareInviteCode() {
    if (!profile?.invite_code) return;
    await Share.share({
      message: `Join me on PTgo — create a client account and enter invite code ${profile.invite_code} to connect.`,
    });
  }

  async function removeClient(connection: ConnectionRow) {
    const confirmed = await confirmAsync(
      'Remove client',
      `${connection.client.name || 'This client'} will lose access to programs you assigned. Their own logged data stays theirs.`,
      'Remove'
    );
    if (!confirmed) return;
    const { error } = await supabase
      .from('trainer_clients')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', connection.id);
    if (!error) loadConnections();
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={[typeScale.screenTitle, { color: theme.textPrimary }]}>Clients</Text>
        <Pressable onPress={signOut} hitSlop={8}>
          <Text style={[typeScale.body, { color: theme.textSecondary }]}>Sign out</Text>
        </Pressable>
      </View>

      <View
        style={{
          backgroundColor: theme.surface1,
          borderRadius: radius.card,
          padding: 16,
          gap: 8,
        }}
      >
        <Text style={[typeScale.metadata, { color: theme.textMuted }]}>Your invite code</Text>
        <Text
          style={{
            color: theme.textPrimary,
            fontSize: 24,
            fontWeight: '500',
            letterSpacing: 4,
            fontVariant: ['tabular-nums'],
          }}
        >
          {profile?.invite_code ?? '—'}
        </Text>
        <Button title="Share invite code" variant="outline" onPress={shareInviteCode} />
      </View>

      {loadError && (
        <View style={{ backgroundColor: theme.danger.bg, borderRadius: 8, padding: 12 }}>
          <Text style={[typeScale.body, { color: theme.danger.text }]}>{loadError}</Text>
        </View>
      )}

      {connections.length === 0 ? (
        <Text style={[typeScale.body, { color: theme.textMuted, paddingVertical: 16 }]}>
          No clients yet. Share your invite code to get started.
        </Text>
      ) : (
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
              <Avatar userId={connection.client.id} name={connection.client.name} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>
                  {connection.client.name || 'Unnamed client'}
                </Text>
                <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
                  Client since {new Date(connection.started_at).toLocaleDateString()}
                </Text>
              </View>
              <Pressable onPress={() => removeClient(connection)} hitSlop={8}>
                <Text style={[typeScale.secondary, { color: theme.danger.text }]}>Remove</Text>
              </Pressable>
            </View>
          ))}
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

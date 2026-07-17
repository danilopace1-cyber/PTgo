import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
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

  // Reload when returning from a client detail screen (e.g. after removal).
  useFocusEffect(
    useCallback(() => {
      loadConnections();
    }, [loadConnections])
  );

  async function shareInviteCode() {
    if (!profile?.invite_code) return;
    await Share.share({
      message: `Join me on PTgo — create a client account and enter invite code ${profile.invite_code} to connect.`,
    });
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

      <View
        style={{
          backgroundColor: theme.surface2,
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/workouts')}
          style={({ pressed }) => [styles.listRow, { opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>
              Workout library
            </Text>
            <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
              Build reusable workouts, then schedule them per client
            </Text>
          </View>
          <Text style={[typeScale.cardTitle, { color: theme.textMuted }]}>›</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/programs')}
          style={({ pressed }) => [
            styles.listRow,
            { opacity: pressed ? 0.7 : 1 },
            {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.border,
            },
          ]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>Programs</Text>
            <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
              Saved bundles of workouts to assign in one tap
            </Text>
          </View>
          <Text style={[typeScale.cardTitle, { color: theme.textMuted }]}>›</Text>
        </Pressable>
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
            <Pressable
              key={connection.id}
              accessibilityRole="button"
              onPress={() => router.push(`/clients/${connection.client.id}`)}
              style={({ pressed }) => [
                styles.listRow,
                { opacity: pressed ? 0.7 : 1 },
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
              <Text style={[typeScale.cardTitle, { color: theme.textMuted }]}>›</Text>
            </Pressable>
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

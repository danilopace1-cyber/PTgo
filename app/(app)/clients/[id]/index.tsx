import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../../../components/Avatar';
import { Button } from '../../../../components/Button';
import { Screen } from '../../../../components/Screen';
import { confirmAsync } from '../../../../lib/confirm';
import { supabase } from '../../../../lib/supabase';
import { radius, type as typeScale, useTheme } from '../../../../lib/theme';
import type { AssignmentWithProgram, Profile } from '../../../../lib/types';

type Connection = { id: string; started_at: string };

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [client, setClient] = useState<Pick<Profile, 'id' | 'name'> | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [assignments, setAssignments] = useState<AssignmentWithProgram[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [profileRes, connectionRes, assignmentRes] = await Promise.all([
      supabase.from('profiles').select('id, name').eq('id', id).maybeSingle<Profile>(),
      supabase
        .from('trainer_clients')
        .select('id, started_at')
        .eq('client_id', id)
        .eq('status', 'active')
        .maybeSingle<Connection>(),
      supabase
        .from('assignments')
        .select('id, program_id, trainer_id, client_id, starts_at, expires_at, expiry_policy, status, program:programs(id, name)')
        .eq('client_id', id)
        .order('starts_at', { ascending: false })
        .returns<AssignmentWithProgram[]>(),
    ]);
    const firstError = profileRes.error ?? connectionRes.error ?? assignmentRes.error;
    setError(firstError?.message ?? null);
    setClient(profileRes.data);
    setConnection(connectionRes.data);
    setAssignments(assignmentRes.data ?? []);
  }, [id]);

  // Reload when returning from the assign flow.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function endAssignment(assignment: AssignmentWithProgram) {
    const confirmed = await confirmAsync(
      'End plan',
      `${client?.name || 'The client'} will lose access to ${assignment.program?.name ?? 'this plan'}.`,
      'End plan'
    );
    if (!confirmed) return;
    const { error: updateError } = await supabase
      .from('assignments')
      .update({ status: 'expired' })
      .eq('id', assignment.id);
    if (updateError) setError(updateError.message);
    load();
  }

  async function removeClient() {
    if (!connection) return;
    const confirmed = await confirmAsync(
      'Remove client',
      `${client?.name || 'This client'} will lose access to programs you assigned. Their own logged data stays theirs.`,
      'Remove'
    );
    if (!confirmed) return;
    const { error: updateError } = await supabase
      .from('trainer_clients')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', connection.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.back();
  }

  const activeAssignments = assignments.filter((assignment) => assignment.status === 'active');
  const pastAssignments = assignments.filter((assignment) => assignment.status !== 'active');

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
        <Text style={[typeScale.body, { color: theme.textSecondary }]}>‹ Clients</Text>
      </Pressable>

      {client && (
        <View style={styles.header}>
          <Avatar userId={client.id} name={client.name} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typeScale.screenTitle, { color: theme.textPrimary }]}>
              {client.name || 'Unnamed client'}
            </Text>
            {connection && (
              <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
                Client since {new Date(connection.started_at).toLocaleDateString()}
              </Text>
            )}
          </View>
        </View>
      )}

      {error && (
        <View style={{ backgroundColor: theme.danger.bg, borderRadius: 8, padding: 12 }}>
          <Text style={[typeScale.body, { color: theme.danger.text }]}>{error}</Text>
        </View>
      )}

      <Text style={[typeScale.cardTitle, { color: theme.textPrimary, marginTop: 8 }]}>
        Current plans
      </Text>

      {activeAssignments.length === 0 ? (
        <Text style={[typeScale.body, { color: theme.textMuted }]}>
          No active plan. Assign one to get {client?.name || 'this client'} training.
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
          {activeAssignments.map((assignment, index) => (
            <View
              key={assignment.id}
              style={[
                styles.listRow,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.border,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>
                  {assignment.program?.name ?? 'Custom plan'}
                </Text>
                <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
                  Expires {new Date(assignment.expires_at).toLocaleDateString()}
                </Text>
              </View>
              <Pressable onPress={() => endAssignment(assignment)} hitSlop={8}>
                <Text style={[typeScale.secondary, { color: theme.danger.text }]}>End</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Button title="Assign a plan" onPress={() => router.push(`/clients/${id}/assign`)} />

      {pastAssignments.length > 0 && (
        <>
          <Text style={[typeScale.cardTitle, { color: theme.textPrimary, marginTop: 8 }]}>
            Past plans
          </Text>
          <View
            style={{
              backgroundColor: theme.surface2,
              borderRadius: radius.card,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
            }}
          >
            {pastAssignments.map((assignment, index) => (
              <View
                key={assignment.id}
                style={[
                  styles.listRow,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.border,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typeScale.cardTitle, { color: theme.textSecondary }]}>
                    {assignment.program?.name ?? 'Custom plan'}
                  </Text>
                  <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
                    {new Date(assignment.starts_at).toLocaleDateString()} –{' '}
                    {new Date(assignment.expires_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={[typeScale.metadata, { color: theme.textMuted }]}>
                  {assignment.status}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Button title="Remove client" variant="ghost" danger onPress={removeClient} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
});

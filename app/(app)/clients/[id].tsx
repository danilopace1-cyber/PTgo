import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import { TextField } from '../../../components/TextField';
import { useAuth } from '../../../lib/auth';
import { confirmAsync } from '../../../lib/confirm';
import { supabase } from '../../../lib/supabase';
import { radius, type as typeScale, useTheme } from '../../../lib/theme';
import type { AssignmentWithProgram, Profile, Program } from '../../../lib/types';

type Connection = { id: string; started_at: string };

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: trainer } = useAuth();
  const theme = useTheme();

  const [client, setClient] = useState<Pick<Profile, 'id' | 'name'> | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [assignments, setAssignments] = useState<AssignmentWithProgram[]>([]);
  const [programs, setPrograms] = useState<Pick<Program, 'id' | 'name'>[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [weeks, setWeeks] = useState('6');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [profileRes, connectionRes, assignmentRes, programRes] = await Promise.all([
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
      supabase.from('programs').select('id, name').order('name'),
    ]);
    const firstError =
      profileRes.error ?? connectionRes.error ?? assignmentRes.error ?? programRes.error;
    setError(firstError?.message ?? null);
    setClient(profileRes.data);
    setConnection(connectionRes.data);
    setAssignments(assignmentRes.data ?? []);
    setPrograms(programRes.data ?? []);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function assignProgram() {
    if (!trainer || !id || !selectedProgramId) return;
    const parsedWeeks = Number.parseInt(weeks, 10);
    if (!Number.isFinite(parsedWeeks) || parsedWeeks < 1 || parsedWeeks > 52) {
      setError('Duration must be between 1 and 52 weeks.');
      return;
    }
    setSubmitting(true);
    const expiresAt = new Date(Date.now() + parsedWeeks * 7 * 24 * 60 * 60 * 1000);
    const { error: insertError } = await supabase.from('assignments').insert({
      program_id: selectedProgramId,
      trainer_id: trainer.id,
      client_id: id,
      expires_at: expiresAt.toISOString(),
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setAssigning(false);
    setSelectedProgramId(null);
    setError(null);
    load();
  }

  async function endAssignment(assignment: AssignmentWithProgram) {
    const confirmed = await confirmAsync(
      'End program',
      `${client?.name || 'The client'} will lose access to ${assignment.program.name}.`,
      'End program'
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
        Current programs
      </Text>

      {activeAssignments.length === 0 ? (
        <Text style={[typeScale.body, { color: theme.textMuted }]}>
          No active program. Assign one to get {client?.name || 'this client'} training.
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
                  {assignment.program.name}
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

      {assigning ? (
        <View
          style={{
            backgroundColor: theme.surface1,
            borderRadius: radius.card,
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>Assign a program</Text>
          {programs.length === 0 ? (
            <>
              <Text style={[typeScale.body, { color: theme.textSecondary }]}>
                You have no programs yet. Build one first, then assign it here.
              </Text>
              <Button
                title="Create a program"
                variant="outline"
                onPress={() => router.push('/programs')}
              />
            </>
          ) : (
            <>
              <View style={{ gap: 8 }}>
                {programs.map((program) => {
                  const selected = selectedProgramId === program.id;
                  return (
                    <Pressable
                      key={program.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setSelectedProgramId(program.id)}
                      style={{
                        backgroundColor: selected ? theme.fillPrimary : theme.surface2,
                        borderWidth: 1,
                        borderColor: selected ? theme.fillPrimary : theme.border,
                        borderRadius: radius.control,
                        padding: 12,
                      }}
                    >
                      <Text
                        style={[
                          typeScale.body,
                          { color: selected ? theme.onFillPrimary : theme.textPrimary },
                        ]}
                      >
                        {program.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextField
                label="Duration (weeks)"
                value={weeks}
                onChangeText={setWeeks}
                keyboardType="number-pad"
                placeholder="6"
              />
              <Button
                title="Assign program"
                onPress={assignProgram}
                loading={submitting}
                disabled={!selectedProgramId}
              />
            </>
          )}
          <Button title="Cancel" variant="ghost" onPress={() => setAssigning(false)} />
        </View>
      ) : (
        <Button title="Assign a program" onPress={() => setAssigning(true)} />
      )}

      {pastAssignments.length > 0 && (
        <>
          <Text style={[typeScale.cardTitle, { color: theme.textPrimary, marginTop: 8 }]}>
            Past programs
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
                    {assignment.program.name}
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

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { radius, type as typeScale, useTheme } from '../../lib/theme';
import {
  WEEKDAY_LABELS,
  isoWeekday,
  type AssignmentWithProgram,
  type AssignmentWorkout,
  type ConnectionWithProfile,
} from '../../lib/types';
import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { Screen } from '../Screen';
import { TextField } from '../TextField';

type ConnectionRow = Omit<ConnectionWithProfile, 'profile'> & {
  trainer: ConnectionWithProfile['profile'];
};

type TodayState =
  | {
      kind: 'workout';
      workout: AssignmentWorkout;
      contextLine: string;
      exerciseCount: number;
    }
  | { kind: 'rest'; nextLabel: string | null };

export function ClientHome() {
  const { profile, signOut } = useAuth();
  const theme = useTheme();
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState<TodayState | null>(null);
  const [assignment, setAssignment] = useState<AssignmentWithProgram | null>(null);
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

  const loadToday = useCallback(async () => {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*, program:programs(id, name)')
      .eq('status', 'active')
      .order('starts_at', { ascending: false })
      .returns<AssignmentWithProgram[]>();
    const current = assignments?.[0] ?? null;
    setAssignment(current);
    if (!current) {
      setToday(null);
      return;
    }

    // The plan is the snapshot taken at assignment time, never the live library.
    const { data: workouts } = await supabase
      .from('assignment_workouts')
      .select('*')
      .eq('assignment_id', current.id)
      .order('position')
      .returns<AssignmentWorkout[]>();
    if (!workouts || workouts.length === 0) {
      setToday(null);
      return;
    }

    const planName = current.program?.name ?? 'Training plan';
    const scheduled = workouts.some((candidate) => candidate.weekday !== null);
    let workout: AssignmentWorkout | null = null;
    let contextLine = planName;

    if (scheduled) {
      // Weekday plan: show what's on today; otherwise it's a rest day.
      const today = isoWeekday(new Date());
      workout = workouts.find((candidate) => candidate.weekday === today) ?? null;
      if (workout?.weekday) {
        contextLine = `${planName} · ${WEEKDAY_LABELS[workout.weekday]}`;
      }
      if (!workout) {
        // Next scheduled day, searching forward from tomorrow and wrapping.
        let nextLabel: string | null = null;
        for (let offset = 1; offset <= 7 && !nextLabel; offset++) {
          const weekday = ((today - 1 + offset) % 7) + 1;
          const next = workouts.find((candidate) => candidate.weekday === weekday);
          if (next?.weekday) nextLabel = `${next.name} on ${WEEKDAY_LABELS[next.weekday]}`;
        }
        setToday({ kind: 'rest', nextLabel });
        return;
      }
    } else {
      // Unscheduled plan: cycle to the day after the last completed one.
      const { data: lastLog } = await supabase
        .from('workout_logs')
        .select('assignment_workout_id')
        .eq('assignment_id', current.id)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ assignment_workout_id: string | null }>();
      const lastIndex = workouts.findIndex(
        (candidate) => candidate.id === lastLog?.assignment_workout_id
      );
      const nextIndex = lastIndex >= 0 ? (lastIndex + 1) % workouts.length : 0;
      workout = workouts[nextIndex];
      contextLine = `${planName} · Day ${nextIndex + 1} of ${workouts.length}`;
    }

    const { count } = await supabase
      .from('assignment_exercises')
      .select('id', { count: 'exact', head: true })
      .eq('assignment_workout_id', workout.id);

    setToday({ kind: 'workout', workout, contextLine, exerciseCount: count ?? 0 });
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Re-check on focus so finishing a workout advances the Today card.
  useFocusEffect(
    useCallback(() => {
      loadToday();
    }, [loadToday])
  );

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
    loadToday();
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
          gap: 12,
        }}
      >
        {today?.kind === 'workout' && assignment ? (
          <>
            <View style={{ gap: 4 }}>
              <Text style={[typeScale.metadata, { color: theme.textMuted }]}>
                {today.contextLine}
              </Text>
              <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>
                {today.workout.name}
              </Text>
              <Text style={[typeScale.secondary, { color: theme.textSecondary }]}>
                {today.exerciseCount}{' '}
                {today.exerciseCount === 1 ? 'exercise' : 'exercises'}
              </Text>
            </View>
            <Button
              title="Start workout"
              onPress={() => router.push(`/log/${today.workout.id}`)}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/assignments/${assignment.id}`)}
              hitSlop={8}
              style={{ alignSelf: 'center' }}
            >
              <Text style={[typeScale.body, { color: theme.textSecondary }]}>
                View your week
              </Text>
            </Pressable>
          </>
        ) : today?.kind === 'rest' && assignment ? (
          <>
            <View style={{ gap: 4 }}>
              <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>
                Rest day
              </Text>
              <Text style={[typeScale.body, { color: theme.textSecondary }]}>
                {today.nextLabel
                  ? `Nothing scheduled today. Next up: ${today.nextLabel}.`
                  : 'Nothing scheduled today.'}
              </Text>
            </View>
            <Button
              title="View your week"
              variant="outline"
              onPress={() => router.push(`/assignments/${assignment.id}`)}
            />
          </>
        ) : (
          <View style={{ gap: 4 }}>
            <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>Today</Text>
            <Text style={[typeScale.body, { color: theme.textSecondary }]}>
              {assignment
                ? 'Your plan has no workouts yet. Check back once your trainer adds them.'
                : 'No workout programmed yet. Plans your trainer assigns will appear here.'}
            </Text>
          </View>
        )}
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

      {assignment && (
        <Text style={[typeScale.metadata, { color: theme.textMuted, textAlign: 'center' }]}>
          Plan expires {new Date(assignment.expires_at).toLocaleDateString()}
          {connections[0]?.trainer.name ? ` · Coached by ${connections[0].trainer.name}` : ''}
        </Text>
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

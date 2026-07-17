import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ViewStyle,
} from 'react-native';
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import { confirmAsync } from '../../../lib/confirm';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { radius, type as typeScale, useTheme } from '../../../lib/theme';
import type { AssignmentExerciseRow, AssignmentWorkout, SetLog } from '../../../lib/types';

type SetEntry = {
  weight: string;
  reps: string;
  loggedId: string | null;
};

type PrevSet = { weight: number | null; reps: number };

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Logs against the assignment snapshot (assignment_workouts), so the plan a
// client trains from is always the frozen copy their trainer assigned.
export default function LogWorkoutScreen() {
  // workoutId is an assignment_workouts id.
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const { profile } = useAuth();
  const theme = useTheme();

  const [workout, setWorkout] = useState<AssignmentWorkout | null>(null);
  const [rows, setRows] = useState<AssignmentExerciseRow[]>([]);
  // Set inputs keyed by workout_exercise row id, one entry per target set.
  const [entries, setEntries] = useState<Record<string, SetEntry[]>>({});
  // Previous session values keyed by exercise id, then 1-based set number.
  const [prev, setPrev] = useState<Record<string, Record<number, PrevSet>>>({});
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [rest, setRest] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);

  const startedAtRef = useRef(new Date());
  // The workout_log row is created lazily on the first completed set.
  const logIdRef = useRef<string | null>(null);
  const logPromiseRef = useRef<Promise<string | null> | null>(null);

  const load = useCallback(async () => {
    if (!workoutId) return;
    const [workoutRes, exercisesRes] = await Promise.all([
      supabase
        .from('assignment_workouts')
        .select('*')
        .eq('id', workoutId)
        .maybeSingle<AssignmentWorkout>(),
      supabase
        .from('assignment_exercises')
        .select('*, exercise:exercises(id, name, equipment, primary_muscles)')
        .eq('assignment_workout_id', workoutId)
        .order('position')
        .returns<AssignmentExerciseRow[]>(),
    ]);
    if (workoutRes.error || !workoutRes.data) {
      setError(workoutRes.error?.message ?? 'This workout is no longer available.');
      return;
    }
    setWorkout(workoutRes.data);
    const exerciseRows = exercisesRes.data ?? [];
    setRows(exerciseRows);
    setEntries(
      Object.fromEntries(
        exerciseRows.map((row) => [
          row.id,
          Array.from({ length: row.target_sets }, () => ({
            weight: '',
            reps: '',
            loggedId: null,
          })),
        ])
      )
    );

    // Previous session's numbers: newest completed log per exercise. RLS
    // already scopes workout_logs to the signed-in client.
    const exerciseIds = exerciseRows.map((row) => row.exercise_id);
    if (exerciseIds.length > 0) {
      const { data: recentLogs } = await supabase
        .from('workout_logs')
        .select('id')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(20)
        .returns<{ id: string }[]>();
      const recentIds = (recentLogs ?? []).map((log) => log.id);
      if (recentIds.length > 0) {
        const { data: prevSets } = await supabase
          .from('set_logs')
          .select('exercise_id, set_number, weight, reps, workout_log_id')
          .in('exercise_id', exerciseIds)
          .in('workout_log_id', recentIds)
          .returns<Pick<SetLog, 'exercise_id' | 'set_number' | 'weight' | 'reps' | 'workout_log_id'>[]>();
        const logRank = new Map(recentIds.map((logId, rank) => [logId, rank]));
        const byExercise: Record<string, Record<number, PrevSet>> = {};
        const sourceLog: Record<string, string> = {};
        const sorted = [...(prevSets ?? [])].sort(
          (a, b) => (logRank.get(a.workout_log_id) ?? 0) - (logRank.get(b.workout_log_id) ?? 0)
        );
        for (const set of sorted) {
          // Keep sets only from each exercise's most recent session.
          sourceLog[set.exercise_id] ??= set.workout_log_id;
          if (sourceLog[set.exercise_id] !== set.workout_log_id) continue;
          (byExercise[set.exercise_id] ??= {})[set.set_number] = {
            weight: set.weight,
            reps: set.reps,
          };
        }
        setPrev(byExercise);
      }
    }
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Timeout chain instead of an interval so restarts (new set, ±15s) reset cleanly.
  useEffect(() => {
    if (rest === null) return;
    if (rest <= 0) {
      const timeout = setTimeout(() => setRest(null), 1500);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(() => setRest((current) => (current ?? 1) - 1), 1000);
    return () => clearTimeout(timeout);
  }, [rest]);

  function ensureLog(): Promise<string | null> {
    if (logIdRef.current) return Promise.resolve(logIdRef.current);
    logPromiseRef.current ??= (async () => {
      if (!profile || !workout) return null;
      const { data, error: insertError } = await supabase
        .from('workout_logs')
        .insert({
          client_id: profile.id,
          assignment_id: workout.assignment_id,
          assignment_workout_id: workout.id,
          workout_id: workout.source_workout_id,
          workout_name: workout.name,
          started_at: startedAtRef.current.toISOString(),
        })
        .select('id')
        .single<{ id: string }>();
      if (insertError || !data) {
        setError(insertError?.message ?? 'Could not start the workout log.');
        logPromiseRef.current = null;
        return null;
      }
      logIdRef.current = data.id;
      return data.id;
    })();
    return logPromiseRef.current;
  }

  function updateEntry(rowId: string, index: number, patch: Partial<SetEntry>) {
    setEntries((current) => ({
      ...current,
      [rowId]: current[rowId].map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  }

  async function toggleSet(row: AssignmentExerciseRow, index: number) {
    const entry = entries[row.id]?.[index];
    if (!entry) return;

    if (entry.loggedId) {
      const { error: deleteError } = await supabase
        .from('set_logs')
        .delete()
        .eq('id', entry.loggedId);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      updateEntry(row.id, index, { loggedId: null });
      return;
    }

    // Empty inputs fall back to last session's numbers (shown as placeholders),
    // then to the prescription's leading rep count.
    const prevSet = prev[row.exercise_id]?.[index + 1];
    const weightInput = Number.parseFloat(entry.weight.replace(',', '.'));
    const weight = Number.isFinite(weightInput) ? weightInput : (prevSet?.weight ?? null);
    const repsInput = Number.parseInt(entry.reps, 10);
    const targetReps = Number.parseInt(row.target_reps, 10);
    const reps = Number.isFinite(repsInput)
      ? repsInput
      : (prevSet?.reps ?? (Number.isFinite(targetReps) ? targetReps : null));
    if (reps === null) {
      setError(`Enter reps for ${row.exercise.name}, set ${index + 1}.`);
      return;
    }

    const logId = await ensureLog();
    if (!logId) return;
    const { data, error: insertError } = await supabase
      .from('set_logs')
      .insert({
        workout_log_id: logId,
        exercise_id: row.exercise_id,
        set_number: index + 1,
        weight,
        reps,
      })
      .select('id')
      .single<{ id: string }>();
    if (insertError || !data) {
      setError(insertError?.message ?? 'Could not save the set.');
      return;
    }
    setError(null);
    updateEntry(row.id, index, {
      loggedId: data.id,
      weight: weight === null ? '' : String(weight),
      reps: String(reps),
    });
    if (row.rest_seconds > 0) setRest(row.rest_seconds);
  }

  async function finishWorkout() {
    const logId = logIdRef.current;
    if (!logId) {
      const leave = await confirmAsync(
        'Leave workout',
        'No sets were logged. Nothing will be saved.',
        'Leave'
      );
      if (leave) router.back();
      return;
    }
    setFinishing(true);
    const { error: updateError } = await supabase
      .from('workout_logs')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', logId);
    setFinishing(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.back();
  }

  const loggedCount = Object.values(entries)
    .flat()
    .filter((entry) => entry.loggedId).length;
  const unitLabel = profile?.units ?? 'kg';

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={finishWorkout} hitSlop={8}>
          <Text style={[typeScale.body, { color: theme.textSecondary }]}>‹ Back</Text>
        </Pressable>
        <Text style={[typeScale.body, styles.mono, { color: theme.textSecondary }]}>
          {formatClock(elapsed)}
        </Text>
      </View>

      <Text style={[typeScale.screenTitle, { color: theme.textPrimary }]}>
        {workout?.name ?? 'Workout'}
      </Text>

      {error && (
        <View style={{ backgroundColor: theme.danger.bg, borderRadius: radius.control, padding: 12 }}>
          <Text style={[typeScale.body, { color: theme.danger.text }]}>{error}</Text>
        </View>
      )}

      {rest !== null && (
        <View
          style={{
            backgroundColor: theme.surface1,
            borderRadius: radius.card,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => setRest((current) => Math.max(0, (current ?? 0) - 15))}
            hitSlop={8}
          >
            <Text style={[typeScale.cardTitle, { color: theme.textSecondary }]}>−15s</Text>
          </Pressable>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={[typeScale.metadata, { color: theme.textMuted }]}>Rest</Text>
            <Text
              style={[
                styles.mono,
                {
                  fontSize: 24,
                  fontWeight: '500',
                  color: rest <= 0 ? theme.success.text : theme.textPrimary,
                },
              ]}
            >
              {formatClock(Math.max(0, rest))}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRest((current) => (current ?? 0) + 15)}
            hitSlop={8}
          >
            <Text style={[typeScale.cardTitle, { color: theme.textSecondary }]}>+15s</Text>
          </Pressable>
        </View>
      )}

      {rows.map((row) => (
        <View
          key={row.id}
          style={{
            backgroundColor: theme.surface2,
            borderRadius: radius.card,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.border,
            padding: 16,
            gap: 12,
          }}
        >
          <View style={{ gap: 2 }}>
            <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>
              {row.exercise.name}
            </Text>
            <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
              {row.target_sets} × {row.target_reps} · rest {row.rest_seconds}s
              {row.target_rpe !== null ? ` · RPE ${row.target_rpe}` : ''}
            </Text>
          </View>

          {row.notes && (
            <View
              style={{
                backgroundColor: theme.accent.bg,
                borderRadius: radius.control,
                paddingHorizontal: 8,
                paddingVertical: 4,
                alignSelf: 'flex-start',
              }}
            >
              <Text style={[typeScale.secondary, { color: theme.accent.text }]}>
                {row.notes}
              </Text>
            </View>
          )}

          <View style={styles.setHeaderRow}>
            <Text style={[typeScale.metadata, styles.setCol, { color: theme.textMuted }]}>
              Set
            </Text>
            <Text style={[typeScale.metadata, styles.prevCol, { color: theme.textMuted }]}>
              Previous
            </Text>
            <Text style={[typeScale.metadata, styles.inputCol, { color: theme.textMuted }]}>
              {unitLabel}
            </Text>
            <Text style={[typeScale.metadata, styles.inputCol, { color: theme.textMuted }]}>
              Reps
            </Text>
            <View style={styles.checkCol} />
          </View>

          {(entries[row.id] ?? []).map((entry, index) => {
            const prevSet = prev[row.exercise_id]?.[index + 1];
            const done = entry.loggedId !== null;
            return (
              <View key={index} style={styles.setRow}>
                <Text style={[typeScale.body, styles.setCol, { color: theme.textSecondary }]}>
                  {index + 1}
                </Text>
                <Text
                  style={[typeScale.secondary, styles.prevCol, { color: theme.textMuted }]}
                  numberOfLines={1}
                >
                  {prevSet
                    ? `${prevSet.weight === null ? '—' : prevSet.weight} × ${prevSet.reps}`
                    : '—'}
                </Text>
                <SetInput
                  column={styles.inputCol}
                  value={entry.weight}
                  placeholder={prevSet?.weight === null ? '—' : (prevSet?.weight?.toString() ?? '')}
                  keyboardType="decimal-pad"
                  editable={!done}
                  onChangeText={(value) => updateEntry(row.id, index, { weight: value })}
                />
                <SetInput
                  column={styles.inputCol}
                  value={entry.reps}
                  placeholder={prevSet?.reps.toString() ?? row.target_reps}
                  keyboardType="number-pad"
                  editable={!done}
                  onChangeText={(value) => updateEntry(row.id, index, { reps: value })}
                />
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  onPress={() => toggleSet(row, index)}
                  style={[
                    styles.checkCol,
                    styles.check,
                    {
                      backgroundColor: done ? theme.success.bg : theme.surface1,
                      borderColor: done ? theme.success.text : theme.borderStrong,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typeScale.cardTitle,
                      { color: done ? theme.success.text : theme.textMuted },
                    ]}
                  >
                    ✓
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}

      {rows.length > 0 && (
        <Button
          title={loggedCount > 0 ? `Finish workout (${loggedCount} sets)` : 'Finish workout'}
          onPress={finishWorkout}
          loading={finishing}
        />
      )}
    </Screen>
  );
}

function SetInput({
  column,
  value,
  placeholder,
  keyboardType,
  editable,
  onChangeText,
}: {
  column: ViewStyle;
  value: string;
  placeholder: string;
  keyboardType: KeyboardTypeOptions;
  editable: boolean;
  onChangeText: (value: string) => void;
}) {
  const theme = useTheme();
  return (
    <TextInput
      value={value}
      placeholder={placeholder}
      placeholderTextColor={theme.textMuted}
      keyboardType={keyboardType}
      editable={editable}
      onChangeText={onChangeText}
      style={[
        column,
        styles.input,
        {
          backgroundColor: editable ? theme.surface1 : 'transparent',
          color: theme.textPrimary,
          borderColor: theme.border,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  mono: {
    fontVariant: ['tabular-nums'],
  },
  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setCol: {
    width: 28,
  },
  prevCol: {
    flex: 1,
  },
  inputCol: {
    width: 64,
  },
  checkCol: {
    width: 44,
  },
  check: {
    height: 44,
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    height: 44,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    fontSize: 16,
    textAlign: 'center',
  },
});

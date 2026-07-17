import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../../components/Button';
import { Screen } from '../../../../components/Screen';
import { TextField } from '../../../../components/TextField';
import { useAuth } from '../../../../lib/auth';
import { supabase } from '../../../../lib/supabase';
import { radius, type as typeScale, useTheme } from '../../../../lib/theme';
import {
  WEEKDAY_LABELS,
  WEEKDAYS,
  type ExpiryPolicy,
  type Profile,
  type Program,
  type ProgramWorkoutRow,
  type Weekday,
  type Workout,
} from '../../../../lib/types';

type ScheduleItem = {
  workout_id: string;
  name: string;
  weekday: Weekday | null;
};

const EXPIRY_OPTIONS: { value: ExpiryPolicy; label: string }[] = [
  { value: 'archive_and_pdf', label: 'Archive + PDF' },
  { value: 'archive', label: 'Archive only' },
  { value: 'auto_pdf', label: 'PDF only' },
  { value: 'remove', label: 'Remove fully' },
];

// Assignment flow: pick a template or individual workouts, arrange this
// client's week, set duration + expiry policy, confirm. Confirming snapshots
// workout content into assignment_workouts/assignment_exercises so later
// library edits never change this client's plan.
// TODO(re-snapshotting): no way yet to push a workout edit into an existing
// assignment; trainers re-assign instead. Revisit later.
export default function AssignScreen() {
  const { id: clientId } = useLocalSearchParams<{ id: string }>();
  const { profile: trainer } = useAuth();
  const theme = useTheme();

  const [client, setClient] = useState<Pick<Profile, 'id' | 'name'> | null>(null);
  const [programs, setPrograms] = useState<Pick<Program, 'id' | 'name'>[]>([]);
  const [library, setLibrary] = useState<Pick<Workout, 'id' | 'name'>[]>([]);
  const [programId, setProgramId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [weeks, setWeeks] = useState('6');
  const [expiryPolicy, setExpiryPolicy] = useState<ExpiryPolicy>('archive_and_pdf');
  const [pickingWorkout, setPickingWorkout] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    const [clientRes, programRes, libraryRes] = await Promise.all([
      supabase.from('profiles').select('id, name').eq('id', clientId).maybeSingle<Profile>(),
      supabase.from('programs').select('id, name').order('name'),
      supabase.from('workouts').select('id, name').order('name').returns<Workout[]>(),
    ]);
    setError(clientRes.error?.message ?? programRes.error?.message ?? libraryRes.error?.message ?? null);
    setClient(clientRes.data);
    setPrograms(programRes.data ?? []);
    setLibrary(libraryRes.data ?? []);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  // A template pre-fills the schedule; the trainer tweaks days before confirming.
  async function applyProgram(program: Pick<Program, 'id' | 'name'>) {
    const { data, error: loadError } = await supabase
      .from('program_workouts')
      .select('*, workout:workouts(id, name)')
      .eq('program_id', program.id)
      .order('position')
      .returns<ProgramWorkoutRow[]>();
    if (loadError) {
      setError(loadError.message);
      return;
    }
    if (!data || data.length === 0) {
      setError(`${program.name} has no workouts yet.`);
      return;
    }
    setError(null);
    setProgramId(program.id);
    setSchedule(
      data.map((row) => ({
        workout_id: row.workout_id,
        name: row.workout.name,
        weekday: row.weekday,
      }))
    );
  }

  function addWorkout(workout: Pick<Workout, 'id' | 'name'>) {
    setSchedule((current) => [
      ...current,
      { workout_id: workout.id, name: workout.name, weekday: null },
    ]);
    setPickingWorkout(false);
  }

  function setItemWeekday(index: number, weekday: Weekday | null) {
    setSchedule((current) =>
      current.map((item, i) => (i === index ? { ...item, weekday } : item))
    );
  }

  function removeItem(index: number) {
    setSchedule((current) => current.filter((_, i) => i !== index));
  }

  async function confirm() {
    if (!trainer || !clientId || schedule.length === 0) return;
    const parsedWeeks = Number.parseInt(weeks, 10);
    if (!Number.isFinite(parsedWeeks) || parsedWeeks < 1 || parsedWeeks > 52) {
      setError('Duration must be between 1 and 52 weeks.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const expiresAt = new Date(Date.now() + parsedWeeks * 7 * 24 * 60 * 60 * 1000);
    const { data: assignment, error: assignmentError } = await supabase
      .from('assignments')
      .insert({
        program_id: programId,
        trainer_id: trainer.id,
        client_id: clientId,
        expires_at: expiresAt.toISOString(),
        expiry_policy: expiryPolicy,
      })
      .select('id')
      .single<{ id: string }>();
    if (assignmentError || !assignment) {
      setSubmitting(false);
      setError(assignmentError?.message ?? 'Could not create the assignment.');
      return;
    }

    // Snapshot: copy each scheduled workout and its prescriptions.
    const { data: workoutRows, error: workoutsError } = await supabase
      .from('assignment_workouts')
      .insert(
        schedule.map((item, index) => ({
          assignment_id: assignment.id,
          source_workout_id: item.workout_id,
          name: item.name,
          weekday: item.weekday,
          position: index,
        }))
      )
      .select('id, source_workout_id, position')
      .returns<{ id: string; source_workout_id: string; position: number }[]>();
    if (workoutsError || !workoutRows) {
      setSubmitting(false);
      setError(workoutsError?.message ?? 'Could not copy workouts.');
      return;
    }

    const { data: exercises, error: exercisesError } = await supabase
      .from('workout_exercises')
      .select('*')
      .in('workout_id', schedule.map((item) => item.workout_id));
    if (exercisesError) {
      setSubmitting(false);
      setError(exercisesError.message);
      return;
    }
    const copies = workoutRows.flatMap((row) =>
      (exercises ?? [])
        .filter((exercise) => exercise.workout_id === row.source_workout_id)
        .map((exercise) => ({
          assignment_workout_id: row.id,
          exercise_id: exercise.exercise_id,
          position: exercise.position,
          target_sets: exercise.target_sets,
          target_reps: exercise.target_reps,
          target_weight_note: exercise.target_weight_note,
          target_rpe: exercise.target_rpe,
          rest_seconds: exercise.rest_seconds,
          notes: exercise.notes,
        }))
    );
    if (copies.length > 0) {
      const { error: copyError } = await supabase.from('assignment_exercises').insert(copies);
      if (copyError) {
        setSubmitting(false);
        setError(copyError.message);
        return;
      }
    }

    setSubmitting(false);
    router.back();
  }

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
        <Text style={[typeScale.body, { color: theme.textSecondary }]}>
          ‹ {client?.name || 'Client'}
        </Text>
      </Pressable>

      <Text style={[typeScale.screenTitle, { color: theme.textPrimary }]}>
        Assign to {client?.name || 'client'}
      </Text>

      {error && (
        <View style={{ backgroundColor: theme.danger.bg, borderRadius: radius.control, padding: 12 }}>
          <Text style={[typeScale.body, { color: theme.danger.text }]}>{error}</Text>
        </View>
      )}

      {schedule.length === 0 && (
        <>
          {programs.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={[typeScale.metadata, { color: theme.textMuted }]}>
                Start from a program
              </Text>
              <View style={{ gap: 8 }}>
                {programs.map((program) => (
                  <Pressable
                    key={program.id}
                    accessibilityRole="button"
                    onPress={() => applyProgram(program)}
                    style={{
                      backgroundColor: theme.surface2,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: radius.control,
                      padding: 12,
                    }}
                  >
                    <Text style={[typeScale.body, { color: theme.textPrimary }]}>
                      {program.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <Text style={[typeScale.metadata, { color: theme.textMuted }]}>
            {programs.length > 0 ? 'Or pick workouts one by one' : 'Pick workouts'}
          </Text>
        </>
      )}

      {schedule.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={[typeScale.metadata, { color: theme.textMuted }]}>
            {client?.name ? `${client.name}'s week` : 'Weekly schedule'} — no day means the
            client cycles through in order
          </Text>
          <View
            style={{
              backgroundColor: theme.surface2,
              borderRadius: radius.card,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.border,
            }}
          >
            {schedule.map((item, index) => (
              <View
                key={`${item.workout_id}-${index}`}
                style={[
                  { padding: 16, gap: 10 },
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.border,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={[typeScale.cardTitle, { flex: 1, color: theme.textPrimary }]}>
                    {item.name}
                  </Text>
                  <Pressable onPress={() => removeItem(index)} hitSlop={8}>
                    <Text style={[typeScale.secondary, { color: theme.danger.text }]}>
                      Remove
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.weekdayRow}>
                  {WEEKDAYS.map((weekday) => {
                    const selected = item.weekday === weekday;
                    return (
                      <Pressable
                        key={weekday}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setItemWeekday(index, selected ? null : weekday)}
                        style={[
                          styles.weekdayPill,
                          {
                            backgroundColor: selected ? theme.fillPrimary : theme.surface1,
                            borderColor: selected ? theme.fillPrimary : theme.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            typeScale.metadata,
                            { color: selected ? theme.onFillPrimary : theme.textSecondary },
                          ]}
                        >
                          {WEEKDAY_LABELS[weekday]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {pickingWorkout ? (
        <View
          style={{
            backgroundColor: theme.surface1,
            borderRadius: radius.card,
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>Add a workout</Text>
          {library.length === 0 ? (
            <>
              <Text style={[typeScale.body, { color: theme.textSecondary }]}>
                Your library is empty. Create workouts first.
              </Text>
              <Button
                title="Open workout library"
                variant="outline"
                onPress={() => router.push('/workouts')}
              />
            </>
          ) : (
            <View style={{ gap: 8 }}>
              {library.map((workout) => (
                <Pressable
                  key={workout.id}
                  accessibilityRole="button"
                  onPress={() => addWorkout(workout)}
                  style={{
                    backgroundColor: theme.surface2,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: radius.control,
                    padding: 12,
                  }}
                >
                  <Text style={[typeScale.body, { color: theme.textPrimary }]}>
                    {workout.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <Button title="Cancel" variant="ghost" onPress={() => setPickingWorkout(false)} />
        </View>
      ) : (
        <Button
          title="Add a workout"
          variant="outline"
          onPress={() => setPickingWorkout(true)}
        />
      )}

      {schedule.length > 0 && (
        <>
          <TextField
            label="Duration (weeks)"
            value={weeks}
            onChangeText={setWeeks}
            keyboardType="number-pad"
            placeholder="6"
          />

          <View style={{ gap: 6 }}>
            <Text style={[typeScale.secondary, { color: theme.textSecondary }]}>
              When it expires
            </Text>
            <View style={styles.weekdayRow}>
              {EXPIRY_OPTIONS.map((option) => {
                const selected = expiryPolicy === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setExpiryPolicy(option.value)}
                    style={[
                      styles.policyPill,
                      {
                        backgroundColor: selected ? theme.fillPrimary : theme.surface1,
                        borderColor: selected ? theme.fillPrimary : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typeScale.metadata,
                        {
                          color: selected ? theme.onFillPrimary : theme.textSecondary,
                          textAlign: 'center',
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Button
            title="Assign plan"
            onPress={confirm}
            loading={submitting}
            disabled={schedule.length === 0}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: 6,
  },
  weekdayPill: {
    flex: 1,
    minHeight: 32,
    borderWidth: 1,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  policyPill: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});

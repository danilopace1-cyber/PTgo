import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import { supabase } from '../../../lib/supabase';
import { radius, type as typeScale, useTheme } from '../../../lib/theme';
import {
  WEEKDAY_LABELS,
  isoWeekday,
  type AssignmentExerciseRow,
  type AssignmentWithProgram,
  type AssignmentWorkout,
} from '../../../lib/types';

// The client's week: every workout in the plan, day by day. Any workout can
// be started on any day — the schedule is a suggestion, not a lock.
export default function AssignmentWeekScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [assignment, setAssignment] = useState<AssignmentWithProgram | null>(null);
  const [workouts, setWorkouts] = useState<AssignmentWorkout[]>([]);
  const [exercisesByWorkout, setExercisesByWorkout] = useState<
    Record<string, AssignmentExerciseRow[]>
  >({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: assignmentRow, error: assignmentError } = await supabase
      .from('assignments')
      .select('*, program:programs(id, name)')
      .eq('id', id)
      .maybeSingle<AssignmentWithProgram>();
    if (assignmentError || !assignmentRow) {
      setError(assignmentError?.message ?? 'This plan is no longer available.');
      setLoaded(true);
      return;
    }
    setAssignment(assignmentRow);

    const { data: workoutRows, error: workoutError } = await supabase
      .from('assignment_workouts')
      .select('*')
      .eq('assignment_id', assignmentRow.id)
      .order('position')
      .returns<AssignmentWorkout[]>();
    if (workoutError) {
      setError(workoutError.message);
      setLoaded(true);
      return;
    }
    // Scheduled days in week order first, unscheduled ("anytime") last.
    const sorted = [...(workoutRows ?? [])].sort((a, b) => {
      if (a.weekday === b.weekday) return a.position - b.position;
      if (a.weekday === null) return 1;
      if (b.weekday === null) return -1;
      return a.weekday - b.weekday;
    });
    setWorkouts(sorted);

    const workoutIds = sorted.map((workout) => workout.id);
    if (workoutIds.length > 0) {
      const { data: exerciseRows, error: exerciseError } = await supabase
        .from('assignment_exercises')
        .select('*, exercise:exercises(id, name, equipment, primary_muscles)')
        .in('assignment_workout_id', workoutIds)
        .order('position')
        .returns<AssignmentExerciseRow[]>();
      if (exerciseError) {
        setError(exerciseError.message);
      } else {
        const grouped: Record<string, AssignmentExerciseRow[]> = {};
        for (const row of exerciseRows ?? []) {
          (grouped[row.assignment_workout_id] ??= []).push(row);
        }
        setExercisesByWorkout(grouped);
      }
    }
    setLoaded(true);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const archived = assignment?.status === 'archived';
  const today = isoWeekday(new Date());

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
        <Text style={[typeScale.body, { color: theme.textSecondary }]}>‹ Home</Text>
      </Pressable>

      <Text style={[typeScale.screenTitle, { color: theme.textPrimary }]}>
        {assignment?.program?.name ?? 'Your week'}
      </Text>

      {assignment && (
        <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
          {archived
            ? 'Archived — read-only copy of a finished plan.'
            : `Active until ${new Date(assignment.expires_at).toLocaleDateString()}`}
        </Text>
      )}

      {error && (
        <View style={{ backgroundColor: theme.danger.bg, borderRadius: radius.control, padding: 12 }}>
          <Text style={[typeScale.body, { color: theme.danger.text }]}>{error}</Text>
        </View>
      )}

      {loaded && !error && workouts.length === 0 && (
        <Text style={[typeScale.body, { color: theme.textMuted, paddingVertical: 8 }]}>
          No workouts in this plan yet.
        </Text>
      )}

      {workouts.map((workout) => {
        const rows = exercisesByWorkout[workout.id] ?? [];
        const isToday = workout.weekday === today;
        return (
          <View key={workout.id} style={{ gap: 8 }}>
            <View style={styles.dayHeader}>
              <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>
                {workout.name}
              </Text>
              {workout.weekday !== null ? (
                <View
                  style={{
                    backgroundColor: isToday ? theme.success.bg : theme.surface1,
                    borderRadius: radius.pill,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={[
                      typeScale.metadata,
                      { color: isToday ? theme.success.text : theme.textMuted },
                    ]}
                  >
                    {isToday ? 'Today' : WEEKDAY_LABELS[workout.weekday]}
                  </Text>
                </View>
              ) : (
                <Text style={[typeScale.metadata, { color: theme.textMuted }]}>Anytime</Text>
              )}
            </View>
            <View
              style={{
                backgroundColor: theme.surface2,
                borderRadius: radius.card,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.border,
              }}
            >
              {rows.length === 0 && (
                <Text style={[typeScale.body, { color: theme.textMuted, padding: 16 }]}>
                  No exercises yet.
                </Text>
              )}
              {rows.map((row, index) => (
                <View
                  key={row.id}
                  style={[
                    styles.listRow,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: theme.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[typeScale.body, { color: theme.textPrimary }]}>
                      {row.exercise.name}
                    </Text>
                    <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
                      {row.target_sets} × {row.target_reps} · rest {row.rest_seconds}s
                      {row.target_rpe !== null ? ` · RPE ${row.target_rpe}` : ''}
                    </Text>
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
                  </View>
                </View>
              ))}
              {!archived && rows.length > 0 && (
                <View style={{ padding: 12 }}>
                  <Button
                    title={`Start ${workout.name}`}
                    variant="outline"
                    onPress={() => router.push(`/log/${workout.id}`)}
                  />
                </View>
              )}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
});

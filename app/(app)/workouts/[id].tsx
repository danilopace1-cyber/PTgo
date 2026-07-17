import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import { TextField } from '../../../components/TextField';
import { confirmAsync } from '../../../lib/confirm';
import { supabase } from '../../../lib/supabase';
import { radius, type as typeScale, useTheme } from '../../../lib/theme';
import type { Exercise, Workout, WorkoutExerciseRow } from '../../../lib/types';

type SearchResult = Pick<Exercise, 'id' | 'name' | 'equipment' | 'primary_muscles'>;

// Builder for one reusable library workout. Assigned copies are snapshots,
// so edits here never change a client's active plan.
export default function WorkoutBuilderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [workout, setWorkout] = useState<Pick<Workout, 'id' | 'name'> | null>(null);
  const [exercises, setExercises] = useState<WorkoutExerciseRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ sets: '3', reps: '8', rest: '90', rpe: '', notes: '' });
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadWorkout = useCallback(async () => {
    if (!id) return;
    const { data, error: loadError } = await supabase
      .from('workouts')
      .select('id, name')
      .eq('id', id)
      .maybeSingle<Workout>();
    if (loadError) setError(loadError.message);
    setWorkout(data);
  }, [id]);

  const loadExercises = useCallback(async () => {
    if (!id) return;
    const { data, error: loadError } = await supabase
      .from('workout_exercises')
      .select('*, exercise:exercises(id, name, equipment, primary_muscles)')
      .eq('workout_id', id)
      .order('position')
      .returns<WorkoutExerciseRow[]>();
    if (loadError) setError(loadError.message);
    setExercises(data ?? []);
  }, [id]);

  useEffect(() => {
    loadWorkout();
    loadExercises();
  }, [loadWorkout, loadExercises]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('exercises')
        .select('id, name, equipment, primary_muscles')
        .ilike('name', `%${query}%`)
        .order('name')
        .limit(20)
        .returns<SearchResult[]>();
      if (!cancelled) setResults(data ?? []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  async function addExercise(result: SearchResult) {
    if (!id) return;
    const { error: insertError } = await supabase.from('workout_exercises').insert({
      workout_id: id,
      exercise_id: result.id,
      position: exercises.length,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSearch('');
    setResults([]);
    loadExercises();
  }

  function openEditor(row: WorkoutExerciseRow) {
    setExpandedId(row.id);
    setDraft({
      sets: String(row.target_sets),
      reps: row.target_reps,
      rest: String(row.rest_seconds),
      rpe: row.target_rpe === null ? '' : String(row.target_rpe),
      notes: row.notes ?? '',
    });
  }

  async function saveEditor(row: WorkoutExerciseRow) {
    const sets = Number.parseInt(draft.sets, 10);
    const rest = Number.parseInt(draft.rest, 10);
    const rpeText = draft.rpe.trim().replace(',', '.');
    const rpe = rpeText ? Number.parseFloat(rpeText) : null;
    if (!Number.isFinite(sets) || sets < 1 || sets > 20) {
      setError('Sets must be between 1 and 20.');
      return;
    }
    if (!Number.isFinite(rest) || rest < 0 || rest > 3600) {
      setError('Rest must be between 0 and 3600 seconds.');
      return;
    }
    if (rpe !== null && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) {
      setError('RPE must be between 1 and 10.');
      return;
    }
    const { error: updateError } = await supabase
      .from('workout_exercises')
      .update({
        target_sets: sets,
        target_reps: draft.reps.trim() || '8',
        rest_seconds: rest,
        target_rpe: rpe,
        notes: draft.notes.trim() || null,
      })
      .eq('id', row.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setError(null);
    setExpandedId(null);
    loadExercises();
  }

  async function removeExercise(row: WorkoutExerciseRow) {
    const { error: deleteError } = await supabase
      .from('workout_exercises')
      .delete()
      .eq('id', row.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setExpandedId(null);
    loadExercises();
  }

  async function deleteWorkout() {
    if (!workout) return;
    const confirmed = await confirmAsync(
      'Delete workout',
      `${workout.name} will be removed from your library and from any program templates using it. Clients' assigned copies are unaffected.`,
      'Delete'
    );
    if (!confirmed) return;
    const { error: deleteError } = await supabase.from('workouts').delete().eq('id', workout.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.back();
  }

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
        <Text style={[typeScale.body, { color: theme.textSecondary }]}>‹ Library</Text>
      </Pressable>

      <Text style={[typeScale.screenTitle, { color: theme.textPrimary }]}>
        {workout?.name ?? 'Workout'}
      </Text>
      <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
        Edits apply to future assignments only; already-assigned copies stay frozen.
      </Text>

      {error && (
        <View style={{ backgroundColor: theme.danger.bg, borderRadius: radius.control, padding: 12 }}>
          <Text style={[typeScale.body, { color: theme.danger.text }]}>{error}</Text>
        </View>
      )}

      {exercises.length === 0 ? (
        <Text style={[typeScale.body, { color: theme.textMuted, paddingVertical: 8 }]}>
          No exercises yet. Search the library below to add some.
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
          {exercises.map((row, index) => {
            const expanded = expandedId === row.id;
            return (
              <View
                key={row.id}
                style={
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.border,
                  }
                }
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() => (expanded ? setExpandedId(null) : openEditor(row))}
                  style={({ pressed }) => [styles.listRow, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>
                      {row.exercise.name}
                    </Text>
                    <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
                      {row.target_sets} × {row.target_reps} · rest {row.rest_seconds}s
                      {row.target_rpe !== null ? ` · RPE ${row.target_rpe}` : ''}
                      {row.notes ? ` · ${row.notes}` : ''}
                    </Text>
                  </View>
                  <Text style={[typeScale.cardTitle, { color: theme.textMuted }]}>
                    {expanded ? '˄' : '˅'}
                  </Text>
                </Pressable>

                {expanded && (
                  <View style={styles.editor}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <TextField
                          label="Sets"
                          value={draft.sets}
                          onChangeText={(value) => setDraft({ ...draft, sets: value })}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextField
                          label="Reps"
                          value={draft.reps}
                          onChangeText={(value) => setDraft({ ...draft, reps: value })}
                          placeholder="8-12"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextField
                          label="Rest (s)"
                          value={draft.rest}
                          onChangeText={(value) => setDraft({ ...draft, rest: value })}
                          keyboardType="number-pad"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextField
                          label="RPE"
                          value={draft.rpe}
                          onChangeText={(value) => setDraft({ ...draft, rpe: value })}
                          keyboardType="decimal-pad"
                          placeholder="8"
                        />
                      </View>
                    </View>
                    <TextField
                      label="Coach note"
                      value={draft.notes}
                      onChangeText={(value) => setDraft({ ...draft, notes: value })}
                      placeholder="e.g. slow eccentric, 3s down"
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button
                        title="Remove"
                        variant="ghost"
                        danger
                        onPress={() => removeExercise(row)}
                        style={{ flex: 1 }}
                      />
                      <Button
                        title="Save"
                        variant="outline"
                        onPress={() => saveEditor(row)}
                        style={{ flex: 1 }}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      <TextField
        label="Add exercise"
        value={search}
        onChangeText={setSearch}
        placeholder="Search the library, e.g. squat"
        autoCapitalize="none"
      />

      {results.length > 0 && (
        <View
          style={{
            backgroundColor: theme.surface2,
            borderRadius: radius.card,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.border,
          }}
        >
          {results.map((result, index) => (
            <Pressable
              key={result.id}
              accessibilityRole="button"
              onPress={() => addExercise(result)}
              style={({ pressed }) => [
                styles.listRow,
                { opacity: pressed ? 0.7 : 1 },
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.border,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[typeScale.body, { color: theme.textPrimary }]}>
                  {result.name}
                </Text>
                <Text style={[typeScale.metadata, { color: theme.textMuted }]}>
                  {[result.primary_muscles[0], result.equipment].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={[typeScale.body, { color: theme.textSecondary }]}>Add</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Button title="Delete workout" variant="ghost" danger onPress={deleteWorkout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  editor: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
});

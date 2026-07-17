import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import { confirmAsync } from '../../../lib/confirm';
import { supabase } from '../../../lib/supabase';
import { radius, type as typeScale, useTheme } from '../../../lib/theme';
import {
  WEEKDAY_LABELS,
  WEEKDAYS,
  type Program,
  type ProgramWorkoutRow,
  type Weekday,
  type Workout,
} from '../../../lib/types';

// Template editor: a program is a saved bundle of library workouts plus a
// default weekly layout. Assigning pre-fills the per-client schedule.
export default function ProgramTemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [program, setProgram] = useState<Pick<Program, 'id' | 'name'> | null>(null);
  const [rows, setRows] = useState<ProgramWorkoutRow[]>([]);
  const [library, setLibrary] = useState<Pick<Workout, 'id' | 'name'>[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [programRes, rowsRes, libraryRes] = await Promise.all([
      supabase.from('programs').select('id, name').eq('id', id).maybeSingle<Program>(),
      supabase
        .from('program_workouts')
        .select('*, workout:workouts(id, name)')
        .eq('program_id', id)
        .order('position')
        .returns<ProgramWorkoutRow[]>(),
      supabase.from('workouts').select('id, name').order('name').returns<Workout[]>(),
    ]);
    setError(programRes.error?.message ?? rowsRes.error?.message ?? libraryRes.error?.message ?? null);
    setProgram(programRes.data);
    setRows(rowsRes.data ?? []);
    setLibrary(libraryRes.data ?? []);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addWorkout(workout: Pick<Workout, 'id' | 'name'>) {
    if (!id) return;
    const { error: insertError } = await supabase.from('program_workouts').insert({
      program_id: id,
      workout_id: workout.id,
      position: rows.length,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setAdding(false);
    load();
  }

  async function setWeekday(row: ProgramWorkoutRow, weekday: Weekday | null) {
    const { error: updateError } = await supabase
      .from('program_workouts')
      .update({ weekday })
      .eq('id', row.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRows((current) =>
      current.map((candidate) =>
        candidate.id === row.id ? { ...candidate, weekday } : candidate
      )
    );
  }

  async function removeRow(row: ProgramWorkoutRow) {
    const { error: deleteError } = await supabase
      .from('program_workouts')
      .delete()
      .eq('id', row.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    load();
  }

  async function deleteProgram() {
    if (!program) return;
    const confirmed = await confirmAsync(
      'Delete program',
      `${program.name} will be removed. Library workouts and clients' assigned copies are unaffected.`,
      'Delete'
    );
    if (!confirmed) return;
    const { error: deleteError } = await supabase.from('programs').delete().eq('id', program.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.back();
  }

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
        <Text style={[typeScale.body, { color: theme.textSecondary }]}>‹ Programs</Text>
      </Pressable>

      <Text style={[typeScale.screenTitle, { color: theme.textPrimary }]}>
        {program?.name ?? 'Program'}
      </Text>
      <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
        A bundle of library workouts with a default weekly layout. You can rearrange days
        per client when assigning.
      </Text>

      {error && (
        <View style={{ backgroundColor: theme.danger.bg, borderRadius: radius.control, padding: 12 }}>
          <Text style={[typeScale.body, { color: theme.danger.text }]}>{error}</Text>
        </View>
      )}

      {rows.length === 0 ? (
        <Text style={[typeScale.body, { color: theme.textMuted, paddingVertical: 8 }]}>
          No workouts in this program yet. Add some from your library below.
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
          {rows.map((row, index) => (
            <View
              key={row.id}
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
                  {row.workout.name}
                </Text>
                <Pressable onPress={() => removeRow(row)} hitSlop={8}>
                  <Text style={[typeScale.secondary, { color: theme.danger.text }]}>Remove</Text>
                </Pressable>
              </View>
              <View style={styles.weekdayRow}>
                {WEEKDAYS.map((weekday) => {
                  const selected = row.weekday === weekday;
                  return (
                    <Pressable
                      key={weekday}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setWeekday(row, selected ? null : weekday)}
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
      )}

      {adding ? (
        <View
          style={{
            backgroundColor: theme.surface1,
            borderRadius: radius.card,
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>
            Add from library
          </Text>
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
          <Button title="Cancel" variant="ghost" onPress={() => setAdding(false)} />
        </View>
      ) : (
        <Button title="Add workout" variant="outline" onPress={() => setAdding(true)} />
      )}

      <Button title="Delete program" variant="ghost" danger onPress={deleteProgram} />
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
});

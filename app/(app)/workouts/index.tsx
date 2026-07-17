import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import { TextField } from '../../../components/TextField';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { radius, type as typeScale, useTheme } from '../../../lib/theme';

type WorkoutRow = {
  id: string;
  name: string;
  created_at: string;
  workout_exercises: { count: number }[];
};

export default function WorkoutLibraryScreen() {
  const { profile } = useAuth();
  const theme = useTheme();
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('workouts')
      .select('id, name, created_at, workout_exercises(count)')
      .order('name')
      .returns<WorkoutRow[]>();
    setError(loadError?.message ?? null);
    setWorkouts(data ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function createWorkout() {
    if (!profile || !newName.trim()) return;
    setCreating(true);
    const { data, error: insertError } = await supabase
      .from('workouts')
      .insert({ owner_id: profile.id, name: newName.trim() })
      .select('id')
      .single<{ id: string }>();
    setCreating(false);
    if (insertError || !data) {
      setError(insertError?.message ?? 'Could not create workout.');
      return;
    }
    setNewName('');
    router.push(`/workouts/${data.id}`);
  }

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
        <Text style={[typeScale.body, { color: theme.textSecondary }]}>‹ Home</Text>
      </Pressable>

      <Text style={[typeScale.screenTitle, { color: theme.textPrimary }]}>Workout library</Text>
      <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
        Reusable building blocks. Schedule them per client when assigning.
      </Text>

      {error && (
        <View style={{ backgroundColor: theme.danger.bg, borderRadius: radius.control, padding: 12 }}>
          <Text style={[typeScale.body, { color: theme.danger.text }]}>{error}</Text>
        </View>
      )}

      {workouts.length === 0 ? (
        <Text style={[typeScale.body, { color: theme.textMuted, paddingVertical: 8 }]}>
          No workouts yet. Create your first one below.
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
          {workouts.map((workout, index) => {
            const exerciseCount = workout.workout_exercises[0]?.count ?? 0;
            return (
              <Pressable
                key={workout.id}
                accessibilityRole="button"
                onPress={() => router.push(`/workouts/${workout.id}`)}
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
                  <Text style={[typeScale.cardTitle, { color: theme.textPrimary }]}>
                    {workout.name}
                  </Text>
                  <Text style={[typeScale.secondary, { color: theme.textMuted }]}>
                    {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}
                  </Text>
                </View>
                <Text style={[typeScale.cardTitle, { color: theme.textMuted }]}>›</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View
        style={{
          backgroundColor: theme.surface1,
          borderRadius: radius.card,
          padding: 16,
          gap: 12,
        }}
      >
        <TextField
          label="New workout"
          value={newName}
          onChangeText={setNewName}
          placeholder="e.g. Legs A"
        />
        <Button
          title="Create workout"
          onPress={createWorkout}
          loading={creating}
          disabled={!newName.trim()}
        />
      </View>
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
});

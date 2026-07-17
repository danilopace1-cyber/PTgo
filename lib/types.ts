export type UserRole = 'trainer' | 'client';

export type ConnectionStatus = 'invited' | 'active' | 'ended';

export type Profile = {
  id: string;
  role: UserRole;
  name: string;
  avatar_url: string | null;
  units: 'kg' | 'lb';
  invite_code: string | null;
  created_at: string;
};

export type ConnectionWithProfile = {
  id: string;
  status: ConnectionStatus;
  started_at: string;
  profile: Pick<Profile, 'id' | 'name'>;
};

export type Exercise = {
  id: string;
  slug: string | null;
  name: string;
  source: 'seed' | 'custom';
  owner_id: string | null;
  level: string | null;
  equipment: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  instructions: string[];
  images: string[];
  created_at: string;
};

// A reusable library workout owned by a trainer (later: solo clients too).
export type Workout = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
};

export type WorkoutExercise = {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: string;
  target_weight_note: string | null;
  target_rpe: number | null;
  rest_seconds: number;
  notes: string | null;
};

export type WorkoutExerciseRow = WorkoutExercise & {
  exercise: Pick<Exercise, 'id' | 'name' | 'equipment' | 'primary_muscles'>;
};

// A program is an optional template: a bundle of workouts + default layout.
export type Program = {
  id: string;
  trainer_id: string;
  name: string;
  description: string;
  created_at: string;
};

// ISO weekday, 1 = Monday. Null = unscheduled (sequence-based).
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ProgramWorkout = {
  id: string;
  program_id: string;
  workout_id: string;
  weekday: Weekday | null;
  position: number;
};

export type ProgramWorkoutRow = ProgramWorkout & {
  workout: Pick<Workout, 'id' | 'name'>;
};

export type ExpiryPolicy = 'remove' | 'archive' | 'auto_pdf' | 'archive_and_pdf';

export type AssignmentStatus = 'active' | 'expired' | 'archived';

export type Assignment = {
  id: string;
  program_id: string | null;
  trainer_id: string;
  client_id: string;
  starts_at: string;
  expires_at: string;
  expiry_policy: ExpiryPolicy;
  status: AssignmentStatus;
};

export type AssignmentWithProgram = Assignment & {
  program: Pick<Program, 'id' | 'name'> | null;
};

// Frozen copy of a workout taken at assignment time; the client's plan.
export type AssignmentWorkout = {
  id: string;
  assignment_id: string;
  source_workout_id: string | null;
  name: string;
  weekday: Weekday | null;
  position: number;
};

export type AssignmentExercise = {
  id: string;
  assignment_workout_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: string;
  target_weight_note: string | null;
  target_rpe: number | null;
  rest_seconds: number;
  notes: string | null;
};

export type AssignmentExerciseRow = AssignmentExercise & {
  exercise: Pick<Exercise, 'id' | 'name' | 'equipment' | 'primary_muscles'>;
};

export type WorkoutLog = {
  id: string;
  client_id: string;
  assignment_id: string | null;
  assignment_workout_id: string | null;
  workout_id: string | null;
  workout_name: string;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
};

export type SetLog = {
  id: string;
  workout_log_id: string;
  exercise_id: string;
  set_number: number;
  weight: number | null;
  reps: number;
  rpe: number | null;
  note: string | null;
};

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

// JS Date.getDay() is 0 = Sunday; convert to ISO 1 = Monday.
export function isoWeekday(date: Date): Weekday {
  return (((date.getDay() + 6) % 7) + 1) as Weekday;
}

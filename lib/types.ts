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

export type Program = {
  id: string;
  trainer_id: string;
  name: string;
  description: string;
  created_at: string;
};

export type ProgramWorkout = {
  id: string;
  program_id: string;
  name: string;
  day_label: string | null;
  position: number;
};

export type WorkoutExercise = {
  id: string;
  program_workout_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: string;
  target_weight_note: string | null;
  rest_seconds: number;
  notes: string | null;
};

export type WorkoutExerciseRow = WorkoutExercise & {
  exercise: Pick<Exercise, 'id' | 'name' | 'equipment' | 'primary_muscles'>;
};

export type ExpiryPolicy = 'remove' | 'archive' | 'auto_pdf' | 'archive_and_pdf';

export type AssignmentStatus = 'active' | 'expired' | 'archived';

export type Assignment = {
  id: string;
  program_id: string;
  trainer_id: string;
  client_id: string;
  starts_at: string;
  expires_at: string;
  expiry_policy: ExpiryPolicy;
  status: AssignmentStatus;
};

export type AssignmentWithProgram = Assignment & {
  program: Pick<Program, 'id' | 'name'>;
};

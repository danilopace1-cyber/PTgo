-- PTgo MVP steps 2-3: exercise library, programs, workouts, assignments.

-- Exercise library: seed rows imported from Free Exercise DB (public domain)
-- plus user-created custom exercises.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  -- Importer id from the seed dataset, used to make re-seeding idempotent.
  slug text unique,
  name text not null,
  source text not null default 'custom' check (source in ('seed', 'custom')),
  owner_id uuid references public.profiles (id) on delete cascade,
  level text,
  equipment text,
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  instructions text[] not null default '{}',
  images text[] not null default '{}',
  created_at timestamptz not null default now(),
  check ((source = 'seed') = (owner_id is null))
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create index programs_trainer_id_idx on public.programs (trainer_id);

-- A named workout day inside a program ("Day 1 - Push").
create table public.program_workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null,
  day_label text,
  position int not null default 0
);

create index program_workouts_program_id_idx on public.program_workouts (program_id);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  program_workout_id uuid not null references public.program_workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  position int not null default 0,
  target_sets int not null default 3 check (target_sets between 1 and 20),
  -- Text so trainers can prescribe ranges like "8-12" or "AMRAP".
  target_reps text not null default '8',
  target_weight_note text,
  rest_seconds int not null default 90 check (rest_seconds between 0 and 3600),
  notes text
);

create index workout_exercises_workout_id_idx on public.workout_exercises (program_workout_id);

create type public.expiry_policy as enum ('remove', 'archive', 'auto_pdf', 'archive_and_pdf');
create type public.assignment_status as enum ('active', 'expired', 'archived');

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  expiry_policy public.expiry_policy not null default 'archive_and_pdf',
  status public.assignment_status not null default 'active'
);

create index assignments_client_id_idx on public.assignments (client_id);
create index assignments_program_id_idx on public.assignments (program_id);

-- Row level security -------------------------------------------------------

alter table public.exercises enable row level security;
alter table public.programs enable row level security;
alter table public.program_workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.assignments enable row level security;

create policy "read seed and own exercises"
  on public.exercises for select
  using (source = 'seed' or owner_id = (select auth.uid()));

create policy "create own custom exercises"
  on public.exercises for insert
  with check (source = 'custom' and owner_id = (select auth.uid()));

create policy "update own custom exercises"
  on public.exercises for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "delete own custom exercises"
  on public.exercises for delete
  using (owner_id = (select auth.uid()));

create policy "trainers manage own programs"
  on public.programs for all
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

-- Program content is the trainer's IP; clients read it only through a live
-- (or archived) assignment.
create policy "clients read assigned programs"
  on public.programs for select
  using (
    exists (
      select 1 from public.assignments a
      where a.program_id = programs.id
        and a.client_id = (select auth.uid())
        and a.status in ('active', 'archived')
    )
  );

create policy "trainers manage own program workouts"
  on public.program_workouts for all
  using (
    exists (
      select 1 from public.programs p
      where p.id = program_workouts.program_id and p.trainer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.programs p
      where p.id = program_workouts.program_id and p.trainer_id = (select auth.uid())
    )
  );

create policy "clients read assigned program workouts"
  on public.program_workouts for select
  using (
    exists (
      select 1 from public.assignments a
      where a.program_id = program_workouts.program_id
        and a.client_id = (select auth.uid())
        and a.status in ('active', 'archived')
    )
  );

create policy "trainers manage own workout exercises"
  on public.workout_exercises for all
  using (
    exists (
      select 1 from public.program_workouts pw
      join public.programs p on p.id = pw.program_id
      where pw.id = workout_exercises.program_workout_id
        and p.trainer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.program_workouts pw
      join public.programs p on p.id = pw.program_id
      where pw.id = workout_exercises.program_workout_id
        and p.trainer_id = (select auth.uid())
    )
  );

create policy "clients read assigned workout exercises"
  on public.workout_exercises for select
  using (
    exists (
      select 1 from public.program_workouts pw
      join public.assignments a on a.program_id = pw.program_id
      where pw.id = workout_exercises.program_workout_id
        and a.client_id = (select auth.uid())
        and a.status in ('active', 'archived')
    )
  );

-- Trainers may only assign their own programs to clients they are actively
-- connected to.
create policy "trainers manage own assignments"
  on public.assignments for all
  using (trainer_id = (select auth.uid()))
  with check (
    trainer_id = (select auth.uid())
    and exists (
      select 1 from public.programs p
      where p.id = assignments.program_id and p.trainer_id = (select auth.uid())
    )
    and exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = (select auth.uid())
        and tc.client_id = assignments.client_id
        and tc.status = 'active'
    )
  );

create policy "clients read own assignments"
  on public.assignments for select
  using (client_id = (select auth.uid()));

-- Table privileges (RLS filters rows; PostgREST still needs grants).
grant select, insert, update, delete on public.exercises to authenticated;
grant select, insert, update, delete on public.programs to authenticated;
grant select, insert, update, delete on public.program_workouts to authenticated;
grant select, insert, update, delete on public.workout_exercises to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;

-- The seed importer runs as service_role, which also gets no automatic grants.
grant all on public.exercises to service_role;

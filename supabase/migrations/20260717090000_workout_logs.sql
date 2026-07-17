-- PTgo MVP step 4: client workout logging (workout_logs + set_logs).
--
-- Logged performance data belongs to the client forever (see ptgo-spec.md
-- data ownership): rows reference assignments/program_workouts with
-- "on delete set null" so a trainer deleting a program never deletes logs.

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  -- Null for solo workouts logged outside any trainer assignment.
  assignment_id uuid references public.assignments (id) on delete set null,
  program_workout_id uuid references public.program_workouts (id) on delete set null,
  -- Snapshot of the day's name so history survives program deletion/expiry.
  workout_name text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text
);

create index workout_logs_client_id_idx on public.workout_logs (client_id, started_at desc);
create index workout_logs_assignment_id_idx on public.workout_logs (assignment_id);

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references public.workout_logs (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  set_number int not null check (set_number between 1 and 50),
  weight numeric(6, 2) check (weight >= 0),
  reps int not null check (reps between 0 and 500),
  rpe numeric(3, 1) check (rpe between 1 and 10),
  note text,
  unique (workout_log_id, exercise_id, set_number)
);

create index set_logs_workout_log_id_idx on public.set_logs (workout_log_id);
create index set_logs_exercise_id_idx on public.set_logs (exercise_id);

-- Row level security -------------------------------------------------------

alter table public.workout_logs enable row level security;
alter table public.set_logs enable row level security;

-- Clients own their logs outright; expiry never touches these rows.
create policy "clients manage own workout logs"
  on public.workout_logs for all
  using (client_id = (select auth.uid()))
  with check (client_id = (select auth.uid()));

-- The coaching record: trainers read logs performed under their assignments,
-- even after the assignment expired or the relationship ended.
create policy "trainers read logs under their assignments"
  on public.workout_logs for select
  using (
    exists (
      select 1 from public.assignments a
      where a.id = workout_logs.assignment_id
        and a.trainer_id = (select auth.uid())
    )
  );

create policy "clients manage own set logs"
  on public.set_logs for all
  using (
    exists (
      select 1 from public.workout_logs wl
      where wl.id = set_logs.workout_log_id
        and wl.client_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.workout_logs wl
      where wl.id = set_logs.workout_log_id
        and wl.client_id = (select auth.uid())
    )
  );

create policy "trainers read set logs under their assignments"
  on public.set_logs for select
  using (
    exists (
      select 1 from public.workout_logs wl
      join public.assignments a on a.id = wl.assignment_id
      where wl.id = set_logs.workout_log_id
        and a.trainer_id = (select auth.uid())
    )
  );

-- Clients also need to read exercise names inside assigned programs when
-- reviewing history; the existing "read seed and own exercises" policy covers
-- seed rows, and trainer customs are covered by assignment access below.
create policy "clients read exercises in assigned programs"
  on public.exercises for select
  using (
    exists (
      select 1 from public.workout_exercises we
      join public.program_workouts pw on pw.id = we.program_workout_id
      join public.assignments a on a.program_id = pw.program_id
      where we.exercise_id = exercises.id
        and a.client_id = (select auth.uid())
        and a.status in ('active', 'archived')
    )
  );

grant select, insert, update, delete on public.workout_logs to authenticated;
grant select, insert, update, delete on public.set_logs to authenticated;

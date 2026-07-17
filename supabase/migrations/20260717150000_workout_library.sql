-- Building-block refactor: workouts become a standalone, reusable library;
-- programs become optional templates (M2M join with a default weekly layout);
-- assigning snapshots workout content per client so library edits never
-- retroactively change an active plan.
--
-- TODO(re-snapshotting): pushing a library-workout edit to already-assigned
-- clients is deliberately unsupported for now — trainers re-assign instead.

-- 1. Library: the old per-program workout rows become standalone workouts. --

alter table public.program_workouts rename to workouts;
-- Index names survive table renames; clear the old one so the new join
-- table can reuse it (the column it covers is dropped below anyway).
drop index public.program_workouts_program_id_idx;

alter table public.workouts add column owner_id uuid references public.profiles (id) on delete cascade;
update public.workouts w
  set owner_id = p.trainer_id
  from public.programs p
  where p.id = w.program_id;
alter table public.workouts alter column owner_id set not null;
alter table public.workouts add column created_at timestamptz not null default now();

create index workouts_owner_id_idx on public.workouts (owner_id);

alter table public.workout_exercises rename column program_workout_id to workout_id;
alter table public.workout_exercises
  add column target_rpe numeric(3, 1) check (target_rpe between 1 and 10);

-- 2. Programs become templates: M2M join with a default weekly layout. -----

create table public.program_workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  -- ISO weekday, 1 = Monday. Null = unscheduled (sequence-based).
  weekday int check (weekday between 1 and 7),
  position int not null default 0
);

create index program_workouts_program_id_idx on public.program_workouts (program_id);
create index program_workouts_workout_id_idx on public.program_workouts (workout_id);

-- Each old workout belonged to exactly one program; keep that layout.
insert into public.program_workouts (program_id, workout_id, position)
  select w.program_id, w.id, w.position
  from public.workouts w;

-- 3. Assignment snapshots: the frozen copy each client actually follows. ---

create table public.assignment_workouts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  -- Provenance only; the snapshot survives library deletion.
  source_workout_id uuid references public.workouts (id) on delete set null,
  name text not null,
  -- ISO weekday, 1 = Monday. Null = unscheduled (client cycles in order).
  weekday int check (weekday between 1 and 7),
  position int not null default 0
);

create index assignment_workouts_assignment_id_idx on public.assignment_workouts (assignment_id);

create table public.assignment_exercises (
  id uuid primary key default gen_random_uuid(),
  assignment_workout_id uuid not null references public.assignment_workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  position int not null default 0,
  target_sets int not null default 3 check (target_sets between 1 and 20),
  target_reps text not null default '8',
  target_weight_note text,
  target_rpe numeric(3, 1) check (target_rpe between 1 and 10),
  rest_seconds int not null default 90 check (rest_seconds between 0 and 3600),
  notes text
);

create index assignment_exercises_workout_id_idx on public.assignment_exercises (assignment_workout_id);

-- Backfill snapshots for every existing assignment from its program's
-- current content (no weekdays existed before; clients keep cycling).
insert into public.assignment_workouts (assignment_id, source_workout_id, name, position)
  select a.id, w.id, w.name, w.position
  from public.assignments a
  join public.workouts w on w.program_id = a.program_id;

insert into public.assignment_exercises
    (assignment_workout_id, exercise_id, position, target_sets, target_reps,
     target_weight_note, target_rpe, rest_seconds, notes)
  select aw.id, we.exercise_id, we.position, we.target_sets, we.target_reps,
         we.target_weight_note, we.target_rpe, we.rest_seconds, we.notes
  from public.assignment_workouts aw
  join public.workout_exercises we on we.workout_id = aw.source_workout_id;

-- 4. Logs: point at the snapshot the client trained from. ------------------

alter table public.workout_logs rename column program_workout_id to workout_id;
alter table public.workout_logs
  add column assignment_workout_id uuid references public.assignment_workouts (id) on delete set null;

update public.workout_logs wl
  set assignment_workout_id = aw.id
  from public.assignment_workouts aw
  where aw.assignment_id = wl.assignment_id
    and aw.source_workout_id = wl.workout_id;

-- 5. Programs are provenance on assignments now, never load-bearing. -------

alter table public.assignments alter column program_id drop not null;
alter table public.assignments drop constraint assignments_program_id_fkey;
alter table public.assignments
  add constraint assignments_program_id_fkey
  foreign key (program_id) references public.programs (id) on delete set null;

-- 6. Row level security ----------------------------------------------------

alter table public.program_workouts enable row level security;
alter table public.assignment_workouts enable row level security;
alter table public.assignment_exercises enable row level security;

-- Old program-scoped policies (renamed along with the table) are replaced by
-- ownership; owner_id also lets clients build solo workouts later.
drop policy "trainers manage own program workouts" on public.workouts;
drop policy "clients read assigned program workouts" on public.workouts;

create policy "manage own workouts"
  on public.workouts for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy "trainers manage own workout exercises" on public.workout_exercises;
drop policy "clients read assigned workout exercises" on public.workout_exercises;

create policy "manage exercises in own workouts"
  on public.workout_exercises for all
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id and w.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id and w.owner_id = (select auth.uid())
    )
  );

create policy "trainers manage own template layouts"
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

create policy "trainers manage own assignment workouts"
  on public.assignment_workouts for all
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_workouts.assignment_id
        and a.trainer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_workouts.assignment_id
        and a.trainer_id = (select auth.uid())
    )
  );

-- The snapshot is now the only path clients read plan content through.
create policy "clients read own assignment workouts"
  on public.assignment_workouts for select
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_workouts.assignment_id
        and a.client_id = (select auth.uid())
        and a.status in ('active', 'archived')
    )
  );

create policy "trainers manage own assignment exercises"
  on public.assignment_exercises for all
  using (
    exists (
      select 1 from public.assignment_workouts aw
      join public.assignments a on a.id = aw.assignment_id
      where aw.id = assignment_exercises.assignment_workout_id
        and a.trainer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.assignment_workouts aw
      join public.assignments a on a.id = aw.assignment_id
      where aw.id = assignment_exercises.assignment_workout_id
        and a.trainer_id = (select auth.uid())
    )
  );

create policy "clients read own assignment exercises"
  on public.assignment_exercises for select
  using (
    exists (
      select 1 from public.assignment_workouts aw
      join public.assignments a on a.id = aw.assignment_id
      where aw.id = assignment_exercises.assignment_workout_id
        and a.client_id = (select auth.uid())
        and a.status in ('active', 'archived')
    )
  );

-- Exercise details (names, images) now flow to clients via snapshots.
drop policy "clients read exercises in assigned programs" on public.exercises;

create policy "clients read exercises in assigned workouts"
  on public.exercises for select
  using (
    exists (
      select 1 from public.assignment_exercises ae
      join public.assignment_workouts aw on aw.id = ae.assignment_workout_id
      join public.assignments a on a.id = aw.assignment_id
      where ae.exercise_id = exercises.id
        and a.client_id = (select auth.uid())
        and a.status in ('active', 'archived')
    )
  );

grant select, insert, update, delete on public.program_workouts to authenticated;
grant select, insert, update, delete on public.assignment_workouts to authenticated;
grant select, insert, update, delete on public.assignment_exercises to authenticated;

-- 7. Library housekeeping ---------------------------------------------------
-- Only now, with every program-scoped policy dropped (including the old
-- exercises policy above), do the per-program columns lose their last
-- dependents and become droppable.
alter table public.workouts drop column program_id;
alter table public.workouts drop column day_label;
alter table public.workouts drop column position;

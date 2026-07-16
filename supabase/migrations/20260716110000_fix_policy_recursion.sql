-- The programs <-> assignments policies referenced each other, which Postgres
-- rejects with "infinite recursion detected in policy" as soon as a row is
-- inserted into assignments. Security definer helpers break the cycle: they
-- run as the table owner, so no RLS is re-evaluated inside them.

create or replace function public.owns_program(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.programs p
    where p.id = pid and p.trainer_id = auth.uid()
  );
$$;

create or replace function public.has_program_assignment(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assignments a
    where a.program_id = pid
      and a.client_id = auth.uid()
      and a.status in ('active', 'archived')
  );
$$;

create or replace function public.owns_program_workout(pwid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.program_workouts pw
    join public.programs p on p.id = pw.program_id
    where pw.id = pwid and p.trainer_id = auth.uid()
  );
$$;

create or replace function public.has_workout_assignment(pwid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.program_workouts pw
    join public.assignments a on a.program_id = pw.program_id
    where pw.id = pwid
      and a.client_id = auth.uid()
      and a.status in ('active', 'archived')
  );
$$;

revoke all on function public.owns_program(uuid) from public, anon;
revoke all on function public.has_program_assignment(uuid) from public, anon;
revoke all on function public.owns_program_workout(uuid) from public, anon;
revoke all on function public.has_workout_assignment(uuid) from public, anon;
grant execute on function public.owns_program(uuid) to authenticated;
grant execute on function public.has_program_assignment(uuid) to authenticated;
grant execute on function public.owns_program_workout(uuid) to authenticated;
grant execute on function public.has_workout_assignment(uuid) to authenticated;

drop policy "clients read assigned programs" on public.programs;
create policy "clients read assigned programs"
  on public.programs for select
  using (public.has_program_assignment(id));

drop policy "trainers manage own program workouts" on public.program_workouts;
create policy "trainers manage own program workouts"
  on public.program_workouts for all
  using (public.owns_program(program_id))
  with check (public.owns_program(program_id));

drop policy "clients read assigned program workouts" on public.program_workouts;
create policy "clients read assigned program workouts"
  on public.program_workouts for select
  using (public.has_program_assignment(program_id));

drop policy "trainers manage own workout exercises" on public.workout_exercises;
create policy "trainers manage own workout exercises"
  on public.workout_exercises for all
  using (public.owns_program_workout(program_workout_id))
  with check (public.owns_program_workout(program_workout_id));

drop policy "clients read assigned workout exercises" on public.workout_exercises;
create policy "clients read assigned workout exercises"
  on public.workout_exercises for select
  using (public.has_workout_assignment(program_workout_id));

drop policy "trainers manage own assignments" on public.assignments;
create policy "trainers manage own assignments"
  on public.assignments for all
  using (trainer_id = (select auth.uid()))
  with check (
    trainer_id = (select auth.uid())
    and public.owns_program(program_id)
    and exists (
      select 1 from public.trainer_clients tc
      where tc.trainer_id = (select auth.uid())
        and tc.client_id = assignments.client_id
        and tc.status = 'active'
    )
  );

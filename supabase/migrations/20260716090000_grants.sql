-- Table privileges for API roles. RLS policies filter rows, but PostgREST
-- still needs table-level grants; Supabase no longer auto-grants these on
-- new tables. anon gets nothing: every policy requires auth.uid().

grant select, update on public.profiles to authenticated;
grant select, update on public.trainer_clients to authenticated;

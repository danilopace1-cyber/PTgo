-- PTgo schema, MVP step 1: profiles with roles + trainer<->client connections.

create type public.user_role as enum ('trainer', 'client');
create type public.connection_status as enum ('invited', 'active', 'ended');

-- One row per auth user, created automatically by the on_auth_user_created trigger.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'client',
  name text not null default '',
  avatar_url text,
  units text not null default 'kg' check (units in ('kg', 'lb')),
  -- Six-character code trainers share so clients can connect. Null for clients.
  invite_code text unique,
  created_at timestamptz not null default now()
);

create table public.trainer_clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  status public.connection_status not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (trainer_id, client_id),
  check (trainer_id <> client_id)
);

create index trainer_clients_client_id_idx on public.trainer_clients (client_id);

-- Ambiguous characters (0/O, 1/I/L) excluded so codes survive being read aloud.
create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where invite_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_role public.user_role;
begin
  if new.raw_user_meta_data ->> 'role' = 'trainer' then
    new_role := 'trainer';
  else
    new_role := 'client';
  end if;

  insert into public.profiles (id, role, name, invite_code)
  values (
    new.id,
    new_role,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    case when new_role = 'trainer' then public.generate_invite_code() else null end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A client redeems a trainer's invite code. Security definer because the client
-- can neither read the trainer's profile yet nor insert into trainer_clients.
create or replace function public.redeem_invite_code(code text)
returns table (connection_id uuid, trainer_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.user_role;
  trainer record;
  conn public.trainer_clients%rowtype;
begin
  if caller_id is null then
    raise exception 'Not signed in';
  end if;

  select p.role into caller_role from public.profiles p where p.id = caller_id;
  if caller_role is distinct from 'client' then
    raise exception 'Only client accounts can connect to a trainer';
  end if;

  select p.id, p.name into trainer
  from public.profiles p
  where p.role = 'trainer' and p.invite_code = upper(trim(redeem_invite_code.code));
  if not found then
    raise exception 'Invite code not recognised';
  end if;

  select * into conn
  from public.trainer_clients tc
  where tc.trainer_id = trainer.id and tc.client_id = caller_id;

  if found then
    -- Rejoining a former trainer reactivates the ended connection.
    if conn.status = 'ended' then
      update public.trainer_clients
        set status = 'active', started_at = now(), ended_at = null
        where id = conn.id;
    end if;
  else
    insert into public.trainer_clients (trainer_id, client_id, status)
      values (trainer.id, caller_id, 'active')
      returning * into conn;
  end if;

  return query select conn.id, trainer.name;
end;
$$;

revoke all on function public.redeem_invite_code(text) from public, anon;
grant execute on function public.redeem_invite_code(text) to authenticated;
revoke all on function public.generate_invite_code() from public, anon, authenticated;

-- Row level security -------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.trainer_clients enable row level security;

create policy "read own profile"
  on public.profiles for select
  using (id = (select auth.uid()));

create policy "read connected profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.trainer_clients tc
      where (tc.trainer_id = (select auth.uid()) and tc.client_id = profiles.id)
         or (tc.client_id = (select auth.uid()) and tc.trainer_id = profiles.id)
    )
  );

create policy "update own profile"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "parties read their connections"
  on public.trainer_clients for select
  using (trainer_id = (select auth.uid()) or client_id = (select auth.uid()));

-- Either side may end the relationship (trainer removes client, client leaves).
-- Inserts happen only through redeem_invite_code, so no insert policy exists.
create policy "parties update their connections"
  on public.trainer_clients for update
  using (trainer_id = (select auth.uid()) or client_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()) or client_id = (select auth.uid()));

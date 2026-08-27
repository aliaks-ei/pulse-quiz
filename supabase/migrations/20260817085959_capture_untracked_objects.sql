-- Capture production-only objects before the baseline migration references them.
--
-- Live: the entitlement tables and functions enforce the free plan's active-room
-- and player limits. Game version capture seals the quiz snapshot used by a live
-- session. The three enforcement triggers are created by the baseline migration.
--
-- Dormant: the usage and catalog tables reproduce production exactly, but no
-- current application path writes usage counters or selects catalog values yet.

create schema if not exists private;

-- Live entitlement configuration.
create table private.plan_definitions (
  plan_key text primary key,
  max_active_rooms_per_account integer
    check (max_active_rooms_per_account is null or max_active_rooms_per_account > 0),
  max_players_per_room integer
    check (max_players_per_room is null or max_players_per_room > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table private.account_plan_assignments (
  account_id uuid primary key references auth.users (id) on delete cascade,
  plan_key text not null references private.plan_definitions (plan_key),
  assigned_at timestamptz not null default now(),
  expires_at timestamptz,
  check (expires_at is null or expires_at > assigned_at)
);

create index account_plan_assignments_plan_key_idx
  on private.account_plan_assignments (plan_key);

-- Dormant usage scaffolding retained for production parity.
create table private.usage_counters (
  account_id uuid not null references auth.users (id) on delete cascade,
  period_start date not null,
  counter_key text not null,
  value integer not null default 0 check (value >= 0),
  primary key (account_id, period_start, counter_key)
);

-- Dormant catalogs retained for production parity and later normalization.
create table private.game_mode_catalog (
  mode_key text primary key,
  label text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table private.question_type_catalog (
  type_key text primary key,
  label text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into private.plan_definitions (
  plan_key,
  max_active_rooms_per_account,
  max_players_per_room,
  is_active
)
values ('free', 1, 10, true)
on conflict (plan_key) do update
set
  max_active_rooms_per_account = excluded.max_active_rooms_per_account,
  max_players_per_room = excluded.max_players_per_room,
  is_active = excluded.is_active;

insert into private.game_mode_catalog (mode_key, label, is_enabled)
values ('classic', 'Classic quiz', true)
on conflict (mode_key) do update
set label = excluded.label, is_enabled = excluded.is_enabled;

insert into private.question_type_catalog (type_key, label, is_enabled)
values ('single_choice', 'Single choice', true)
on conflict (type_key) do update
set label = excluded.label, is_enabled = excluded.is_enabled;

-- Live entitlement lookup used by both enforcement triggers and the browser RPC.
create or replace function private.account_entitlements(p_account_id uuid)
returns table (
  plan_key text,
  max_active_rooms_per_account integer,
  max_players_per_room integer
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select
    definition.plan_key,
    definition.max_active_rooms_per_account,
    definition.max_players_per_room
  from private.plan_definitions definition
  where definition.plan_key = coalesce((
    select assignment.plan_key
    from private.account_plan_assignments assignment
    where assignment.account_id = p_account_id
      and (assignment.expires_at is null or assignment.expires_at > now())
  ), 'free')
    and definition.is_active;
$$;

create or replace function private.lock_and_check_active_room_limit(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_limit integer;
  v_active_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text, 0));

  select max_active_rooms_per_account
  into v_limit
  from private.account_entitlements(p_account_id);

  if v_limit is null then
    return;
  end if;

  select count(*) into v_active_count
  from public.live_sessions
  where created_by = p_account_id
    and phase <> 'finished';

  if v_active_count >= v_limit then
    raise exception 'Your current plan allows % active room(s)', v_limit
      using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function private.enforce_live_session_room_limit()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  perform private.lock_and_check_active_room_limit(new.created_by);
  return new;
end;
$$;

create or replace function private.enforce_session_player_limit()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_host_id uuid;
  v_limit integer;
  v_player_count integer;
begin
  if new.role <> 'player' then
    return new;
  end if;

  select created_by into v_host_id
  from public.live_sessions
  where id = new.session_id
  for update;

  select max_players_per_room into v_limit
  from private.account_entitlements(v_host_id);

  if v_limit is null then
    return new;
  end if;

  select count(*) into v_player_count
  from public.session_players
  where session_id = new.session_id and role = 'player';

  if v_player_count >= v_limit then
    raise exception 'This room is full (maximum % players)', v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Live immutable snapshot capture. The public relations are created later in
-- the baseline; PL/pgSQL resolves them when the trigger first executes.
create or replace function private.capture_game_version(p_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_revision integer;
  v_version_id uuid;
  v_content jsonb;
begin
  select coalesce(max(revision), 0) + 1 into v_revision
  from public.game_versions
  where game_id = p_game_id;

  select to_jsonb(games_with_questions)
  into v_content
  from public.games_with_questions
  where id = p_game_id;

  if v_content is null then
    raise exception 'Game not found';
  end if;

  insert into public.game_versions (
    game_id, revision, state, game_mode, content, sealed_at
  ) values (
    p_game_id, v_revision, 'sealed', 'classic', v_content, now()
  ) returning id into v_version_id;

  return v_version_id;
end;
$$;

create or replace function private.assign_live_session_version()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if new.game_version_id is null then
    new.game_version_id := private.capture_game_version(new.game_id);
  end if;
  return new;
end;
$$;


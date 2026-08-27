begin;

do $$
declare
  expected_private_tables text[] := array[
    'account_plan_assignments',
    'game_mode_catalog',
    'invite_lookup_attempts',
    'plan_definitions',
    'question_type_catalog',
    'translation_quota_windows',
    'usage_counters'
  ];
  actual_private_tables text[];
  expected_browser_rpcs text[] := array[
    'cancel_session(uuid)',
    'consume_translation_quota()',
    'create_live_session(uuid)',
    'get_invite_session_summary(text)',
    'get_my_entitlements()',
    'get_owned_game_status(uuid)',
    'get_server_time()',
    'get_session_snapshot(uuid,uuid)',
    'host_advance_session_phase(uuid,session_phase)',
    'join_or_resume_session(text,text,text,uuid,uuid)',
    'list_owned_games_with_status(integer,integer)',
    'list_past_sessions(integer,integer)',
    'move_game_to_trash(uuid)',
    'pause_session_flow(uuid)',
    'restore_game_from_trash(uuid)',
    'resume_session_flow(uuid)',
    'set_game_answer_reveal_settings(uuid,integer,boolean)',
    'set_game_primary_locale(uuid,text)',
    'start_gameplay(uuid)',
    'submit_answer(uuid,uuid,uuid,bigint)',
    'update_session_presence(uuid,uuid,boolean)',
    'upsert_game_with_questions(uuid,text,jsonb)'
  ];
  actual_browser_rpcs text[];
  entitlement record;
begin
  select array_agg(table_name order by table_name)
  into actual_private_tables
  from information_schema.tables
  where table_schema = 'private' and table_type = 'BASE TABLE';

  if actual_private_tables is distinct from expected_private_tables then
    raise exception 'Unexpected private schema tables: %', actual_private_tables;
  end if;

  if (
    select count(*)
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and trigger.tgname in (
        'trg_live_sessions_assign_version',
        'trg_live_sessions_room_limit',
        'trg_session_players_capacity'
      )
      and trigger.tgenabled = 'O'
      and not trigger.tgisinternal
  ) <> 3 then
    raise exception 'Entitlement or version trigger is missing or disabled';
  end if;

  select * into entitlement
  from private.account_entitlements('00000000-0000-0000-0000-000000000001');

  if entitlement.plan_key <> 'free'
    or entitlement.max_active_rooms_per_account <> 1
    or entitlement.max_players_per_room <> 10 then
    raise exception 'Free entitlement defaults do not match production';
  end if;

  select array_agg(procedure.oid::regprocedure::text order by procedure.oid::regprocedure::text)
  into actual_browser_rpcs
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and has_function_privilege('authenticated', procedure.oid, 'execute');

  if actual_browser_rpcs is distinct from expected_browser_rpcs then
    raise exception 'Authenticated RPC grant drift: %', actual_browser_rpcs;
  end if;

  if exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and (
        has_function_privilege('anon', procedure.oid, 'execute')
      )
  ) then
    raise exception 'Public or anonymous role can execute a public function';
  end if;
end;
$$;

create function public.chunk0_scratch_function()
returns void
language sql
as $$ select null::void $$;

do $$
begin
  if has_function_privilege('anon', 'public.chunk0_scratch_function()', 'execute')
    or has_function_privilege('authenticated', 'public.chunk0_scratch_function()', 'execute') then
    raise exception 'Default privileges exposed a newly created function';
  end if;
end;
$$;

do $$
declare
  test_user_id constant uuid := '00000000-0000-0000-0000-000000000010';
  test_game_id constant uuid := '00000000-0000-0000-0000-000000000020';
  test_session_id constant uuid := '00000000-0000-0000-0000-000000000030';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    test_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'chunk0@example.test',
    '',
    now(),
    now(),
    now(),
    '{}',
    '{}'
  );

  insert into public.games (id, owner_id, title)
  values (test_game_id, test_user_id, 'Chunk 0 verification');

  insert into public.live_sessions (
    id, game_id, title, invite_code, created_by
  ) values (
    test_session_id, test_game_id, 'Chunk 0 verification', 'CHK000', test_user_id
  );

  if not exists (
    select 1
    from public.game_versions version
    join public.live_sessions session
      on session.game_version_id = version.id
    where session.id = test_session_id
      and version.game_id = test_game_id
      and version.state = 'sealed'
  ) then
    raise exception 'Creating a session did not capture a sealed game version';
  end if;
end;
$$;

rollback;

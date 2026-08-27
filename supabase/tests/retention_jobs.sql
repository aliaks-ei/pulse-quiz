-- The retention jobs delete real data. This is the proof that each one takes
-- what it is meant to and nothing else, run on every pull request against a
-- database built from migrations alone.

begin;

do $$
declare
  host_id constant uuid := '00000000-0000-0000-0000-000000000100';
  second_host_id constant uuid := '00000000-0000-0000-0000-000000000101';
  abandoned_id constant uuid := '00000000-0000-0000-0000-000000000102';
  seen_player_id constant uuid := '00000000-0000-0000-0000-000000000103';
  fresh_visitor_id constant uuid := '00000000-0000-0000-0000-000000000104';
  trashed_game_id constant uuid := '00000000-0000-0000-0000-000000000200';
  kept_game_id constant uuid := '00000000-0000-0000-0000-000000000201';
  trashed_section_id constant uuid := '00000000-0000-0000-0000-000000000210';
  kept_section_id constant uuid := '00000000-0000-0000-0000-000000000211';
  session_id constant uuid := '00000000-0000-0000-0000-000000000300';
  report jsonb;
begin
  -- Fixtures ---------------------------------------------------------------
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, is_anonymous
  )
  values
    (host_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
     'authenticated', 'retention-host@example.test', '', now(), now(), now(),
     now(), '{}', '{}', false),
    (second_host_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
     'authenticated', 'retention-host-2@example.test', '', now(), now(), now(),
     now(), '{}', '{}', false),
    -- Minted for a visitor who never joined a room.
    (abandoned_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
     'authenticated', null, '', null, now() - interval '40 days',
     now() - interval '40 days', now() - interval '40 days', '{}', '{}', true),
    -- Same age, but holds a player row in a session that has not finished.
    (seen_player_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
     'authenticated', null, '', null, now() - interval '40 days',
     now() - interval '40 days', now() - interval '40 days', '{}', '{}', true),
    -- Anonymous and idle, but only since yesterday.
    (fresh_visitor_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
     'authenticated', null, '', null, now() - interval '1 day',
     now() - interval '1 day', now() - interval '1 day', '{}', '{}', true);

  insert into public.games (id, owner_id, title, deleted_at)
  values
    (trashed_game_id, host_id, 'Trashed past the window',
     now() - interval '31 days'),
    (kept_game_id, second_host_id, 'Still live', null);

  insert into public.game_sections (id, game_id, position, title)
  values
    (trashed_section_id, trashed_game_id, 0, 'Round 1'),
    (kept_section_id, kept_game_id, 0, 'Round 1');

  insert into public.questions (
    game_id, section_id, position, prompt, correct_option_id, media
  )
  values
    (trashed_game_id, trashed_section_id, 0, 'Trashed question',
     gen_random_uuid(),
     '{"kind": "image", "path": "assets/trashed.webp"}'::jsonb),
    (kept_game_id, kept_section_id, 0, 'Live question', gen_random_uuid(),
     '{"kind": "image", "path": "assets/live.webp"}'::jsonb);

  insert into public.media_assets (
    owner_id, bucket_id, object_path, status, size_bytes, created_at
  )
  values
    (host_id, 'pulse-quiz-question-media', 'assets/trashed.webp', 'ready',
     1000, now() - interval '40 days'),
    (second_host_id, 'pulse-quiz-question-media', 'assets/live.webp', 'ready',
     1000, now() - interval '40 days'),
    -- No question references this one any more.
    (second_host_id, 'pulse-quiz-question-media', 'assets/detached.webp',
     'ready', 1000, now() - interval '40 days'),
    -- Uploaded moments ago: the builder may not have saved the question yet.
    (second_host_id, 'pulse-quiz-question-media', 'assets/just-uploaded.webp',
     'ready', 1000, now()),
    -- Avatars live in the same table and are not the questions' to reap.
    (seen_player_id, 'player-avatars', 'avatars/player.webp', 'ready', 500,
     now() - interval '40 days');

  insert into public.live_sessions (id, game_id, title, invite_code, created_by)
  values (session_id, kept_game_id, 'Still live', 'RET001', second_host_id);

  insert into public.session_players (
    session_id, auth_user_id, display_name, role
  )
  values (session_id, seen_player_id, 'Resumable', 'player');

  -- Trashed games ----------------------------------------------------------
  report := private.purge_trashed_games(true);

  if (report ->> 'matched')::integer <> 1 or (report ->> 'armed')::boolean then
    raise exception 'Report-only purge did not report exactly one game: %', report;
  end if;

  if not exists (select 1 from public.games where id = trashed_game_id) then
    raise exception 'Report-only purge deleted a game';
  end if;

  report := private.purge_trashed_games(false);

  if (report ->> 'matched')::integer <> 1 then
    raise exception 'Armed purge did not take the trashed game: %', report;
  end if;

  if exists (select 1 from public.games where id = trashed_game_id) then
    raise exception 'Armed purge left the trashed game behind';
  end if;

  if not exists (select 1 from public.games where id = kept_game_id) then
    raise exception 'Armed purge took a game that was never trashed';
  end if;

  if (
    select status from public.media_assets
    where object_path = 'assets/trashed.webp'
  ) <> 'scheduled_for_deletion' then
    raise exception 'Purging a game left its media unscheduled';
  end if;

  -- Anonymous accounts -----------------------------------------------------
  report := private.expire_anonymous_users(true);

  if (report ->> 'matched')::integer <> 1 then
    raise exception 'Report-only expiry did not report one account: %', report;
  end if;

  if not exists (select 1 from auth.users where id = abandoned_id) then
    raise exception 'Report-only expiry deleted an account';
  end if;

  report := private.expire_anonymous_users(false);

  if exists (select 1 from auth.users where id = abandoned_id) then
    raise exception 'Armed expiry left the abandoned account behind';
  end if;

  if not exists (select 1 from auth.users where id = seen_player_id) then
    raise exception 'Armed expiry took an account with a player row';
  end if;

  if not exists (select 1 from auth.users where id = fresh_visitor_id) then
    raise exception 'Armed expiry took an account inside its window';
  end if;

  -- Detached media ---------------------------------------------------------
  report := private.mark_detached_media(true);

  if (
    select status from public.media_assets
    where object_path = 'assets/detached.webp'
  ) = 'scheduled_for_deletion' then
    raise exception 'Report-only marking scheduled an asset for deletion';
  end if;

  report := private.mark_detached_media(false);

  if (
    select status from public.media_assets
    where object_path = 'assets/detached.webp'
  ) <> 'scheduled_for_deletion' then
    raise exception 'Detached media was not scheduled for deletion';
  end if;

  if (
    select status from public.media_assets
    where object_path = 'assets/live.webp'
  ) = 'scheduled_for_deletion' then
    raise exception 'Media a question still uses was scheduled for deletion';
  end if;

  if (
    select status from public.media_assets
    where object_path = 'assets/just-uploaded.webp'
  ) = 'scheduled_for_deletion' then
    raise exception 'A fresh upload was scheduled before its grace period';
  end if;

  if (
    select status from public.media_assets
    where object_path = 'avatars/player.webp'
  ) = 'scheduled_for_deletion' then
    raise exception 'A player avatar was scheduled by the question media job';
  end if;

  -- Every run leaves a report behind, armed or not.
  if (
    select count(distinct job_key) from private.retention_runs
  ) <> 3 then
    raise exception 'A retention job did not record its run';
  end if;
end;
$$;

do $$
begin
  if (
    select count(*)
    from cron.job
    where jobname in (
      'purge-trashed-games',
      'expire-anonymous-users',
      'mark-detached-media'
    )
  ) <> 3 then
    raise exception 'A retention job is not scheduled';
  end if;

  if exists (
    select 1 from private.retention_settings where is_armed
  ) then
    raise exception 'A retention job ships armed';
  end if;
end;
$$;

rollback;

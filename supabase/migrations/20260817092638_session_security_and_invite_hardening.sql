-- Public room codes need enough entropy to be safe even when users share a
-- link broadly. Sixteen hexadecimal characters supply 64 bits of randomness.
create or replace function public.generate_invite_code()
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  generated text;
begin
  loop
    generated := upper(encode(extensions.gen_random_bytes(8), 'hex'));

    exit when not exists (
      select 1
      from public.live_sessions ls
      where ls.invite_code = generated
    );
  end loop;

  return generated;
end;
$$;

-- Keep online invite guessing bounded even when an anonymous account is used.
create schema if not exists private;

create table if not exists private.invite_lookup_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

alter table private.invite_lookup_attempts enable row level security;

create or replace function private.consume_invite_lookup_quota()
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_attempt private.invite_lookup_attempts%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select *
  into v_attempt
  from private.invite_lookup_attempts
  where user_id = v_user_id
  for update;

  if v_attempt.user_id is null then
    insert into private.invite_lookup_attempts (user_id, attempts)
    values (v_user_id, 1);
    return;
  end if;

  if v_attempt.window_started_at <= now() - interval '1 minute' then
    update private.invite_lookup_attempts
    set window_started_at = now(), attempts = 1, updated_at = now()
    where user_id = v_user_id;
    return;
  end if;

  if v_attempt.attempts >= 12 then
    raise exception 'Too many invite attempts. Please wait a minute.';
  end if;

  update private.invite_lookup_attempts
  set attempts = attempts + 1, updated_at = now()
  where user_id = v_user_id;
end;
$$;

create or replace function public.get_invite_session_summary(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_session public.live_sessions%rowtype;
begin
  perform private.consume_invite_lookup_quota();

  select *
  into v_session
  from public.live_sessions ls
  where ls.invite_code = upper(btrim(p_invite_code));

  if v_session.id is null then
    raise exception 'Invalid invite code';
  end if;

  v_session := public.sync_live_session_phase(v_session.id);

  return jsonb_build_object(
    'sessionId', v_session.id,
    'title', v_session.title,
    'inviteCode', v_session.invite_code,
    'phase', v_session.phase,
    'isJoinable', v_session.phase = 'lobby',
    'createdAt', v_session.created_at,
    'updatedAt', v_session.updated_at
  );
end;
$$;

-- Translation is a billable external operation. The quota lives in Postgres so
-- it is shared by every Edge Function isolate and survives cold starts.
create table if not exists private.translation_quota_windows (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  requests integer not null default 0 check (requests >= 0),
  updated_at timestamptz not null default now()
);

alter table private.translation_quota_windows enable row level security;

create or replace function public.consume_translation_quota()
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_quota private.translation_quota_windows%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select *
  into v_quota
  from private.translation_quota_windows
  where user_id = v_user_id
  for update;

  if v_quota.user_id is null then
    insert into private.translation_quota_windows (user_id, requests)
    values (v_user_id, 1);
    return;
  end if;

  if v_quota.window_started_at <= now() - interval '1 hour' then
    update private.translation_quota_windows
    set window_started_at = now(), requests = 1, updated_at = now()
    where user_id = v_user_id;
    return;
  end if;

  if v_quota.requests >= 20 then
    raise exception 'Translation quota exceeded';
  end if;

  update private.translation_quota_windows
  set requests = requests + 1, updated_at = now()
  where user_id = v_user_id;
end;
$$;

-- A selected upload is supplied by ID rather than a URL or Storage path. The
-- database verifies that the currently authenticated player owns a ready
-- player-avatar asset before it can be associated with a live session.
drop function if exists public.join_or_resume_session(text, text, text, uuid);

create function public.join_or_resume_session(
  p_invite_code text,
  p_display_name text,
  p_avatar_key text default 'avatar-01',
  p_resume_player_id uuid default null,
  p_avatar_asset_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.live_sessions%rowtype;
  v_player public.session_players%rowtype;
  v_display_name text;
  v_avatar_key text;
  v_avatar_asset_id uuid;
begin
  v_display_name := btrim(p_display_name);
  v_avatar_key := coalesce(nullif(btrim(p_avatar_key), ''), 'avatar-01');

  if coalesce(char_length(v_display_name), 0) = 0 then
    raise exception 'Display name is required';
  end if;

  if v_avatar_key not in (
    'avatar-01', 'avatar-02', 'avatar-03',
    'avatar-04', 'avatar-05', 'avatar-06'
  ) then
    raise exception 'Avatar selection is invalid';
  end if;

  if p_avatar_asset_id is not null then
    select asset.id
    into v_avatar_asset_id
    from public.media_assets asset
    where asset.id = p_avatar_asset_id
      and asset.owner_id = (select auth.uid())
      and asset.bucket_id = 'player-avatars'
      and asset.status = 'ready';

    if v_avatar_asset_id is null then
      raise exception 'Avatar upload is unavailable';
    end if;
  end if;

  select *
  into v_session
  from public.live_sessions ls
  where ls.invite_code = upper(btrim(p_invite_code));

  if v_session.id is null then
    raise exception 'Invalid invite code';
  end if;

  v_session := public.sync_live_session_phase(v_session.id);

  if p_resume_player_id is not null then
    update public.session_players
    set
      display_name = v_display_name,
      avatar_key = v_avatar_key,
      avatar_asset_id = v_avatar_asset_id,
      is_connected = true,
      last_seen_at = now()
    where id = p_resume_player_id
      and session_id = v_session.id
      and auth_user_id = (select auth.uid())
    returning * into v_player;
  end if;

  if v_player.id is null then
    update public.session_players
    set
      display_name = v_display_name,
      avatar_key = v_avatar_key,
      avatar_asset_id = v_avatar_asset_id,
      is_connected = true,
      last_seen_at = now()
    where session_id = v_session.id
      and auth_user_id = (select auth.uid())
    returning * into v_player;
  end if;

  if v_player.id is null and v_session.phase <> 'lobby' then
    raise exception 'New players can only join while the lobby is open';
  end if;

  if v_player.id is null then
    insert into public.session_players (
      session_id,
      auth_user_id,
      display_name,
      avatar_key,
      avatar_asset_id,
      role
    )
    values (
      v_session.id,
      (select auth.uid()),
      v_display_name,
      v_avatar_key,
      v_avatar_asset_id,
      case
        when v_session.host_player_id is null then 'host'::public.session_player_role
        else 'player'::public.session_player_role
      end
    )
    returning * into v_player;
  end if;

  if v_session.host_player_id is null and v_player.role = 'host' then
    update public.live_sessions
    set host_player_id = v_player.id
    where id = v_session.id
    returning * into v_session;
  end if;

  return public.get_session_snapshot(v_session.id, v_player.id);
end;
$$;

create or replace function public.build_session_leaderboard(p_session_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'playerId', ranked.id,
        'displayName', ranked.display_name,
        'avatarKey', ranked.avatar_key,
        'avatarAssetId', ranked.avatar_asset_id,
        'avatarAssetPath', ranked.avatar_asset_path,
        'score', ranked.score,
        'rank', ranked.rank
      )
      order by ranked.score desc, ranked.joined_at asc
    ),
    '[]'::jsonb
  )
  from (
    select
      sp.id,
      sp.display_name,
      sp.avatar_key,
      sp.avatar_asset_id,
      asset.object_path as avatar_asset_path,
      sp.score,
      sp.joined_at,
      dense_rank() over (order by sp.score desc, sp.joined_at asc) as rank
    from public.session_players sp
    left join public.media_assets asset
      on asset.id = sp.avatar_asset_id
      and asset.bucket_id = 'player-avatars'
      and asset.status = 'ready'
    where sp.session_id = p_session_id
      and sp.role = 'player'
  ) ranked;
$$;

-- Return only the avatar data a viewer can render. Stable Auth identifiers are
-- internal authorization data and must not be sent to other participants.
create or replace function public.get_session_snapshot(
  p_session_id uuid,
  p_current_player_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot jsonb;
  v_game jsonb;
  v_questions jsonb;
  v_sections jsonb;
  v_phase text;
  v_viewer_role text;
  v_index integer;
  v_question jsonb;
begin
  v_snapshot := public.get_session_snapshot_before_answer_transition(
    p_session_id,
    p_current_player_id
  );

  v_snapshot := jsonb_set(
    v_snapshot,
    '{players}',
    coalesce((
      select jsonb_agg(
        (player.value - 'authUserId') || jsonb_build_object(
          'avatarAssetId', session_player.avatar_asset_id,
          'avatarAssetPath', avatar_asset.object_path
        )
        order by player.position
      )
      from jsonb_array_elements(coalesce(v_snapshot -> 'players', '[]'::jsonb))
        with ordinality as player(value, position)
      left join public.session_players session_player
        on session_player.id = (player.value ->> 'id')::uuid
      left join public.media_assets avatar_asset
        on avatar_asset.id = session_player.avatar_asset_id
        and avatar_asset.bucket_id = 'player-avatars'
        and avatar_asset.status = 'ready'
    ), '[]'::jsonb)
  );

  v_snapshot := jsonb_set(
    v_snapshot,
    '{leaderboard}',
    coalesce((
      select jsonb_agg(
        leaderboard_entry.value || jsonb_build_object(
          'avatarAssetId', session_player.avatar_asset_id,
          'avatarAssetPath', avatar_asset.object_path
        )
        order by leaderboard_entry.position
      )
      from jsonb_array_elements(coalesce(v_snapshot -> 'leaderboard', '[]'::jsonb))
        with ordinality as leaderboard_entry(value, position)
      left join public.session_players session_player
        on session_player.id = (leaderboard_entry.value ->> 'playerId')::uuid
      left join public.media_assets avatar_asset
        on avatar_asset.id = session_player.avatar_asset_id
        and avatar_asset.bucket_id = 'player-avatars'
        and avatar_asset.status = 'ready'
    ), '[]'::jsonb)
  );

  v_snapshot := jsonb_set(
    v_snapshot,
    '{roundSummary}',
    coalesce((
      select jsonb_agg(
        summary_entry.value || jsonb_build_object(
          'avatarAssetId', session_player.avatar_asset_id,
          'avatarAssetPath', avatar_asset.object_path
        )
        order by summary_entry.position
      )
      from jsonb_array_elements(coalesce(v_snapshot -> 'roundSummary', '[]'::jsonb))
        with ordinality as summary_entry(value, position)
      left join public.session_players session_player
        on session_player.id = (summary_entry.value ->> 'playerId')::uuid
      left join public.media_assets avatar_asset
        on avatar_asset.id = session_player.avatar_asset_id
        and avatar_asset.bucket_id = 'player-avatars'
        and avatar_asset.status = 'ready'
    ), '[]'::jsonb)
  );

  v_game := v_snapshot -> 'game';
  v_questions := coalesce(v_game -> 'questions', '[]'::jsonb);
  v_sections := coalesce(v_game -> 'sections', '[]'::jsonb);
  v_phase := v_snapshot #>> '{session,phase}';
  v_viewer_role := v_snapshot ->> 'viewerRole';

  if v_phase = 'answer_transition' and v_viewer_role = 'host' then
    v_index := (v_snapshot #>> '{session,currentQuestionIndex}')::integer;
    v_question := v_questions -> v_index;
    v_snapshot := jsonb_set(
      v_snapshot,
      '{currentQuestion}',
      coalesce(v_question, 'null'::jsonb)
    );
  elsif v_phase = 'answer_transition' then
    v_snapshot := jsonb_set(v_snapshot, '{currentQuestion}', 'null'::jsonb);
  end if;

  if v_phase = 'answer_transition' then
    v_snapshot := jsonb_set(v_snapshot, '{submittedIsCorrect}', 'null'::jsonb);
    v_snapshot := jsonb_set(v_snapshot, '{submittedPoints}', 'null'::jsonb);
  end if;

  v_snapshot := jsonb_set(
    v_snapshot,
    '{game}',
    jsonb_build_object(
      'id', v_game -> 'id',
      'title', v_game -> 'title',
      'titleI18n', v_game -> 'titleI18n',
      'primaryLocale', v_game -> 'primaryLocale',
      'questionCount', jsonb_array_length(v_questions),
      'sectionCount', jsonb_array_length(v_sections),
      'sections', v_sections
    )
  );

  return v_snapshot;
end;
$$;

-- Supabase creates PUBLIC execute privileges by default. Only actual browser
-- RPC entry points are re-granted; lifecycle helpers stay callable only from
-- trusted database functions.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.cancel_session(uuid) to authenticated;
grant execute on function public.consume_translation_quota() to authenticated;
grant execute on function public.create_live_session(uuid) to authenticated;
grant execute on function public.get_invite_session_summary(text) to authenticated;
grant execute on function public.get_my_entitlements() to authenticated;
grant execute on function public.get_owned_game_status(uuid) to authenticated;
grant execute on function public.get_server_time() to authenticated;
grant execute on function public.get_session_snapshot(uuid, uuid) to authenticated;
grant execute on function public.host_advance_session_phase(uuid, public.session_phase) to authenticated;
grant execute on function public.join_or_resume_session(text, text, text, uuid, uuid) to authenticated;
grant execute on function public.list_owned_games_with_status(integer, integer) to authenticated;
grant execute on function public.list_past_sessions(integer, integer) to authenticated;
grant execute on function public.move_game_to_trash(uuid) to authenticated;
grant execute on function public.pause_session_flow(uuid) to authenticated;
grant execute on function public.restore_game_from_trash(uuid) to authenticated;
grant execute on function public.resume_session_flow(uuid) to authenticated;
grant execute on function public.set_game_answer_reveal_settings(uuid, integer, boolean) to authenticated;
grant execute on function public.set_game_primary_locale(uuid, text) to authenticated;
grant execute on function public.start_gameplay(uuid) to authenticated;
grant execute on function public.submit_answer(uuid, uuid, uuid, bigint) to authenticated;
grant execute on function public.update_session_presence(uuid, uuid, boolean) to authenticated;
grant execute on function public.upsert_game_with_questions(uuid, text, jsonb) to authenticated;




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."session_phase" AS ENUM (
    'lobby',
    'question_active',
    'question_closed',
    'results',
    'finished',
    'answer_reveal',
    'round_summary',
    'round_leaderboard',
    'answer_transition'
);


ALTER TYPE "public"."session_phase" OWNER TO "postgres";


CREATE TYPE "public"."session_player_role" AS ENUM (
    'host',
    'player'
);


ALTER TYPE "public"."session_player_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_question"("p_session_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.host_advance_session_phase(p_session_id);
end;
$$;


ALTER FUNCTION "public"."advance_question"("p_session_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."live_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "invite_code" "text" NOT NULL,
    "host_player_id" "uuid",
    "phase" "public"."session_phase" DEFAULT 'lobby'::"public"."session_phase" NOT NULL,
    "current_question_index" integer DEFAULT 0 NOT NULL,
    "question_started_at" timestamp with time zone,
    "question_ends_at" timestamp with time zone,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "part_index" integer DEFAULT 0 NOT NULL,
    "part_count" integer DEFAULT 1 NOT NULL,
    "phase_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phase_ends_at" timestamp with time zone,
    "paused_at" timestamp with time zone,
    "pause_remaining_ms" integer,
    "current_part_start_index" integer DEFAULT 0 NOT NULL,
    "current_part_end_index" integer DEFAULT 0 NOT NULL,
    "finished_at" timestamp with time zone,
    "game_version_id" "uuid",
    CONSTRAINT "live_sessions_current_question_index_check" CHECK (("current_question_index" >= 0)),
    CONSTRAINT "live_sessions_invite_code_check" CHECK (("invite_code" ~ '^[A-Z0-9]{6}$'::"text")),
    CONSTRAINT "live_sessions_pause_remaining_ms_check" CHECK ((("pause_remaining_ms" IS NULL) OR ("pause_remaining_ms" >= 0))),
    CONSTRAINT "live_sessions_title_check" CHECK (("char_length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."live_sessions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_answer_reveal"("p_session_id" "uuid") RETURNS "public"."live_sessions"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.begin_answer_transition(p_session_id);
$$;


ALTER FUNCTION "public"."begin_answer_reveal"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_answer_transition"("p_session_id" "uuid") RETURNS "public"."live_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_started_at timestamptz := now();
begin
  update public.live_sessions
  set
    phase = 'answer_transition',
    question_ends_at = v_started_at,
    phase_started_at = v_started_at,
    phase_ends_at = v_started_at + interval '2 seconds',
    paused_at = null,
    pause_remaining_ms = null
  where id = p_session_id
    and phase = 'question_active'
  returning * into v_session;

  if v_session.id is null then
    select * into v_session from public.live_sessions where id = p_session_id;
  end if;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  return v_session;
end;
$$;


ALTER FUNCTION "public"."begin_answer_transition"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_question_phase"("p_session_id" "uuid", "p_question_index" integer) RETURNS "public"."live_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_question public.questions%rowtype;
  v_part record;
  v_started_at timestamptz := now();
begin
  select *
  into v_session
  from public.live_sessions ls
  where ls.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  select *
  into v_question
  from public.questions q
  where q.game_id = v_session.game_id
    and q.position = p_question_index;

  if v_question.id is null then
    raise exception 'Question % is not available for this session', p_question_index;
  end if;

  select *
  into v_part
  from public.build_game_section_partitions(v_session.game_id) part
  where p_question_index between part.start_index and part.end_index
  limit 1;

  update public.live_sessions
  set
    phase = 'question_active',
    current_question_index = p_question_index,
    part_index = coalesce(v_part.part_index, 0),
    part_count = coalesce(v_part.part_count, 1),
    current_part_start_index = coalesce(v_part.start_index, 0),
    current_part_end_index = coalesce(v_part.end_index, 0),
    question_started_at = v_started_at,
    question_ends_at = v_started_at + make_interval(secs => v_question.duration_seconds),
    phase_started_at = v_started_at,
    phase_ends_at = v_started_at + make_interval(secs => v_question.duration_seconds),
    paused_at = null,
    pause_remaining_ms = null
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;


ALTER FUNCTION "public"."begin_question_phase"("p_session_id" "uuid", "p_question_index" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_round_leaderboard"("p_session_id" "uuid") RETURNS "public"."live_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_started_at timestamptz := now();
  v_default_seconds integer;
  v_next_mode text;
  v_next_seconds integer;
  v_resolved_seconds integer;
  v_phase_ends_at timestamptz;
begin
  select *
  into v_session
  from public.live_sessions ls
  where ls.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  select g.default_section_intermission_seconds
  into v_default_seconds
  from public.games g
  where g.id = v_session.game_id;

  v_default_seconds := coalesce(v_default_seconds, 10);

  select gs.intermission_mode, gs.intermission_seconds
  into v_next_mode, v_next_seconds
  from public.build_game_section_partitions(v_session.game_id) next_part
  join public.game_sections gs
    on gs.id = next_part.section_id
  where next_part.part_index = v_session.part_index + 1
  limit 1;

  if v_next_mode is null then
    -- No next section: this leaderboard precedes finish_session.
    v_resolved_seconds := v_default_seconds;
  elsif v_next_mode = 'manual' then
    v_resolved_seconds := null;
  elsif v_next_mode = 'timer' then
    v_resolved_seconds := coalesce(v_next_seconds, v_default_seconds);
  else
    -- 'inherit'
    v_resolved_seconds := v_default_seconds;
  end if;

  if v_resolved_seconds is null then
    v_phase_ends_at := null;
  else
    v_phase_ends_at := v_started_at + make_interval(secs => v_resolved_seconds);
  end if;

  update public.live_sessions
  set
    phase = 'round_leaderboard',
    question_started_at = null,
    question_ends_at = null,
    phase_started_at = v_started_at,
    phase_ends_at = v_phase_ends_at,
    paused_at = null,
    pause_remaining_ms = null
  where id = p_session_id
  returning * into v_session;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  return v_session;
end;
$$;


ALTER FUNCTION "public"."begin_round_leaderboard"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_round_summary"("p_session_id" "uuid") RETURNS "public"."live_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_started_at timestamptz := now();
begin
  update public.live_sessions
  set
    phase = 'round_summary',
    question_started_at = null,
    question_ends_at = null,
    phase_started_at = v_started_at,
    phase_ends_at = v_started_at + interval '4 seconds',
    paused_at = null,
    pause_remaining_ms = null
  where id = p_session_id
  returning * into v_session;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  return v_session;
end;
$$;


ALTER FUNCTION "public"."begin_round_summary"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_visible_answer_reveal"("p_session_id" "uuid") RETURNS "public"."live_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_started_at timestamptz := now();
  v_reveal_seconds integer;
  v_manual_question_advance boolean;
begin
  select
    coalesce(g.default_answer_reveal_seconds, 5),
    coalesce(g.manual_question_advance, false)
  into v_reveal_seconds, v_manual_question_advance
  from public.live_sessions ls
  join public.games g on g.id = ls.game_id
  where ls.id = p_session_id;

  update public.live_sessions
  set
    phase = 'answer_reveal',
    question_ends_at = v_started_at,
    phase_started_at = v_started_at,
    phase_ends_at = case
      when coalesce(v_manual_question_advance, false) then null
      else v_started_at + make_interval(secs => coalesce(v_reveal_seconds, 5))
    end,
    paused_at = null,
    pause_remaining_ms = null
  where id = p_session_id
  returning * into v_session;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  return v_session;
end;
$$;


ALTER FUNCTION "public"."begin_visible_answer_reveal"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."build_game_section_partitions"("p_game_id" "uuid") RETURNS TABLE("section_id" "uuid", "section_title" "text", "part_index" integer, "start_index" integer, "end_index" integer, "part_count" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with section_counts as (
    select
      gs.id as section_id,
      gs.title as section_title,
      gs.position,
      count(q.id)::integer as question_count
    from public.game_sections gs
    left join public.questions q
      on q.section_id = gs.id
    where gs.game_id = p_game_id
    group by gs.id, gs.title, gs.position
  ),
  ranked_sections as (
    select
      sc.section_id,
      sc.section_title,
      sc.question_count,
      row_number() over (order by sc.position asc, sc.section_id asc) - 1 as part_index,
      count(*) over ()::integer as part_count
    from section_counts sc
    where sc.question_count > 0
  )
  select
    rs.section_id,
    rs.section_title,
    rs.part_index,
    coalesce(
      sum(rs.question_count) over (
        order by rs.part_index
        rows between unbounded preceding and 1 preceding
      ),
      0
    )::integer as start_index,
    (
      sum(rs.question_count) over (
        order by rs.part_index
        rows between unbounded preceding and current row
      ) - 1
    )::integer as end_index,
    rs.part_count
  from ranked_sections rs
  order by rs.part_index asc;
$$;


ALTER FUNCTION "public"."build_game_section_partitions"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."build_question_partitions"("p_question_count" integer) RETURNS TABLE("part_index" integer, "start_index" integer, "end_index" integer, "part_count" integer)
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with meta as (
    select
      greatest(coalesce(p_question_count, 0), 1) as question_count,
      public.calculate_part_count(p_question_count) as computed_part_count
  ),
  parts as (
    select
      gs as part_index,
      (
        (meta.question_count / meta.computed_part_count)
        + case
            when gs < (meta.question_count % meta.computed_part_count) then 1
            else 0
          end
      ) as part_size,
      meta.computed_part_count as part_count
    from meta,
    generate_series(0, meta.computed_part_count - 1) gs
  )
  select
    parts.part_index,
    coalesce(
      sum(parts.part_size) over (
        order by parts.part_index
        rows between unbounded preceding and 1 preceding
      ),
      0
    )::integer as start_index,
    (
      sum(parts.part_size) over (
        order by parts.part_index
        rows between unbounded preceding and current row
      ) - 1
    )::integer as end_index,
    parts.part_count
  from parts;
$$;


ALTER FUNCTION "public"."build_question_partitions"("p_question_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."build_session_leaderboard"("p_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'playerId', ranked.id,
        'displayName', ranked.display_name,
        'avatarKey', ranked.avatar_key,
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
      sp.score,
      sp.joined_at,
      dense_rank() over (order by sp.score desc) as rank
    from public.session_players sp
    where sp.session_id = p_session_id
      and sp.role = 'player'
  ) ranked;
$$;


ALTER FUNCTION "public"."build_session_leaderboard"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_part_count"("p_question_count" integer) RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select greatest(1, ceil(greatest(coalesce(p_question_count, 0), 1) / 5.0)::integer);
$$;


ALTER FUNCTION "public"."calculate_part_count"("p_question_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_session"("p_session_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.live_sessions ls
    where ls.id = p_session_id
      and (
        ls.created_by = (select auth.uid())
        or exists (
          select 1
          from public.session_players sp
          where sp.session_id = ls.id
            and sp.auth_user_id = (select auth.uid())
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_read_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_session"("p_session_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session_id uuid;
begin
  perform public.require_permanent_user();

  select ls.id
  into v_session_id
  from public.live_sessions ls
  join public.games g
    on g.id = ls.game_id
  where ls.id = p_session_id
    and g.owner_id = (select auth.uid());

  if v_session_id is null then
    raise exception 'Session not found or not owned by current user';
  end if;

  delete from public.live_sessions
  where id = v_session_id;

  return true;
end;
$$;


ALTER FUNCTION "public"."cancel_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_current_question"("p_session_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
begin
  v_session := public.sync_live_session_phase(p_session_id);

  if v_session.phase <> 'question_active' then
    raise exception 'There is no active question to close';
  end if;

  perform public.host_advance_session_phase(p_session_id);
end;
$$;


ALTER FUNCTION "public"."close_current_question"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_live_session"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_host_player_id uuid;
  v_reused_existing boolean := false;
  v_first_part record;
begin
  perform public.require_permanent_user();

  if not (select public.is_game_owner(p_game_id)) then
    raise exception 'Game not found or not owned by current user';
  end if;

  select *
  into v_session
  from public.live_sessions ls
  where ls.game_id = p_game_id
    and ls.phase <> 'finished'
  order by ls.updated_at desc, ls.created_at desc
  limit 1;

  if v_session.id is null then
    select *
    into v_first_part
    from public.build_game_section_partitions(p_game_id)
    order by part_index asc
    limit 1;

    insert into public.live_sessions (
      game_id,
      title,
      invite_code,
      created_by,
      part_index,
      part_count,
      current_part_start_index,
      current_part_end_index,
      phase_started_at
    )
    select
      g.id,
      g.title,
      public.generate_invite_code(),
      (select auth.uid()),
      0,
      coalesce(v_first_part.part_count, 1),
      coalesce(v_first_part.start_index, 0),
      coalesce(v_first_part.end_index, 0),
      now()
    from public.games g
    where g.id = p_game_id
    returning * into v_session;
  else
    v_reused_existing := true;
    v_session := public.sync_live_session_phase(v_session.id);
  end if;

  insert into public.session_players (
    session_id,
    auth_user_id,
    display_name,
    role
  )
  values (
    v_session.id,
    (select auth.uid()),
    'Host',
    'host'
  )
  on conflict (session_id, auth_user_id) do update
  set
    role = 'host',
    is_connected = true,
    last_seen_at = now()
  returning id into v_host_player_id;

  if v_session.host_player_id is distinct from v_host_player_id then
    update public.live_sessions
    set host_player_id = v_host_player_id
    where id = v_session.id
    returning * into v_session;
  end if;

  return jsonb_build_object(
    'sessionId', v_session.id,
    'inviteCode', v_session.invite_code,
    'reusedExisting', v_reused_existing
  );
end;
$$;


ALTER FUNCTION "public"."create_live_session"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_game_cascade"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_paths text[] := '{}';
begin
  perform public.require_permanent_user();

  if not (select public.is_game_owner(p_game_id)) then
    raise exception 'Game not found or not owned by current user';
  end if;

  select coalesce(array_agg(distinct media_path) filter (where media_path is not null), '{}')
  into v_paths
  from (
    select nullif(q.media->>'path', '') as media_path
    from public.questions q
    where q.game_id = p_game_id
    union all
    select nullif(q.reveal_media->>'path', '') as media_path
    from public.questions q
    where q.game_id = p_game_id
  ) paths;

  delete from public.games
  where id = p_game_id
    and owner_id = (select auth.uid());

  return jsonb_build_object(
    'deleted', true,
    'mediaPaths', to_jsonb(v_paths)
  );
end;
$$;


ALTER FUNCTION "public"."delete_game_cascade"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_past_session"("p_session_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  return public.cancel_session(p_session_id);
end;
$$;


ALTER FUNCTION "public"."delete_past_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_session"("p_session_id" "uuid") RETURNS "public"."live_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_finished_at timestamptz := now();
begin
  update public.live_sessions
  set
    phase = 'finished',
    question_started_at = null,
    question_ends_at = null,
    phase_started_at = v_finished_at,
    phase_ends_at = null,
    paused_at = null,
    pause_remaining_ms = null,
    finished_at = coalesce(finished_at, v_finished_at)
  where id = p_session_id
  returning * into v_session;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  insert into public.session_results (session_id, leaderboard)
  values (
    p_session_id,
    public.build_session_leaderboard(p_session_id)
  )
  on conflict (session_id) do update
  set leaderboard = excluded.leaderboard;

  return v_session;
end;
$$;


ALTER FUNCTION "public"."finish_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invite_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  generated text;
begin
  loop
    generated := upper(substring(encode(extensions.gen_random_bytes(4), 'hex') from 1 for 6));

    exit when not exists (
      select 1
      from public.live_sessions ls
      where ls.invite_code = generated
    );
  end loop;

  return generated;
end;
$$;


ALTER FUNCTION "public"."generate_invite_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invite_session_summary"("p_invite_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
begin
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


ALTER FUNCTION "public"."get_invite_session_summary"("p_invite_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_entitlements"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'private', 'public', 'pg_temp'
    AS $$
begin
  perform public.require_permanent_user();

  return (
    select coalesce(jsonb_build_object(
      'planKey', plan_key,
      'maxActiveRoomsPerAccount', max_active_rooms_per_account,
      'maxPlayersPerRoom', max_players_per_room
    ), '{}'::jsonb)
    from private.account_entitlements((select auth.uid()))
  );
end;
$$;


ALTER FUNCTION "public"."get_my_entitlements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_owned_game_status"("p_game_id" "uuid") RETURNS TABLE("game_id" "uuid", "title" "text", "updated_at" timestamp with time zone, "question_count" integer, "active_session_id" "uuid", "active_invite_code" "text", "active_phase" "public"."session_phase", "active_player_count" integer, "active_host_connected" boolean, "active_session_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.require_permanent_user();

  if not (select public.is_game_owner(p_game_id)) then
    return;
  end if;

  return query
  select
    g.id as game_id,
    g.title,
    g.updated_at,
    (
      select count(*)::integer
      from public.questions q
      where q.game_id = g.id
    ) as question_count,
    active_session.id as active_session_id,
    active_session.invite_code as active_invite_code,
    active_session.phase as active_phase,
    coalesce((
      select count(*)::integer
      from public.session_players sp
      where sp.session_id = active_session.id
        and sp.role = 'player'
    ), 0) as active_player_count,
    (
      select coalesce(
        host_player.is_connected and host_player.last_seen_at >= now() - interval '20 seconds',
        false
      )
      from public.session_players host_player
      where host_player.id = active_session.host_player_id
    ) as active_host_connected,
    active_session.updated_at as active_session_updated_at
  from public.games g
  left join lateral (
    select
      ls.id,
      ls.invite_code,
      ls.phase,
      ls.host_player_id,
      ls.updated_at
    from public.live_sessions ls
    where ls.game_id = g.id
      and ls.phase <> 'finished'
    order by ls.updated_at desc, ls.created_at desc
    limit 1
  ) active_session on true
  where g.id = p_game_id
    and g.owner_id = (select auth.uid());
end;
$$;


ALTER FUNCTION "public"."get_owned_game_status"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_server_time"() RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;


ALTER FUNCTION "public"."get_server_time"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_session_snapshot"("p_session_id" "uuid", "p_current_player_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."get_session_snapshot"("p_session_id" "uuid", "p_current_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_session_snapshot_before_answer_transition"("p_session_id" "uuid", "p_current_player_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_resolved_player_id uuid;
  v_viewer_role public.session_player_role;
  v_snapshot jsonb;
begin
  select * into v_session
  from public.live_sessions ls
  where ls.id = p_session_id;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  if not (select public.can_read_session(p_session_id)) then
    raise exception 'Session not found or access denied';
  end if;

  v_session := public.sync_live_session_phase(p_session_id);

  if p_current_player_id is not null then
    select sp.id into v_resolved_player_id
    from public.session_players sp
    where sp.id = p_current_player_id
      and sp.session_id = p_session_id
      and sp.auth_user_id = (select auth.uid())
    limit 1;
  end if;

  if v_resolved_player_id is null then
    select sp.id into v_resolved_player_id
    from public.session_players sp
    where sp.session_id = p_session_id
      and sp.auth_user_id = (select auth.uid())
    order by sp.joined_at asc
    limit 1;
  end if;

  if v_resolved_player_id is not null then
    select sp.role into v_viewer_role
    from public.session_players sp
    where sp.id = v_resolved_player_id;
  elsif v_session.created_by = (select auth.uid()) then
    v_viewer_role := 'host';
  else
    v_viewer_role := null;
  end if;

  with session_data as (
    select *
    from public.live_sessions ls
    where ls.id = p_session_id
  ),
  section_partitions as (
    select *
    from public.build_game_section_partitions((select game_id from session_data))
  ),
  current_section as (
    select *
    from section_partitions sp
    where sp.part_index = (select part_index from session_data)
    limit 1
  ),
  game_questions as (
    select
      q.id,
      q.game_id,
      q.section_id,
      q.position,
      q.prompt,
      q.prompt_i18n,
      q.duration_seconds,
      q.points,
      q.correct_option_id,
      q.media,
      q.reveal_media,
      q.reveal_text,
      q.reveal_text_i18n,
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', qo.id,
              'text', qo.text,
              'textI18n', qo.text_i18n
            )
            order by qo.position asc, qo.id asc
          ),
          '[]'::jsonb
        )
        from public.question_options qo
        where qo.question_id = q.id
      ) as options
    from public.questions q
    where q.game_id = (select game_id from session_data)
  ),
  game_sections_data as (
    select
      gs.id,
      gs.position,
      gs.title,
      gs.title_i18n,
      coalesce(
        (
          select jsonb_agg(to_jsonb(gq.id) order by gq.position asc)
          from game_questions gq
          where gq.section_id = gs.id
        ),
        '[]'::jsonb
      ) as question_ids
    from public.game_sections gs
    where gs.game_id = (select game_id from session_data)
  ),
  game_data as (
    select
      g.id,
      g.title,
      g.title_i18n,
      g.primary_locale,
      g.owner_id,
      g.default_question_points,
      g.default_section_intermission_seconds,
      g.created_at,
      g.updated_at,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', gq.id,
              'sectionId', gq.section_id,
              'position', gq.position,
              'prompt', gq.prompt,
              'promptI18n', gq.prompt_i18n,
              'durationSeconds', gq.duration_seconds,
              'points', gq.points,
              'correctOptionId', null,
              'media', gq.media,
              'revealMedia', gq.reveal_media,
              'revealText', gq.reveal_text,
              'revealTextI18n', gq.reveal_text_i18n,
              'options', gq.options
            )
            order by gq.position asc
          )
          from game_questions gq
          where gq.game_id = g.id
        ),
        '[]'::jsonb
      ) as questions,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', gsd.id,
              'position', gsd.position,
              'title', gsd.title,
              'titleI18n', gsd.title_i18n,
              'questionIds', gsd.question_ids
            )
            order by gsd.position asc
          )
          from game_sections_data gsd
        ),
        '[]'::jsonb
      ) as sections
    from public.games g
    where g.id = (select game_id from session_data)
    group by g.id
  ),
  player_data as (
    select
      sp.id,
      sp.session_id,
      sp.auth_user_id,
      sp.display_name,
      sp.avatar_key,
      sp.role,
      sp.joined_at,
      sp.last_seen_at,
      (sp.is_connected and sp.last_seen_at >= now() - interval '20 seconds') as is_connected,
      sp.score
    from public.session_players sp
    where sp.session_id = p_session_id
    order by sp.role asc, sp.score desc, sp.joined_at asc
  ),
  leaderboard_data as (
    select public.build_session_leaderboard(p_session_id) as value
  ),
  round_summary_data as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'playerId', ranked.player_id,
          'displayName', ranked.display_name,
          'avatarKey', ranked.avatar_key,
          'pointsGained', ranked.points_gained,
          'rank', ranked.rank,
          'totalScore', ranked.total_score
        )
        order by ranked.points_gained desc, ranked.joined_at asc
      ),
      '[]'::jsonb
    ) as value
    from (
      select
        scored.player_id,
        scored.display_name,
        scored.avatar_key,
        scored.joined_at,
        scored.total_score,
        scored.points_gained,
        dense_rank() over (
          order by scored.points_gained desc, scored.joined_at asc
        ) as rank
      from (
        select
          sp.id as player_id,
          sp.display_name,
          sp.avatar_key,
          sp.joined_at,
          sp.score as total_score,
          coalesce(sum(ans.awarded_points), 0)::integer as points_gained
        from public.session_players sp
        left join public.answer_submissions ans
          on ans.player_id = sp.id
          and ans.session_id = sp.session_id
          and ans.part_index = (select part_index from session_data)
        where sp.session_id = p_session_id
          and sp.role = 'player'
        group by sp.id, sp.display_name, sp.avatar_key, sp.joined_at, sp.score
      ) scored
    ) ranked
  ),
  current_question_data as (
    select jsonb_build_object(
      'id', gq.id,
      'sectionId', gq.section_id,
      'position', gq.position,
      'prompt', gq.prompt,
      'promptI18n', gq.prompt_i18n,
      'durationSeconds', gq.duration_seconds,
      'points', gq.points,
      'correctOptionId', case
        when (select phase from session_data) = 'answer_reveal'
          then gq.correct_option_id
        else null
      end,
      'media', case
        when v_viewer_role = 'host' and (select phase from session_data) = 'question_active'
          then gq.media
        else null
      end,
      'revealMedia', case
        when v_viewer_role = 'host' and (select phase from session_data) = 'answer_reveal'
          then gq.reveal_media
        else null
      end,
      'revealText', case
        when v_viewer_role = 'host' and (select phase from session_data) = 'answer_reveal'
          then gq.reveal_text
        else null
      end,
      'revealTextI18n', case
        when v_viewer_role = 'host' and (select phase from session_data) = 'answer_reveal'
          then gq.reveal_text_i18n
        else '{}'::jsonb
      end,
      'options', gq.options
    ) as value
    from game_questions gq
    where gq.position = (select current_question_index from session_data)
      and (select phase from session_data) in ('question_active', 'answer_reveal')
  ),
  current_answer as (
    select ans.option_id, ans.is_correct, ans.awarded_points
    from public.answer_submissions ans
    where ans.session_id = p_session_id
      and ans.player_id = v_resolved_player_id
      and ans.question_id = (
        select gq.id
        from game_questions gq
        where gq.position = (select current_question_index from session_data)
      )
    limit 1
  )
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', sd.id,
      'gameId', sd.game_id,
      'inviteCode', sd.invite_code,
      'title', sd.title,
      'hostPlayerId', sd.host_player_id,
      'phase', sd.phase,
      'currentQuestionIndex', sd.current_question_index,
      'questionStartedAt', sd.question_started_at,
      'questionEndsAt', sd.question_ends_at,
      'phaseStartedAt', sd.phase_started_at,
      'phaseEndsAt', sd.phase_ends_at,
      'partIndex', sd.part_index,
      'partCount', sd.part_count,
      'currentPartStartIndex', sd.current_part_start_index,
      'currentPartEndIndex', sd.current_part_end_index,
      'currentSectionId', (select section_id from current_section),
      'currentSectionTitle', (select section_title from current_section),
      'sectionIndex', sd.part_index,
      'sectionCount', sd.part_count,
      'currentSectionStartIndex', sd.current_part_start_index,
      'currentSectionEndIndex', sd.current_part_end_index,
      'isPaused', sd.paused_at is not null,
      'pausedAt', sd.paused_at,
      'finishedAt', sd.finished_at,
      'createdAt', sd.created_at,
      'updatedAt', sd.updated_at
    ),
    'game', (
      select jsonb_build_object(
        'id', gd.id,
        'title', gd.title,
        'titleI18n', gd.title_i18n,
        'primaryLocale', gd.primary_locale,
        'ownerId', gd.owner_id,
        'defaultQuestionPoints', gd.default_question_points,
        'defaultSectionIntermissionSeconds', gd.default_section_intermission_seconds,
        'createdAt', gd.created_at,
        'updatedAt', gd.updated_at,
        'questions', gd.questions,
        'sections', gd.sections
      )
      from game_data gd
    ),
    'players', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', pd.id,
            'sessionId', pd.session_id,
            'authUserId', pd.auth_user_id,
            'displayName', pd.display_name,
            'avatarKey', pd.avatar_key,
            'role', pd.role,
            'joinedAt', pd.joined_at,
            'lastSeenAt', pd.last_seen_at,
            'isConnected', pd.is_connected,
            'score', pd.score
          )
          order by pd.role asc, pd.score desc, pd.joined_at asc
        ),
        '[]'::jsonb
      )
      from player_data pd
    ),
    'leaderboard', (select value from leaderboard_data),
    'roundSummary', (select value from round_summary_data),
    'currentQuestion', (select value from current_question_data),
    'currentPlayerId', v_resolved_player_id,
    'viewerRole', v_viewer_role,
    'submittedOptionId', (select option_id from current_answer),
    'submittedIsCorrect', case
      when sd.phase = 'question_active' then null
      else (select is_correct from current_answer)
    end,
    'submittedPoints', case
      when sd.phase = 'question_active' then null
      else (select awarded_points from current_answer)
    end
  )
  into v_snapshot
  from session_data sd;

  return v_snapshot;
end;
$$;


ALTER FUNCTION "public"."get_session_snapshot_before_answer_transition"("p_session_id" "uuid", "p_current_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."host_advance_session_phase"("p_session_id" "uuid", "p_expected_phase" "public"."session_phase" DEFAULT NULL::"public"."session_phase") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_question_count integer;
begin
  perform public.require_permanent_user();
  v_session := public.sync_live_session_phase(p_session_id);

  if not (select public.is_session_host(p_session_id)) then
    raise exception 'Only the host can advance the game';
  end if;

  if p_expected_phase is not null and v_session.phase <> p_expected_phase then
    return;
  end if;

  if v_session.phase in ('finished', 'answer_transition') then
    return;
  end if;

  if v_session.paused_at is not null then
    update public.live_sessions set paused_at = null, pause_remaining_ms = null
    where id = p_session_id;
    v_session := public.sync_live_session_phase(p_session_id);
  end if;

  select count(*)::integer into v_question_count
  from public.questions q where q.game_id = v_session.game_id;

  if v_session.phase = 'question_active' then
    perform public.begin_answer_transition(p_session_id);
  elsif v_session.phase = 'answer_reveal' then
    if v_session.current_question_index + 1 >= v_question_count then
      perform public.finish_session(p_session_id);
    elsif v_session.current_question_index >= v_session.current_part_end_index then
      perform public.begin_round_summary(p_session_id);
    else
      perform public.begin_question_phase(p_session_id, v_session.current_question_index + 1);
    end if;
  elsif v_session.phase = 'round_summary' then
    if v_session.current_question_index + 1 >= v_question_count then
      perform public.finish_session(p_session_id);
    else
      perform public.begin_round_leaderboard(p_session_id);
    end if;
  elsif v_session.phase = 'round_leaderboard' then
    if v_session.current_question_index + 1 >= v_question_count then
      perform public.finish_session(p_session_id);
    else
      perform public.begin_question_phase(p_session_id, v_session.current_question_index + 1);
    end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."host_advance_session_phase"("p_session_id" "uuid", "p_expected_phase" "public"."session_phase") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_game_owner"("p_game_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and g.owner_id = (select auth.uid())
  );
$$;


ALTER FUNCTION "public"."is_game_owner"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_permanent_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    (select auth.uid()) is not null
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) is false;
$$;


ALTER FUNCTION "public"."is_permanent_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_session_host"("p_session_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.live_sessions ls
    join public.session_players sp
      on sp.id = ls.host_player_id
    where ls.id = p_session_id
      and sp.auth_user_id = (select auth.uid())
  );
$$;


ALTER FUNCTION "public"."is_session_host"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_session_participant"("p_session_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.session_players sp
    where sp.session_id = p_session_id
      and sp.auth_user_id = (select auth.uid())
  );
$$;


ALTER FUNCTION "public"."is_session_participant"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_or_resume_session"("p_invite_code" "text", "p_display_name" "text", "p_avatar_key" "text" DEFAULT 'avatar-01'::"text", "p_resume_player_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_player public.session_players%rowtype;
  v_display_name text;
  v_avatar_key text;
begin
  v_display_name := btrim(p_display_name);
  v_avatar_key := coalesce(nullif(btrim(p_avatar_key), ''), 'avatar-01');

  if coalesce(char_length(v_display_name), 0) = 0 then
    raise exception 'Display name is required';
  end if;

  if v_avatar_key not in (
    'avatar-01',
    'avatar-02',
    'avatar-03',
    'avatar-04',
    'avatar-05',
    'avatar-06'
  ) then
    raise exception 'Avatar selection is invalid';
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
      role
    )
    values (
      v_session.id,
      (select auth.uid()),
      v_display_name,
      v_avatar_key,
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


ALTER FUNCTION "public"."join_or_resume_session"("p_invite_code" "text", "p_display_name" "text", "p_avatar_key" "text", "p_resume_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_owned_games_with_status"("p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("game_id" "uuid", "title" "text", "updated_at" timestamp with time zone, "question_count" integer, "active_session_id" "uuid", "active_invite_code" "text", "active_phase" "public"."session_phase", "active_player_count" integer, "active_host_connected" boolean, "active_session_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_limit integer := greatest(coalesce(p_limit, 50), 1);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.require_permanent_user();

  return query
  select
    g.id as game_id,
    g.title,
    g.updated_at,
    (
      select count(*)::integer
      from public.questions q
      where q.game_id = g.id
    ) as question_count,
    active_session.id as active_session_id,
    active_session.invite_code as active_invite_code,
    active_session.phase as active_phase,
    coalesce((
      select count(*)::integer
      from public.session_players sp
      where sp.session_id = active_session.id
        and sp.role = 'player'
    ), 0) as active_player_count,
    (
      select coalesce(
        host_player.is_connected and host_player.last_seen_at >= now() - interval '20 seconds',
        false
      )
      from public.session_players host_player
      where host_player.id = active_session.host_player_id
    ) as active_host_connected,
    active_session.updated_at as active_session_updated_at
  from public.games g
  left join lateral (
    select
      ls.id,
      ls.invite_code,
      ls.phase,
      ls.host_player_id,
      ls.updated_at
    from public.live_sessions ls
    where ls.game_id = g.id
      and ls.phase <> 'finished'
    order by ls.updated_at desc, ls.created_at desc
    limit 1
  ) active_session on true
  where g.owner_id = (select auth.uid())
  order by g.updated_at desc, g.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;


ALTER FUNCTION "public"."list_owned_games_with_status"("p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_past_sessions"("p_limit" integer DEFAULT 25, "p_offset" integer DEFAULT 0) RETURNS TABLE("session_id" "uuid", "game_id" "uuid", "title" "text", "primary_locale" "text", "title_i18n" "jsonb", "invite_code" "text", "phase" "public"."session_phase", "finished_at" timestamp with time zone, "player_count" integer, "winner_name" "text", "top_score" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_limit integer := greatest(coalesce(p_limit, 25), 1);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.require_permanent_user();

  return query
  with active_per_game as (
    select distinct on (ls.game_id) ls.id as active_session_id
    from public.live_sessions ls
    join public.games g on g.id = ls.game_id
    where g.owner_id = (select auth.uid())
      and ls.phase <> 'finished'
    order by ls.game_id, ls.updated_at desc, ls.created_at desc
  )
  select
    ls.id as session_id,
    ls.game_id,
    ls.title,
    g.primary_locale,
    g.title_i18n,
    ls.invite_code,
    ls.phase,
    coalesce(ls.finished_at, ls.updated_at) as finished_at,
    (
      select count(*)::integer
      from public.session_players sp
      where sp.session_id = ls.id
        and sp.role = 'player'
    ) as player_count,
    winner.display_name as winner_name,
    winner.score as top_score
  from public.live_sessions ls
  join public.games g on g.id = ls.game_id
  left join lateral (
    select sp.display_name, sp.score
    from public.session_players sp
    where sp.session_id = ls.id
      and sp.role = 'player'
    order by sp.score desc, sp.joined_at asc
    limit 1
  ) winner on true
  where g.owner_id = (select auth.uid())
    and ls.id not in (select apg.active_session_id from active_per_game apg)
  order by coalesce(ls.finished_at, ls.updated_at) desc, ls.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;


ALTER FUNCTION "public"."list_past_sessions"("p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_game_to_trash"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.require_permanent_user();

  update public.games
  set deleted_at = now()
  where id = p_game_id
    and owner_id = (select auth.uid())
    and deleted_at is null;

  if not found then
    raise exception 'Game not found or not owned by current user';
  end if;

  return jsonb_build_object('trashed', true);
end;
$$;


ALTER FUNCTION "public"."move_game_to_trash"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pause_session_flow"("p_session_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_remaining_ms integer;
begin
  v_session := public.sync_live_session_phase(p_session_id);

  if not (select public.is_session_host(p_session_id)) then
    raise exception 'Only the host can pause this session';
  end if;

  if v_session.phase not in ('answer_reveal', 'round_summary', 'round_leaderboard') then
    raise exception 'This phase cannot be paused';
  end if;

  if v_session.paused_at is not null then
    return;
  end if;

  v_remaining_ms := greatest(
    0,
    coalesce(floor(extract(epoch from (coalesce(v_session.phase_ends_at, now()) - now())) * 1000)::integer, 0)
  );

  update public.live_sessions
  set
    paused_at = now(),
    pause_remaining_ms = v_remaining_ms,
    phase_ends_at = null
  where id = p_session_id;
end;
$$;


ALTER FUNCTION "public"."pause_session_flow"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."require_permanent_user"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not (select public.is_permanent_user()) then
    raise exception 'Host sign in required';
  end if;
end;
$$;


ALTER FUNCTION "public"."require_permanent_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_game_from_trash"("p_game_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.require_permanent_user();

  update public.games
  set deleted_at = null
  where id = p_game_id
    and owner_id = (select auth.uid())
    and deleted_at is not null;

  if not found then
    raise exception 'Trashed game not found or not owned by current user';
  end if;

  return jsonb_build_object('restored', true);
end;
$$;


ALTER FUNCTION "public"."restore_game_from_trash"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resume_session_flow"("p_session_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
begin
  v_session := public.sync_live_session_phase(p_session_id);

  if not (select public.is_session_host(p_session_id)) then
    raise exception 'Only the host can resume this session';
  end if;

  if v_session.paused_at is null then
    return;
  end if;

  update public.live_sessions
  set
    paused_at = null,
    phase_ends_at = now() + coalesce(pause_remaining_ms, 0) * interval '1 millisecond',
    pause_remaining_ms = null
  where id = p_session_id;
end;
$$;


ALTER FUNCTION "public"."resume_session_flow"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_game_answer_reveal_settings"("p_game_id" "uuid", "p_seconds" integer, "p_manual_question_advance" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.require_permanent_user();

  if p_seconds < 1 or p_seconds > 300 then
    raise exception 'Default answer reveal must be between 1 and 300 seconds';
  end if;

  update public.games
  set
    default_answer_reveal_seconds = p_seconds,
    manual_question_advance = coalesce(p_manual_question_advance, false)
  where id = p_game_id
    and owner_id = (select auth.uid());

  if not found then
    raise exception 'Game not found or not owned by current user';
  end if;
end;
$$;


ALTER FUNCTION "public"."set_game_answer_reveal_settings"("p_game_id" "uuid", "p_seconds" integer, "p_manual_question_advance" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_game_default_answer_reveal_seconds"("p_game_id" "uuid", "p_seconds" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_manual_question_advance boolean;
begin
  select g.manual_question_advance
  into v_manual_question_advance
  from public.games g
  where g.id = p_game_id
    and g.owner_id = (select auth.uid());

  if v_manual_question_advance is null then
    raise exception 'Game not found or not owned by current user';
  end if;

  perform public.set_game_answer_reveal_settings(
    p_game_id,
    p_seconds,
    v_manual_question_advance
  );
end;
$$;


ALTER FUNCTION "public"."set_game_default_answer_reveal_seconds"("p_game_id" "uuid", "p_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_game_primary_locale"("p_game_id" "uuid", "p_locale" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_owner uuid;
  v_has_translations boolean;
begin
  if p_locale not in ('en', 'ru', 'be', 'pl') then
    raise exception 'Unsupported locale: %', p_locale;
  end if;

  select owner_id into v_owner
  from public.games
  where id = p_game_id;

  if v_owner is null then
    raise exception 'Game not found';
  end if;

  if v_owner <> (select auth.uid()) then
    raise exception 'Not authorized';
  end if;

  select exists (
    select 1 from public.games g
    where g.id = p_game_id and g.title_i18n <> '{}'::jsonb
    union all
    select 1 from public.game_sections s
    where s.game_id = p_game_id and s.title_i18n <> '{}'::jsonb
    union all
    select 1 from public.questions q
    where q.game_id = p_game_id
      and (q.prompt_i18n <> '{}'::jsonb or q.reveal_text_i18n <> '{}'::jsonb)
    union all
    select 1 from public.question_options qo
    join public.questions q on q.id = qo.question_id
    where q.game_id = p_game_id and qo.text_i18n <> '{}'::jsonb
  ) into v_has_translations;

  if v_has_translations then
    raise exception 'Clear all translations before changing the primary language';
  end if;

  update public.games
  set primary_locale = p_locale
  where id = p_game_id;
end;
$$;


ALTER FUNCTION "public"."set_game_primary_locale"("p_game_id" "uuid", "p_locale" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_gameplay"("p_session_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_question_count integer;
begin
  v_session := public.sync_live_session_phase(p_session_id);

  if not (select public.is_session_host(p_session_id)) then
    raise exception 'Only the host can start gameplay';
  end if;

  if v_session.phase <> 'lobby' then
    raise exception 'This session has already started';
  end if;

  select count(*)::integer
  into v_question_count
  from public.questions q
  where q.game_id = v_session.game_id;

  if v_question_count = 0 then
    raise exception 'A session cannot start without at least one question';
  end if;

  perform public.begin_question_phase(p_session_id, 0);
end;
$$;


ALTER FUNCTION "public"."start_gameplay"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_answer"("p_session_id" "uuid", "p_question_id" "uuid", "p_option_id" "uuid", "p_client_submitted_at_ms" bigint DEFAULT NULL::bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_player public.session_players%rowtype;
  v_question public.questions%rowtype;
  v_submission_id uuid;
  v_points integer := 0;
  v_correct boolean := false;
  v_player_count integer;
  v_answer_count integer;
  v_server_ms bigint;
  v_skew_ms bigint;
  v_effective_ms bigint;
  v_deadline_ms bigint;
  c_skew_tolerance_ms constant bigint := 200;
begin
  v_session := public.sync_live_session_phase(p_session_id);

  if v_session.phase <> 'question_active'
    or v_session.question_ends_at is null then
    raise exception 'This question is no longer accepting answers';
  end if;

  v_server_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_deadline_ms := (extract(epoch from v_session.question_ends_at) * 1000)::bigint;

  if p_client_submitted_at_ms is null then
    v_effective_ms := v_server_ms;
  else
    v_skew_ms := abs(v_server_ms - p_client_submitted_at_ms);
    if v_skew_ms > c_skew_tolerance_ms then
      v_effective_ms := v_server_ms;
    else
      v_effective_ms := least(v_server_ms, p_client_submitted_at_ms);
    end if;
  end if;

  if v_effective_ms > v_deadline_ms then
    raise exception 'This question is no longer accepting answers';
  end if;

  select *
  into v_player
  from public.session_players sp
  where sp.session_id = p_session_id
    and sp.auth_user_id = (select auth.uid())
  order by sp.joined_at asc
  limit 1;

  if v_player.id is null then
    raise exception 'Player is not part of this session';
  end if;

  if v_player.role <> 'player' then
    raise exception 'The host cannot submit answers';
  end if;

  select *
  into v_question
  from public.questions q
  where q.id = p_question_id
    and q.game_id = v_session.game_id
    and q.position = v_session.current_question_index;

  if v_question.id is null then
    raise exception 'Question is not active for this session';
  end if;

  if not exists (
    select 1
    from public.question_options qo
    where qo.id = p_option_id
      and qo.question_id = p_question_id
  ) then
    raise exception 'Selected option does not belong to the active question';
  end if;

  if v_question.correct_option_id = p_option_id then
    v_correct := true;
    v_points := v_question.points;
  end if;

  insert into public.answer_submissions (
    session_id,
    question_id,
    player_id,
    option_id,
    is_correct,
    awarded_points,
    part_index
  )
  values (
    p_session_id,
    p_question_id,
    v_player.id,
    p_option_id,
    v_correct,
    v_points,
    v_session.part_index
  )
  on conflict (session_id, question_id, player_id) do nothing
  returning id into v_submission_id;

  if v_submission_id is null then
    -- Treat duplicate submissions as success — the client may have retried
    -- after a transient failure (see C3 optimistic submission).
    return;
  end if;

  update public.session_players
  set
    score = score + v_points,
    is_connected = true,
    last_seen_at = now()
  where id = v_player.id;

  select count(*)::integer
  into v_player_count
  from public.session_players sp
  where sp.session_id = p_session_id
    and sp.role = 'player';

  select count(*)::integer
  into v_answer_count
  from public.answer_submissions ans
  join public.session_players sp
    on sp.id = ans.player_id
  where ans.session_id = p_session_id
    and ans.question_id = p_question_id
    and sp.role = 'player';

  if v_player_count > 0 and v_answer_count >= v_player_count then
    perform public.begin_answer_reveal(p_session_id);
  end if;
end;
$$;


ALTER FUNCTION "public"."submit_answer"("p_session_id" "uuid", "p_question_id" "uuid", "p_option_id" "uuid", "p_client_submitted_at_ms" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_live_session_phase"("p_session_id" "uuid") RETURNS "public"."live_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_session public.live_sessions%rowtype;
  v_question_count integer;
begin
  loop
    select *
    into v_session
    from public.live_sessions ls
    where ls.id = p_session_id
    for update;

    if v_session.id is null then
      raise exception 'Session not found';
    end if;

    if v_session.phase = 'finished' then
      insert into public.session_results (session_id, leaderboard)
      values (p_session_id, public.build_session_leaderboard(p_session_id))
      on conflict (session_id) do update
      set leaderboard = excluded.leaderboard;
      return v_session;
    end if;

    if v_session.paused_at is not null then
      return v_session;
    end if;

    if v_session.phase_ends_at is null or v_session.phase_ends_at > now() then
      return v_session;
    end if;

    select count(*)::integer into v_question_count
    from public.questions q where q.game_id = v_session.game_id;

    if v_session.phase = 'question_active' then
      v_session := public.begin_answer_transition(p_session_id);
      continue;
    end if;

    if v_session.phase = 'answer_transition' then
      v_session := public.begin_visible_answer_reveal(p_session_id);
      continue;
    end if;

    if v_session.phase = 'answer_reveal' then
      if v_session.current_question_index + 1 >= v_question_count then
        v_session := public.finish_session(p_session_id);
      elsif v_session.current_question_index >= v_session.current_part_end_index then
        v_session := public.begin_round_summary(p_session_id);
      else
        v_session := public.begin_question_phase(p_session_id, v_session.current_question_index + 1);
      end if;
      continue;
    end if;

    if v_session.phase = 'round_summary' then
      if v_session.current_question_index + 1 >= v_question_count then
        v_session := public.finish_session(p_session_id);
      else
        v_session := public.begin_round_leaderboard(p_session_id);
      end if;
      continue;
    end if;

    if v_session.phase = 'round_leaderboard' then
      if v_session.current_question_index + 1 >= v_question_count then
        v_session := public.finish_session(p_session_id);
      else
        v_session := public.begin_question_phase(p_session_id, v_session.current_question_index + 1);
      end if;
      continue;
    end if;

    return v_session;
  end loop;
end;
$$;


ALTER FUNCTION "public"."sync_live_session_phase"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_session_presence"("p_session_id" "uuid", "p_player_id" "uuid" DEFAULT NULL::"uuid", "p_is_connected" boolean DEFAULT true) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_player_id uuid;
begin
  perform public.sync_live_session_phase(p_session_id);

  if p_player_id is not null then
    update public.session_players
    set
      is_connected = p_is_connected,
      last_seen_at = now()
    where id = p_player_id
      and session_id = p_session_id
      and auth_user_id = (select auth.uid())
    returning id into v_player_id;
  end if;

  if v_player_id is null then
    update public.session_players
    set
      is_connected = p_is_connected,
      last_seen_at = now()
    where id = (
      select sp.id
      from public.session_players sp
      where sp.session_id = p_session_id
        and sp.auth_user_id = (select auth.uid())
      order by sp.joined_at asc
      limit 1
    )
    returning id into v_player_id;
  end if;

  return v_player_id;
end;
$$;


ALTER FUNCTION "public"."update_session_presence"("p_session_id" "uuid", "p_player_id" "uuid", "p_is_connected" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_game_with_questions"("p_game_id" "uuid", "p_title" "text", "p_questions" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_game_id uuid;
  v_sections jsonb;
  v_section jsonb;
  v_question jsonb;
  v_option jsonb;
  v_section_id uuid;
  v_question_id uuid;
  v_option_count integer;
  v_section_position integer := 0;
  v_question_position integer := 0;
  v_option_position integer;
  v_default_question_points integer := 1;
  v_existing_default_question_points integer;
  v_question_points integer;
  v_default_section_intermission_seconds integer := 10;
  v_existing_default_section_intermission_seconds integer;
  v_section_intermission_mode text;
  v_section_intermission_seconds integer;
  v_primary_locale text := 'en';
  v_existing_primary_locale text;
  v_title_i18n jsonb := '{}'::jsonb;
begin
  perform public.require_permanent_user();

  if coalesce(char_length(btrim(p_title)), 0) = 0 then
    raise exception 'Game title is required';
  end if;

  if p_questions is null then
    raise exception 'Questions payload is required';
  end if;

  if jsonb_typeof(p_questions) = 'array' then
    v_sections := jsonb_build_array(
      jsonb_build_object('title', 'Section 1', 'questions', p_questions)
    );
  elsif jsonb_typeof(p_questions) = 'object'
    and jsonb_typeof(p_questions->'sections') = 'array' then
    v_sections := p_questions->'sections';
    v_primary_locale := coalesce(nullif(p_questions->>'primaryLocale', ''), v_primary_locale);
    v_title_i18n := coalesce(p_questions->'titleI18n', '{}'::jsonb);
    v_default_question_points := coalesce(
      (p_questions->>'defaultQuestionPoints')::integer,
      v_default_question_points
    );
    v_default_section_intermission_seconds := coalesce(
      (p_questions->>'defaultSectionIntermissionSeconds')::integer,
      v_default_section_intermission_seconds
    );
  else
    raise exception 'Questions payload must be a JSON array or an object with a sections array';
  end if;

  if v_primary_locale not in ('en', 'ru', 'be', 'pl') then
    raise exception 'Unsupported locale: %', v_primary_locale;
  end if;

  perform public.validate_i18n_map(v_title_i18n, v_primary_locale, 'game title');

  if jsonb_array_length(v_sections) = 0 then
    raise exception 'A game must include at least one section';
  end if;

  if p_game_id is not null then
    select
      g.default_question_points,
      g.default_section_intermission_seconds,
      g.primary_locale
    into
      v_existing_default_question_points,
      v_existing_default_section_intermission_seconds,
      v_existing_primary_locale
    from public.games g
    where g.id = p_game_id;

    v_default_question_points := coalesce(
      (p_questions->>'defaultQuestionPoints')::integer,
      v_existing_default_question_points,
      v_default_question_points
    );
    v_default_section_intermission_seconds := coalesce(
      (p_questions->>'defaultSectionIntermissionSeconds')::integer,
      v_existing_default_section_intermission_seconds,
      v_default_section_intermission_seconds
    );
    v_primary_locale := coalesce(
      nullif(p_questions->>'primaryLocale', ''),
      v_existing_primary_locale,
      v_primary_locale
    );
  end if;

  if v_default_question_points < 1 or v_default_question_points > 10 then
    raise exception 'Default question points must be between 1 and 10';
  end if;

  if v_default_section_intermission_seconds < 0
    or v_default_section_intermission_seconds > 300 then
    raise exception 'Default section intermission must be between 0 and 300 seconds';
  end if;

  if p_game_id is null then
    insert into public.games (
      title,
      title_i18n,
      primary_locale,
      owner_id,
      default_question_points,
      default_section_intermission_seconds
    )
    values (
      btrim(p_title),
      v_title_i18n,
      v_primary_locale,
      (select auth.uid()),
      v_default_question_points,
      v_default_section_intermission_seconds
    )
    returning id into v_game_id;
  else
    update public.games
    set
      title = btrim(p_title),
      title_i18n = v_title_i18n,
      primary_locale = v_primary_locale,
      default_question_points = v_default_question_points,
      default_section_intermission_seconds = v_default_section_intermission_seconds
    where id = p_game_id
      and owner_id = (select auth.uid())
    returning id into v_game_id;
  end if;

  if v_game_id is null then
    raise exception 'Game not found or not owned by current user';
  end if;

  delete from public.questions where game_id = v_game_id;
  delete from public.game_sections where game_id = v_game_id;

  for v_section in select value from jsonb_array_elements(v_sections) loop
    if coalesce(char_length(btrim(v_section->>'title')), 0) = 0 then
      raise exception 'Section title is required';
    end if;

    if jsonb_typeof(v_section->'questions') <> 'array'
      or jsonb_array_length(v_section->'questions') = 0 then
      raise exception 'Each section must include at least one question';
    end if;

    perform public.validate_i18n_map(
      coalesce(v_section->'titleI18n', '{}'::jsonb),
      v_primary_locale,
      'section title'
    );

    v_section_intermission_mode := coalesce(
      nullif(btrim(v_section->>'intermissionMode'), ''),
      'inherit'
    );

    if v_section_intermission_mode not in ('inherit', 'timer', 'manual') then
      raise exception 'Invalid section intermission mode: %', v_section_intermission_mode;
    end if;

    v_section_intermission_seconds := nullif(v_section->>'intermissionSeconds', '')::integer;

    if v_section_intermission_mode = 'timer' then
      if v_section_intermission_seconds is null then
        raise exception 'Section intermission seconds are required when mode is timer';
      end if;
      if v_section_intermission_seconds < 0
        or v_section_intermission_seconds > 300 then
        raise exception 'Section intermission seconds must be between 0 and 300';
      end if;
    else
      v_section_intermission_seconds := null;
    end if;

    v_section_id := coalesce((v_section->>'id')::uuid, gen_random_uuid());

    insert into public.game_sections (
      id,
      game_id,
      position,
      title,
      title_i18n,
      intermission_mode,
      intermission_seconds
    )
    values (
      v_section_id,
      v_game_id,
      v_section_position,
      btrim(v_section->>'title'),
      coalesce(v_section->'titleI18n', '{}'::jsonb),
      v_section_intermission_mode,
      v_section_intermission_seconds
    );

    for v_question in select value from jsonb_array_elements(v_section->'questions') loop
      v_option_count := case
        when jsonb_typeof(v_question->'options') = 'array'
          then jsonb_array_length(v_question->'options')
        else 0
      end;

      if coalesce(char_length(btrim(v_question->>'prompt')), 0) = 0 then
        raise exception 'Question prompt is required';
      end if;

      if v_option_count <> 4 then
        raise exception 'Each question must include exactly four options';
      end if;

      perform public.validate_i18n_map(
        coalesce(v_question->'promptI18n', '{}'::jsonb),
        v_primary_locale,
        'question prompt'
      );
      perform public.validate_i18n_map(
        coalesce(v_question->'revealTextI18n', '{}'::jsonb),
        v_primary_locale,
        'question reveal text'
      );

      v_question_points := coalesce(
        (v_question->>'points')::integer,
        v_default_question_points
      );

      if v_question_points < 1 or v_question_points > 10 then
        raise exception 'Question points must be between 1 and 10';
      end if;

      v_question_id := coalesce((v_question->>'id')::uuid, gen_random_uuid());

      insert into public.questions (
        id,
        game_id,
        section_id,
        position,
        prompt,
        prompt_i18n,
        duration_seconds,
        points,
        correct_option_id,
        media,
        reveal_media,
        reveal_text,
        reveal_text_i18n
      )
      values (
        v_question_id,
        v_game_id,
        v_section_id,
        v_question_position,
        btrim(v_question->>'prompt'),
        coalesce(v_question->'promptI18n', '{}'::jsonb),
        coalesce((v_question->>'durationSeconds')::integer, 20),
        v_question_points,
        (v_question->>'correctOptionId')::uuid,
        v_question->'media',
        v_question->'revealMedia',
        nullif(btrim(v_question->>'revealText'), ''),
        coalesce(v_question->'revealTextI18n', '{}'::jsonb)
      );

      v_option_position := 0;

      for v_option in select value from jsonb_array_elements(v_question->'options') loop
        if coalesce(char_length(btrim(v_option->>'text')), 0) = 0 then
          raise exception 'Question options cannot be blank';
        end if;

        perform public.validate_i18n_map(
          coalesce(v_option->'textI18n', '{}'::jsonb),
          v_primary_locale,
          'question option'
        );

        insert into public.question_options (
          id,
          question_id,
          position,
          text,
          text_i18n
        )
        values (
          coalesce((v_option->>'id')::uuid, gen_random_uuid()),
          v_question_id,
          v_option_position,
          btrim(v_option->>'text'),
          coalesce(v_option->'textI18n', '{}'::jsonb)
        );

        v_option_position := v_option_position + 1;
      end loop;

      v_question_position := v_question_position + 1;
    end loop;

    v_section_position := v_section_position + 1;
  end loop;

  return v_game_id;
end;
$$;


ALTER FUNCTION "public"."upsert_game_with_questions"("p_game_id" "uuid", "p_title" "text", "p_questions" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_i18n_map"("p_map" "jsonb", "p_primary_locale" "text", "p_field" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_key text;
  v_entry jsonb;
begin
  if p_map is null then
    return;
  end if;

  if jsonb_typeof(p_map) <> 'object' then
    raise exception '% translations must be a JSON object', p_field;
  end if;

  for v_key, v_entry in
    select key, value
    from jsonb_each(p_map)
  loop
    if v_key not in ('en', 'ru', 'be', 'pl') then
      raise exception 'Unsupported translation locale for %: %', p_field, v_key;
    end if;

    if v_key = p_primary_locale then
      raise exception '% translations cannot include the primary locale: %', p_field, v_key;
    end if;

    if v_entry = 'null'::jsonb then
      continue;
    end if;

    if jsonb_typeof(v_entry) <> 'object'
      or jsonb_typeof(v_entry->'text') <> 'string'
      or jsonb_typeof(v_entry->'source_hash') <> 'string' then
      raise exception '% translation entries must be {text, source_hash}', p_field;
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "public"."validate_i18n_map"("p_map" "jsonb", "p_primary_locale" "text", "p_field" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."answer_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "option_id" "uuid",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_correct" boolean DEFAULT false NOT NULL,
    "awarded_points" integer DEFAULT 0 NOT NULL,
    "part_index" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "answer_submissions_awarded_points_check" CHECK (("awarded_points" >= 0))
);


ALTER TABLE "public"."answer_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "title" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "intermission_mode" "text" DEFAULT 'inherit'::"text" NOT NULL,
    "intermission_seconds" integer,
    "title_i18n" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "game_sections_intermission_mode_check" CHECK (("intermission_mode" = ANY (ARRAY['inherit'::"text", 'timer'::"text", 'manual'::"text"]))),
    CONSTRAINT "game_sections_intermission_seconds_check" CHECK ((("intermission_seconds" IS NULL) OR (("intermission_seconds" >= 0) AND ("intermission_seconds" <= 300)))),
    CONSTRAINT "game_sections_intermission_timer_requires_seconds" CHECK ((("intermission_mode" <> 'timer'::"text") OR ("intermission_seconds" IS NOT NULL))),
    CONSTRAINT "game_sections_position_check" CHECK (("position" >= 0)),
    CONSTRAINT "game_sections_title_check" CHECK (("char_length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."game_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "revision" integer NOT NULL,
    "state" "text" NOT NULL,
    "game_mode" "text" DEFAULT 'classic'::"text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sealed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_versions_check" CHECK (((("state" = 'draft'::"text") AND ("sealed_at" IS NULL)) OR (("state" = 'sealed'::"text") AND ("sealed_at" IS NOT NULL)))),
    CONSTRAINT "game_versions_revision_check" CHECK (("revision" > 0)),
    CONSTRAINT "game_versions_state_check" CHECK (("state" = ANY (ARRAY['draft'::"text", 'sealed'::"text"])))
);


ALTER TABLE "public"."game_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "title" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_question_points" integer DEFAULT 1 NOT NULL,
    "default_section_intermission_seconds" integer DEFAULT 10 NOT NULL,
    "primary_locale" "text" DEFAULT 'en'::"text" NOT NULL,
    "title_i18n" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "default_answer_reveal_seconds" integer DEFAULT 5 NOT NULL,
    "manual_question_advance" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "games_default_answer_reveal_seconds_check" CHECK ((("default_answer_reveal_seconds" >= 1) AND ("default_answer_reveal_seconds" <= 300))),
    CONSTRAINT "games_default_question_points_check" CHECK ((("default_question_points" >= 1) AND ("default_question_points" <= 10))),
    CONSTRAINT "games_default_section_intermission_seconds_check" CHECK ((("default_section_intermission_seconds" >= 0) AND ("default_section_intermission_seconds" <= 300))),
    CONSTRAINT "games_primary_locale_check" CHECK (("primary_locale" = ANY (ARRAY['en'::"text", 'ru'::"text", 'be'::"text", 'pl'::"text"]))),
    CONSTRAINT "games_title_check" CHECK (("char_length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."question_options" (
    "id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "text" "text" NOT NULL,
    "text_i18n" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "question_options_position_check" CHECK (("position" >= 0)),
    CONSTRAINT "question_options_text_check" CHECK (("char_length"("btrim"("text")) > 0))
);


ALTER TABLE "public"."question_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "prompt" "text" NOT NULL,
    "duration_seconds" integer DEFAULT 20 NOT NULL,
    "correct_option_id" "uuid" NOT NULL,
    "media" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reveal_media" "jsonb",
    "reveal_text" "text",
    "section_id" "uuid" NOT NULL,
    "points" integer DEFAULT 1 NOT NULL,
    "prompt_i18n" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reveal_text_i18n" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "questions_duration_seconds_check" CHECK ((("duration_seconds" >= 5) AND ("duration_seconds" <= 300))),
    CONSTRAINT "questions_points_check" CHECK ((("points" >= 1) AND ("points" <= 10))),
    CONSTRAINT "questions_position_check" CHECK (("position" >= 0)),
    CONSTRAINT "questions_prompt_check" CHECK (("char_length"("btrim"("prompt")) > 0))
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."games_with_questions" WITH ("security_invoker"='true') AS
 WITH "question_data" AS (
         SELECT "q"."id",
            "q"."game_id",
            "q"."section_id",
            "q"."position",
            "q"."prompt",
            "q"."prompt_i18n",
            "q"."duration_seconds",
            "q"."points",
            "q"."correct_option_id",
            "q"."media",
            "q"."reveal_media",
            "q"."reveal_text",
            "q"."reveal_text_i18n",
            ( SELECT COALESCE("jsonb_agg"("jsonb_build_object"('id', "qo"."id", 'text', "qo"."text", 'text_i18n', "qo"."text_i18n") ORDER BY "qo"."position", "qo"."id"), '[]'::"jsonb") AS "coalesce"
                   FROM "public"."question_options" "qo"
                  WHERE ("qo"."question_id" = "q"."id")) AS "options"
           FROM "public"."questions" "q"
        )
 SELECT "id",
    "title",
    "title_i18n",
    "primary_locale",
    "owner_id",
    "created_at",
    "updated_at",
    "deleted_at",
    "default_question_points",
    "default_section_intermission_seconds",
    "default_answer_reveal_seconds",
    "manual_question_advance",
    ( SELECT COALESCE("jsonb_agg"("jsonb_build_object"('id', "qd"."id", 'section_id', "qd"."section_id", 'position', "qd"."position", 'prompt', "qd"."prompt", 'prompt_i18n', "qd"."prompt_i18n", 'duration_seconds', "qd"."duration_seconds", 'points', "qd"."points", 'correct_option_id', "qd"."correct_option_id", 'media', "qd"."media", 'reveal_media', "qd"."reveal_media", 'reveal_text', "qd"."reveal_text", 'reveal_text_i18n', "qd"."reveal_text_i18n", 'options', "qd"."options") ORDER BY "qd"."position"), '[]'::"jsonb") AS "coalesce"
           FROM "question_data" "qd"
          WHERE ("qd"."game_id" = "g"."id")) AS "questions",
    ( SELECT COALESCE("jsonb_agg"("jsonb_build_object"('id', "gs"."id", 'position', "gs"."position", 'title', "gs"."title", 'title_i18n', "gs"."title_i18n", 'intermission_mode', "gs"."intermission_mode", 'intermission_seconds', "gs"."intermission_seconds", 'question_ids', COALESCE(( SELECT "jsonb_agg"("q"."id" ORDER BY "q"."position") AS "jsonb_agg"
                   FROM "public"."questions" "q"
                  WHERE ("q"."section_id" = "gs"."id")), '[]'::"jsonb")) ORDER BY "gs"."position", "gs"."id"), '[]'::"jsonb") AS "coalesce"
           FROM "public"."game_sections" "gs"
          WHERE ("gs"."game_id" = "g"."id")) AS "sections"
   FROM "public"."games" "g";


ALTER VIEW "public"."games_with_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "bucket_id" "text" DEFAULT 'question-media'::"text" NOT NULL,
    "object_path" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "scheduled_for_deletion_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "media_assets_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'ready'::"text", 'scheduled_for_deletion'::"text"])))
);


ALTER TABLE "public"."media_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "auth_user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "role" "public"."session_player_role" NOT NULL,
    "is_connected" boolean DEFAULT true NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "avatar_key" "text" DEFAULT 'avatar-01'::"text" NOT NULL,
    CONSTRAINT "session_players_avatar_key_check" CHECK (("avatar_key" = ANY (ARRAY['avatar-01'::"text", 'avatar-02'::"text", 'avatar-03'::"text", 'avatar-04'::"text", 'avatar-05'::"text", 'avatar-06'::"text"]))),
    CONSTRAINT "session_players_display_name_check" CHECK ((("char_length"("btrim"("display_name")) >= 1) AND ("char_length"("btrim"("display_name")) <= 32))),
    CONSTRAINT "session_players_score_check" CHECK (("score" >= 0))
);


ALTER TABLE "public"."session_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "leaderboard" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."session_results" OWNER TO "postgres";


ALTER TABLE ONLY "public"."answer_submissions"
    ADD CONSTRAINT "answer_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."answer_submissions"
    ADD CONSTRAINT "answer_submissions_session_id_question_id_player_id_key" UNIQUE ("session_id", "question_id", "player_id");



ALTER TABLE ONLY "public"."game_sections"
    ADD CONSTRAINT "game_sections_game_id_position_key" UNIQUE ("game_id", "position");



ALTER TABLE ONLY "public"."game_sections"
    ADD CONSTRAINT "game_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_versions"
    ADD CONSTRAINT "game_versions_game_id_revision_key" UNIQUE ("game_id", "revision");



ALTER TABLE ONLY "public"."game_versions"
    ADD CONSTRAINT "game_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_bucket_id_object_path_key" UNIQUE ("bucket_id", "object_path");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_question_id_id_key" UNIQUE ("question_id", "id");



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_question_id_position_key" UNIQUE ("question_id", "position");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_game_id_position_key" UNIQUE ("game_id", "position");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_players"
    ADD CONSTRAINT "session_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_players"
    ADD CONSTRAINT "session_players_session_id_auth_user_id_key" UNIQUE ("session_id", "auth_user_id");



ALTER TABLE ONLY "public"."session_results"
    ADD CONSTRAINT "session_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_results"
    ADD CONSTRAINT "session_results_session_id_key" UNIQUE ("session_id");



CREATE INDEX "answer_submissions_option_id_idx" ON "public"."answer_submissions" USING "btree" ("option_id");



CREATE INDEX "answer_submissions_player_id_idx" ON "public"."answer_submissions" USING "btree" ("player_id");



CREATE INDEX "answer_submissions_question_id_idx" ON "public"."answer_submissions" USING "btree" ("question_id");



CREATE INDEX "answer_submissions_session_part_idx" ON "public"."answer_submissions" USING "btree" ("session_id", "part_index");



CREATE INDEX "answer_submissions_session_question_player_idx" ON "public"."answer_submissions" USING "btree" ("session_id", "question_id", "player_id");



CREATE INDEX "game_sections_game_id_idx" ON "public"."game_sections" USING "btree" ("game_id");



CREATE INDEX "game_versions_game_id_state_idx" ON "public"."game_versions" USING "btree" ("game_id", "state", "revision" DESC);



CREATE UNIQUE INDEX "game_versions_one_draft_per_game_idx" ON "public"."game_versions" USING "btree" ("game_id") WHERE ("state" = 'draft'::"text");



CREATE INDEX "games_owner_active_idx" ON "public"."games" USING "btree" ("owner_id", "updated_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "games_owner_id_idx" ON "public"."games" USING "btree" ("owner_id");



CREATE INDEX "live_sessions_created_by_idx" ON "public"."live_sessions" USING "btree" ("created_by");



CREATE INDEX "live_sessions_game_id_idx" ON "public"."live_sessions" USING "btree" ("game_id");



CREATE INDEX "live_sessions_game_version_id_idx" ON "public"."live_sessions" USING "btree" ("game_version_id");



CREATE INDEX "live_sessions_host_player_id_idx" ON "public"."live_sessions" USING "btree" ("host_player_id");



CREATE UNIQUE INDEX "live_sessions_one_active_per_game_idx" ON "public"."live_sessions" USING "btree" ("game_id") WHERE ("phase" <> 'finished'::"public"."session_phase");



CREATE INDEX "media_assets_owner_status_idx" ON "public"."media_assets" USING "btree" ("owner_id", "status", "created_at" DESC);



CREATE INDEX "question_options_question_id_idx" ON "public"."question_options" USING "btree" ("question_id");



CREATE INDEX "questions_game_id_idx" ON "public"."questions" USING "btree" ("game_id");



CREATE INDEX "questions_id_correct_option_id_idx" ON "public"."questions" USING "btree" ("id", "correct_option_id");



CREATE INDEX "questions_section_id_idx" ON "public"."questions" USING "btree" ("section_id");



CREATE INDEX "session_players_auth_user_id_idx" ON "public"."session_players" USING "btree" ("auth_user_id");



CREATE INDEX "session_players_session_id_score_joined_at_idx" ON "public"."session_players" USING "btree" ("session_id", "score" DESC, "joined_at");



CREATE OR REPLACE TRIGGER "trg_game_sections_updated_at" BEFORE UPDATE ON "public"."game_sections" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_game_versions_updated_at" BEFORE UPDATE ON "public"."game_versions" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_games_updated_at" BEFORE UPDATE ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_live_sessions_assign_version" BEFORE INSERT ON "public"."live_sessions" FOR EACH ROW EXECUTE FUNCTION "private"."assign_live_session_version"();



CREATE OR REPLACE TRIGGER "trg_live_sessions_room_limit" BEFORE INSERT ON "public"."live_sessions" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_live_session_room_limit"();



CREATE OR REPLACE TRIGGER "trg_live_sessions_updated_at" BEFORE UPDATE ON "public"."live_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_media_assets_updated_at" BEFORE UPDATE ON "public"."media_assets" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_session_players_capacity" BEFORE INSERT ON "public"."session_players" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_session_player_limit"();



ALTER TABLE ONLY "public"."answer_submissions"
    ADD CONSTRAINT "answer_submissions_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."question_options"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."answer_submissions"
    ADD CONSTRAINT "answer_submissions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."session_players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."answer_submissions"
    ADD CONSTRAINT "answer_submissions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."answer_submissions"
    ADD CONSTRAINT "answer_submissions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_sections"
    ADD CONSTRAINT "game_sections_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_versions"
    ADD CONSTRAINT "game_versions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_game_version_id_fkey" FOREIGN KEY ("game_version_id") REFERENCES "public"."game_versions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_host_player_id_fkey" FOREIGN KEY ("host_player_id") REFERENCES "public"."session_players"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_correct_option_matches_question_fkey" FOREIGN KEY ("id", "correct_option_id") REFERENCES "public"."question_options"("question_id", "id") DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."game_sections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_players"
    ADD CONSTRAINT "session_players_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_players"
    ADD CONSTRAINT "session_players_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_results"
    ADD CONSTRAINT "session_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE CASCADE;



ALTER TABLE "public"."answer_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game owners can manage games" ON "public"."games" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "owner_id") AND (COALESCE(((( SELECT "auth"."jwt"() AS "jwt") ->> 'is_anonymous'::"text"))::boolean, false) IS FALSE))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "owner_id") AND (COALESCE(((( SELECT "auth"."jwt"() AS "jwt") ->> 'is_anonymous'::"text"))::boolean, false) IS FALSE)));



CREATE POLICY "game owners can read options" ON "public"."question_options" FOR SELECT TO "authenticated" USING (((COALESCE(((( SELECT "auth"."jwt"() AS "jwt") ->> 'is_anonymous'::"text"))::boolean, false) IS FALSE) AND (EXISTS ( SELECT 1
   FROM "public"."questions" "q"
  WHERE (("q"."id" = "question_options"."question_id") AND ( SELECT "public"."is_game_owner"("q"."game_id") AS "is_game_owner"))))));



CREATE POLICY "game owners can read questions" ON "public"."questions" FOR SELECT TO "authenticated" USING (((COALESCE(((( SELECT "auth"."jwt"() AS "jwt") ->> 'is_anonymous'::"text"))::boolean, false) IS FALSE) AND ( SELECT "public"."is_game_owner"("questions"."game_id") AS "is_game_owner")));



CREATE POLICY "game owners can read sections" ON "public"."game_sections" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_sections"."game_id") AND ("g"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."game_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_versions_are_visible_to_the_owner" ON "public"."game_versions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_versions"."game_id") AND ("g"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal session results access" ON "public"."session_results" TO "postgres" USING (true) WITH CHECK (true);



ALTER TABLE "public"."live_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "media_assets_are_private_to_the_owner" ON "public"."media_assets" FOR SELECT TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "media_assets_can_be_created_by_the_owner" ON "public"."media_assets" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "media_assets_can_be_updated_by_the_owner" ON "public"."media_assets" FOR UPDATE TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_are_private_to_the_owner" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "profiles_can_be_created_by_the_owner" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "profiles_can_be_updated_by_the_owner" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."question_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session participants can read players" ON "public"."session_players" FOR SELECT TO "authenticated" USING ((("auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_session_participant"("session_players"."session_id") AS "is_session_participant")));



CREATE POLICY "session participants can read sessions" ON "public"."live_sessions" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "created_by") OR ( SELECT "public"."is_session_participant"("live_sessions"."id") AS "is_session_participant")));



CREATE POLICY "session participants can read submissions" ON "public"."answer_submissions" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_session_participant"("answer_submissions"."session_id") AS "is_session_participant"));



ALTER TABLE "public"."session_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_results" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."advance_question"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."advance_question"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."advance_question"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_question"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."live_sessions" TO "anon";
GRANT ALL ON TABLE "public"."live_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."live_sessions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."begin_answer_reveal"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_answer_reveal"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."begin_answer_reveal"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_answer_reveal"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."begin_answer_transition"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_answer_transition"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."begin_answer_transition"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_answer_transition"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."begin_question_phase"("p_session_id" "uuid", "p_question_index" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_question_phase"("p_session_id" "uuid", "p_question_index" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."begin_question_phase"("p_session_id" "uuid", "p_question_index" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_question_phase"("p_session_id" "uuid", "p_question_index" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."begin_round_leaderboard"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_round_leaderboard"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."begin_round_leaderboard"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_round_leaderboard"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."begin_round_summary"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_round_summary"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."begin_round_summary"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_round_summary"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."begin_visible_answer_reveal"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_visible_answer_reveal"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."begin_visible_answer_reveal"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_visible_answer_reveal"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."build_game_section_partitions"("p_game_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."build_game_section_partitions"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."build_game_section_partitions"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."build_game_section_partitions"("p_game_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."build_question_partitions"("p_question_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."build_question_partitions"("p_question_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."build_question_partitions"("p_question_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."build_question_partitions"("p_question_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."build_session_leaderboard"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."build_session_leaderboard"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."build_session_leaderboard"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."build_session_leaderboard"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_part_count"("p_question_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_part_count"("p_question_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_part_count"("p_question_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_part_count"("p_question_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_read_session"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_session"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_session"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_session"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_session"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_session"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_current_question"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_current_question"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."close_current_question"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_current_question"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_live_session"("p_game_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_live_session"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_live_session"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_live_session"("p_game_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_game_cascade"("p_game_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_game_cascade"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_game_cascade"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_game_cascade"("p_game_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_past_session"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_past_session"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_past_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_past_session"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finish_session"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_session"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."finish_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finish_session"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_invite_code"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invite_code"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_invite_session_summary"("p_invite_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_invite_session_summary"("p_invite_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invite_session_summary"("p_invite_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invite_session_summary"("p_invite_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_entitlements"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_entitlements"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_entitlements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_entitlements"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_owned_game_status"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_owned_game_status"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_owned_game_status"("p_game_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_server_time"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_server_time"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_server_time"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_session_snapshot"("p_session_id" "uuid", "p_current_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_session_snapshot"("p_session_id" "uuid", "p_current_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_session_snapshot"("p_session_id" "uuid", "p_current_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_session_snapshot"("p_session_id" "uuid", "p_current_player_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_session_snapshot_before_answer_transition"("p_session_id" "uuid", "p_current_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_session_snapshot_before_answer_transition"("p_session_id" "uuid", "p_current_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_session_snapshot_before_answer_transition"("p_session_id" "uuid", "p_current_player_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."host_advance_session_phase"("p_session_id" "uuid", "p_expected_phase" "public"."session_phase") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."host_advance_session_phase"("p_session_id" "uuid", "p_expected_phase" "public"."session_phase") TO "anon";
GRANT ALL ON FUNCTION "public"."host_advance_session_phase"("p_session_id" "uuid", "p_expected_phase" "public"."session_phase") TO "authenticated";
GRANT ALL ON FUNCTION "public"."host_advance_session_phase"("p_session_id" "uuid", "p_expected_phase" "public"."session_phase") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_game_owner"("p_game_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_game_owner"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_game_owner"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_game_owner"("p_game_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_permanent_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_permanent_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_permanent_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_permanent_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_session_host"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_session_host"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_session_host"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_session_host"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_session_participant"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_session_participant"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_session_participant"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_session_participant"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_or_resume_session"("p_invite_code" "text", "p_display_name" "text", "p_avatar_key" "text", "p_resume_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_or_resume_session"("p_invite_code" "text", "p_display_name" "text", "p_avatar_key" "text", "p_resume_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."join_or_resume_session"("p_invite_code" "text", "p_display_name" "text", "p_avatar_key" "text", "p_resume_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_or_resume_session"("p_invite_code" "text", "p_display_name" "text", "p_avatar_key" "text", "p_resume_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_owned_games_with_status"("p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_owned_games_with_status"("p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_owned_games_with_status"("p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_past_sessions"("p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_past_sessions"("p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_past_sessions"("p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."move_game_to_trash"("p_game_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_game_to_trash"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."move_game_to_trash"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_game_to_trash"("p_game_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pause_session_flow"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pause_session_flow"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pause_session_flow"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pause_session_flow"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."require_permanent_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."require_permanent_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."require_permanent_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."require_permanent_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_game_from_trash"("p_game_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_game_from_trash"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."restore_game_from_trash"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_game_from_trash"("p_game_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resume_session_flow"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resume_session_flow"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resume_session_flow"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resume_session_flow"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_game_answer_reveal_settings"("p_game_id" "uuid", "p_seconds" integer, "p_manual_question_advance" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_game_answer_reveal_settings"("p_game_id" "uuid", "p_seconds" integer, "p_manual_question_advance" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_game_answer_reveal_settings"("p_game_id" "uuid", "p_seconds" integer, "p_manual_question_advance" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_game_answer_reveal_settings"("p_game_id" "uuid", "p_seconds" integer, "p_manual_question_advance" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_game_default_answer_reveal_seconds"("p_game_id" "uuid", "p_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_game_default_answer_reveal_seconds"("p_game_id" "uuid", "p_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."set_game_default_answer_reveal_seconds"("p_game_id" "uuid", "p_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_game_default_answer_reveal_seconds"("p_game_id" "uuid", "p_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_game_primary_locale"("p_game_id" "uuid", "p_locale" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_game_primary_locale"("p_game_id" "uuid", "p_locale" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_game_primary_locale"("p_game_id" "uuid", "p_locale" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_gameplay"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_gameplay"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."start_gameplay"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_gameplay"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_answer"("p_session_id" "uuid", "p_question_id" "uuid", "p_option_id" "uuid", "p_client_submitted_at_ms" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_answer"("p_session_id" "uuid", "p_question_id" "uuid", "p_option_id" "uuid", "p_client_submitted_at_ms" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."submit_answer"("p_session_id" "uuid", "p_question_id" "uuid", "p_option_id" "uuid", "p_client_submitted_at_ms" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_answer"("p_session_id" "uuid", "p_question_id" "uuid", "p_option_id" "uuid", "p_client_submitted_at_ms" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_live_session_phase"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_live_session_phase"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_live_session_phase"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_live_session_phase"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_session_presence"("p_session_id" "uuid", "p_player_id" "uuid", "p_is_connected" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_session_presence"("p_session_id" "uuid", "p_player_id" "uuid", "p_is_connected" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_session_presence"("p_session_id" "uuid", "p_player_id" "uuid", "p_is_connected" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_session_presence"("p_session_id" "uuid", "p_player_id" "uuid", "p_is_connected" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_game_with_questions"("p_game_id" "uuid", "p_title" "text", "p_questions" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_game_with_questions"("p_game_id" "uuid", "p_title" "text", "p_questions" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_game_with_questions"("p_game_id" "uuid", "p_title" "text", "p_questions" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_game_with_questions"("p_game_id" "uuid", "p_title" "text", "p_questions" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_i18n_map"("p_map" "jsonb", "p_primary_locale" "text", "p_field" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_i18n_map"("p_map" "jsonb", "p_primary_locale" "text", "p_field" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_i18n_map"("p_map" "jsonb", "p_primary_locale" "text", "p_field" "text") TO "service_role";



GRANT ALL ON TABLE "public"."answer_submissions" TO "anon";
GRANT ALL ON TABLE "public"."answer_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."answer_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."game_sections" TO "anon";
GRANT ALL ON TABLE "public"."game_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."game_sections" TO "service_role";



GRANT ALL ON TABLE "public"."game_versions" TO "anon";
GRANT ALL ON TABLE "public"."game_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."game_versions" TO "service_role";



GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";



GRANT ALL ON TABLE "public"."question_options" TO "anon";
GRANT ALL ON TABLE "public"."question_options" TO "authenticated";
GRANT ALL ON TABLE "public"."question_options" TO "service_role";



GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";



GRANT ALL ON TABLE "public"."games_with_questions" TO "anon";
GRANT ALL ON TABLE "public"."games_with_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."games_with_questions" TO "service_role";



GRANT ALL ON TABLE "public"."media_assets" TO "anon";
GRANT ALL ON TABLE "public"."media_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."media_assets" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."session_players" TO "anon";
GRANT ALL ON TABLE "public"."session_players" TO "authenticated";
GRANT ALL ON TABLE "public"."session_players" TO "service_role";



GRANT ALL ON TABLE "public"."session_results" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

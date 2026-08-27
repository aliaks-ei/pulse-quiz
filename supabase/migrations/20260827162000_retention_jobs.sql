-- Retention jobs: the data half of the cleanup that keeps the database and the
-- media bucket from growing without bound.
--
-- Three pg_cron jobs. Each one runs report-only until its row in
-- private.retention_settings is armed, and every run writes what it matched to
-- private.retention_runs, so the first cycles can be read before anything is
-- deleted. Arming is an update, not a deploy, and so is changing a window.
--
-- Nothing here touches R2: Postgres cannot reach the bucket. Assets whose
-- question is gone are marked scheduled_for_deletion, which frees the account's
-- quota immediately, and the media-reaper Worker removes the bytes.

create extension if not exists pg_cron;

create table private.retention_settings (
  job_key text primary key,
  is_armed boolean not null default false,
  retain_interval interval not null
    check (retain_interval >= interval '1 day'),
  updated_at timestamptz not null default now()
);

-- Windows settled in the plan: a trashed quiz stays recoverable for 30 days, an
-- abandoned anonymous account holds nothing anyone would miss and goes after 15,
-- and an unreferenced asset waits a day so a slow builder save is never reaped
-- out from under the question it belongs to.
insert into private.retention_settings (job_key, retain_interval)
values
  ('mark_detached_media', interval '1 day'),
  ('purge_trashed_games', interval '30 days'),
  ('expire_anonymous_users', interval '15 days');

create table private.retention_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null
    references private.retention_settings (job_key) on delete cascade,
  ran_at timestamptz not null default now(),
  was_armed boolean not null,
  matched_count integer not null,
  sample jsonb not null default '[]'::jsonb
);

create index retention_runs_job_key_ran_at_idx
  on private.retention_runs (job_key, ran_at desc);

-- Report-only runs are the point of the log, so both kinds are recorded. The
-- sample is capped: the count is the number that matters, the paths and ids are
-- there to make a report readable.
create function private.record_retention_run(
  p_job_key text,
  p_was_armed boolean,
  p_matched_count integer,
  p_sample jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = private, public, pg_temp
as $$
begin
  insert into private.retention_runs (
    job_key, was_armed, matched_count, sample
  )
  values (p_job_key, p_was_armed, p_matched_count, p_sample);

  delete from private.retention_runs
  where job_key = p_job_key
    and ran_at < now() - interval '90 days';

  return jsonb_build_object(
    'jobKey', p_job_key,
    'armed', p_was_armed,
    'matched', p_matched_count,
    'sample', p_sample
  );
end;
$$;

-- Assets no question points at any more. The account's own deletions already
-- arrive here through public.schedule_media_deletion; this catches the rest:
-- media dropped by a question rewrite, and media left behind by a purged quiz.
--
-- Player avatars share the table but not the lifecycle — they hang off
-- session_players, not questions — so the avatar bucket is left alone.
create function private.mark_detached_media(p_dry_run boolean default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_settings private.retention_settings%rowtype;
  v_dry_run boolean;
  v_paths text[];
begin
  select * into v_settings
  from private.retention_settings
  where job_key = 'mark_detached_media';

  v_dry_run := coalesce(p_dry_run, not v_settings.is_armed);

  select coalesce(array_agg(asset.object_path order by asset.created_at), '{}')
  into v_paths
  from public.media_assets asset
  where asset.bucket_id <> 'player-avatars'
    and asset.status <> 'scheduled_for_deletion'
    and asset.created_at < now() - v_settings.retain_interval
    and not exists (
      select 1
      from public.questions question
      where question.media ->> 'path' = asset.object_path
        or question.reveal_media ->> 'path' = asset.object_path
    );

  if not v_dry_run and array_length(v_paths, 1) > 0 then
    update public.media_assets
    set
      status = 'scheduled_for_deletion',
      scheduled_for_deletion_at = now(),
      updated_at = now()
    where bucket_id <> 'player-avatars'
      and status <> 'scheduled_for_deletion'
      and object_path = any (v_paths);
  end if;

  return private.record_retention_run(
    'mark_detached_media',
    not v_dry_run,
    coalesce(array_length(v_paths, 1), 0),
    to_jsonb(v_paths[1:20])
  );
end;
$$;

-- Quizzes the owner moved to the trash and never restored.
--
-- public.delete_game_cascade is the owner's version of this and cannot be
-- reused: it reads auth.uid(), which a cron job does not have. The deletion
-- itself is the same — remove the game row and let the foreign keys take its
-- questions, sessions and results — with the media marked first, because once
-- the questions are gone nothing links the asset to the quiz any more.
create function private.purge_trashed_games(p_dry_run boolean default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_settings private.retention_settings%rowtype;
  v_dry_run boolean;
  v_game_ids uuid[];
begin
  select * into v_settings
  from private.retention_settings
  where job_key = 'purge_trashed_games';

  v_dry_run := coalesce(p_dry_run, not v_settings.is_armed);

  select coalesce(array_agg(game.id order by game.deleted_at), '{}')
  into v_game_ids
  from public.games game
  where game.deleted_at is not null
    and game.deleted_at < now() - v_settings.retain_interval;

  if not v_dry_run and array_length(v_game_ids, 1) > 0 then
    update public.media_assets asset
    set
      status = 'scheduled_for_deletion',
      scheduled_for_deletion_at = now(),
      updated_at = now()
    where asset.status <> 'scheduled_for_deletion'
      and exists (
        select 1
        from public.questions question
        where question.game_id = any (v_game_ids)
          and (
            question.media ->> 'path' = asset.object_path
            or question.reveal_media ->> 'path' = asset.object_path
          )
      )
      -- A quiz duplicated from another one shares its media paths. Keep the
      -- object while any surviving question still needs it.
      and not exists (
        select 1
        from public.questions question
        where question.game_id <> all (v_game_ids)
          and (
            question.media ->> 'path' = asset.object_path
            or question.reveal_media ->> 'path' = asset.object_path
          )
      );

    delete from public.games where id = any (v_game_ids);
  end if;

  return private.record_retention_run(
    'purge_trashed_games',
    not v_dry_run,
    coalesce(array_length(v_game_ids, 1), 0),
    to_jsonb(v_game_ids[1:20])
  );
end;
$$;

-- Anonymous accounts minted for a visitor who never joined a room. These are
-- what drive the monthly active user count, and each one is a row in auth.users
-- that nothing else references.
--
-- Only accounts with no trace at all are taken: a player row of any age keeps
-- the account, which is what keeps a paused or resumable session safe, and an
-- account that somehow owns a quiz or an asset is left for a human to look at
-- rather than cascaded away with its objects still sitting in R2.
create function private.expire_anonymous_users(p_dry_run boolean default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_settings private.retention_settings%rowtype;
  v_dry_run boolean;
  v_user_ids uuid[];
begin
  select * into v_settings
  from private.retention_settings
  where job_key = 'expire_anonymous_users';

  v_dry_run := coalesce(p_dry_run, not v_settings.is_armed);

  select coalesce(array_agg(account.id order by account.created_at), '{}')
  into v_user_ids
  from auth.users account
  where account.is_anonymous
    and greatest(
      account.created_at,
      coalesce(account.updated_at, account.created_at),
      coalesce(account.last_sign_in_at, account.created_at)
    ) < now() - v_settings.retain_interval
    and not exists (
      select 1 from public.session_players player
      where player.auth_user_id = account.id
    )
    and not exists (
      select 1 from public.live_sessions live_session
      where live_session.created_by = account.id
    )
    and not exists (
      select 1 from public.games game where game.owner_id = account.id
    )
    and not exists (
      select 1 from public.media_assets asset where asset.owner_id = account.id
    );

  if not v_dry_run and array_length(v_user_ids, 1) > 0 then
    delete from auth.users where id = any (v_user_ids);
  end if;

  return private.record_retention_run(
    'expire_anonymous_users',
    not v_dry_run,
    coalesce(array_length(v_user_ids, 1), 0),
    to_jsonb(v_user_ids[1:20])
  );
end;
$$;

revoke all on function private.record_retention_run(text, boolean, integer, jsonb)
  from public, anon, authenticated;
revoke all on function private.mark_detached_media(boolean)
  from public, anon, authenticated;
revoke all on function private.purge_trashed_games(boolean)
  from public, anon, authenticated;
revoke all on function private.expire_anonymous_users(boolean)
  from public, anon, authenticated;

-- Nightly, spaced so the media marking sees a purge from the same night.
-- cron.schedule updates a job that already carries the name, so re-running this
-- migration re-asserts the schedule instead of duplicating it.
select cron.schedule(
  'purge-trashed-games',
  '10 3 * * *',
  $job$select private.purge_trashed_games()$job$
);

select cron.schedule(
  'expire-anonymous-users',
  '20 3 * * *',
  $job$select private.expire_anonymous_users()$job$
);

select cron.schedule(
  'mark-detached-media',
  '30 3 * * *',
  $job$select private.mark_detached_media()$job$
);

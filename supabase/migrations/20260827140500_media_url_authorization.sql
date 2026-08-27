-- Playback authorization for question media.
--
-- Media moves to a private R2 bucket, so a permanent public URL is replaced by a
-- short-lived presigned one. The `media-url` Edge Function mints those URLs, but
-- it does not decide who may have them: this function does, from the caller's
-- own JWT, against the tables that already own the answer.
--
-- A caller may resolve an asset when they own it, when they own the quiz that
-- references it, or when they hold a session_players row in a live session of
-- that quiz. No new permissions model is introduced.
--
-- Paths with no media_assets row are absent from the result. The caller reads
-- that as unknown, and a row with authorized = false as forbidden.

create index if not exists media_assets_object_path_idx
  on public.media_assets (object_path);

create index if not exists questions_media_path_idx
  on public.questions ((media ->> 'path'));

create index if not exists questions_reveal_media_path_idx
  on public.questions ((reveal_media ->> 'path'));

create or replace function public.authorize_media_paths(
  p_paths text[],
  p_session_id uuid default null
)
returns table (object_path text, bucket_id text, authorized boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with caller as (
    select (select auth.uid()) as user_id
  ),
  requested as (
    select distinct path
    from unnest(coalesce(p_paths, array[]::text[])) as path
    where path is not null and path <> ''
  ),
  -- The same object_path can hold both a legacy row and an R2 row while the
  -- cutover runs. Prefer the R2 row so playback stops falling back as soon as
  -- the bytes have moved.
  asset as (
    select distinct on (requested.path)
      requested.path,
      media_asset.owner_id,
      media_asset.bucket_id
    from requested
    join public.media_assets media_asset
      on media_asset.object_path = requested.path
    where media_asset.status <> 'scheduled_for_deletion'
    order by
      requested.path,
      (media_asset.bucket_id = 'question-media'),
      media_asset.created_at desc
  )
  select
    asset.path,
    asset.bucket_id,
    coalesce(
      asset.owner_id = caller.user_id
      or exists (
        select 1
        from public.questions question
        join public.games game on game.id = question.game_id
        where (
            question.media ->> 'path' = asset.path
            or question.reveal_media ->> 'path' = asset.path
          )
          and (
            game.owner_id = caller.user_id
            or exists (
              select 1
              from public.live_sessions live_session
              join public.session_players player
                on player.session_id = live_session.id
              where live_session.game_id = game.id
                and live_session.phase <> 'finished'
                and player.auth_user_id = caller.user_id
                and (p_session_id is null or live_session.id = p_session_id)
            )
          )
      ),
      false
    )
  from asset, caller
  where caller.user_id is not null;
$$;

revoke all on function public.authorize_media_paths(text[], uuid)
  from public, anon;
grant execute on function public.authorize_media_paths(text[], uuid)
  to authenticated, service_role;

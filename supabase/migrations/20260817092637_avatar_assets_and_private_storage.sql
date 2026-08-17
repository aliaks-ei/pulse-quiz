-- Avatar defaults and player uploads are deliberately kept out of the source
-- tree. Presets are public, while player-supplied avatars remain private and
-- are only readable by people in the same live session.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'avatar-presets',
    'avatar-presets',
    true,
    1048576,
    array['image/webp']
  ),
  (
    'player-avatars',
    'player-avatars',
    false,
    1048576,
    array['image/webp']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.session_players
add column if not exists avatar_asset_id uuid
references public.media_assets (id)
on delete set null;

create index if not exists session_players_avatar_asset_id_idx
on public.session_players (avatar_asset_id)
where avatar_asset_id is not null;

-- Only the service-role upload function writes player avatars. The browser
-- receives a signed URL only after this policy confirms the viewer shares a
-- session with the avatar owner.
drop policy if exists "session participants can read player avatars" on storage.objects;

create policy "session participants can read player avatars"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'player-avatars'
  and exists (
    select 1
    from public.media_assets avatar_asset
    where avatar_asset.bucket_id = 'player-avatars'
      and avatar_asset.object_path = storage.objects.name
      and avatar_asset.status = 'ready'
      and (
        avatar_asset.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.session_players avatar_player
          join public.session_players viewer_player
            on viewer_player.session_id = avatar_player.session_id
          where avatar_player.avatar_asset_id = avatar_asset.id
            and viewer_player.auth_user_id = (select auth.uid())
        )
      )
  )
);

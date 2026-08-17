-- Supabase manages the storage schema itself. This migration configures only
-- the application bucket, its least-privilege policies, and Realtime tables.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-media',
  'question-media',
  true,
  52428800,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated users can upload question media" on storage.objects;
drop policy if exists "authenticated users can update their question media" on storage.objects;
drop policy if exists "authenticated users can delete their question media" on storage.objects;

create policy "authenticated users can upload question media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'question-media'
  and owner = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) is false
);

create policy "authenticated users can update their question media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'question-media'
  and owner = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) is false
)
with check (
  bucket_id = 'question-media'
  and owner = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) is false
);

create policy "authenticated users can delete question media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'question-media'
  and owner = (select auth.uid())
  and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) is false
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_sessions'
  ) then
    alter publication supabase_realtime add table public.live_sessions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'session_players'
  ) then
    alter publication supabase_realtime add table public.session_players;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'answer_submissions'
  ) then
    alter publication supabase_realtime add table public.answer_submissions;
  end if;
end;
$$;

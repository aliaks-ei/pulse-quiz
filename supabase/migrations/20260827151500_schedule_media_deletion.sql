-- Retiring question media once it lives in R2.
--
-- The builder used to delete replaced media straight out of Supabase Storage.
-- The browser cannot reach R2, and it should not: deletion now means marking the
-- asset for the reaper, which is also what frees the account's storage quota,
-- since private.account_storage_bytes already ignores scheduled rows.
--
-- Scoped to the caller's own assets. Definer rather than a direct update so it
-- survives media_assets writes being restricted to the service role.

create or replace function public.schedule_media_deletion(p_paths text[])
returns integer
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with scheduled as (
    update public.media_assets
    set
      status = 'scheduled_for_deletion',
      scheduled_for_deletion_at = now(),
      updated_at = now()
    where owner_id = (select auth.uid())
      and object_path = any (coalesce(p_paths, array[]::text[]))
      and status <> 'scheduled_for_deletion'
    returning 1
  )
  select count(*)::integer from scheduled;
$$;

revoke all on function public.schedule_media_deletion(text[]) from public, anon;
grant execute on function public.schedule_media_deletion(text[])
  to authenticated, service_role;

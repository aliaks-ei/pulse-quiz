-- Per-account media storage quota.
--
-- The limit lives on the plan row so it moves with the plan a host is on and can
-- be raised without a deploy, the same way the active-room and player limits
-- already work. Usage is summed from media_assets rather than kept in a running
-- counter: the sum is one indexed aggregate per account and cannot drift when
-- assets are reaped outside the upload path.

alter table private.plan_definitions
  add column max_storage_bytes bigint
    check (max_storage_bytes is null or max_storage_bytes > 0);

update private.plan_definitions
set max_storage_bytes = 524288000
where plan_key = 'free';

alter table public.media_assets
  add column size_bytes bigint not null default 0
    check (size_bytes >= 0);

-- Weigh the objects already held in Supabase Storage. Matches nothing on a
-- database rebuilt from migrations alone.
update public.media_assets asset
set size_bytes = coalesce((object.metadata ->> 'size')::bigint, 0)
from storage.objects object
where object.bucket_id = asset.bucket_id
  and object.name = asset.object_path;

create or replace function private.account_storage_bytes(p_account_id uuid)
returns bigint
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce(sum(size_bytes), 0)::bigint
  from public.media_assets
  where owner_id = p_account_id
    and status <> 'scheduled_for_deletion';
$$;

-- Return type changes, so the function has to be replaced rather than redefined.
drop function private.account_entitlements(uuid);

create function private.account_entitlements(p_account_id uuid)
returns table (
  plan_key text,
  max_active_rooms_per_account integer,
  max_players_per_room integer,
  max_storage_bytes bigint
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select
    definition.plan_key,
    definition.max_active_rooms_per_account,
    definition.max_players_per_room,
    definition.max_storage_bytes
  from private.plan_definitions definition
  where definition.plan_key = coalesce((
    select assignment.plan_key
    from private.account_plan_assignments assignment
    where assignment.account_id = p_account_id
      and (assignment.expires_at is null or assignment.expires_at > now())
  ), 'free')
    and definition.is_active;
$$;

-- The builder reads its storage meter from the entitlement call it already makes.
create or replace function public.get_my_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_account_id uuid := (select auth.uid());
begin
  perform public.require_permanent_user();

  return (
    select coalesce(jsonb_build_object(
      'planKey', plan_key,
      'maxActiveRoomsPerAccount', max_active_rooms_per_account,
      'maxPlayersPerRoom', max_players_per_room,
      'maxStorageBytes', max_storage_bytes,
      'usedStorageBytes', private.account_storage_bytes(v_account_id)
    ), '{}'::jsonb)
    from private.account_entitlements(v_account_id)
  );
end;
$$;

-- The upload gate's quota check. Service role only: it takes the account id as
-- an argument, so no browser client may ever call it.
--
-- The check is per request and does not serialize. Two uploads racing can
-- overshoot the limit by at most one file; the next upload is then rejected.
create or replace function public.reserve_media_storage(
  p_account_id uuid,
  p_incoming_bytes bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_limit bigint;
  v_used bigint;
begin
  if p_incoming_bytes is null or p_incoming_bytes < 0 then
    raise exception 'Incoming size must be zero or more';
  end if;

  select max_storage_bytes into v_limit
  from private.account_entitlements(p_account_id);

  v_used := private.account_storage_bytes(p_account_id);

  return jsonb_build_object(
    'allowed', v_limit is null or v_used + p_incoming_bytes <= v_limit,
    'usedBytes', v_used,
    'limitBytes', v_limit
  );
end;
$$;

revoke all on function public.reserve_media_storage(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.reserve_media_storage(uuid, bigint) to service_role;

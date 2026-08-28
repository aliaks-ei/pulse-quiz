-- Invite codes were unusable: 20260817092638 widened the generator to 16 hex
-- characters while live_sessions_invite_code_check still demanded exactly 6, so
-- every create_live_session failed with 23514. Room creation has been broken in
-- production since that migration was applied.
--
-- The code is read off a screen and typed on a phone, so it uses a 32-character
-- alphabet with the lookalikes I, O, 0 and 1 removed. Eight characters give
-- about 41 bits, which is far above the 6-hex original and cannot be misread.
-- Guessing stays bounded by the 12-lookups-per-minute invite quota.
create or replace function public.generate_invite_code()
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code_length constant integer := 8;
  random_bytes bytea;
  generated text;
begin
  loop
    random_bytes := extensions.gen_random_bytes(code_length);
    generated := '';

    -- 256 is a multiple of 32, so the modulo introduces no bias.
    for position in 0 .. code_length - 1 loop
      generated := generated
        || substr(alphabet, (get_byte(random_bytes, position) % 32) + 1, 1);
    end loop;

    exit when not exists (
      select 1
      from public.live_sessions ls
      where ls.invite_code = generated
    );
  end loop;

  return generated;
end;
$$;

-- 6 to 16 rather than exactly 8: the five rooms created before the hardening
-- migration carry 6-character codes and stay valid.
alter table public.live_sessions
  drop constraint live_sessions_invite_code_check;

alter table public.live_sessions
  add constraint live_sessions_invite_code_check
  check (invite_code ~ '^[A-Z0-9]{6,16}$');

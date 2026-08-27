-- The baseline dump granted every future public function to browser roles.
-- Remove that default and re-assert the deliberately small RPC surface.
-- PostgreSQL applies global defaults before schema-specific defaults, so both
-- levels must be revoked: a per-schema revoke cannot subtract a global grant.
alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

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

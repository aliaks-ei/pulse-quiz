-- Restore EXECUTE on the two helpers that RLS policies call.
--
-- 20260827120510_lock_default_privileges.sql revoked execute on every function
-- in public and re-granted only the RPC entry points the browser calls by name.
-- That missed a second class of caller: an RLS policy expression is evaluated
-- as the role being restricted, so a helper named in a policy needs EXECUTE for
-- that role even though the browser never calls it directly.
--
-- Without these grants, every authenticated read of questions, question_options,
-- live_sessions, session_players and answer_submissions failed with
-- 42501 "permission denied for function is_game_owner".
--
-- Both functions are SECURITY DEFINER and take the caller's own auth.uid(), so
-- granting EXECUTE gives away nothing a policy did not already decide.
grant execute on function public.is_game_owner(uuid) to authenticated;
grant execute on function public.is_session_participant(uuid) to authenticated;

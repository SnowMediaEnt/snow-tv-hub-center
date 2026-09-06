-- Two small repairs to capture_player_signin, the function that records every
-- Player sign-in. Both change only what happens on CONFLICT with an existing
-- row; inserts are untouched.
--
-- 1. supabase_user_id — replace a stamp that no longer resolves.
--
--    The stamp is how the reverse bridge (player-login) knows which website
--    account a streaming login may sign back in. It was written first-wins
--    (COALESCE), which is right while the stamped account exists. But
--    delete-account removes the auth user and nothing clears the stamp, so a
--    line stays pointed at a dead id: player-login finds it, fails
--    getUserById, answers not_linked — and because of the COALESCE no later
--    authenticated capture can ever overwrite it. Anyone who deleted and
--    recreated their website account was unrecoverable. Now a dangling stamp
--    yields to a new one; a live stamp is still never replaced.
--
-- 2. panel_password — never overwrite a stored password with NULL.
--
--    capture-player-signin passes NULL when the client sent none. The upsert
--    wrote it through unconditionally, so a reconcile that carried no password
--    erased the one on file. Keep the old value when the new one is absent.

CREATE OR REPLACE FUNCTION public.capture_player_signin(
  p_host text, p_username text, p_password text, p_expiration_date date,
  p_status text, p_max_connections integer, p_is_trial boolean, p_device_id text,
  p_server_label text, p_supabase_user_id uuid, p_matched_customer_id uuid,
  p_reason text, p_tenant_code text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_matched uuid;
  v_reseller text := NULL;
BEGIN
  IF p_tenant_code IS NOT NULL
     AND btrim(p_tenant_code) <> ''
     AND lower(p_tenant_code) NOT IN ('snowmedia','canvas','ask') THEN
    SELECT code INTO v_reseller FROM public.tenants WHERE code = p_tenant_code;
  END IF;

  INSERT INTO public.player_signins (
    panel_host, panel_username, panel_password, expiration_date, xtream_status,
    max_connections, is_trial, device_id, server_label,
    supabase_user_id, matched_customer_id, reseller_id
  ) VALUES (
    p_host, p_username, p_password, p_expiration_date, p_status,
    p_max_connections, p_is_trial, p_device_id, p_server_label,
    p_supabase_user_id, p_matched_customer_id, v_reseller
  )
  ON CONFLICT (panel_host, panel_username) DO UPDATE SET
    panel_password = COALESCE(EXCLUDED.panel_password, public.player_signins.panel_password),
    expiration_date = EXCLUDED.expiration_date,
    xtream_status = EXCLUDED.xtream_status,
    max_connections = EXCLUDED.max_connections,
    is_trial = EXCLUDED.is_trial,
    server_label = EXCLUDED.server_label,
    last_seen_at = now(),
    device_id = CASE WHEN p_reason = 'signin' THEN EXCLUDED.device_id ELSE public.player_signins.device_id END,
    signin_count = public.player_signins.signin_count + CASE WHEN p_reason = 'signin' THEN 1 ELSE 0 END,
    supabase_user_id = CASE
      WHEN EXCLUDED.supabase_user_id IS NOT NULL AND (
        public.player_signins.supabase_user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = public.player_signins.supabase_user_id)
      ) THEN EXCLUDED.supabase_user_id
      ELSE public.player_signins.supabase_user_id
    END,
    matched_customer_id = COALESCE(EXCLUDED.matched_customer_id, public.player_signins.matched_customer_id),
    reseller_id = COALESCE(EXCLUDED.reseller_id, public.player_signins.reseller_id)
  RETURNING id, matched_customer_id INTO v_id, v_matched;

  -- Auto-link/merge into the CRM on EVERY capture (signin + reconcile).
  -- Failures here must never break sign-in capture.
  BEGIN
    PERFORM public.link_player_signin_to_crm(v_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'link_player_signin_to_crm failed for %: %', v_id, SQLERRM;
  END;

  SELECT matched_customer_id INTO v_matched FROM public.player_signins WHERE id = v_id;

  RETURN jsonb_build_object('ok', true, 'linked', v_matched IS NOT NULL);
END
$function$;

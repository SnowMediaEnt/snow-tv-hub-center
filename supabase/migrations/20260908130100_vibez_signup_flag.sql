-- Vibez sign-up hand-off. Separate from billing_account on purpose: that flag
-- also requires the native billing plugin and a built-in app key, and Vibez
-- needs neither — it is a URL and a text field — so hanging it off the same
-- switch would hide it on exactly the builds it exists to serve.
INSERT INTO public.feature_flags (key, enabled)
VALUES ('vibez_signup', false)
ON CONFLICT (key) DO NOTHING;

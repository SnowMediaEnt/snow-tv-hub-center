-- Billing account feature (docs/billing): ships dark. Flip `enabled` to true
-- in the feature_flags table to show My Account / trial / plans in the app.
INSERT INTO public.feature_flags (key, enabled)
VALUES ('billing_account', false)
ON CONFLICT (key) DO NOTHING;

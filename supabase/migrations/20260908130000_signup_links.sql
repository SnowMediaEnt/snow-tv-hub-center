-- Sign-up links for services the app CANNOT provision itself.
--
-- DreamStreams goes through WHMCS: the app creates the trial, takes the
-- payment and reads the credentials back over the SMC Account API, so it
-- needs no row here. Vibez has no such API — only a set of hosted pages from
-- the panel-automation service, which run a Stripe checkout and provision the
-- line through a Stripe webhook. All the app can do is hand the customer to
-- the right page.
--
-- These live in a table rather than in the app because the panel account
-- number and site name are part of every URL and will change, and because the
-- per-tier prices are the operator's to set. Editing a row beats shipping an
-- APK. When a service later gains a real API, delete its rows and it stops
-- being offered as a hand-off.
CREATE TABLE public.signup_links (
  -- Stable slug so seeds are idempotent and rows are easy to edit by hand.
  id            text PRIMARY KEY,
  service       text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('trial','plan','register','login','home')),
  -- Overrides the label the app builds from term_months + connections.
  label         text,
  term_months   integer,
  connections   integer,
  -- NULL means "we do not know the price" — the app then shows the tier
  -- without one rather than inventing a number.
  price         numeric(10,2),
  currency      text NOT NULL DEFAULT 'USD',
  url           text NOT NULL,
  sort          integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signup_links_service_active_idx ON public.signup_links (service, active, sort);

GRANT SELECT ON public.signup_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_links TO authenticated;
GRANT ALL ON public.signup_links TO service_role;

ALTER TABLE public.signup_links ENABLE ROW LEVEL SECURITY;

-- Public read: the sign-up screen runs before anyone has an account, so an
-- anonymous device must be able to see what is on offer. Nothing secret is
-- here; these URLs are handed to customers.
CREATE POLICY "Anyone can view signup links"
  ON public.signup_links FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert signup links"
  ON public.signup_links FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update signup links"
  ON public.signup_links FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete signup links"
  ON public.signup_links FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_signup_links_updated_at
  BEFORE UPDATE ON public.signup_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.signup_links REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.signup_links;

-- Vibez, from the panel automation page list. Prices are deliberately left
-- NULL: set them and the tiers start showing a price, no rebuild needed.
INSERT INTO public.signup_links (id, service, kind, term_months, connections, url, sort) VALUES
  ('vibez-trial',    'vibez', 'trial',    NULL, NULL, 'https://superadminpanels.com/099451/auto/sites/zargoza/trial.php',         0),
  ('vibez-register', 'vibez', 'register', NULL, NULL, 'https://superadminpanels.com/099451/auto/sites/zargoza/register.php',      1),
  ('vibez-login',    'vibez', 'login',    NULL, NULL, 'https://superadminpanels.com/099451/auto/sites/zargoza/login.php',         2),
  ('vibez-home',     'vibez', 'home',     NULL, NULL, 'https://superadminpanels.com/099451/auto/sites/zargoza/index.php',         3),
  ('vibez-1m-3c',    'vibez', 'plan',        1,    3, 'https://superadminpanels.com/099451/auto/sites/zargoza/onemonth.php',     10),
  ('vibez-1m-6c',    'vibez', 'plan',        1,    6, 'https://superadminpanels.com/099451/auto/sites/zargoza/onemonth2.php',    11),
  ('vibez-1m-9c',    'vibez', 'plan',        1,    9, 'https://superadminpanels.com/099451/auto/sites/zargoza/onemonth3.php',    12),
  ('vibez-3m-3c',    'vibez', 'plan',        3,    3, 'https://superadminpanels.com/099451/auto/sites/zargoza/threemonth.php',   20),
  ('vibez-3m-6c',    'vibez', 'plan',        3,    6, 'https://superadminpanels.com/099451/auto/sites/zargoza/threemonth2.php',  21),
  ('vibez-3m-9c',    'vibez', 'plan',        3,    9, 'https://superadminpanels.com/099451/auto/sites/zargoza/threemonth3.php',  22),
  ('vibez-6m-3c',    'vibez', 'plan',        6,    3, 'https://superadminpanels.com/099451/auto/sites/zargoza/sixmonth.php',     30),
  ('vibez-6m-6c',    'vibez', 'plan',        6,    6, 'https://superadminpanels.com/099451/auto/sites/zargoza/sixmonth2.php',    31),
  ('vibez-6m-9c',    'vibez', 'plan',        6,    9, 'https://superadminpanels.com/099451/auto/sites/zargoza/sixmonth3.php',    32),
  ('vibez-12m-3c',   'vibez', 'plan',       12,    3, 'https://superadminpanels.com/099451/auto/sites/zargoza/twelvemonth.php',  40),
  ('vibez-12m-6c',   'vibez', 'plan',       12,    6, 'https://superadminpanels.com/099451/auto/sites/zargoza/twelvemonth2.php', 41),
  ('vibez-12m-9c',   'vibez', 'plan',       12,    9, 'https://superadminpanels.com/099451/auto/sites/zargoza/twelvemonth3.php', 42)
ON CONFLICT (id) DO NOTHING;

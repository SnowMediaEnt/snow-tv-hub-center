-- Point every Vibez tier at the packages page until the panel's per-package
-- deep links work.
--
-- The links the panel publishes (onemonth3.php and friends) redirect to the
-- site root instead of the package, so picking "3 months" on the TV landed
-- the customer somewhere they had to choose again anyway. One link that
-- works beats four that do not. The prices stay on their rows so the TV can
-- still show what things cost; only the destination is shared.
--
-- The tier grid collapses to a single action by itself while every row points
-- to the same place, and comes back on its own once these URLs differ again —
-- so fixing the deep links later is this UPDATE in reverse, with no rebuild.
UPDATE public.signup_links
   SET url = 'https://superadminpanels.com/099451/auto/sites/zargoza/#packages'
 WHERE service = 'vibez'
   AND kind IN ('trial', 'plan', 'register');

# Billing account in the app

The SMC Account API (see `API.md`) is called only from the native side of the
Android app: `android/app/src/main/java/com/snowmedia/billing/`. The web layer
talks to it through the `SmcBilling` Capacitor plugin (`src/capacitor/SmcBilling.ts`).

## Turning it on

1. **App key** — put the key in `android/local.properties` (gitignored, never in source):

   ```
   SMC_BILLING_APP_KEY=...
   SMC_BILLING_BASE_URL=https://billing.smcdreamstreams.store/smc/v1   # optional
   ```

   Gradle copies it into `BuildConfig`. A build without the key still works;
   the billing screens simply stay hidden. Rotate the key before a release by
   editing that file and rebuilding.

2. **Feature flag** — the whole feature is behind `billing_account` in
   `public.feature_flags` (default `false`; migration
   `20260908120000_billing_account_flag.sql` seeds the row). Set it to `true`
   to show:
   - "Billing & subscription" on the My Account dashboard (website users and
     player-only users), which opens the billing screen;
   - "My Account" at the top of the Player's Settings;
   - "New here? Start a free 24-hour trial" on the Player's sign-in form.

## Where things live

| Piece | File |
|---|---|
| HTTP client, error mapping, timeouts, retry rule | `BillingApi.kt`, `BillingError.kt` |
| Typed models over the API JSON | `BillingModels.kt` |
| Invoice / service polling (3 s, 2 min) | `Poller.kt` |
| Token, device UUID, pending invoice (encrypted) | `SecureStore.kt` |
| Capacitor plugin | `SmcBillingPlugin.kt` |
| JVM unit tests (MockWebServer) | `android/app/src/test/java/com/snowmedia/billing/` |
| Web bridge + types | `src/capacitor/SmcBilling.ts` |
| Money/date formatting, error text, player sign-in from a service | `src/lib/billing.ts` |
| Screens | `src/components/billing/` |

Run the unit tests with `./gradlew :app:testDebugUnitTest` from `android/`.

## Rules the code keeps

- The token never reaches JavaScript; nothing logs bodies, tokens, passwords or codes.
- `pay_url` is one-time: opened at once in a Chrome Custom Tab (never a WebView),
  or shown as a QR code on Fire TV, and never stored. "Open again" mints a new one.
- Only the pending `invoice_id` is persisted, so a restart resumes polling.
- GETs retry once on a network failure; POSTs never retry.

## Emailing the login

The Account API sends no email of any kind, so after a trial or purchase the
username and password exist only on the TV screen. `email-line-credentials`
mails a copy. It verifies the line against the panel before sending, composes
the body server-side (so it is not an open relay — the caller supplies only
the address), and throttles per line and per IP.

Two Supabase edge-function secrets control the sender:

| Secret | Default | Notes |
|---|---|---|
| `EMAIL_FROM` | `Snow Media <onboarding@resend.dev>` | The default is Resend's shared sandbox sender and **only delivers to the Resend account owner** — customers get nothing, silently. Set it to an address on a domain verified in Resend, e.g. `Snow Media <noreply@support.snowmediaent.com>`. |
| `EMAIL_REPLY_TO` | `support@snowmediaent.com` | Where replies go, since the From is a no-reply. |

A domain verified in Resend authorises that exact domain only: verifying
`support.snowmediaent.com` allows `anything@support.snowmediaent.com` but not
`support@snowmediaent.com`.

Note that `send-custom-email` still hardcodes the sandbox sender, so its
welcome and verification mail has the same delivery limit.

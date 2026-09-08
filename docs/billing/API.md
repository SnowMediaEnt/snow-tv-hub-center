# SMC Account API — v1 (build 1.1.0)

Base URL: `https://billing.smcdreamstreams.store/smc/v1`
All requests and responses are JSON (`Content-Type: application/json`). Times are ISO-8601 UTC (`2026-09-08T12:00:00Z`); dates are `YYYY-MM-DD`; money is a number in USD.

## Authentication

| Header | Who sends it | Notes |
|---|---|---|
| `X-SMC-App-Key: <app_key>` | every request except `/health` | Static key printed once by `deploy/install.sh`. Wrong/missing → `401 invalid_app_key`. |
| `Authorization: Bearer <token>` | every user endpoint | Issued by `/auth/register` and `/auth/login`. 30-day sliding expiry (each use extends it) with a hard 90-day cap from issue; revoked by `/auth/logout` and whenever the customer's WHMCS password changes. |
| `X-SMC-Device: <opaque id>` | optional | Labels the token and enforces one free trial per device. Only an HMAC of it is stored (as the token's `device_label` and in the trial table); the raw value never reaches the database or the logs. |

Flow: **register** (or **login**) → keep `token` in encrypted storage → call user endpoints → on `401 token_expired` / `401 invalid_token` send the user back to login → **logout** revokes the token.

Accounts that enabled two-factor authentication in the WHMCS client area cannot log in through the app (`403 two_factor_required`); closed accounts get `403 account_closed`.

### Errors

Every error is `{ "error": { "code": "...", "message": "...", "details": {...}? } }` with a matching HTTP status. Stack traces are never returned, and WHMCS' own error text is never relayed: a `502` carries a fixed sentence naming the failed WHMCS call, the detail is only in the server log.

| HTTP | code | When |
|---|---|---|
| 400 | `invalid_json` | body is malformed or not a JSON object (arrays and scalars included) |
| 400 | `redeem_failed` | snowgift rejected the code (`message` explains) |
| 401 | `invalid_app_key` | app key missing/wrong |
| 401 | `missing_token` / `invalid_token` / `token_expired` | bearer problems (log in again) |
| 401 | `invalid_credentials` | login failed |
| 403 | `two_factor_required` | the account uses WHMCS two-factor authentication; use the billing website |
| 403 | `account_closed` | the WHMCS client is Closed |
| 404 | `not_found` | unknown route (with or without a token), or the service/invoice is not the caller's |
| 404 | `plan_not_found` | `plan_id` is not a DreamStreams product |
| 405 | `method_not_allowed` | |
| 409 | `email_exists` | register with an email WHMCS already has (client or user account) → offer login |
| 409 | `trial_already_used` | one trial per client (any status), and per device when `X-SMC-Device` is sent |
| 409 | `plan_unavailable` | plan is hidden (price not confirmed yet), has no billing cycle, or is the trial |
| 409 | `not_renewable` | trial, terminated/cancelled service, or zero amount |
| 409 | `invoice_not_payable` | `/invoices/{id}/pay-url` on an invoice that is not Unpaid |
| 422 | `validation_error` | `details.field` names the bad field; non-string/number values are rejected the same way |
| 429 | `rate_limited` | `details.retry_after` seconds; also sent as `Retry-After` header |
| 502 | `register_failed`, `order_failed`, `provisioning_failed`, `invoice_failed`, `sso_failed`, `whmcs_error` | WHMCS/localAPI reported an error |
| 503 | `redeem_unavailable` | snowgift addon missing or threw |
| 500 | `internal_error` | anything else (logged server-side) |

### Rate limits

| Scope | Limit | Notes |
|---|---|---|
| `/auth/login`, `/auth/register`, `/redeem` | 10 per client IP per 15 min | per endpoint |
| `/auth/login` per account | 20 attempts per email per 15 min, any IP | cleared by a successful login |
| bearer failures (missing/bad/expired token) | 120 per client IP per minute | past the limit the answer is `429` instead of `401`; valid tokens are never counted |
| everything else | 120 per token per minute (`/plans`: per IP) | |
| `POST /orders` (new orders), `POST /trial` (attempts reaching WHMCS) | 5 per client per 15 min | re-fetching an existing pending order does not count |

Counters are atomic (`INSERT … ON DUPLICATE KEY UPDATE`), so parallel requests cannot slip past a limit.

**Client IP.** Limits key on the TCP peer address (`REMOTE_ADDR`). If the site is put behind Cloudflare or another reverse proxy, every app user would share the proxy's address: list the proxy addresses/CIDRs in `"trusted_proxies"` in `/etc/snowmedia/smcapi.json`; only for those peers are `CF-Connecting-IP` (first) or the right-most non-proxy hop of `X-Forwarded-For` used. Without that setting the forwarded headers are ignored.

## Endpoints

### GET /health — no auth

```json
{ "ok": true, "version": "1.1.0", "time": "2026-09-07T12:00:00Z" }
```
`HEAD` is accepted too (for uptime monitors).

### POST /auth/register

```json
{ "email": "jane@example.com", "password": "at least 8 chars", "first_name": "Jane", "last_name": "Doe",
  "phone": "+15550100", "country": "US" }
```
`phone` and `country` (ISO-3166 alpha-2; missing or empty → `US`) are optional. Creates the WHMCS client (no email is sent) and logs the user in.

`201`
```json
{ "token": "b64url…", "token_type": "Bearer", "expires_at": "2026-10-07T12:00:00Z",
  "client": { "id": 42, "first_name": "Jane", "last_name": "Doe", "name": "Jane Doe", "email": "jane@example.com", "trial_used": false } }
```
`409 email_exists` if the address already has a WHMCS client **or** user account.

### POST /auth/login

```json
{ "email": "jane@example.com", "password": "…" }
```
`200` — same body as register. `401 invalid_credentials` otherwise; `403 two_factor_required` / `403 account_closed` as described above. The client is resolved from the authenticated email (WHMCS 8 user → owned client), never from a bare numeric id.

### POST /auth/logout — bearer

`200 { "ok": true }`. Revokes only the token used for the call. (All of a client's tokens are also revoked when its WHMCS password changes.)

### GET /me — bearer

```json
{ "client": { "id": 42, "first_name": "Jane", "last_name": "Doe", "name": "Jane Doe", "email": "jane@example.com", "trial_used": true } }
```

### GET /plans — app key only

```json
{ "currency": "USD", "plans": [
  { "id": 1, "name": "DreamStreams 24-Hour Free Trial", "connections": 2, "term_months": 0, "cycle": "free", "price": 0, "currency": "USD", "trial": true, "hidden": false, "orderable": false },
  { "id": 2, "name": "DreamStreams 1 Connection - 1 Month", "connections": 1, "term_months": 1, "cycle": "monthly", "price": 9.99, "currency": "USD", "trial": false, "hidden": true, "orderable": false },
  { "id": 3, "name": "DreamStreams 1 Connection - 3 Months", "connections": 1, "term_months": 3, "cycle": "quarterly", "price": 24.99, "currency": "USD", "trial": false, "hidden": false, "orderable": true }
] }
```
Sorted trial first, then by connections and term. `cycle` is the one billing cycle enabled in WHMCS (a disabled cycle is `-1` there; an enabled cycle may legitimately be `0.00`). A product with no enabled cycle is listed with `cycle: null`, `price: null`. **Only `orderable == true` plans can be bought** (`POST /orders`, otherwise `409 plan_unavailable`); the app should show those plus the trial by default. The owner un-hides a product in WHMCS once its price is confirmed.

### POST /trial — bearer

No body. Starts the 24-hour free trial (product 1): `AddOrder` (free, no invoice) + `AcceptOrder(autosetup)` which provisions the line on the panel synchronously (2–5 s; use a generous client timeout). The trial is reserved atomically per client and per device before WHMCS is called, so a double tap or a retry cannot create two trials.

`201`
```json
{ "order_id": 118, "service": { …service object, see below… } }
```
- `409 trial_already_used` — the client already has a trial service (any status), the `X-SMC-Device` already had one, or another request is provisioning it right now.
- `502 order_failed` — WHMCS refused the order; nothing was created and the client may try again (5 attempts per 15 min).
- `502 provisioning_failed` — order created but the panel did not create the line; `details.order_id` / `details.service_id` are set and the service stays `pending`. The client counts as having used the trial; support can retry the module create in WHMCS.

### GET /services — bearer

```json
{ "services": [ {
  "id": 57, "plan": { "id": 7, "name": "DreamStreams 2 Connections - 3 Months", "cycle": "quarterly", "term_months": 3, "trial": false },
  "status": "active", "active": true, "connections": 2, "billing_cycle": "quarterly", "amount": 44.99, "currency": "USD",
  "registered_at": "2026-09-07", "next_due": "2026-12-07", "expires_at": "2026-12-07T23:59:59Z", "panel_line_id": "6f0c…",
  "credentials": { "host": "http://dstreams.xyz:8080", "username": "ds1001", "password": "…",
                   "m3u_url": "http://dstreams.xyz:8080/get.php?username=ds1001&password=…&type=m3u_plus&output=ts" }
} ] }
```
- `status` is the WHMCS service status lower-cased: `pending`, `active`, `suspended`, `terminated`, `cancelled`.
- `credentials` is `null` until the line exists (pending paid orders). Username/password come from WHMCS (`tblhosting`), the source of truth for the panel login.
- `expires_at`: trial → 24 h after it was started; paid → end of `next_due` day (the panel line is renewed when the renewal invoice is paid).
- Newest service first. Only DreamStreams products (group 1) are listed.

### GET /services/{id} — bearer

`200 { "service": {…} }`; `404 not_found` unless the service belongs to the caller.

### POST /services/{id}/renew — bearer

Creates (or reuses) the renewal invoice for a paid service. If the caller already has an **Unpaid** invoice holding a Hosting line for this service, it is returned instead of creating a duplicate (invoices of other clients are never considered, even if they reference the service). Paying it makes WHMCS extend `next_due` by one billing cycle and run the module's Renew action on the panel.

Account credit (for example from a redeemed gift code) is applied to the invoice **after** its line has been linked to the service, so a credit-paid renewal really renews the line. If credit covers the whole amount the invoice comes back `paid` with `pay_url: null` — nothing to open.

`200`
```json
{ "invoice_id": 991, "amount": 44.99, "currency": "USD", "due_date": "2026-09-07", "status": "unpaid",
  "pay_url": "https://billing.smcdreamstreams.store/…one-time-sso…" }
```
`status` is `unpaid` or `paid`. `409 not_renewable` for the trial, terminated/cancelled services, or services with no amount.

### POST /orders — bearer

```json
{ "plan_id": 7 }
```
Places a WHMCS order for the plan's billing cycle. The service is created `pending`; WHMCS provisions the line automatically when the invoice is paid (`autosetup=payment`).

**Idempotent per plan:** while the client still has a `pending` service for this plan with an Unpaid invoice, calling again returns that order (`200`, `"reused": true`, fresh `pay_url`) instead of creating another. Once that invoice is paid or cancelled a new order can be placed. New orders are capped at 5 per client per 15 minutes.

`201` (new) / `200` (reused)
```json
{ "order_id": 120, "service_id": 58, "invoice_id": 992, "amount": 44.99, "currency": "USD", "reused": false,
  "plan": { "id": 7, "name": "…", "connections": 2, "term_months": 3, "cycle": "quarterly", "price": 44.99, "currency": "USD", "trial": false, "hidden": false, "orderable": true },
  "pay_url": "https://billing.smcdreamstreams.store/…one-time-sso…" }
```
For a plan priced `0.00` WHMCS raises no invoice: `invoice_id` and `pay_url` are `null`, and the order is activated by the operator in WHMCS.

### GET /invoices/{id} — bearer

```json
{ "invoice_id": 992, "status": "unpaid", "total": 44.99, "currency": "USD", "due_date": "2026-09-07", "paid_at": null }
```
`status` ∈ `unpaid | paid | cancelled | refunded | …`; `paid_at` is set when paid. `404` unless the invoice is the caller's. Polling this endpoint is cheap: it never creates SSO tokens.

### POST /invoices/{id}/pay-url — bearer

No body. Mints a **new** one-time pay link for one of the caller's Unpaid invoices (the Custom Tab was dismissed, the previous link expired, the app was restarted).

```json
{ "invoice_id": 992, "status": "unpaid", "total": 44.99, "currency": "USD", "pay_url": "https://billing.smcdreamstreams.store/…one-time-sso…" }
```
`409 invoice_not_payable` when the invoice is not Unpaid; `404` unless it is the caller's.

### POST /redeem — bearer

```json
{ "code": "GIFT-XXXX-XXXX" }
```
Best-effort bridge to the `snowgift` addon (`\Snowgift\Vouchers::redeem`). `200 { "ok": true, "result": {…} }` where `result` contains only the addon's `message`, `credit`, `amount`, `currency`, `balance`, `plan`, `expires_at` fields (whichever it returned); `400 redeem_failed` when the addon rejects the code, `503 redeem_unavailable` when the addon is missing or errors. The code is never logged — not even inside an addon exception message.

## Pay-URL flow (orders and renewals)

1. App calls `POST /orders` or `POST /services/{id}/renew` and receives `invoice_id` + `pay_url`. **Persist `invoice_id`.**
2. `pay_url` is a **one-time** WHMCS auto-login link (`CreateSsoToken`) that lands on the invoice page. Open it immediately in a Chrome Custom Tab / browser — do not cache or reuse it. To get a fresh link for the same invoice call `POST /invoices/{invoice_id}/pay-url`. (Re-calling `POST /orders` for the same plan returns the same pending order while its invoice is unpaid; re-calling `/renew` returns the same unpaid invoice.)
3. The customer pays on the WHMCS page. Until Stripe/PayPal is activated in WHMCS, only the offline "Bank Transfer" method is shown; the moment a real gateway is enabled in WHMCS it appears on that page automatically — no API change needed.
4. When the Custom Tab closes, the app polls `GET /invoices/{invoice_id}` (e.g. every 3 s for up to 2 minutes, then on next app open). On `status == "paid"`:
   - new order → `GET /services/{service_id}` until `status == "active"` and `credentials` is non-null (provisioning runs on payment, typically within seconds);
   - renewal → `GET /services/{id}` shows the new `next_due` / `expires_at`.

A renewal whose `status` is already `paid` in the `/renew` response (covered by account credit) skips steps 2–3.

No email is involved anywhere; everything the app needs is in the JSON responses.

## Kotlin / OkHttp example

```kotlin
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class SmcAccountApi(private val appKey: String, private val deviceId: String) {
    private val base = "https://billing.smcdreamstreams.store/smc/v1"
    private val json = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS) // /trial provisions synchronously (2-5 s)
        .build()

    class ApiException(val status: Int, val code: String, message: String) : Exception(message)

    private fun call(method: String, path: String, body: JSONObject? = null, token: String? = null): JSONObject {
        val builder = Request.Builder()
            .url(base + path)
            .header("X-SMC-App-Key", appKey)
            .header("X-SMC-Device", deviceId) // only an HMAC of it is stored server-side
            .header("Accept", "application/json")
        token?.let { builder.header("Authorization", "Bearer $it") }
        val requestBody = body?.toString()?.toRequestBody(json)
        builder.method(method, if (method == "GET") null else (requestBody ?: "{}".toRequestBody(json)))

        client.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            val parsed = runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            if (!response.isSuccessful) {
                val error = parsed.optJSONObject("error")
                throw ApiException(response.code,
                    error?.optString("code") ?: "http_${response.code}",
                    error?.optString("message") ?: "Request failed")
            }
            return parsed
        }
    }

    fun login(email: String, password: String): String =
        call("POST", "/auth/login", JSONObject().put("email", email).put("password", password))
            .getString("token")

    fun register(email: String, password: String, first: String, last: String): String =
        call("POST", "/auth/register", JSONObject()
            .put("email", email).put("password", password)
            .put("first_name", first).put("last_name", last)).getString("token")

    fun plans(): JSONObject = call("GET", "/plans")
    fun me(token: String): JSONObject = call("GET", "/me", token = token).getJSONObject("client")
    fun startTrial(token: String): JSONObject = call("POST", "/trial", token = token).getJSONObject("service")
    fun services(token: String) = call("GET", "/services", token = token).getJSONArray("services")
    fun order(token: String, planId: Int): JSONObject =
        call("POST", "/orders", JSONObject().put("plan_id", planId), token)
    fun renew(token: String, serviceId: Int): JSONObject =
        call("POST", "/services/$serviceId/renew", token = token)
    fun invoice(token: String, invoiceId: Int): JSONObject = call("GET", "/invoices/$invoiceId", token = token)
    fun payUrl(token: String, invoiceId: Int): String =
        call("POST", "/invoices/$invoiceId/pay-url", token = token).getString("pay_url")
    fun logout(token: String) { call("POST", "/auth/logout", token = token) }
}

// Usage (off the main thread):
// val api = SmcAccountApi(BuildConfig.SMC_APP_KEY, Settings.Secure.ANDROID_ID)
// val token = api.login(email, password)          // 403 two_factor_required -> send the user to the website
// val order = api.order(token, planId)              // persist order.getInt("invoice_id")
// if (!order.isNull("pay_url"))
//     CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(order.getString("pay_url")))
// ... on resume: poll api.invoice(token, invoiceId) until status == "paid",
//     then api.services(token) until the new service is "active" with credentials.
// ... if the user dismissed the tab: launchUrl(api.payUrl(token, invoiceId)) — never re-order.
```

## Operational notes

- Secrets live in `/etc/snowmedia/smcapi.json` (`app_key`, `token_secret`, optional `trusted_proxies`), mode 0400 `www-data`. `token_secret` HMACs device ids; bearer tokens are stored as `sha256(token)` in `mod_smcapi_tokens`.
- `deploy/install.sh` installs the code root-owned and read-only for the web user (only the secrets file belongs to `www-data`), and installs `deploy/hooks/smcapi_tokens.php` into `includes/hooks/` so a password change (`ClientChangePassword` / `UserChangePassword`) revokes the client's app tokens. Run the health check right after installing; it proves the vhost accepts the `.htaccess` (which uses only `mod_rewrite`/`mod_headers`/`mod_setenvif` directives).
- Tables `mod_smcapi_tokens`, `mod_smcapi_ratelimit` (bucket = primary key, atomic upsert) and `mod_smcapi_trials` (unique per `client_id` and per `device_hash`) are created on first request and checked once per PHP process; a trials table from the first release is upgraded in place.
- Failures are written with PHP `error_log` (Apache error log) and a few non-sensitive lines to the WHMCS activity log. Passwords, tokens, gift codes and device ids are never logged; raw WHMCS error messages are logged but never returned to the app.
- The API never uses the WHMCS session: it is closed right after `init.php` and no `Set-Cookie` header is sent.
- Paid orders are **not** accepted through `AcceptOrder`; WHMCS provisions them on payment. If the owner prefers orders to show as "Active" immediately, accept them in the WHMCS admin after payment as usual.

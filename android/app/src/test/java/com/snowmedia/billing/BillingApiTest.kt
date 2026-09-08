package com.snowmedia.billing

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/**
 * BillingApi against MockWebServer: every response shape in docs/API.md,
 * every error code, the retry rule, and the "never crash on a bad body" rule.
 */
class BillingApiTest {

    private lateinit var server: MockWebServer
    private lateinit var api: BillingApi
    private var token: String? = "tok_abc"
    private val sleeps = ArrayList<Long>()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = BillingApi(
            baseUrl = server.url("/smc/v1/").toString(),
            appKey = "app-key-1",
            deviceId = "device-uuid-1",
            tokenProvider = { token },
            sleep = { sleeps.add(it) },
        )
    }

    @After
    fun tearDown() { server.shutdown() }

    private fun json(body: String, code: Int = 200): MockResponse =
        MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)

    private fun errorBody(code: String, message: String, details: String? = null): String =
        """{"error":{"code":"$code","message":"$message"${if (details != null) ",\"details\":$details" else ""}}}"""

    private inline fun expectError(block: () -> Unit): BillingError {
        try { block() } catch (e: BillingError) { return e }
        fail("expected BillingError"); throw IllegalStateException()
    }

    // ── headers and transport ──────────────────────────────────────────────

    @Test fun `every request carries app key, device id and accept`() {
        server.enqueue(json(CLIENT_ME))
        api.me()
        val r = server.takeRequest()
        assertEquals("app-key-1", r.getHeader("X-SMC-App-Key"))
        assertEquals("device-uuid-1", r.getHeader("X-SMC-Device"))
        assertEquals("application/json", r.getHeader("Accept"))
        assertEquals("Bearer tok_abc", r.getHeader("Authorization"))
        assertEquals("GET", r.method)
        assertEquals("/smc/v1/me", r.path)
    }

    @Test fun `public endpoints send no bearer`() {
        server.enqueue(json(PLANS))
        api.plans()
        assertNull(server.takeRequest().getHeader("Authorization"))
        server.enqueue(json(SESSION))
        api.login("a@b.c", "pw")
        assertNull(server.takeRequest().getHeader("Authorization"))
    }

    @Test fun `no token means missing_token locally without a request`() {
        token = null
        val e = expectError { api.services() }
        assertEquals("missing_token", e.code)
        assertEquals(401, e.status)
        assertTrue(e.isAuthError)
        assertEquals(0, server.requestCount)
    }

    @Test fun `token is read at call time`() {
        server.enqueue(json(SERVICES))
        token = "later"
        api.services()
        assertEquals("Bearer later", server.takeRequest().getHeader("Authorization"))
    }

    // ── auth shapes ────────────────────────────────────────────────────────

    @Test fun `register sends the form and parses the session`() {
        server.enqueue(json(SESSION))
        val s = api.register(" new@example.com ", "hunter22", " Ada ", "Lovelace", phone = "+1 555", country = "US")
        val r = server.takeRequest()
        assertEquals("POST", r.method)
        assertEquals("/smc/v1/auth/register", r.path)
        val body = JSONObject(r.body.readUtf8())
        assertEquals("new@example.com", body.getString("email"))
        assertEquals("hunter22", body.getString("password"))
        assertEquals("Ada", body.getString("first_name"))
        assertEquals("Lovelace", body.getString("last_name"))
        assertEquals("+1 555", body.getString("phone"))
        assertEquals("US", body.getString("country"))
        assertTrue(r.getHeader("Content-Type")!!.startsWith("application/json"))
        assertEquals("smc_a1b2c3", s.token)
        assertEquals("Bearer", s.tokenType)
        assertEquals("2026-10-08T12:00:00+00:00", s.expiresAt)
        assertEquals(1234L, s.client.id)
        assertEquals("Ada", s.client.firstName)
        assertEquals("Ada Lovelace", s.client.name)
        assertEquals("new@example.com", s.client.email)
        assertFalse(s.client.trialUsed)
    }

    @Test fun `register omits blank optional fields`() {
        server.enqueue(json(SESSION))
        api.register("a@b.c", "pw", "A", "B", phone = "  ", country = null)
        val body = JSONObject(server.takeRequest().body.readUtf8())
        assertFalse(body.has("phone"))
        assertFalse(body.has("country"))
    }

    @Test fun `login parses the session and trims the email`() {
        server.enqueue(json(SESSION))
        val s = api.login("  new@example.com", "pw")
        val body = JSONObject(server.takeRequest().body.readUtf8())
        assertEquals("new@example.com", body.getString("email"))
        assertEquals("pw", body.getString("password"))
        assertEquals("smc_a1b2c3", s.token)
    }

    @Test fun `session without a token is bad_response`() {
        server.enqueue(json("""{"token_type":"Bearer","client":{"id":1,"email":"a@b.c"}}"""))
        val e = expectError { api.login("a@b.c", "pw") }
        assertEquals("bad_response", e.code)
        assertTrue(e.message!!.contains("token"))
    }

    @Test fun `logout posts with the bearer and an empty object body`() {
        server.enqueue(json("""{"ok":true}"""))
        api.logout()
        val r = server.takeRequest()
        assertEquals("/smc/v1/auth/logout", r.path)
        assertEquals("Bearer tok_abc", r.getHeader("Authorization"))
        assertEquals("{}", r.body.readUtf8())
    }

    @Test fun `me parses the client and trial_used`() {
        server.enqueue(json(CLIENT_ME))
        val c = api.me()
        assertEquals(1234L, c.id)
        assertEquals("Ada", c.firstName)
        assertEquals("Lovelace", c.lastName)
        assertTrue(c.trialUsed)
        assertEquals("Lovelace", c.raw.getString("last_name"))
    }

    @Test fun `me without client object is bad_response`() {
        server.enqueue(json("""{"ok":true}"""))
        assertEquals("bad_response", expectError { api.me() }.code)
    }

    // ── plans ──────────────────────────────────────────────────────────────

    @Test fun `plans handles null cycle and price, string prices, and orderable`() {
        server.enqueue(json(PLANS))
        val p = api.plans()
        assertEquals("USD", p.currency)
        assertEquals(3, p.plans.size)

        val monthly = p.plans[0]
        assertEquals(12L, monthly.id)
        assertEquals("Monthly 2 Connections", monthly.name)
        assertEquals(2, monthly.connections)
        assertEquals(1, monthly.termMonths)
        assertEquals("monthly", monthly.cycle)
        assertEquals(12.99, monthly.price!!, 0.0001)
        assertEquals("USD", monthly.currency)
        assertFalse(monthly.trial)
        assertTrue(monthly.orderable)

        val trial = p.plans[1]
        assertTrue(trial.trial)
        assertEquals(0.0, trial.price!!, 0.0)
        assertFalse(trial.orderable)

        val broken = p.plans[2]
        assertNull(broken.cycle)
        assertNull(broken.price)
        assertFalse(broken.orderable)
        assertEquals("EUR", broken.currency) // its own currency wins over the response default
    }

    @Test fun `plans with a stringified price still parse`() {
        server.enqueue(json("""{"currency":"USD","plans":[{"id":"7","name":"X","connections":"1","term_months":"3","cycle":"quarterly","price":"29.97","currency":"USD","trial":0,"hidden":"false","orderable":"1"}]}"""))
        val plan = api.plans().plans.single()
        assertEquals(7L, plan.id)
        assertEquals(1, plan.connections)
        assertEquals(3, plan.termMonths)
        assertEquals(29.97, plan.price!!, 0.0001)
        assertFalse(plan.trial)
        assertFalse(plan.hidden)
        assertTrue(plan.orderable)
    }

    @Test fun `plans without a plans array is bad_response`() {
        server.enqueue(json("""{"currency":"USD"}"""))
        assertEquals("bad_response", expectError { api.plans() }.code)
    }

    // ── trial and services ─────────────────────────────────────────────────

    @Test fun `trial parses the order and the provisioned service`() {
        server.enqueue(json(TRIAL))
        val t = api.startTrial()
        val r = server.takeRequest()
        assertEquals("POST", r.method)
        assertEquals("/smc/v1/trial", r.path)
        assertEquals(5001L, t.orderId)
        assertEquals(9001L, t.service.id)
        assertEquals("active", t.service.status)
        assertTrue(t.service.active)
        assertTrue(t.service.plan.trial)
        assertEquals("Free Trial 24h", t.service.plan.name)
        assertTrue(t.service.provisioned)
        assertFalse(t.service.renewable)
        val c = t.service.credentials!!
        assertEquals("http://dstreams.xyz:8080", c.host)
        assertEquals("trial_ada", c.username)
        assertEquals("s3cret", c.password)
        assertEquals("http://dstreams.xyz:8080/get.php?username=trial_ada&password=s3cret&type=m3u_plus", c.m3uUrl)
        assertEquals("2026-09-09T12:00:00+00:00", t.service.expiresAt)
    }

    @Test fun `services parses each row and leaves pending lines without credentials`() {
        server.enqueue(json(SERVICES))
        val list = api.services()
        assertEquals(3, list.size)

        val active = list[0]
        assertEquals(9002L, active.id)
        assertEquals("active", active.status)
        assertEquals(2, active.connections)
        assertEquals("monthly", active.billingCycle)
        assertEquals(12.99, active.amount!!, 0.0001)
        assertEquals("2026-10-01", active.nextDue)
        assertEquals("line-77", active.panelLineId)
        assertNotNull(active.credentials)
        assertTrue(active.renewable)
        assertTrue(active.provisioned)
        assertFalse(active.terminal)

        val pending = list[1]
        assertEquals("pending", pending.status)
        assertNull(pending.credentials)
        assertFalse(pending.provisioned)
        assertFalse(pending.renewable)

        val terminated = list[2]
        assertEquals("terminated", terminated.status)
        assertTrue(terminated.terminal)
        assertFalse(terminated.renewable)
    }

    @Test fun `suspended paid service is renewable, zero amount is not, trial is not`() {
        fun svc(status: String, amount: String, trial: Boolean) =
            Service.parse(JSONObject("""{"id":1,"status":"$status","amount":$amount,"plan":{"id":1,"name":"x","trial":$trial}}"""))
        assertTrue(svc("suspended", "5", false).renewable)
        assertTrue(svc("Active", "5", false).renewable) // server case-folds; we do too
        assertFalse(svc("active", "0", false).renewable)
        assertFalse(svc("active", "null", false).renewable)
        assertFalse(svc("active", "5", true).renewable)
        assertFalse(svc("cancelled", "5", false).renewable)
    }

    @Test fun `credentials with blanks count as none`() {
        val s = Service.parse(JSONObject("""{"id":1,"status":"active","credentials":{"host":"h","username":"","password":"p"}}"""))
        assertNull(s.credentials)
        assertFalse(s.provisioned)
    }

    @Test fun `service reads the wrapped object`() {
        server.enqueue(json("""{"service":${SERVICE_ACTIVE}}"""))
        val s = api.service(9002)
        assertEquals("/smc/v1/services/9002", server.takeRequest().path)
        assertEquals(9002L, s.id)
    }

    @Test fun `services without an array is bad_response`() {
        server.enqueue(json("""{"services":null}"""))
        assertEquals("bad_response", expectError { api.services() }.code)
    }

    @Test fun `service row without an id is bad_response`() {
        server.enqueue(json("""{"services":[{"status":"active"}]}"""))
        assertEquals("bad_response", expectError { api.services() }.code)
    }

    // ── renew / order ──────────────────────────────────────────────────────

    @Test fun `renew unpaid returns the invoice and a pay_url`() {
        server.enqueue(json("""{"invoice_id":31337,"amount":12.99,"currency":"USD","due_date":"2026-10-01","status":"unpaid","pay_url":"https://billing.example/pay/abc"}"""))
        val r = api.renew(9002)
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("/smc/v1/services/9002/renew", req.path)
        assertEquals(31337L, r.invoiceId)
        assertEquals(12.99, r.amount!!, 0.0001)
        assertEquals("2026-10-01", r.dueDate)
        assertFalse(r.paid)
        assertEquals("https://billing.example/pay/abc", r.payUrl)
    }

    @Test fun `renew paid by credit has status paid and no pay_url`() {
        server.enqueue(json("""{"invoice_id":31338,"amount":12.99,"currency":"USD","due_date":"2026-10-01","status":"paid","pay_url":null}"""))
        val r = api.renew(9002)
        assertTrue(r.paid)
        assertNull(r.payUrl)
    }

    @Test fun `order parses a fresh order`() {
        server.enqueue(json(ORDER))
        val o = api.order(12)
        val req = server.takeRequest()
        assertEquals("/smc/v1/orders", req.path)
        assertEquals(12, JSONObject(req.body.readUtf8()).getInt("plan_id"))
        assertEquals(5002L, o.orderId)
        assertEquals(9003L, o.serviceId)
        assertEquals(31339L, o.invoiceId)
        assertEquals(12.99, o.amount!!, 0.0001)
        assertFalse(o.reused)
        assertEquals("Monthly 2 Connections", o.plan!!.name)
        assertEquals("https://billing.example/pay/def", o.payUrl)
    }

    @Test fun `order reused flag is carried`() {
        server.enqueue(json(ORDER.replace("\"reused\":false", "\"reused\":true")))
        assertTrue(api.order(12).reused)
    }

    @Test fun `order for a free plan has no invoice and no pay_url`() {
        server.enqueue(json("""{"order_id":5003,"service_id":9004,"invoice_id":null,"amount":0,"currency":"USD","reused":false,"plan":{"id":13,"name":"Comp","price":0,"orderable":true},"pay_url":null}"""))
        val o = api.order(13)
        assertNull(o.invoiceId)
        assertNull(o.payUrl)
        assertEquals(0.0, o.amount!!, 0.0)
    }

    // ── invoices ───────────────────────────────────────────────────────────

    @Test fun `invoice unpaid, paid and cancelled`() {
        server.enqueue(json("""{"invoice_id":31337,"status":"Unpaid","total":12.99,"currency":"USD","due_date":"2026-10-01","paid_at":null}"""))
        val u = api.invoice(31337)
        assertEquals("/smc/v1/invoices/31337", server.takeRequest().path)
        assertEquals("unpaid", u.status)
        assertFalse(u.paid); assertFalse(u.closed)
        assertEquals(12.99, u.total!!, 0.0001)
        assertNull(u.paidAt)

        server.enqueue(json("""{"invoice_id":31337,"status":"paid","total":"12.99","currency":"USD","due_date":"2026-10-01","paid_at":"2026-09-08T10:00:00+00:00"}"""))
        val p = api.invoice(31337)
        assertTrue(p.paid); assertFalse(p.closed)
        assertEquals("2026-09-08T10:00:00+00:00", p.paidAt)

        server.enqueue(json("""{"invoice_id":31337,"status":"cancelled","total":12.99,"currency":"USD"}"""))
        val c = api.invoice(31337)
        assertFalse(c.paid); assertTrue(c.closed)
    }

    @Test fun `pay-url mints a fresh link`() {
        server.enqueue(json("""{"invoice_id":31337,"status":"unpaid","total":12.99,"currency":"USD","pay_url":"https://billing.example/pay/xyz"}"""))
        val p = api.payUrl(31337)
        val r = server.takeRequest()
        assertEquals("POST", r.method)
        assertEquals("/smc/v1/invoices/31337/pay-url", r.path)
        assertEquals("https://billing.example/pay/xyz", p.payUrl)
        assertEquals(12.99, p.total!!, 0.0001)
    }

    @Test fun `pay-url without a link is bad_response`() {
        server.enqueue(json("""{"invoice_id":31337,"status":"unpaid","pay_url":null}"""))
        assertEquals("bad_response", expectError { api.payUrl(31337) }.code)
    }

    // ── redeem ─────────────────────────────────────────────────────────────

    @Test fun `redeem trims the code and parses the addon result`() {
        server.enqueue(json("""{"ok":true,"result":{"message":"Added 30 days","credit":true,"amount":12.99,"currency":"USD","balance":12.99,"plan":"Monthly","expires_at":"2026-11-01"}}"""))
        val r = api.redeem("  GIFT-1234 ")
        val req = server.takeRequest()
        assertEquals("/smc/v1/redeem", req.path)
        assertEquals("GIFT-1234", JSONObject(req.body.readUtf8()).getString("code"))
        assertTrue(r.ok)
        assertEquals("Added 30 days", r.message)
        assertEquals(1.0, r.credit!!, 0.0)  // booleans read as numbers: true → 1
        assertEquals(12.99, r.amount!!, 0.0001)
        assertEquals(12.99, r.balance!!, 0.0001)
        assertEquals("Monthly", r.plan)
        assertEquals("2026-11-01", r.expiresAt)
    }

    @Test fun `redeem with an empty result still succeeds`() {
        server.enqueue(json("""{"ok":true,"result":{}}"""))
        val r = api.redeem("X")
        assertTrue(r.ok)
        assertNull(r.message)
        assertNull(r.amount)
    }

    // ── every error code ───────────────────────────────────────────────────

    @Test fun `every documented error code maps to a BillingError with that code and status`() {
        val cases = listOf(
            Triple("invalid_json", 400, "Body is not valid JSON"),
            Triple("redeem_failed", 400, "Code not valid"),
            Triple("invalid_app_key", 401, "Bad app key"),
            Triple("missing_token", 401, "Missing bearer"),
            Triple("invalid_token", 401, "Token unknown"),
            Triple("token_expired", 401, "Token expired"),
            Triple("invalid_credentials", 401, "Wrong email or password"),
            Triple("two_factor_required", 403, "Two-factor is on"),
            Triple("account_closed", 403, "Account closed"),
            Triple("not_found", 404, "No such service"),
            Triple("plan_not_found", 404, "No such plan"),
            Triple("email_exists", 409, "Already registered"),
            Triple("trial_already_used", 409, "Trial used"),
            Triple("plan_unavailable", 409, "Not orderable"),
            Triple("not_renewable", 409, "Cannot renew"),
            Triple("invoice_not_payable", 409, "Already paid"),
            Triple("validation_error", 422, "password too short"),
            Triple("rate_limited", 429, "Slow down"),
            Triple("register_failed", 502, "WHMCS said no"),
            Triple("order_failed", 502, "WHMCS said no"),
            Triple("provisioning_failed", 502, "Panel down"),
            Triple("invoice_failed", 502, "WHMCS said no"),
            Triple("sso_failed", 502, "WHMCS said no"),
            Triple("whmcs_error", 502, "WHMCS said no"),
            Triple("redeem_unavailable", 503, "Addon off"),
            Triple("internal_error", 500, "Boom"),
        )
        for ((code, status, message) in cases) {
            server.enqueue(json(errorBody(code, message), status))
            val e = expectError { api.services() }
            assertEquals(code, e.code)
            assertEquals(status, e.status)
            assertEquals(message, e.message)
            assertFalse("$code is not a network error", e.isNetwork)
            // A non-network failure is never retried, whatever the method.
            assertEquals("$code must not retry", 1, server.requestCount - cases.indexOf(Triple(code, status, message)))
        }
    }

    @Test fun `only token failures are auth errors`() {
        for (code in listOf("invalid_token", "token_expired", "missing_token")) {
            assertTrue(code, BillingError.fromResponse(401, errorBody(code, "x")).isAuthError)
        }
        assertFalse(BillingError.fromResponse(401, errorBody("invalid_credentials", "x")).isAuthError)
        assertFalse(BillingError.fromResponse(401, errorBody("invalid_app_key", "x")).isAuthError)
        assertFalse(BillingError.fromResponse(403, errorBody("invalid_token", "x")).isAuthError)
    }

    @Test fun `validation_error carries the field`() {
        server.enqueue(json(errorBody("validation_error", "password must be at least 8 characters", """{"field":"password"}"""), 422))
        val e = expectError { api.register("a@b.c", "short", "A", "B") }
        assertEquals("validation_error", e.code)
        assertEquals("password", e.field)
    }

    @Test fun `rate_limited reads retry_after from details or the header`() {
        server.enqueue(json(errorBody("rate_limited", "Slow down", """{"retry_after":45}"""), 429))
        val a = expectError { api.me() }
        assertTrue(a.isRateLimited)
        assertEquals(45, a.retryAfterSeconds)

        server.enqueue(json(errorBody("rate_limited", "Slow down"), 429).setHeader("Retry-After", "60"))
        val b = expectError { api.me() }
        assertEquals(60, b.retryAfterSeconds)

        server.enqueue(json(errorBody("rate_limited", "Slow down"), 429))
        assertNull(expectError { api.me() }.retryAfterSeconds)
    }

    @Test fun `provisioning_failed keeps order and service ids in details`() {
        server.enqueue(json(errorBody("provisioning_failed", "Panel down", """{"order_id":5001,"service_id":9001}"""), 502))
        val e = expectError { api.startTrial() }
        assertEquals(9001, e.details!!.getInt("service_id"))
        assertEquals(5001, e.details!!.getInt("order_id"))
    }

    @Test fun `non-JSON error body becomes http_status with a default message`() {
        server.enqueue(MockResponse().setResponseCode(502).setHeader("Content-Type", "text/html").setBody("<html>Bad Gateway</html>"))
        val e = expectError { api.me() }
        assertEquals("http_502", e.code)
        assertEquals(502, e.status)
        assertTrue(e.message!!.contains("billing server"))

        server.enqueue(MockResponse().setResponseCode(401))
        val u = expectError { api.me() }
        assertEquals("http_401", u.code)
        assertFalse(u.isAuthError) // unknown 401: do not throw the session away on a proxy's say-so
    }

    @Test fun `error envelope with a blank code falls back to http_status`() {
        server.enqueue(json("""{"error":{"code":"","message":""}}""", 500))
        val e = expectError { api.me() }
        assertEquals("http_500", e.code)
        assertTrue(e.message!!.isNotBlank())
    }

    @Test fun `toJson carries code status and details for the bridge`() {
        val e = BillingError.fromResponse(422, errorBody("validation_error", "bad", """{"field":"email"}"""))
        val j = e.toJson()
        assertEquals("validation_error", j.getString("code"))
        assertEquals(422, j.getInt("status"))
        assertEquals("email", j.getJSONObject("details").getString("field"))
        assertTrue(BillingError.network(RuntimeException()).toJson().isNull("details"))
    }

    // ── bad 2xx bodies ─────────────────────────────────────────────────────

    @Test fun `HTML with a 200 is bad_response, not a crash`() {
        server.enqueue(MockResponse().setResponseCode(200).setHeader("Content-Type", "text/html").setBody("<!doctype html><html>captive portal</html>"))
        val e = expectError { api.plans() }
        assertEquals("bad_response", e.code)
        assertTrue(e.message!!.contains("HTML"))
    }

    @Test fun `empty, array and truncated bodies are bad_response`() {
        server.enqueue(json(""))
        assertEquals("bad_response", expectError { api.plans() }.code)
        server.enqueue(json("[1,2,3]"))
        assertEquals("bad_response", expectError { api.plans() }.code)
        server.enqueue(json("""{"currency":"USD","plans":[{"id":1,"na"""))
        assertEquals("bad_response", expectError { api.plans() }.code)
    }

    @Test fun `wrong types in required fields are bad_response`() {
        server.enqueue(json("""{"invoice_id":"not-a-number","status":"unpaid"}"""))
        assertEquals("bad_response", expectError { api.invoice(1) }.code)
    }

    // ── retry rule ─────────────────────────────────────────────────────────

    @Test fun `GET retries once after a network failure`() {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        server.enqueue(json(SERVICES))
        val list = api.services()
        assertEquals(3, list.size)
        assertEquals(2, server.requestCount)
        assertEquals(listOf(BillingApi.RETRY_DELAY_MS), sleeps)
    }

    @Test fun `GET gives up after the second network failure`() {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        val e = expectError { api.services() }
        assertTrue(e.isNetwork)
        assertEquals("network", e.code)
        assertEquals(0, e.status)
        assertEquals(2, server.requestCount)
    }

    @Test fun `GET does not retry an HTTP error`() {
        server.enqueue(json(errorBody("not_found", "gone"), 404))
        server.enqueue(json(SERVICES))
        assertEquals("not_found", expectError { api.service(1) }.code)
        assertEquals(1, server.requestCount)
        assertTrue(sleeps.isEmpty())
    }

    @Test fun `POST is never retried`() {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        server.enqueue(json("""{"ok":true,"result":{}}"""))
        val e = expectError { api.redeem("CODE") }
        assertTrue(e.isNetwork)
        assertEquals(1, server.requestCount)
        assertTrue(sleeps.isEmpty())
    }

    @Test fun `trial and order POSTs are not retried either`() {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        assertTrue(expectError { api.startTrial() }.isNetwork)
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        assertTrue(expectError { api.order(1) }.isNetwork)
        assertEquals(2, server.requestCount)
    }

    @Test fun `base url with or without a trailing slash yields the same path`() {
        val bare = BillingApi(server.url("/smc/v1").toString(), "k", "d", { "t" }, sleep = {})
        server.enqueue(json(CLIENT_ME))
        bare.me()
        assertEquals("/smc/v1/me", server.takeRequest().path)
    }

    companion object {
        const val CLIENT_ME = """{"client":{"id":1234,"first_name":"Ada","last_name":"Lovelace","name":"Ada Lovelace","email":"new@example.com","trial_used":true}}"""
        const val SESSION = """{"token":"smc_a1b2c3","token_type":"Bearer","expires_at":"2026-10-08T12:00:00+00:00","client":{"id":1234,"first_name":"Ada","last_name":"Lovelace","name":"Ada Lovelace","email":"new@example.com","trial_used":false}}"""
        const val PLANS = """{"currency":"USD","plans":[
            {"id":12,"name":"Monthly 2 Connections","connections":2,"term_months":1,"cycle":"monthly","price":12.99,"currency":"USD","trial":false,"hidden":false,"orderable":true},
            {"id":1,"name":"Free Trial 24h","connections":1,"term_months":0,"cycle":"free","price":0,"currency":"USD","trial":true,"hidden":true,"orderable":false},
            {"id":99,"name":"Legacy","connections":1,"term_months":12,"cycle":null,"price":null,"currency":"EUR","trial":false,"hidden":false,"orderable":false}
        ]}"""
        const val SERVICE_ACTIVE = """{"id":9002,"plan":{"id":12,"name":"Monthly 2 Connections","cycle":"monthly","term_months":1,"trial":false},"status":"active","active":true,"connections":2,"billing_cycle":"monthly","amount":12.99,"currency":"USD","registered_at":"2026-09-01","next_due":"2026-10-01","expires_at":"2026-10-01T00:00:00+00:00","panel_line_id":"line-77","credentials":{"host":"http://dstreams.xyz:8080","username":"ada2","password":"pw2","m3u_url":"http://dstreams.xyz:8080/get.php?username=ada2&password=pw2&type=m3u_plus"}}"""
        const val SERVICE_PENDING = """{"id":9003,"plan":{"id":12,"name":"Monthly 2 Connections","cycle":"monthly","term_months":1,"trial":false},"status":"pending","active":false,"connections":2,"billing_cycle":"monthly","amount":12.99,"currency":"USD","registered_at":"2026-09-08","next_due":"2026-09-08","expires_at":null,"panel_line_id":null,"credentials":null}"""
        const val SERVICE_TERMINATED = """{"id":9000,"plan":{"id":12,"name":"Monthly 2 Connections","cycle":"monthly","term_months":1,"trial":false},"status":"Terminated","active":false,"connections":2,"billing_cycle":"monthly","amount":12.99,"currency":"USD","registered_at":"2026-01-01","next_due":"2026-02-01","expires_at":"2026-02-01T00:00:00+00:00","panel_line_id":"line-1","credentials":null}"""
        const val SERVICES = """{"services":[$SERVICE_ACTIVE,$SERVICE_PENDING,$SERVICE_TERMINATED]}"""
        const val TRIAL = """{"order_id":5001,"service":{"id":9001,"plan":{"id":1,"name":"Free Trial 24h","cycle":"free","term_months":0,"trial":true},"status":"active","active":true,"connections":1,"billing_cycle":"free","amount":0,"currency":"USD","registered_at":"2026-09-08","next_due":null,"expires_at":"2026-09-09T12:00:00+00:00","panel_line_id":"line-88","credentials":{"host":"http://dstreams.xyz:8080","username":"trial_ada","password":"s3cret","m3u_url":"http://dstreams.xyz:8080/get.php?username=trial_ada&password=s3cret&type=m3u_plus"}}}"""
        const val ORDER = """{"order_id":5002,"service_id":9003,"invoice_id":31339,"amount":12.99,"currency":"USD","reused":false,"plan":{"id":12,"name":"Monthly 2 Connections","connections":2,"term_months":1,"cycle":"monthly","price":12.99,"currency":"USD","trial":false,"hidden":false,"orderable":true},"pay_url":"https://billing.example/pay/def"}"""
    }
}

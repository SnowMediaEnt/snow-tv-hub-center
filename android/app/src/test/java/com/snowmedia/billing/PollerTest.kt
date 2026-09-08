package com.snowmedia.billing

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * The polling loop with a fake clock: which tick decides, how many sleeps,
 * and how each kind of failure ends it.
 */
class PollerTest {

    private var now = 0L
    private val sleeps = ArrayList<Long>()
    private val poller = Poller(now = { now }, sleep = { sleeps.add(it); now += it })

    private fun <T> Poller.Outcome<T>.ticks(): Int = when (this) {
        is Poller.Outcome.Done -> ticks
        is Poller.Outcome.Stopped -> ticks
        is Poller.Outcome.TimedOut -> ticks
        is Poller.Outcome.Failed -> ticks
        is Poller.Outcome.Cancelled -> ticks
    }

    @Test fun `answer on the first tick returns without sleeping`() {
        val out = poller.poll(3000, 120_000, fetch = { "paid" }, done = { it == "paid" })
        assertTrue(out is Poller.Outcome.Done)
        assertEquals("paid", (out as Poller.Outcome.Done).value)
        assertEquals(1, out.ticks)
        assertTrue(sleeps.isEmpty())
    }

    @Test fun `done on the third tick sleeps twice`() {
        var n = 0
        val out = poller.poll(3000, 120_000, fetch = { if (++n < 3) "unpaid" else "paid" }, done = { it == "paid" })
        assertTrue(out is Poller.Outcome.Done)
        assertEquals(3, out.ticks())
        assertEquals(listOf(3000L, 3000L), sleeps)
    }

    @Test fun `stop ends the poll as Stopped with the value`() {
        var n = 0
        val out = poller.poll(3000, 120_000, fetch = { if (++n < 2) "unpaid" else "cancelled" }, done = { it == "paid" }, stop = { it == "cancelled" })
        assertTrue(out is Poller.Outcome.Stopped)
        assertEquals("cancelled", (out as Poller.Outcome.Stopped).value)
        assertEquals(2, out.ticks)
    }

    @Test fun `done wins over stop when both match`() {
        val out = poller.poll(3000, 120_000, fetch = { "x" }, done = { true }, stop = { true })
        assertTrue(out is Poller.Outcome.Done)
    }

    @Test fun `network errors are transient ticks`() {
        var n = 0
        val out = poller.poll(
            3000, 120_000,
            fetch = { if (++n < 3) throw BillingError.network(RuntimeException("dns")) else "paid" },
            done = { it == "paid" },
        )
        assertTrue(out is Poller.Outcome.Done)
        assertEquals(3, out.ticks())
        assertEquals(2, sleeps.size)
    }

    @Test fun `any other error fails the poll at that tick`() {
        var n = 0
        val out = poller.poll<String>(
            3000, 120_000,
            fetch = { if (++n < 2) "unpaid" else throw BillingError("token_expired", "expired", 401) },
            done = { it == "paid" },
        )
        assertTrue(out is Poller.Outcome.Failed)
        assertEquals("token_expired", (out as Poller.Outcome.Failed).error.code)
        assertEquals(2, out.ticks)
    }

    @Test fun `timeout carries the last value and stops at the deadline`() {
        val out = poller.poll(3000, 120_000, fetch = { "unpaid" }, done = { false })
        assertTrue(out is Poller.Outcome.TimedOut)
        assertEquals("unpaid", (out as Poller.Outcome.TimedOut).last)
        // tick 1 at t=0, then one tick per 3 s; tick 41 lands at t=120 s and is the last.
        assertEquals(41, out.ticks)
        assertEquals(40, sleeps.size)
        assertEquals(120_000L, now)
    }

    @Test fun `timeout with only network errors has no last value`() {
        val out = poller.poll<String>(3000, 9_000, fetch = { throw BillingError.network(RuntimeException()) }, done = { false })
        assertTrue(out is Poller.Outcome.TimedOut)
        assertNull((out as Poller.Outcome.TimedOut).last)
        assertEquals(4, out.ticks)
    }

    @Test fun `cancelled before the first fetch never fetches`() {
        val t = Poller.Ticket().apply { cancel() }
        var fetched = 0
        val out = poller.poll(3000, 120_000, ticket = t, fetch = { fetched++; "x" }, done = { false })
        assertTrue(out is Poller.Outcome.Cancelled)
        assertEquals(0, fetched)
        assertEquals(0, out.ticks())
    }

    @Test fun `cancelled during a sleep returns after that sleep with the last value`() {
        val t = Poller.Ticket()
        val p = Poller(now = { now }, sleep = { sleeps.add(it); now += it; t.cancel() })
        val out = p.poll(3000, 120_000, ticket = t, fetch = { "unpaid" }, done = { false })
        assertTrue(out is Poller.Outcome.Cancelled)
        assertEquals("unpaid", (out as Poller.Outcome.Cancelled).last)
        assertEquals(1, out.ticks)
        assertEquals(1, sleeps.size)
    }

    // ── the two real loops against the API ─────────────────────────────────

    private fun withServer(block: (MockWebServer, BillingApi) -> Unit) {
        val server = MockWebServer()
        server.start()
        try {
            val api = BillingApi(server.url("/smc/v1").toString(), "k", "d", { "tok" }, sleep = { sleeps.add(it); now += it })
            block(server, api)
        } finally {
            server.shutdown()
        }
    }

    private fun json(body: String, code: Int = 200) =
        MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)

    @Test fun `pollInvoicePaid resolves when the invoice flips to paid`() = withServer { server, api ->
        server.enqueue(json("""{"invoice_id":1,"status":"unpaid"}"""))
        server.enqueue(json("""{"invoice_id":1,"status":"unpaid"}"""))
        server.enqueue(json("""{"invoice_id":1,"status":"paid","paid_at":"now"}"""))
        val out = poller.pollInvoicePaid(api, 1)
        assertTrue(out is Poller.Outcome.Done)
        assertEquals(3, out.ticks())
        assertEquals(3, server.requestCount)
        assertEquals("/smc/v1/invoices/1", server.takeRequest().path)
        assertEquals(listOf(Poller.INVOICE_INTERVAL_MS, Poller.INVOICE_INTERVAL_MS), sleeps)
    }

    @Test fun `pollInvoicePaid stops on a cancelled invoice`() = withServer { server, api ->
        server.enqueue(json("""{"invoice_id":1,"status":"unpaid"}"""))
        server.enqueue(json("""{"invoice_id":1,"status":"cancelled"}"""))
        val out = poller.pollInvoicePaid(api, 1)
        assertTrue(out is Poller.Outcome.Stopped)
        assertEquals(2, out.ticks())
    }

    @Test fun `pollInvoicePaid rides out a dropped connection`() = withServer { server, api ->
        // The GET's own single retry handles one drop; a second drop in a row
        // surfaces as a network error, which the poller treats as a tick.
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        server.enqueue(json("""{"invoice_id":1,"status":"paid"}"""))
        val out = poller.pollInvoicePaid(api, 1)
        assertTrue(out is Poller.Outcome.Done)
        assertEquals(2, out.ticks())
        assertEquals(3, server.requestCount)
    }

    @Test fun `pollInvoicePaid fails fast on a dead token`() = withServer { server, api ->
        server.enqueue(json("""{"error":{"code":"token_expired","message":"x"}}""", 401))
        val out = poller.pollInvoicePaid(api, 1)
        assertTrue(out is Poller.Outcome.Failed)
        assertTrue((out as Poller.Outcome.Failed).error.isAuthError)
        assertEquals(1, server.requestCount)
    }

    @Test fun `pollInvoicePaid times out after two minutes of unpaid`() = withServer { server, api ->
        repeat(60) { server.enqueue(json("""{"invoice_id":1,"status":"unpaid"}""")) }
        val out = poller.pollInvoicePaid(api, 1)
        assertTrue(out is Poller.Outcome.TimedOut)
        assertEquals(41, out.ticks())
        assertEquals("unpaid", (out as Poller.Outcome.TimedOut).last!!.status)
        assertTrue(now >= Poller.INVOICE_TIMEOUT_MS)
    }

    @Test fun `pollServiceProvisioned waits for active with credentials`() = withServer { server, api ->
        server.enqueue(json("""{"service":{"id":9,"status":"pending","credentials":null}}"""))
        server.enqueue(json("""{"service":{"id":9,"status":"active","credentials":null}}"""))
        server.enqueue(json("""{"service":{"id":9,"status":"active","credentials":{"host":"h","username":"u","password":"p"}}}"""))
        val out = poller.pollServiceProvisioned(api, 9)
        assertTrue(out is Poller.Outcome.Done)
        assertEquals(3, out.ticks())
        assertEquals("u", (out as Poller.Outcome.Done).value.credentials!!.username)
    }

    @Test fun `pollServiceProvisioned stops on a terminated service`() = withServer { server, api ->
        server.enqueue(json("""{"service":{"id":9,"status":"terminated"}}"""))
        val out = poller.pollServiceProvisioned(api, 9)
        assertTrue(out is Poller.Outcome.Stopped)
    }

    @Test fun `pollServiceProvisioned fails on not_found`() = withServer { server, api ->
        server.enqueue(json("""{"error":{"code":"not_found","message":"x"}}""", 404))
        val out = poller.pollServiceProvisioned(api, 9)
        when (out) {
            is Poller.Outcome.Failed -> assertEquals("not_found", out.error.code)
            else -> fail("expected Failed, got $out")
        }
    }
}

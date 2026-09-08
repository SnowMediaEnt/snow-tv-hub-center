package com.snowmedia.billing

/**
 * The polling loop behind "wait for the invoice to be paid" and "wait for
 * the new line to be provisioned".
 *
 * Time is injected ([now], [sleep]) so the unit tests drive a whole two-minute
 * poll in microseconds and assert exactly which tick decided the outcome.
 *
 * Semantics, in the order they are checked on every tick:
 *   1. [Ticket.cancelled] → [Outcome.Cancelled]. The caller (the plugin, on a
 *      request from the web layer) can stop a poll at any time.
 *   2. fetch. A network error is NOT fatal: the Custom Tab may have just
 *      closed and the radio may still be waking up. It counts as a tick with
 *      no answer. Any other [BillingError] — an expired token, a 404 — ends
 *      the poll as [Outcome.Failed], because no amount of waiting fixes it.
 *   3. [done] on the value → [Outcome.Done].
 *   4. [stop] on the value → [Outcome.Stopped]: a terminal state that will
 *      never become done (a cancelled invoice).
 *   5. Past the deadline → [Outcome.TimedOut] carrying the last value seen,
 *      so the UI can say "still unpaid" rather than "unknown".
 *   6. Otherwise sleep one interval and go again.
 *
 * The first fetch is immediate, so a poll whose answer is already there
 * returns without sleeping at all.
 */
class Poller(
    private val now: () -> Long = System::currentTimeMillis,
    private val sleep: (Long) -> Unit = { Thread.sleep(it) },
) {
    sealed class Outcome<out T> {
        data class Done<T>(val value: T, val ticks: Int) : Outcome<T>()
        data class Stopped<T>(val value: T, val ticks: Int) : Outcome<T>()
        data class TimedOut<T>(val last: T?, val ticks: Int) : Outcome<T>()
        data class Failed(val error: BillingError, val ticks: Int) : Outcome<Nothing>()
        data class Cancelled<T>(val last: T?, val ticks: Int) : Outcome<T>()
    }

    /** Cooperative cancellation handle. */
    class Ticket {
        @Volatile var cancelled: Boolean = false
            private set
        fun cancel() { cancelled = true }
    }

    fun <T> poll(
        intervalMs: Long,
        timeoutMs: Long,
        ticket: Ticket = Ticket(),
        fetch: () -> T,
        done: (T) -> Boolean,
        stop: (T) -> Boolean = { false },
    ): Outcome<T> {
        val start = now()
        var ticks = 0
        var last: T? = null
        while (true) {
            if (ticket.cancelled) return Outcome.Cancelled(last, ticks)
            ticks++
            try {
                val v = fetch()
                last = v
                if (done(v)) return Outcome.Done(v, ticks)
                if (stop(v)) return Outcome.Stopped(v, ticks)
            } catch (e: BillingError) {
                if (!e.isNetwork) return Outcome.Failed(e, ticks)
                // transient: fall through and wait
            }
            if (now() - start >= timeoutMs) return Outcome.TimedOut(last, ticks)
            sleep(intervalMs)
            if (ticket.cancelled) return Outcome.Cancelled(last, ticks)
        }
    }

    companion object {
        const val INVOICE_INTERVAL_MS = 3_000L
        const val INVOICE_TIMEOUT_MS = 120_000L
        const val SERVICE_INTERVAL_MS = 3_000L
        const val SERVICE_TIMEOUT_MS = 120_000L
    }
}

/** Wait for an invoice to be paid. Stops early on a closed invoice. */
fun Poller.pollInvoicePaid(api: BillingApi, invoiceId: Long, ticket: Poller.Ticket = Poller.Ticket()): Poller.Outcome<Invoice> =
    poll(
        intervalMs = Poller.INVOICE_INTERVAL_MS,
        timeoutMs = Poller.INVOICE_TIMEOUT_MS,
        ticket = ticket,
        fetch = { api.invoice(invoiceId) },
        done = { it.paid },
        stop = { it.closed },
    )

/** Wait for a service to be active with credentials. Stops early on a terminal status. */
fun Poller.pollServiceProvisioned(api: BillingApi, serviceId: Long, ticket: Poller.Ticket = Poller.Ticket()): Poller.Outcome<Service> =
    poll(
        intervalMs = Poller.SERVICE_INTERVAL_MS,
        timeoutMs = Poller.SERVICE_TIMEOUT_MS,
        ticket = ticket,
        fetch = { api.service(serviceId) },
        done = { it.provisioned },
        stop = { it.terminal },
    )

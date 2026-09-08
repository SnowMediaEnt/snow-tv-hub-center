package com.snowmedia.billing

import org.json.JSONArray
import org.json.JSONObject

/**
 * Typed views over the SMC Account API's JSON (docs/API.md, build 1.1.0).
 *
 * Every model keeps `raw`, the exact JSONObject the server sent, so the
 * Capacitor plugin can hand the API's own shape to the web layer unchanged
 * and the TypeScript types can mirror API.md field for field. The typed
 * fields exist for the Kotlin logic that has to make decisions — pollers,
 * "is this renewable", tests — not as a second schema.
 *
 * Parsing is deliberately tolerant about TYPES and strict about PRESENCE of
 * the few fields the app cannot work without. WHMCS hands numbers through as
 * ints, doubles or strings depending on the row, so every numeric read goes
 * through [num]/[int]/[long] rather than the typed getters, which throw on a
 * mismatch. A missing `id` is a hard failure; a missing `phone` is not.
 */

class ParseException(message: String) : Exception(message)

internal fun JSONObject.str(key: String): String? {
    if (!has(key) || isNull(key)) return null
    val v = opt(key) ?: return null
    return if (v is String) v else v.toString()
}

internal fun JSONObject.strOr(key: String, default: String): String = str(key) ?: default

internal fun JSONObject.req(key: String): String =
    str(key) ?: throw ParseException("Missing '$key' in ${names()?.join(",") ?: "{}"}")

internal fun JSONObject.num(key: String): Double? {
    if (!has(key) || isNull(key)) return null
    return when (val v = opt(key)) {
        is Number -> v.toDouble()
        is String -> v.trim().toDoubleOrNull()
        is Boolean -> if (v) 1.0 else 0.0 // the redeem addon's `credit` is sometimes a flag
        else -> null
    }
}

internal fun JSONObject.int(key: String): Int? = num(key)?.toInt()

internal fun JSONObject.long(key: String): Long? = num(key)?.toLong()

internal fun JSONObject.reqLong(key: String): Long =
    long(key) ?: throw ParseException("Missing numeric '$key'")

internal fun JSONObject.bool(key: String, default: Boolean = false): Boolean {
    if (!has(key) || isNull(key)) return default
    return when (val v = opt(key)) {
        is Boolean -> v
        is Number -> v.toInt() != 0
        is String -> v.equals("true", true) || v == "1"
        else -> default
    }
}

internal fun JSONObject.obj(key: String): JSONObject? =
    if (has(key) && !isNull(key)) optJSONObject(key) else null

internal fun JSONObject.arr(key: String): JSONArray? =
    if (has(key) && !isNull(key)) optJSONArray(key) else null

// ── auth ───────────────────────────────────────────────────────────────────

data class Client(
    val id: Long,
    val firstName: String?,
    val lastName: String?,
    val name: String?,
    val email: String,
    val trialUsed: Boolean,
    val raw: JSONObject,
) {
    companion object {
        fun parse(j: JSONObject): Client = Client(
            id = j.reqLong("id"),
            firstName = j.str("first_name"),
            lastName = j.str("last_name"),
            name = j.str("name"),
            email = j.req("email"),
            trialUsed = j.bool("trial_used"),
            raw = j,
        )
    }
}

data class Session(
    val token: String,
    val tokenType: String,
    val expiresAt: String?,
    val client: Client,
    val raw: JSONObject,
) {
    companion object {
        fun parse(j: JSONObject): Session = Session(
            token = j.req("token"),
            tokenType = j.strOr("token_type", "Bearer"),
            expiresAt = j.str("expires_at"),
            client = Client.parse(j.obj("client") ?: throw ParseException("Missing 'client'")),
            raw = j,
        )
    }
}

// ── plans ──────────────────────────────────────────────────────────────────

data class Plan(
    val id: Long,
    val name: String,
    val connections: Int,
    val termMonths: Int,
    /** null when the product has no enabled billing cycle. */
    val cycle: String?,
    /** null when the product has no enabled billing cycle; may legitimately be 0.0. */
    val price: Double?,
    val currency: String,
    val trial: Boolean,
    val hidden: Boolean,
    val orderable: Boolean,
    val raw: JSONObject,
) {
    companion object {
        fun parse(j: JSONObject, fallbackCurrency: String = "USD"): Plan = Plan(
            id = j.reqLong("id"),
            name = j.req("name"),
            connections = j.int("connections") ?: 0,
            termMonths = j.int("term_months") ?: 0,
            cycle = j.str("cycle"),
            price = j.num("price"),
            currency = j.strOr("currency", fallbackCurrency),
            trial = j.bool("trial"),
            hidden = j.bool("hidden"),
            orderable = j.bool("orderable"),
            raw = j,
        )
    }
}

data class PlansResponse(val currency: String, val plans: List<Plan>, val raw: JSONObject) {
    companion object {
        fun parse(j: JSONObject): PlansResponse {
            val currency = j.strOr("currency", "USD")
            val arr = j.arr("plans") ?: throw ParseException("Missing 'plans'")
            val out = ArrayList<Plan>(arr.length())
            for (i in 0 until arr.length()) {
                val p = arr.optJSONObject(i) ?: continue
                out.add(Plan.parse(p, currency))
            }
            return PlansResponse(currency, out, j)
        }
    }
}

// ── services ───────────────────────────────────────────────────────────────

data class ServicePlan(
    val id: Long,
    val name: String,
    val cycle: String?,
    val termMonths: Int,
    val trial: Boolean,
) {
    companion object {
        fun parse(j: JSONObject): ServicePlan = ServicePlan(
            id = j.long("id") ?: 0L,
            name = j.strOr("name", ""),
            cycle = j.str("cycle"),
            termMonths = j.int("term_months") ?: 0,
            trial = j.bool("trial"),
        )
    }
}

data class Credentials(
    val host: String,
    val username: String,
    val password: String,
    val m3uUrl: String?,
) {
    companion object {
        fun parse(j: JSONObject): Credentials = Credentials(
            host = j.req("host"),
            username = j.req("username"),
            password = j.req("password"),
            m3uUrl = j.str("m3u_url"),
        )
    }
}

data class Service(
    val id: Long,
    val plan: ServicePlan,
    /** pending | active | suspended | terminated | cancelled (lower-cased by the server). */
    val status: String,
    val active: Boolean,
    val connections: Int,
    val billingCycle: String?,
    val amount: Double?,
    val currency: String,
    val registeredAt: String?,
    val nextDue: String?,
    val expiresAt: String?,
    val panelLineId: String?,
    /** null until the line exists (a pending paid order). */
    val credentials: Credentials?,
    val raw: JSONObject,
) {
    /** RENEW is offered only here (API.md: trial, terminated/cancelled or zero-amount → 409 not_renewable). */
    val renewable: Boolean
        get() = !plan.trial && (status == "active" || status == "suspended") && (amount ?: 0.0) > 0.0

    /** The line is usable by the player. */
    val provisioned: Boolean
        get() = status == "active" && credentials != null

    val terminal: Boolean
        get() = status == "terminated" || status == "cancelled"

    companion object {
        fun parse(j: JSONObject): Service = Service(
            id = j.reqLong("id"),
            plan = ServicePlan.parse(j.obj("plan") ?: JSONObject()),
            status = j.strOr("status", "").lowercase(),
            active = j.bool("active"),
            connections = j.int("connections") ?: 0,
            billingCycle = j.str("billing_cycle"),
            amount = j.num("amount"),
            currency = j.strOr("currency", "USD"),
            registeredAt = j.str("registered_at"),
            nextDue = j.str("next_due"),
            expiresAt = j.str("expires_at"),
            panelLineId = j.str("panel_line_id"),
            credentials = j.obj("credentials")?.let { c ->
                // A credentials object with blanks is the same as none: the
                // player cannot sign in with it.
                runCatching { Credentials.parse(c) }.getOrNull()
                    ?.takeIf { it.host.isNotBlank() && it.username.isNotBlank() && it.password.isNotBlank() }
            },
            raw = j,
        )

        fun parseList(j: JSONObject): List<Service> {
            val arr = j.arr("services") ?: throw ParseException("Missing 'services'")
            val out = ArrayList<Service>(arr.length())
            for (i in 0 until arr.length()) {
                val s = arr.optJSONObject(i) ?: continue
                out.add(parse(s))
            }
            return out
        }
    }
}

data class TrialResult(val orderId: Long, val service: Service, val raw: JSONObject) {
    companion object {
        fun parse(j: JSONObject): TrialResult = TrialResult(
            orderId = j.reqLong("order_id"),
            service = Service.parse(j.obj("service") ?: throw ParseException("Missing 'service'")),
            raw = j,
        )
    }
}

// ── money movement ─────────────────────────────────────────────────────────

data class RenewResult(
    val invoiceId: Long,
    val amount: Double?,
    val currency: String,
    val dueDate: String?,
    /** unpaid | paid. paid with a null pay_url = covered by account credit. */
    val status: String,
    val payUrl: String?,
    val raw: JSONObject,
) {
    val paid: Boolean get() = status == "paid"

    companion object {
        fun parse(j: JSONObject): RenewResult = RenewResult(
            invoiceId = j.reqLong("invoice_id"),
            amount = j.num("amount"),
            currency = j.strOr("currency", "USD"),
            dueDate = j.str("due_date"),
            status = j.strOr("status", "unpaid").lowercase(),
            payUrl = j.str("pay_url"),
            raw = j,
        )
    }
}

data class OrderResult(
    val orderId: Long,
    val serviceId: Long,
    /** null for a 0.00 plan: WHMCS raises no invoice and the operator activates it. */
    val invoiceId: Long?,
    val amount: Double?,
    val currency: String,
    val reused: Boolean,
    val plan: Plan?,
    val payUrl: String?,
    val raw: JSONObject,
) {
    companion object {
        fun parse(j: JSONObject): OrderResult = OrderResult(
            orderId = j.reqLong("order_id"),
            serviceId = j.reqLong("service_id"),
            invoiceId = j.long("invoice_id"),
            amount = j.num("amount"),
            currency = j.strOr("currency", "USD"),
            reused = j.bool("reused"),
            plan = j.obj("plan")?.let { runCatching { Plan.parse(it) }.getOrNull() },
            payUrl = j.str("pay_url"),
            raw = j,
        )
    }
}

data class Invoice(
    val invoiceId: Long,
    /** unpaid | paid | cancelled | refunded | … */
    val status: String,
    val total: Double?,
    val currency: String,
    val dueDate: String?,
    val paidAt: String?,
    val raw: JSONObject,
) {
    val paid: Boolean get() = status == "paid"

    /** Nothing further can happen to this invoice; stop polling it. */
    val closed: Boolean get() = status == "cancelled" || status == "refunded" || status == "collections"

    companion object {
        fun parse(j: JSONObject): Invoice = Invoice(
            invoiceId = j.reqLong("invoice_id"),
            status = j.strOr("status", "unpaid").lowercase(),
            total = j.num("total"),
            currency = j.strOr("currency", "USD"),
            dueDate = j.str("due_date"),
            paidAt = j.str("paid_at"),
            raw = j,
        )
    }
}

data class PayUrlResult(
    val invoiceId: Long,
    val status: String,
    val total: Double?,
    val currency: String,
    val payUrl: String,
    val raw: JSONObject,
) {
    companion object {
        fun parse(j: JSONObject): PayUrlResult = PayUrlResult(
            invoiceId = j.reqLong("invoice_id"),
            status = j.strOr("status", "unpaid").lowercase(),
            total = j.num("total"),
            currency = j.strOr("currency", "USD"),
            payUrl = j.req("pay_url"),
            raw = j,
        )
    }
}

data class RedeemResult(
    val ok: Boolean,
    /** The addon's human message, if it sent one. */
    val message: String?,
    val credit: Double?,
    val amount: Double?,
    val currency: String?,
    val balance: Double?,
    val plan: String?,
    val expiresAt: String?,
    val raw: JSONObject,
) {
    companion object {
        fun parse(j: JSONObject): RedeemResult {
            val r = j.obj("result") ?: JSONObject()
            return RedeemResult(
                ok = j.bool("ok"),
                message = r.str("message"),
                credit = r.num("credit"),
                amount = r.num("amount"),
                currency = r.str("currency"),
                balance = r.num("balance"),
                plan = r.str("plan"),
                expiresAt = r.str("expires_at"),
                raw = j,
            )
        }
    }
}

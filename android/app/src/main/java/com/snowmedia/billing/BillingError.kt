package com.snowmedia.billing

import org.json.JSONObject

/**
 * The one failure type the billing layer throws.
 *
 * Every non-2xx answer, every network failure and every unparseable body ends
 * up here with a stable [code] the web layer can switch on. The codes that
 * come from the server are the ones in docs/API.md; the client adds three of
 * its own for things the server never got to say:
 *
 *   network       — no response at all (DNS, connect, read timeout)
 *   bad_response  — 2xx but the body was not the JSON we expected (an HTML
 *                   error page from a proxy, a truncated body, a missing
 *                   required field)
 *   cancelled     — the caller stopped a poll
 *
 * [details] is whatever the server put under error.details, kept as-is:
 * `retry_after` on 429, `field` on 422, `order_id`/`service_id` on
 * provisioning_failed.
 */
class BillingError(
    val code: String,
    message: String,
    /** HTTP status, or 0 for a client-side failure. */
    val status: Int = 0,
    val details: JSONObject? = null,
    cause: Throwable? = null,
) : Exception(message, cause) {

    /** The token is no longer good: clear it and show sign-in. */
    val isAuthError: Boolean
        get() = status == 401 && (code == "invalid_token" || code == "token_expired" || code == "missing_token")

    val isNetwork: Boolean get() = code == "network"

    val isRateLimited: Boolean get() = code == "rate_limited"

    /** Seconds the server asked us to wait, when it said. */
    val retryAfterSeconds: Int?
        get() = details?.int("retry_after")

    /** 422 validation_error: which field was wrong. */
    val field: String?
        get() = details?.str("field")

    fun toJson(): JSONObject = JSONObject()
        .put("code", code)
        .put("message", message ?: "")
        .put("status", status)
        .put("details", details ?: JSONObject.NULL)

    companion object {
        fun network(cause: Throwable): BillingError =
            BillingError("network", "Could not reach the billing server. Check the internet connection and try again.", 0, null, cause)

        fun badResponse(status: Int, why: String, cause: Throwable? = null): BillingError =
            BillingError("bad_response", "The billing server sent an unexpected reply ($why).", status, null, cause)

        fun cancelled(): BillingError = BillingError("cancelled", "Stopped.", 0)

        /**
         * Build from a non-2xx response. The server's `{error:{code,message,details}}`
         * is used when present; anything else (HTML, empty body) becomes
         * `http_<status>` so the caller still gets a stable code.
         */
        fun fromResponse(status: Int, body: String?, retryAfterHeader: String? = null): BillingError {
            val parsed = body?.trim()?.takeIf { it.startsWith("{") }?.let { runCatching { JSONObject(it) }.getOrNull() }
            val err = parsed?.obj("error")
            val code = err?.str("code")?.takeIf { it.isNotBlank() } ?: "http_$status"
            val message = err?.str("message")?.takeIf { it.isNotBlank() } ?: defaultMessage(status)
            var details = err?.obj("details")
            // 429 may carry the wait only as a header. Surface it the same way.
            if (status == 429 && details?.int("retry_after") == null) {
                val secs = retryAfterHeader?.trim()?.toIntOrNull()
                if (secs != null) details = (details ?: JSONObject()).put("retry_after", secs)
            }
            return BillingError(code, message, status, details)
        }

        private fun defaultMessage(status: Int): String = when (status) {
            401 -> "Please sign in again."
            403 -> "This account cannot be used from the app."
            404 -> "That item was not found."
            429 -> "Too many attempts. Please wait a moment."
            in 500..599 -> "The billing server had a problem. Please try again in a minute."
            else -> "Request failed ($status)."
        }
    }
}

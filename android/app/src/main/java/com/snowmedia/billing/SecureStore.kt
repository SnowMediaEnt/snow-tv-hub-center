package com.snowmedia.billing

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID

/**
 * The only place the billing token lives on the device.
 *
 * Backed by EncryptedSharedPreferences (AES-256-GCM values, key in the
 * Android keystore). Two failure modes are handled rather than crashing the
 * app at launch:
 *
 *   • A corrupted keyset. Some Fire TV builds lose the keystore entry across
 *     an OS update, after which EncryptedSharedPreferences throws on open for
 *     ever. The file and the master key are dropped and the store is re-created
 *     empty — the viewer signs in again, which beats a dead My Account screen.
 *   • The keystore being unusable at all. Then the store is in-memory for this
 *     process: sign-in works for the session and nothing secret touches disk.
 *
 * Nothing here logs values. The device id is not a secret but the token is,
 * and the two share a file, so the whole file is treated as one.
 */
class SecureStore private constructor(private val kv: KV) {

    private interface KV {
        fun get(key: String): String?
        fun put(key: String, value: String?)
    }

    private class PrefsKV(private val prefs: SharedPreferences) : KV {
        override fun get(key: String): String? = prefs.getString(key, null)
        override fun put(key: String, value: String?) {
            prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
        }
    }

    private class MemoryKV : KV {
        private val map = HashMap<String, String>()
        @Synchronized override fun get(key: String): String? = map[key]
        @Synchronized override fun put(key: String, value: String?) { if (value == null) map.remove(key) else map[key] = value }
    }

    /** Bearer token, or null when signed out. */
    var token: String?
        get() = kv.get(K_TOKEN)?.takeIf { it.isNotBlank() }
        set(v) = kv.put(K_TOKEN, v)

    var tokenExpiresAt: String?
        get() = kv.get(K_TOKEN_EXP)
        set(v) = kv.put(K_TOKEN_EXP, v)

    /** Shown on the My Account screen; not used for auth. */
    var email: String?
        get() = kv.get(K_EMAIL)
        set(v) = kv.put(K_EMAIL, v)

    /** Stable per-install id for X-SMC-Device. Created once, survives sign-out. */
    val deviceId: String
        get() {
            kv.get(K_DEVICE)?.takeIf { it.isNotBlank() }?.let { return it }
            val fresh = UUID.randomUUID().toString()
            kv.put(K_DEVICE, fresh)
            return fresh
        }

    /**
     * The invoice the viewer was last sent to pay, so a restart mid-payment can
     * resume polling instead of losing the thread. Shape:
     * `{invoice_id, kind: "renew"|"order", service_id?, plan_name?, created_at}`.
     * Never holds a pay_url — those are one-time and must be re-minted.
     */
    var pendingInvoice: JSONObject?
        get() = kv.get(K_PENDING)?.let { runCatching { JSONObject(it) }.getOrNull() }
        set(v) = kv.put(K_PENDING, v?.toString())

    val signedIn: Boolean get() = token != null

    /** Sign out: everything but the device id. */
    fun clearSession() {
        token = null
        tokenExpiresAt = null
        email = null
        pendingInvoice = null
    }

    companion object {
        private const val FILE = "smc_billing_secure"
        private const val K_TOKEN = "token"
        private const val K_TOKEN_EXP = "token_expires_at"
        private const val K_EMAIL = "email"
        private const val K_DEVICE = "device_id"
        private const val K_PENDING = "pending_invoice"

        @Volatile private var instance: SecureStore? = null

        fun get(context: Context): SecureStore =
            instance ?: synchronized(this) {
                instance ?: open(context.applicationContext).also { instance = it }
            }

        private fun open(ctx: Context): SecureStore {
            openEncrypted(ctx)?.let { return SecureStore(PrefsKV(it)) }
            // Corrupt keyset: drop it and try once more from scratch.
            runCatching { ctx.deleteSharedPreferences(FILE) }
            runCatching {
                KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(MasterKey.DEFAULT_MASTER_KEY_ALIAS)
            }
            openEncrypted(ctx)?.let { return SecureStore(PrefsKV(it)) }
            return SecureStore(MemoryKV())
        }

        private fun openEncrypted(ctx: Context): SharedPreferences? = try {
            val key = MasterKey.Builder(ctx).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
            EncryptedSharedPreferences.create(
                ctx,
                FILE,
                key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (e: Exception) {
            null
        }
    }
}

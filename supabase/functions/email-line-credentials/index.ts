// Email a customer the streaming login they just got.
//
// WHY THIS EXISTS: the SMC Account API deliberately sends nothing —
// docs/billing/API.md is explicit, "Creates the WHMCS client (no email is
// sent)" and "No email is involved anywhere; everything the app needs is in
// the JSON responses." So after a trial or a purchase the username and
// password exist only on the TV screen. If the viewer walks away, or the box
// is wiped, that line is gone. This mails them a copy.
//
// WHY IT IS NOT send-custom-email: that function has no config.toml entry, so
// it requires a Supabase JWT. A customer who signed up through the billing
// account has a WHMCS account, not a Supabase session — they have no JWT to
// send. It also takes caller-supplied `html`, which must never be reachable
// anonymously.
//
// AUTH MODEL — the same one player-favorites uses, and for the same reason:
// there is no session to check, so the credentials themselves are the proof.
// The line is verified against the panel before anything is sent. The body is
// composed HERE; the caller supplies no markup, only where to send it. So the
// worst a caller can do is mail a copy of a line they already hold to an
// address of their choosing, at a throttled rate — not use this as an open
// relay.
//
// Nothing here logs the password, the email body, or the address.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { Resend } from 'npm:resend@4.0.0';

const REQUEST_TIMEOUT_MS = 8000;
const THROTTLE_WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_IP = 10;   // a household setting up several boxes
const MAX_PER_LINE = 3;  // one send, plus a couple of "it didn't arrive" retries

// Verified sender if the operator has set one up in Resend; otherwise Resend's
// shared sandbox address, which only delivers to the Resend account owner.
const FROM = Deno.env.get('EMAIL_FROM') || 'Snow Media <onboarding@resend.dev>';

// The From is a no-reply on a sending subdomain, so point replies at a mailbox
// that is actually read. A customer whose login does not work will hit Reply
// before they find the support page.
const REPLY_TO = Deno.env.get('EMAIL_REPLY_TO') || 'support@snowmediaent.com';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const schemeFor = (host: string) => (host.includes(':443') || host.endsWith('.xyz') ? 'https' : 'http');

/** Strip scheme and trailing slashes so the panel URL builds cleanly. */
const bareHost = (h: string) => h.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');

// Deliberately conservative: this address is handed straight to the mail
// provider, so anything exotic is rejected rather than escaped.
const EMAIL_RE = /^[^\s@,;<>"']{1,64}@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const HTML_ESCAPES: Record<string, string> = {
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
};
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => HTML_ESCAPES[c] ?? c);

interface ThrottleDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): { maybeSingle(): Promise<{ data: { count: number | null; window_start: string } | null }> };
    };
    upsert(row: Record<string, unknown>, opts: { onConflict: string }): Promise<unknown>;
    update(row: Record<string, unknown>): { eq(col: string, val: string): Promise<unknown> };
  };
}

/** Shares player_login_throttle under its own prefixes, so this never spends player-login's budget. */
async function throttle(admin: ThrottleDb, key: string | null, max: number): Promise<boolean> {
  if (!key) return true;
  try {
    const windowStart = new Date(Date.now() - THROTTLE_WINDOW_MS).toISOString();
    const { data } = await admin.from('player_login_throttle').select('count, window_start').eq('ip_hash', key).maybeSingle();
    if (!data || data.window_start < windowStart) {
      await admin.from('player_login_throttle').upsert(
        { ip_hash: key, window_start: new Date().toISOString(), count: 1 },
        { onConflict: 'ip_hash' },
      );
      return true;
    }
    const nextCount = (data.count ?? 0) + 1;
    await admin.from('player_login_throttle').update({ count: nextCount }).eq('ip_hash', key);
    return nextCount <= max;
  } catch (e) {
    // Fail open: a throttle-table outage must not stop a paying customer
    // receiving the line they just bought.
    console.warn('[email-line-credentials] throttle fail-open:', (e as Error).message);
    return true;
  }
}

/** The credentials are the proof of ownership; check them before sending anything. */
async function verifyLine(host: string, username: string, password: string): Promise<'ok' | 'auth_failed' | 'unreachable'> {
  const url =
    `${schemeFor(host)}://${host}/player_api.php?username=` +
    encodeURIComponent(username) + `&password=` + encodeURIComponent(password);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'SnowMediaHub/1.0 (+email-line-credentials)' } });
    if (res.status === 401 || res.status === 403) return 'auth_failed';
    if (!res.ok) return 'unreachable';
    let data: unknown;
    try { data = await res.json(); } catch { return 'unreachable'; }
    const auth = (data as { user_info?: Record<string, unknown> })?.user_info?.auth;
    return auth === 1 || auth === '1' || auth === true ? 'ok' : 'auth_failed';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

function buildHtml(o: {
  username: string; password: string; host: string; serverLabel: string;
  planName: string | null; expiresAt: string | null;
}): string {
  const rows: Array<[string, string]> = [
    ['Username', o.username],
    ['Password', o.password],
    ['Server', o.host],
  ];
  if (o.planName) rows.unshift(['Plan', o.planName]);
  if (o.expiresAt) rows.push(['Expires', o.expiresAt]);

  const cells = rows.map(([k, v]) => `
        <tr>
          <td style="padding:10px 14px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;">${esc(k)}</td>
          <td style="padding:10px 14px;color:#111827;font-size:16px;font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all;">${esc(v)}</td>
        </tr>`).join('');

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f6f8;">
  <div style="background:#ffffff;border-radius:12px;padding:28px;box-shadow:0 2px 10px rgba(0,0,0,.08);">
    <h1 style="margin:0 0 6px;color:#0A2147;font-size:22px;">Your ${esc(o.serverLabel)} login</h1>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
      Keep this email — it is the only copy of your password we send. Enter these in the Player on your TV.
    </p>
    <table style="width:100%;border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">${cells}
    </table>
    <p style="margin:22px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
      Do not share these details. Anyone with them can watch on your connections.
      Need help? <a href="mailto:support@snowmediaent.com" style="color:#2563eb;">support@snowmediaent.com</a>
    </p>
  </div>
</div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const email = String(body.email ?? '').trim();
  const host = bareHost(String(body.host ?? ''));
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const serverLabel = String(body.serverLabel ?? '').trim() || 'Snow Media';
  const planName = body.planName ? String(body.planName).trim().slice(0, 120) : null;
  const expiresAt = body.expiresAt ? String(body.expiresAt).trim().slice(0, 60) : null;

  if (!email || !EMAIL_RE.test(email) || email.length > 254) return json({ error: 'invalid_email' }, 400);
  if (!host || !username || !password) return json({ error: 'missing_credentials' }, 400);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.error('[email-line-credentials] RESEND_API_KEY is not set');
    return json({ error: 'email_unavailable' }, 503);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const admin = url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  if (admin) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const db = admin as unknown as ThrottleDb;
    const okIp = await throttle(db, ip ? `emailip:${ip}` : null, MAX_PER_IP);
    const okLine = await throttle(db, `emailline:${host}|${username.toLowerCase()}`, MAX_PER_LINE);
    if (!okIp || !okLine) return json({ error: 'rate_limited' }, 429);
  }

  const verdict = await verifyLine(host, username, password);
  if (verdict === 'auth_failed') return json({ error: 'invalid_credentials' }, 401);
  if (verdict === 'unreachable') return json({ error: 'panel_unreachable' }, 502);

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [email],
      replyTo: REPLY_TO,
      subject: `Your ${serverLabel} login details`,
      html: buildHtml({ username, password, host, serverLabel, planName, expiresAt }),
    });
    if (error) {
      // Message only — never the address or the payload.
      console.error('[email-line-credentials] send failed:', (error as { message?: string }).message ?? 'unknown');
      return json({ error: 'send_failed' }, 502);
    }
  } catch (e) {
    console.error('[email-line-credentials] send threw:', (e as Error).message);
    return json({ error: 'send_failed' }, 502);
  }

  return json({ ok: true });
});

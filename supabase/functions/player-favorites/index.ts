// Player Favourites — the only road to public.player_favorites.
//
// A favourites list belongs to a STREAMING line (host + username). To read or
// write one the caller proves the line the only way that actually proves it:
// the username and password are verified against the upstream panel, exactly
// as the player-login bridge does. Nothing here trusts a password copied into
// our own database — capture-player-signin writes that copy from an
// unauthenticated request, so it is not a secret.
//
// Throttled per IP and per line before the panel is contacted, so this cannot
// be used to brute-force panel passwords either. The limits are looser than
// player-login's (that one mints sessions; this one reads a channel list) but
// still tight enough that guessing is hopeless: 30 attempts per line per five
// minutes.
//
// Writes are compare-and-set on the row's version (see the migration). The
// client quotes the version it last saw; if the row has moved on, it gets the
// current list back with applied:false and merges before retrying.
//
// verify_jwt = false (supabase/config.toml). Soft failures return HTTP 200
// with { ok:false, reason } like every other player-* function.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { hashClientIp } from '../_shared/ai-guard.ts';

const ALLOWED_HOSTS = ['dstreams.xyz:8080', 'strmz.xyz'] as const;
// A 500-entry list of fully-populated channels is ~120KB; leave headroom.
const MAX_BODY_BYTES = 300 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;

const THROTTLE_WINDOW_MS = 5 * 60 * 1000;
const THROTTLE_MAX_PER_IP = 60;
const THROTTLE_MAX_PER_LINE = 30;

const MAX_FAVORITES = 500;
const MAX_NAME = 200;
const MAX_URL = 2048;
const MAX_ID = 64;
// eslint-disable-next-line no-control-regex -- the point is to reject control characters
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const schemeFor = (host: string): 'http' | 'https' =>
  host === 'strmz.xyz' ? 'https' : 'http';

const normalizeHost = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  let h = raw.trim().toLowerCase();
  if (!h) return null;
  h = h.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (h === 'dstreams.xyz') h = 'dstreams.xyz:8080';
  return h;
};

// Panels commonly sit behind an nginx rule that rejects anything that does not
// look like a media player, answering 401 with an HTML page. Judged by status
// alone that is indistinguishable from a wrong password, so a working line was
// reported as bad credentials. Ask with agents a panel expects, and decide
// from the BODY: only JSON carrying user_info can say a login is wrong.
// Ordered most-likely-first. The Dalvik agent is what the app's own native
// HTTP sends today, and the app reaches this panel fine — so it is the one
// with direct evidence behind it. The rest cover the usual gateway allowlists.
// Only the failure path costs extra requests: the first agent that gets a JSON
// answer wins and the loop stops.
const PANEL_AGENTS = [
  'Dalvik/2.1.0 (Linux; U; Android 9; AFTMM Build/PS7233)',
  'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/70.0.3538.110 Mobile Safari/537.36',
  'VLC/3.0.20 LibVLC/3.0.20',
  'okhttp/4.12.0',
];

// Same verification as player-login. Duplicated rather than shared on
// purpose: player-login is a session-minting path and must not pick up
// behaviour changes made for a favourites list.
async function verifyLine(host: string, username: string, password: string): Promise<
  { kind: 'ok' } | { kind: 'auth_failed' } | { kind: 'unreachable' }
> {
  const url =
    `${schemeFor(host)}://${host}/player_api.php?username=` +
    encodeURIComponent(username) + `&password=` + encodeURIComponent(password);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    for (const ua of PANEL_AGENTS) {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': ua, Accept: 'application/json' },
      });
      const text = (await res.text()).trim();
      // An HTML page is the gateway talking, not the panel — try the next agent.
      if (!text.startsWith('{')) continue;
      let data: unknown;
      try { data = JSON.parse(text); } catch { continue; }
      const ui = (data as { user_info?: Record<string, unknown> })?.user_info;
      if (!ui) continue;
      const auth = ui.auth;
      const authed = auth === 1 || auth === '1' || auth === true;
      return authed ? { kind: 'ok' } : { kind: 'auth_failed' };
    }
    console.warn('[player-favorites] panel returned no JSON for any user agent — gateway block?');
    return { kind: 'unreachable' };
  } catch {
    return { kind: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

// The slice of the admin client the throttle uses, typed by shape. Typing it
// as ReturnType<typeof createClient> reads naturally but, with no Database
// generic supplied, the newer supabase-js types resolve every table to
// `never` and each column access fails `deno check` — the code runs, the
// check does not. A structural type says exactly what is used and nothing
// about generics.
interface ThrottleRow { count: number | null; window_start: string }
interface ThrottleDb {
  from: (table: 'player_login_throttle') => {
    select: (cols: string) => {
      eq: (col: string, v: string) => { maybeSingle: () => PromiseLike<{ data: ThrottleRow | null }> };
    };
    upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => PromiseLike<unknown>;
    update: (row: Record<string, unknown>) => { eq: (col: string, v: string) => PromiseLike<unknown> };
  };
}

// Shares player_login_throttle (keyed by an arbitrary text key) but under its
// own prefixes, so favourites traffic never spends player-login's budget.
async function throttle(
  admin: ThrottleDb,
  key: string | null,
  max: number,
): Promise<boolean> {
  if (!key) return true;
  try {
    const windowStart = new Date(Date.now() - THROTTLE_WINDOW_MS).toISOString();
    const { data } = await admin
      .from('player_login_throttle')
      .select('count, window_start')
      .eq('ip_hash', key)
      .maybeSingle();
    if (!data || data.window_start < windowStart) {
      await admin
        .from('player_login_throttle')
        .upsert({ ip_hash: key, window_start: new Date().toISOString(), count: 1 }, { onConflict: 'ip_hash' });
      return true;
    }
    const nextCount = (data.count ?? 0) + 1;
    await admin.from('player_login_throttle').update({ count: nextCount }).eq('ip_hash', key);
    return nextCount <= max;
  } catch (e) {
    console.warn('[player-favorites] throttle fail-open:', e);
    return true;
  }
}

interface FavChannel {
  stream_id: number;
  name: string;
  num?: number;
  stream_icon?: string;
  category_id?: string;
  epg_channel_id?: string;
}

const cleanText = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s || s.length > max || CONTROL_CHARS.test(s)) return undefined;
  return s;
};

// Accept exactly the shape the client renders and nothing else. Anything that
// is not a channel is dropped, not rejected: a single odd entry must not cost
// the user their whole list.
function sanitizeFavorites(raw: unknown): FavChannel[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_FAVORITES) return null;
  const out: FavChannel[] = [];
  const seen = new Set<number>();
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const id = typeof o.stream_id === 'number' && Number.isFinite(o.stream_id) ? Math.trunc(o.stream_id) : null;
    const name = cleanText(o.name, MAX_NAME);
    if (id === null || id < 0 || !name || seen.has(id)) continue;
    seen.add(id);
    const f: FavChannel = { stream_id: id, name };
    if (typeof o.num === 'number' && Number.isFinite(o.num)) f.num = Math.trunc(o.num);
    const icon = cleanText(o.stream_icon, MAX_URL);
    if (icon && /^https?:\/\//i.test(icon)) f.stream_icon = icon;
    const cat = cleanText(o.category_id, MAX_ID);
    if (cat) f.category_id = cat;
    const epg = cleanText(o.epg_channel_id, MAX_ID);
    if (epg) f.epg_channel_id = epg;
    out.push(f);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, reason: 'method_not_allowed' });

  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return jsonResponse({ ok: false, reason: 'body_too_large' });
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return jsonResponse({ ok: false, reason: 'bad_json' }); }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const host = normalizeHost(body.host);
    if (!host || !ALLOWED_HOSTS.includes(host as (typeof ALLOWED_HOSTS)[number])) {
      return jsonResponse({ ok: false, reason: 'host_not_allowed' });
    }
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password.trim() : '';
    if (!username || username.length > 256 || !password || password.length > 512) {
      return jsonResponse({ ok: false, reason: 'bad_credentials' });
    }
    const op = body.op === 'set' ? 'set' : body.op === 'get' ? 'get' : null;
    if (!op) return jsonResponse({ ok: false, reason: 'bad_op' });

    // Throttle BEFORE the panel is contacted.
    const ipHash = await hashClientIp(req).catch(() => null);
    // Cast through unknown: checking the real client against ThrottleDb
    // structurally walks supabase-js's query-builder generics, which
    // `deno check` rejects as excessively deep. The shape IS satisfied.
    const throttleDb = admin as unknown as ThrottleDb;
    if (!(await throttle(throttleDb, ipHash ? `favip:${ipHash}` : null, THROTTLE_MAX_PER_IP))) {
      return jsonResponse({ ok: false, reason: 'rate_limited' });
    }
    if (!(await throttle(throttleDb, `favline:${host}:${username}`, THROTTLE_MAX_PER_LINE))) {
      return jsonResponse({ ok: false, reason: 'rate_limited' });
    }

    const verdict = await verifyLine(host, username, password);
    if (verdict.kind === 'unreachable') return jsonResponse({ ok: false, reason: 'panel_unreachable' });
    if (verdict.kind === 'auth_failed') return jsonResponse({ ok: false, reason: 'auth_failed' });

    if (op === 'get') {
      // Through an RPC rather than a select, so the version number is made by
      // the same SQL expression the write path uses. Two implementations of
      // one comparison key is how compare-and-set quietly stops comparing.
      const { data, error } = await admin.rpc('player_favorites_read', {
        p_host: host,
        p_username: username,
      });
      if (error) {
        console.error('[player-favorites] get failed:', error.message);
        return jsonResponse({ ok: false, reason: 'db_error' });
      }
      const r = data as { ok?: boolean; favorites?: unknown; version?: number | null } | null;
      if (!r?.ok) return jsonResponse({ ok: false, reason: 'db_error' });
      if (r.favorites == null) return jsonResponse({ ok: true, favorites: null, version: null });
      return jsonResponse({
        ok: true,
        favorites: sanitizeFavorites(r.favorites) ?? [],
        version: typeof r.version === 'number' ? r.version : null,
      });
    }

    // op === 'set'
    const favorites = sanitizeFavorites(body.favorites);
    if (!favorites) return jsonResponse({ ok: false, reason: 'bad_favorites' });
    const baseVersion =
      typeof body.base_version === 'number' && Number.isFinite(body.base_version)
        ? Math.trunc(body.base_version)
        : null;

    const { data, error } = await admin.rpc('player_favorites_upsert_cas', {
      p_host: host,
      p_username: username,
      p_favorites: favorites,
      p_base_version: baseVersion,
    });
    if (error) {
      console.error('[player-favorites] set failed:', error.message);
      return jsonResponse({ ok: false, reason: 'db_error' });
    }
    const r = data as { ok?: boolean; reason?: string; applied?: boolean; favorites?: unknown; version?: number } | null;
    if (!r?.ok) return jsonResponse({ ok: false, reason: r?.reason || 'db_error' });
    return jsonResponse({
      ok: true,
      applied: Boolean(r.applied),
      favorites: sanitizeFavorites(r.favorites) ?? [],
      version: typeof r.version === 'number' ? r.version : null,
    });
  } catch (e) {
    console.error('[player-favorites] unexpected:', e);
    return jsonResponse({ ok: false, reason: 'error' });
  }
});

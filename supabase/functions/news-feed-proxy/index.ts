// News feed for the TV ticker — DB-driven, with the legacy file as fallback.
//
// Every Snow Media Center TV app's scrolling ticker fetches THIS function and
// parses it as RSS. Items come from public.smc_news, which the SMC Admin
// iPhone app edits (More → News Ticker). That was always the intent — the
// table's own migration says "backing the proxy with this table makes the
// ticker editable from the iPhone app with zero changes to the TV app" — but
// the function itself was never rewritten to read it. It stayed a plain
// proxy for https://snowmediaapps.com/smc/newsfeed.xml, so everything typed
// into the editor landed in a table nothing read.
//
// Order of preference:
//   1. Published rows in smc_news, in the editor's order (sort_order, then
//      newest first). Emitted as RSS with the exact three fields the ticker's
//      parser looks for: <title>, <description>, <pubDate>.
//   2. If the table has no published rows, or cannot be read (migration not
//      applied yet, transient error), the legacy XML file — so the ticker
//      keeps scrolling whatever was there before, and the switch-over happens
//      the moment the first item is published.
//   3. If that fails too, an empty channel — never an error; the ticker has
//      its own fallback strings.
//
// Short cache so an edit reaches the fleet on the TV app's next 5-minute
// refresh rather than up to 7 minutes later.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const LEGACY_FEED_URL = 'https://snowmediaapps.com/smc/newsfeed.xml';
const CACHE_SECONDS = 60;
const MAX_ITEMS = 50;

const xmlHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
};

const XML_ESCAPES: Record<string, string> = {
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
};
const escapeXml = (s: string): string => s.replace(/[<>&'"]/g, (c) => XML_ESCAPES[c] ?? c);

interface NewsRow {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
}

function toRss(rows: NewsRow[]): string {
  const items = rows.map((r) => {
    const title = escapeXml((r.title || '').trim());
    // The ticker renders "title - description"; with an empty description it
    // renders the title alone, so an item with no body still scrolls.
    const description = escapeXml((r.body || '').trim());
    const pubDate = new Date(r.created_at).toUTCString();
    return (
      `    <item>\n` +
      `      <title>${title}</title>\n` +
      `      <description>${description}</description>\n` +
      `      <pubDate>${pubDate}</pubDate>\n` +
      `      <guid isPermaLink="false">${escapeXml(r.id)}</guid>\n` +
      `    </item>`
    );
  }).join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0">\n` +
    `  <channel>\n` +
    `    <title>Snow Media Center</title>\n` +
    `    <link>https://snowmediaent.com</link>\n` +
    `    <description>Snow Media Center news</description>\n` +
    `${items}\n` +
    `  </channel>\n` +
    `</rss>\n`
  );
}

async function fromDatabase(): Promise<string | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  try {
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin
      .from('smc_news')
      .select('id,title,body,created_at')
      .eq('published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(MAX_ITEMS);
    if (error) {
      // A missing table (migration not yet applied) lands here. Fall through
      // to the legacy file rather than serving nothing.
      console.warn('[news-feed-proxy] smc_news read failed:', error.message);
      return null;
    }
    const rows = (data || []) as unknown as NewsRow[];
    if (rows.length === 0) return null;
    return toRss(rows);
  } catch (e) {
    console.warn('[news-feed-proxy] smc_news threw:', (e as Error).message);
    return null;
  }
}

async function fromLegacyFile(): Promise<string | null> {
  try {
    const res = await fetch(`${LEGACY_FEED_URL}?ts=${Date.now()}`, {
      headers: { Accept: 'application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    return await res.text();
  } catch (e) {
    console.error('[news-feed-proxy] legacy feed failed:', (e as Error).message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const xml = (await fromDatabase()) ?? (await fromLegacyFile());
  if (xml) return new Response(xml, { headers: xmlHeaders });

  return new Response('<?xml version="1.0"?><rss><channel></channel></rss>', {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
  });
});

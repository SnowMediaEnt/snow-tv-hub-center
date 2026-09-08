import { supabase } from '@/integrations/supabase/client';
import { SERVERS } from '@/lib/xtream';

/**
 * Sign-up links for services the app cannot provision itself.
 *
 * DreamStreams runs through WHMCS and needs nothing here. Vibez has no API —
 * only hosted pages that run a Stripe checkout and provision the line through
 * a Stripe webhook — so all the app can do is hand the customer to the right
 * page. Rows live in public.signup_links because the panel account number and
 * site name are part of every URL and will change.
 */

export type SignupKind = 'trial' | 'plan' | 'register' | 'login' | 'home';

export interface SignupLink {
  id: string;
  service: string;
  kind: SignupKind;
  label: string | null;
  termMonths: number | null;
  connections: number | null;
  /** null = we do not know it; show the tier without a price rather than invent one. */
  price: number | null;
  currency: string;
  url: string;
  sort: number;
}

export const VIBEZ = 'vibez';

/** The Vibez panel host, taken from SERVERS so serverForHost() matches it exactly. */
export const VIBEZ_HOST: string =
  SERVERS.find((s) => s.label === 'Vibez')?.host ?? 'https://strmz.xyz';

/**
 * The panel's live packages as of the last check, used as a floor.
 *
 * This is a floor, not a duplicate source of truth: the table wins whenever it
 * has rows. It exists so a cold cache, an offline first launch or a failed
 * fetch degrades to a working screen instead of an empty grid — the failure
 * mode that would otherwise strand exactly the customer this feature is for.
 */
const FALLBACK_BASE = 'https://superadminpanels.com/099451/auto/sites/zargoza';
const FALLBACK: SignupLink[] = [
  { id: 'vibez-trial', service: VIBEZ, kind: 'trial', label: 'Free for 2 days', termMonths: null, connections: 5, price: 0, currency: 'USD', url: `${FALLBACK_BASE}/trial.php`, sort: 0 },
  { id: 'vibez-register', service: VIBEZ, kind: 'register', label: null, termMonths: null, connections: null, price: null, currency: 'USD', url: `${FALLBACK_BASE}/register.php`, sort: 1 },
  { id: 'vibez-1m-9c', service: VIBEZ, kind: 'plan', label: null, termMonths: 1, connections: 9, price: 35, currency: 'USD', url: `${FALLBACK_BASE}/onemonth3.php`, sort: 10 },
  { id: 'vibez-3m-9c', service: VIBEZ, kind: 'plan', label: null, termMonths: 3, connections: 9, price: 100, currency: 'USD', url: `${FALLBACK_BASE}/threemonth3.php`, sort: 20 },
  { id: 'vibez-12m-9c', service: VIBEZ, kind: 'plan', label: null, termMonths: 12, connections: 9, price: 375, currency: 'USD', url: `${FALLBACK_BASE}/twelvemonth3.php`, sort: 40 },
];

interface Row {
  id: string; service: string; kind: string; label: string | null;
  term_months: number | null; connections: number | null;
  price: number | null; currency: string; url: string; sort: number;
}

const KINDS: SignupKind[] = ['trial', 'plan', 'register', 'login', 'home'];

const toLink = (r: Row): SignupLink | null => {
  if (!r?.url || !KINDS.includes(r.kind as SignupKind)) return null;
  // Only ever hand a browser an https/http link that came from our own table.
  if (!/^https?:\/\//i.test(r.url)) return null;
  return {
    id: String(r.id),
    service: String(r.service),
    kind: r.kind as SignupKind,
    label: r.label ?? null,
    termMonths: r.term_months ?? null,
    connections: r.connections ?? null,
    price: r.price === null || r.price === undefined ? null : Number(r.price),
    currency: r.currency || 'USD',
    url: r.url,
    sort: r.sort ?? 0,
  };
};

/** Rows for a service, newest config first, falling back to the built-in list. */
export async function loadSignupLinks(service: string = VIBEZ): Promise<SignupLink[]> {
  try {
    const { data, error } = await supabase
      .from('signup_links')
      .select('id,service,kind,label,term_months,connections,price,currency,url,sort')
      .eq('service', service)
      .eq('active', true)
      .order('sort', { ascending: true });
    if (error) throw error;
    const rows = (data as unknown as Row[] | null) ?? [];
    const mapped = rows.map(toLink).filter((l): l is SignupLink => l !== null);
    if (mapped.length) return mapped;
  } catch {
    /* fall through to the built-in list */
  }
  return service === VIBEZ ? FALLBACK : [];
}

export interface SignupOffers {
  trial: SignupLink | null;
  register: SignupLink | null;
  plans: SignupLink[];
}

export function toOffers(links: SignupLink[]): SignupOffers {
  return {
    trial: links.find((l) => l.kind === 'trial') ?? null,
    register: links.find((l) => l.kind === 'register') ?? null,
    plans: links.filter((l) => l.kind === 'plan').sort((a, b) => a.sort - b.sort),
  };
}

/** "3 months · 6 connections", or the row's own label when the operator set one. */
/** "1 month", "3 months", "1 year" — how the panel itself words each term. */
export function termText(months: number | null): string {
  if (!months) return '';
  if (months === 12) return '1 year';
  return months === 1 ? '1 month' : `${months} months`;
}

export function connectionsText(n: number | null): string {
  if (!n) return '';
  return n === 1 ? '1 connection' : `${n} connections`;
}

/** A one-line name for a tier, e.g. "1 year · 9 connections". */
export function linkLabel(l: SignupLink): string {
  if (l.label) return l.label;
  return [termText(l.termMonths), connectionsText(l.connections)].filter(Boolean).join(' · ') || 'Plan';
}

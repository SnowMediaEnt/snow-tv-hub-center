import { supabase } from '@/integrations/supabase/client';
import type { XtreamCreds } from '@/lib/xtream';

/**
 * Mail a customer the streaming login they just received.
 *
 * The billing API sends nothing at all (docs/billing/API.md: "No email is
 * involved anywhere"), so without this the username and password exist only
 * on the TV screen — gone the moment the viewer walks away or the box is
 * wiped. The edge function verifies the line against the panel before it
 * sends, composes the body itself, and throttles per line and per IP.
 *
 * Every failure here is non-fatal by design: the credentials are already on
 * screen and already saved to the device, so a bounced email must never block
 * someone from watching. Callers surface the message and move on.
 */

/**
 * A flat shape rather than a discriminated union: this project compiles with
 * `strict: false`, where narrowing on an `ok: true | false` discriminant does
 * not hold, so callers would have to cast to read `message`.
 */
export interface EmailLineOutcome {
  ok: boolean;
  /** Set when ok is false: the server's stable error code. */
  code?: string;
  /** Set when ok is false: the sentence to show the viewer. */
  message?: string;
}

const MESSAGES: Record<string, string> = {
  invalid_email: 'That email address does not look right.',
  missing_credentials: 'This service has no login details yet.',
  invalid_credentials: 'The panel did not recognise this login, so nothing was sent.',
  panel_unreachable: 'Could not reach the streaming server just now. Your details are still on screen.',
  rate_limited: 'That has been sent a few times already. Try again in a few minutes.',
  email_unavailable: 'Email is not switched on for this server yet.',
  send_failed: 'The email could not be sent. Your details are still on screen.',
};

const friendly = (code: string): string =>
  MESSAGES[code] ?? 'The email could not be sent. Your details are still on screen.';

/** Marks a line as already mailed, so re-entering a screen does not send again. */
const sentKey = (host: string, username: string) =>
  `smc:line-emailed:${host.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase()}|${username.trim().toLowerCase()}`;

export function wasLineEmailed(creds: Pick<XtreamCreds, 'host' | 'username'>): boolean {
  try {
    return localStorage.getItem(sentKey(creds.host, creds.username)) === '1';
  } catch {
    return false;
  }
}

function markLineEmailed(creds: Pick<XtreamCreds, 'host' | 'username'>): void {
  try {
    localStorage.setItem(sentKey(creds.host, creds.username), '1');
  } catch {
    /* private mode — worst case we offer to send it again */
  }
}

export async function emailLineCredentials(input: {
  email: string;
  creds: Pick<XtreamCreds, 'host' | 'username' | 'password'>;
  serverLabel?: string | null;
  planName?: string | null;
  /** ISO or already-formatted expiry, shown as-is in the email. */
  expiresAt?: string | null;
}): Promise<EmailLineOutcome> {
  const email = input.email.trim();
  if (!email || !email.includes('@')) return { ok: false, code: 'invalid_email', message: friendly('invalid_email') };

  try {
    const { data, error } = await supabase.functions.invoke('email-line-credentials', {
      body: {
        email,
        host: input.creds.host,
        username: input.creds.username,
        password: input.creds.password,
        serverLabel: input.serverLabel ?? undefined,
        planName: input.planName ?? undefined,
        expiresAt: input.expiresAt ?? undefined,
      },
    });

    // functions.invoke reports a non-2xx as `error` and does not give us the
    // body, so re-read the code from `data` when the function answered with
    // one, and fall back to a generic failure when it did not.
    const code = (data as { error?: string } | null)?.error;
    if (error || code) {
      const resolved = code || 'send_failed';
      return { ok: false, code: resolved, message: friendly(resolved) };
    }

    markLineEmailed(input.creds);
    return { ok: true };
  } catch {
    return { ok: false, code: 'send_failed', message: friendly('send_failed') };
  }
}

/**
 * A note that we sent someone off to a Vibez page to pay.
 *
 * The panel has no API, so nothing tells the TV that a purchase happened. On a
 * Fire TV Stick the Custom Tab also backgrounds SMC, and a low-memory device
 * may destroy the WebView outright — the viewer pays on their phone, comes
 * back, and finds the app booted to the home screen with no memory of any of
 * it. This marker survives that: the sign-in form reads it on mount and offers
 * to jump straight to "type the login they emailed you".
 *
 * It holds no credentials — only which tier was opened and when.
 */

const KEY = 'snow-vibez-pending';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days; after that it is noise

export interface VibezPending {
  linkId: string;
  label: string;
  url: string;
  at: number;
}

export function readPending(now: number = Date.now()): VibezPending | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as VibezPending;
    if (!p?.linkId || typeof p.at !== 'number') return null;
    if (now - p.at > TTL_MS) { clearPending(); return null; }
    return p;
  } catch {
    return null;
  }
}

export function writePending(p: Omit<VibezPending, 'at'>, now: number = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, at: now }));
  } catch {
    /* private mode: the flow still works, it just cannot be resumed after a kill */
  }
}

export function clearPending(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

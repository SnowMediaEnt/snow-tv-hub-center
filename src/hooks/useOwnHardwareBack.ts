import { useEffect, useLayoutEffect } from 'react';
import { App as CapApp } from '@capacitor/app';

type BackFlagsWindow = Window & { __playerOwnsBack?: boolean; __overlayHandledBackAt?: number };

/**
 * Own the native hardware Back button while a full-screen overlay is open.
 *
 * On Fire TV / Android TV the remote's Back reaches Capacitor's
 * App.backButton listener and is not delivered to the page as a keydown.
 * useNavigation's listener would pop the whole route out from under the
 * overlay. Mirroring LiveTV and AccountChooser: flag `window.__playerOwnsBack`
 * so that listener bails, and synthesize an Escape keydown so the overlay's
 * own keyboard handling (useTVFocus.onBack) sees one Back, exactly like a
 * DOM Back.
 */
export function useOwnHardwareBack(active: boolean, fallback: () => void): void {
  useLayoutEffect(() => {
    if (!active) return;
    const w = window as unknown as BackFlagsWindow;
    const prev = w.__playerOwnsBack;
    w.__playerOwnsBack = true;
    return () => { w.__playerOwnsBack = prev === true; };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const w = window as unknown as BackFlagsWindow;
    let handle: { remove?: () => void } | undefined;
    let cancelled = false;
    (async () => {
      try {
        const h = await CapApp.addListener('backButton', () => {
          if (cancelled) return;
          w.__overlayHandledBackAt = Date.now();
          try {
            document.body.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true,
            }));
          } catch {
            fallback();
          }
        });
        if (cancelled) h?.remove?.();
        else handle = h;
      } catch {
        // Not native: DOM Back already reaches the overlay.
      }
    })();
    return () => {
      cancelled = true;
      handle?.remove?.();
    };
  }, [active, fallback]);
}

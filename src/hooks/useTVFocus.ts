import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { focusTextInputForDpad, hideKeyboardForDpad } from '@/utils/dpadKeyboard';
import { snapAllTVScrollToTop } from '@/utils/tvScroll';

type Direction = 'up' | 'down' | 'left' | 'right';
type NavTarget = string | null | undefined | (() => string | null | undefined);

export type TVFocusNavigationMap = Record<string, Partial<Record<Direction, NavTarget>>>;

interface UseTVFocusOptions {
  enabled?: boolean;
  initialFocusId?: string;
  focusableSelector?: string;
  navigation?: TVFocusNavigationMap;
  onBack?: () => void;
  onFocusChange?: (id: string) => void;
  scrollBlock?: ScrollLogicalPosition;
  /** When false, don't auto-focus any element on mount. Useful for embedded
   *  views where the parent decides when focus enters. */
  autoFocusOnMount?: boolean;
}


const isTextInput = (el: HTMLElement | null): el is HTMLInputElement | HTMLTextAreaElement =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');

/**
 * Keep the on-screen keyboard shut while a field is merely HIGHLIGHTED.
 *
 * On a TV, moving the D-pad onto a field is not the same as wanting to type in
 * it — but in an Android WebView any .focus() on an input raises the IME, and
 * focusById() calls .focus() on every move. That is what made the keyboard
 * appear on arrival at the Player sign-in, cover the form, and come straight
 * back after Back: anything that restored focus re-raised it.
 *
 * inputmode="none" is the standard way to say "I will provide my own input
 * method"; Chrome has honoured it since 66, which is the floor for Fire TV. The
 * original value is parked on the element so activate() can hand it back. On a
 * WebView that ignores the attribute we are no worse off than before.
 */
const suppressIme = (el: HTMLElement | null) => {
  if (!isTextInput(el)) return;
  if (el.dataset.tvInputMode === undefined) {
    el.dataset.tvInputMode = el.getAttribute('inputmode') ?? '';
  }
  el.setAttribute('inputmode', 'none');
};

/** The viewer pressed Enter on the field: give it its real keyboard back. */
const allowIme = (el: HTMLElement | null) => {
  if (!isTextInput(el)) return;
  const original = el.dataset.tvInputMode;
  if (original) el.setAttribute('inputmode', original);
  else el.removeAttribute('inputmode');
};

const isVisible = (el: HTMLElement) =>
  !el.hasAttribute('disabled') &&
  el.getAttribute('aria-disabled') !== 'true' &&
  el.dataset.tvDisabled !== 'true' &&
  el.offsetParent !== null;
export const useTVFocus = ({
  enabled = true,
  initialFocusId,
  focusableSelector = '[data-tv-focus-id]',
  navigation = {},
  onBack,
  onFocusChange,
  scrollBlock = 'nearest',
  autoFocusOnMount = true,
}: UseTVFocusOptions = {}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentIdRef = useRef<string | null>(initialFocusId ?? null);
  const didAutoFocusRef = useRef(false);
  // Whether WE opened the keyboard. Focus alone no longer opens it, so this is
  // an accurate record — and Back needs it: keying off "focus is in an input"
  // instead would trap the viewer on the screen, since the field keeps focus
  // after the keyboard closes.
  const imeOpenRef = useRef(false);
  const [currentFocusId, setCurrentFocusId] = useState<string | null>(initialFocusId ?? null);



  const getElements = useCallback(() => {
    const root = containerRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(isVisible);
  }, [focusableSelector]);

  const getAllElements = useCallback(() => {
    const root = containerRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector));
  }, [focusableSelector]);

  const getId = useCallback((el: HTMLElement) => {
    if (el.dataset.tvFocusId) return el.dataset.tvFocusId;
    const attrMatch = focusableSelector.match(/\[([^\]=]+)/)?.[1];
    return attrMatch ? el.getAttribute(attrMatch) ?? '' : '';
  }, [focusableSelector]);

  const focusById = useCallback((id?: string | null, block: ScrollLogicalPosition = scrollBlock) => {
    if (!id) return false;
    const elements = getElements();
    const target = elements.find((el) => getId(el) === id);
    if (!target) return false;

    document.querySelectorAll<HTMLElement>('[data-tv-focused="true"]').forEach((el) => {
      el.dataset.tvFocused = 'false';
    });
    target.dataset.tvFocused = 'true';
    target.tabIndex = target.tabIndex < 0 ? 0 : target.tabIndex;
    // Highlight only. Enter is what asks for the keyboard.
    suppressIme(target);
    target.focus({ preventScroll: true });
    // When focusing a top-of-page "back" control, snap the nearest scroll
    // container to absolute top so the safe-area padding isn't clipped.
    const isBackTop = /(^|-)back($|-)/i.test(id);
    const scroller = target.closest('.tv-scroll-container') as HTMLElement | null;
    if (isBackTop && scroller) {
      snapAllTVScrollToTop([scroller, containerRef.current]);
    } else {
      target.scrollIntoView({ block, inline: 'nearest', behavior: 'smooth' });
    }
    currentIdRef.current = id;
    setCurrentFocusId(id);
    onFocusChange?.(id);
    return true;
  }, [getElements, getId, onFocusChange, scrollBlock]);

  const findManagedElement = useCallback((target: HTMLElement | null) => {
    if (!target) return null;
    return getAllElements().find((el) => el === target || el.contains(target)) ?? null;
  }, [getAllElements]);

  const findSpatial = useCallback((direction: Direction) => {
    const elements = getElements();
    if (!elements.length) return null;
    const active = findManagedElement(document.activeElement as HTMLElement | null);
    const current = active ?? elements.find((el) => getId(el) === currentIdRef.current) ?? elements[0];
    const currentRect = current.getBoundingClientRect();
    const currentX = currentRect.left + currentRect.width / 2;
    const currentY = currentRect.top + currentRect.height / 2;

    let best: HTMLElement | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    elements.forEach((candidate) => {
      if (candidate === current) return;
      const rect = candidate.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const dx = x - currentX;
      const dy = y - currentY;
      const inDirection =
        (direction === 'up' && dy < -8) ||
        (direction === 'down' && dy > 8) ||
        (direction === 'left' && dx < -8) ||
        (direction === 'right' && dx > 8);
      if (!inDirection) return;
      const primary = direction === 'up' || direction === 'down' ? Math.abs(dy) : Math.abs(dx);
      const secondary = direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy);
      const score = primary + secondary * 1.8;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    });
    return best ? getId(best) : null;
  }, [findManagedElement, getElements, getId]);

  const move = useCallback((direction: Direction) => {
    const currentEl = findManagedElement(document.activeElement as HTMLElement | null);
    const currentId = currentEl ? getId(currentEl) : currentIdRef.current;
    const rule = currentId ? navigation[currentId]?.[direction] : undefined;
    const ruledTarget = typeof rule === 'function' ? rule() : rule;
    if (ruledTarget === null) return true;
    const nextId = ruledTarget !== undefined ? ruledTarget : findSpatial(direction);
    return focusById(nextId ?? currentId);
  }, [findManagedElement, findSpatial, focusById, getId, navigation]);

  const activate = useCallback(() => {
    const currentEl = findManagedElement(document.activeElement as HTMLElement | null)
      ?? getElements().find((el) => getId(el) === currentIdRef.current);
    if (!currentEl) return;
    if (isTextInput(currentEl)) {
      allowIme(currentEl);
      imeOpenRef.current = true;
      void focusTextInputForDpad(currentEl);
      return;
    }
    currentEl.click();
  }, [findManagedElement, getElements, getId]);

  useEffect(() => {
    if (!enabled || !autoFocusOnMount) return;
    // Only auto-focus ONCE per mount. Re-enabling (e.g. when a child returns
    // focus to the parent) must NOT re-snap to initialFocusId — that races
    // with explicit focusById(...) calls made by the parent's return handler
    // and reliably overrides them (the auto-focus rAF is scheduled by React's
    // commit phase, AFTER the listener's rAF, so it wins on the next frame).
    if (didAutoFocusRef.current) return;
    didAutoFocusRef.current = true;
    const rafId = requestAnimationFrame(() => {
      const elements = getElements();
      const wanted = initialFocusId && elements.some((el) => getId(el) === initialFocusId)
        ? initialFocusId
        : getId(elements[0]);
      focusById(wanted, 'nearest');
    });
    return () => cancelAnimationFrame(rafId);
  }, [enabled, autoFocusOnMount, focusById, getElements, getId, initialFocusId]);


  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const active = document.activeElement as HTMLElement | null;
      const isLooseTarget = (el: HTMLElement | null) =>
        !el || el === document.body || el === document.documentElement || el === containerRef.current;
      const managedTarget = findManagedElement(target)
        ?? findManagedElement(active)
        ?? (isLooseTarget(target) && isLooseTarget(active)
          ? getAllElements().find((el) => getId(el) === currentIdRef.current)
          : null)
        ?? null;
      if (!managedTarget) return;

      const typing = isTextInput(target) || isTextInput(active) || !!target?.isContentEditable;
      // Close the keyboard but keep the field highlighted, so Back reads as
      // "done typing" rather than "the screen reset itself". Re-suppressing
      // first means the re-focus cannot raise it again.
      const closeIme = (el: HTMLElement | null) => {
        imeOpenRef.current = false;
        suppressIme(el);
        void hideKeyboardForDpad(el).then(() => focusById(currentIdRef.current, 'nearest'));
      };
      const isBack = event.key === 'Escape' || event.key === 'Backspace' || event.keyCode === 4 || event.code === 'GoBack';
      if (isBack) {
        // Backspace is a delete key while the keyboard is up, not a Back.
        if (event.key === 'Backspace' && imeOpenRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        if (imeOpenRef.current) {
          closeIme(active ?? target);
          return;
        }
        onBack?.();
        return;
      }

      if (typing && event.key === 'Enter' && managedTarget.dataset.tvAllowEnter === 'true') return;

      // The keyboard's own Next / Done key arrives as Enter. Next means the
      // field below — not "open this field again", which is what activate()
      // did, and why Next appeared to do nothing at all. With no field below,
      // this is Done and the keyboard simply closes.
      if (imeOpenRef.current && event.key === 'Enter' && isTextInput(active ?? target)) {
        event.preventDefault();
        event.stopPropagation();
        const from = active ?? target;
        imeOpenRef.current = false;
        suppressIme(from);
        void hideKeyboardForDpad(from).then(() => {
          const before = currentIdRef.current;
          move('down');
          if (currentIdRef.current === before) return;
          const landed = getAllElements().find((el) => getId(el) === currentIdRef.current) ?? null;
          if (!isTextInput(landed)) return;
          allowIme(landed);
          imeOpenRef.current = true;
          void focusTextInputForDpad(landed);
        });
        return;
      }
      // While typing in INPUT/TEXTAREA/contentEditable, never swallow Space — the user must be able
      // to type spaces. Also let Enter pass through unless arrow navigation is needed.
      if (typing && (event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space' || event.keyCode === 32)) return;
      if (typing && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;


      event.preventDefault();
      event.stopPropagation();
      // Moving off a field closes the keyboard; the field we land on is
      // suppressed by focusById, so it cannot pop straight back up.
      if (typing && event.key.startsWith('Arrow')) {
        imeOpenRef.current = false;
        suppressIme(active ?? target);
        void hideKeyboardForDpad(active ?? target);
      }

      if (event.key === 'Enter' || event.key === ' ') activate();
      if (event.key === 'ArrowUp') move('up');
      if (event.key === 'ArrowDown') move('down');
      if (event.key === 'ArrowLeft') move('left');
      if (event.key === 'ArrowRight') move('right');
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [activate, enabled, findManagedElement, focusById, getAllElements, getId, move, onBack]);

  const focusProps = useCallback((id: string) => ({
    'data-tv-focus-id': id,
    tabIndex: 0,
    onFocus: () => focusById(id, 'nearest'),
  }), [focusById]);

  return useMemo(() => ({
    containerRef,
    currentFocusId,
    focusById,
    move,
    focusProps,
  }), [currentFocusId, focusById, focusProps, move]);
};

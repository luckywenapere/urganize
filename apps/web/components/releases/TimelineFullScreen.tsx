'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Minimize2 } from '@/components/icons';
import { lockBodyScroll } from '@/lib/body-scroll-lock';

type TimelineFullScreenProps = {
  /** Names the dialog for a screen reader and heads the bar. */
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * The timeline, filling the app window (founder, 2026-10-07: "a way to make the
 * timeline view full screen"). It is NOT the browser's own full screen, which
 * iPhone Safari does not offer and which would hide the address bar too.
 *
 * URG-295 (2026-10-15, Oyin's demo with Moses on Oct 14): full screen used to
 * cover the top bar too, and on a desktop the timeline OPENS full screen, so a
 * person landed on a screen with no way to anywhere else in the app. Now it
 * fills everything UNDER the top bar: the side menu, the page bar and the page
 * go, the six areas, search, notifications and the account menu stay. On a
 * phone the bottom bar stays too (it floats above, and the scroll body pads
 * clear of it with `.mobile-nav-clearance`).
 *
 * How it stays under the bar without hiding the bar's menus: it is portalled
 * into AppShell's `.app-shell-frame`, inside `.app-layout`'s stacking context,
 * at z-[29], one below the sticky header's z-30. The header's dropdowns (the
 * account menu, the bell's panel) live in the header's own context, so they
 * open OVER the timeline. Portalled to `document.body` at a high tier, as it
 * was, nothing in the header could ever surface above it. `position: fixed`
 * still measures against the screen there: nothing around the page may anchor
 * fixed elements (lib/fixed-containing-block-guard.test.ts). The top edge is
 * the header's measured bottom, so the trial and offline strips above the bar
 * are allowed for. Without a shell frame (never in the app) it falls back to
 * the old body portal at the full-window tier.
 *
 * Not a modal any more: no `aria-modal` and no Tab trap, because the top bar is
 * meant to be reachable from it. Focus still moves in on open and goes back on
 * close. The activity pop-up and the sheets portal to the body above all of
 * `.app-layout`, so they still open ON TOP of it.
 *
 * ESCAPE yields to any open dialog. The activity pop-up owns Escape (see
 * TaskOutcomeSheet's note), and two window listeners on one keypress would close
 * both and drop the person out of the thing they were editing. So this only
 * closes when no `aria-modal` dialog is on the page.
 */
export function TimelineFullScreen({ title, onClose, children }: TimelineFullScreenProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [top, setTop] = useState(0);

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.app-shell-frame') ?? document.body);
  }, []);

  const inShell = host !== null && host !== document.body;

  // Keep the top edge on the header's bottom: it moves with the safe area, the
  // strips above it and the lg breakpoint (72px bar on a desktop, none below).
  useEffect(() => {
    if (!inShell) return;
    const header = document.querySelector<HTMLElement>('[data-shell-topbar]');
    if (!header) return;
    const measure = () => setTop(Math.max(0, Math.round(header.getBoundingClientRect().bottom)));
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(header);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [inShell]);

  useEffect(() => lockBodyScroll(), []);

  // Focus in on open, back to the opener on close (no trap; see above).
  useEffect(() => {
    if (!host) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [host]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!host) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="region"
      aria-label={title}
      tabIndex={-1}
      data-timeline-full-screen
      style={inShell ? { top } : undefined}
      className={`fixed inset-x-0 bottom-0 flex flex-col bg-bg-base focus:outline-none ${
        inShell ? 'z-[29]' : 'top-0 z-[160]'
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stroke-default px-4 py-3 sm:px-6">
        <h2 className="min-w-0 truncate font-display text-lg text-content-primary">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-stroke-control px-3 text-sm font-medium text-content-secondary transition-colors hover:border-content-secondary hover:text-content-primary"
        >
          <Minimize2 className="h-4 w-4" aria-hidden="true" />
          Exit full screen
        </button>
      </div>
      <div className="mobile-nav-clearance min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">{children}</div>
    </div>,
    host
  );
}

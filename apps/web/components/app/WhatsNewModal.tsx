'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { changelog, CURRENT_VERSION } from '@urganize/changelog';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';

// "What's new" on the first login after an update (founder request,
// 2026-07-23). The changelog ledger (packages/changelog — the same single
// source of truth the public /changelog page renders) drives the content;
// this device remembers the last version it announced and shows everything
// newer, once, on the next visit. Dismissing (button, backdrop, Esc) records
// the current version so it never repeats for the same release.
const SEEN_KEY = 'urganize.whats-new.seen-version';
const SEEN_VERSION_RECORD = 1;
// Don't flood long-absent devices — cap how many versions one modal shows.
const MAX_VERSIONS = 5;

const isVersionString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

// FILTER (founder call, 2026-07-23): only FEATURE releases get announced —
// x.Y.0 versions, per the repo's own bump rules (minor = new user-facing
// feature, patch = fixes/polish). Nobody needs a push-up card about a
// panel being nudged to the bottom.
const isFeatureRelease = (version: string): boolean => /^\d+\.\d+\.0$/.test(version);

export function WhatsNewModal() {
  const [seenVersion, setSeenVersion] = useState<string | null | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);

  // Hydrate the seen-version in a mount effect (SSR-safe).
  useEffect(() => {
    setSeenVersion(readPersistedState<string>(SEEN_KEY, SEEN_VERSION_RECORD, isVersionString));
  }, []);

  const freshEntries = useMemo(() => {
    if (seenVersion === undefined) return [];
    if (seenVersion === CURRENT_VERSION) return [];
    const candidates =
      seenVersion === null
        ? // First visit on this device: announce only the current release —
          // enough to say "here's what just landed" without a history dump.
          changelog.slice(0, 1)
        : (() => {
            const seenIndex = changelog.findIndex((entry) => entry.version === seenVersion);
            return seenIndex === -1 ? changelog.slice(0, 1) : changelog.slice(0, seenIndex);
          })();
    return candidates.filter((entry) => isFeatureRelease(entry.version)).slice(0, MAX_VERSIONS);
  }, [seenVersion]);

  const open = !dismissed && freshEntries.length > 0;

  const dismiss = () => {
    setDismissed(true);
    writePersistedState(SEEN_KEY, SEEN_VERSION_RECORD, CURRENT_VERSION);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // dismiss is stable enough for this lifetime; open is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-x-0 top-0 z-[200] flex h-[100dvh] items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Dismiss what's new"
        className="absolute inset-0"
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="relative flex max-h-[min(40rem,calc(100dvh-3rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.76*var(--shadow-alpha-scale)))]"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stroke-subtle p-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
              What&apos;s new
              <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                v{CURRENT_VERSION}
              </span>
            </p>
            <h2 id="whats-new-title" className="mt-2 font-display text-2xl font-semibold text-content-primary">
              Urganize got better
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="motion-focus motion-press grid h-9 w-9 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain p-5">
          {freshEntries.map((entry) => (
            <div key={entry.version}>
              <p className="flex items-baseline gap-2 font-mono text-[11px] font-bold text-content-tertiary">
                v{entry.version}
                <span className="font-normal">· {entry.date}</span>
              </p>
              <ul className="mt-2 space-y-2">
                {entry.highlights.map((highlight, index) => (
                  <li key={index} className="flex gap-2.5 text-sm leading-6 text-content-secondary">
                    <span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 justify-end border-t border-stroke-subtle p-4">
          <button
            type="button"
            onClick={dismiss}
            className="motion-focus motion-press rounded-full bg-brand px-5 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

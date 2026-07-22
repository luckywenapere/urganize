'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Sparkles, X } from 'lucide-react';
import { useUpsellStore } from '@/stores/useUpsellStore';
import type { PaidFeatureFlag } from '@/lib/entitlements';

// URG-178: shown whenever a free-tier user reaches for a paid feature —
// never a dead click, never a raw 403. Mirrors DeleteReleaseDialog's portal +
// backdrop + escape pattern. Global singleton mounted once by AppShell.
const COPY: Record<PaidFeatureFlag, { title: string; body: string }> = {
  catalogView: {
    title: 'See your whole roster at a glance',
    body: 'A richer view across every release you manage is part of the paid plan.',
  },
  chappiAssistant: {
    title: 'Chappi is part of the paid plan',
    body: 'Ask questions about your releases and tasks, and let Chappi take actions for you, once you upgrade.',
  },
  fileManagement: {
    title: 'File storage is part of the paid plan',
    body: 'Keep artwork, masters, contracts, and split sheets attached to the release itself, once you upgrade.',
  },
  crossReleaseInsights: {
    title: 'Insights across releases is part of the paid plan',
    body: 'A rollup of health and status across your whole roster is part of the paid plan.',
  },
};

export function UpsellModal() {
  const isOpen = useUpsellStore((state) => state.isOpen);
  const flag = useUpsellStore((state) => state.flag);
  const hide = useUpsellStore((state) => state.hide);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hide, isOpen]);

  if (!isOpen || !isMounted || !flag) return null;

  const copy = COPY[flag];

  const dialog = (
    <div
      className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-center justify-center bg-black/72 px-4 py-4 backdrop-blur-sm"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close upgrade dialog"
        className="absolute inset-0 cursor-default"
        onClick={hide}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upsell-title"
        className="relative mx-auto w-full max-w-sm border border-stroke-default bg-bg-surface p-5 shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.76*var(--shadow-alpha-scale)))]"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={hide}
          className="motion-focus absolute right-3 top-3 text-content-tertiary hover:text-content-primary"
        >
          <X className="h-4 w-4" />
        </button>

        <Sparkles className="h-5 w-5 text-brand" aria-hidden="true" />
        <h2 id="upsell-title" className="mt-3 font-display text-lg font-semibold text-content-primary">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-content-secondary">{copy.body}</p>

        <div className="mt-5 flex items-center gap-3">
          <Link
            href="/locked"
            className="motion-focus motion-press inline-flex h-9 items-center bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
          >
            See paid plans
          </Link>
          <button
            type="button"
            onClick={hide}
            className="motion-focus text-sm text-content-tertiary hover:text-content-primary"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { useAuthStore } from '@/lib/auth-store';
import { SOLO_LIMIT_EVENT, type SoloLimitDetail } from '@/lib/access-redirect';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { checkoutPath, splitLimitMessage } from '@/lib/self-serve';

// Self-serve checkout (2026-10-22). When a Solo team hits a limit (one artist,
// two people, one rollout at a time), the server refuses with Manager as the
// way up, and this one sheet opens wherever it happened: a bottom sheet on a
// phone, a dialog on a computer. "Upgrade to Manager" opens the same checkout,
// which prorates through the existing plan-change code. The refusal message is
// the server's (lib/entitlements.ts), split into its first sentence and the rest.

export function SoloLimitSheet() {
  const router = useRouter();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [detail, setDetail] = useState<SoloLimitDetail | null>(null);

  useEffect(() => {
    const onLimit = (event: Event) => {
      const next = (event as CustomEvent<SoloLimitDetail>).detail;
      if (!next?.message) return;
      setDetail(next);
      captureAnalyticsEvent(
        createPostHogEvent('solo_limit_hit', { path: 'self_serve', plan: 'solo', kind: next.key }),
        { userId }
      );
    };
    window.addEventListener(SOLO_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(SOLO_LIMIT_EVENT, onLimit);
  }, [userId]);

  const close = useCallback(() => setDetail(null), []);

  if (!detail || typeof document === 'undefined') return null;
  const { title, body } = splitLimitMessage(detail.message);

  const upgrade = () => {
    captureAnalyticsEvent(
      createPostHogEvent('upgrade_to_manager_clicked', { path: 'self_serve', plan: 'manager', kind: detail.key, source: 'limit' }),
      { userId }
    );
    setDetail(null);
    router.push(checkoutPath({ plan: 'manager' }));
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Not now" tabIndex={-1} onClick={close} className="absolute inset-0 bg-black/60" />
      <DialogPanel
        label={title}
        onClose={close}
        className="relative w-full max-w-md rounded-t-3xl border border-stroke-default bg-bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-full bg-stroke-strong sm:hidden" />
        <h2 className="font-display text-xl text-content-primary">{title}</h2>
        {body ? <p className="mt-2 text-content-secondary">{body}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            className="min-h-12 rounded-full px-5 text-sm font-semibold text-content-secondary hover:bg-bg-hover"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={upgrade}
            className="min-h-12 rounded-full bg-brand px-5 text-sm font-semibold text-content-inverse"
          >
            Upgrade to Pro
          </button>
        </div>
      </DialogPanel>
    </div>,
    document.body
  );
}

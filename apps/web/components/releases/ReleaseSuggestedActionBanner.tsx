'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { captureAnalyticsEvent } from '@/lib/analytics';

type ReleaseSuggestedActionBannerProps = {
  releaseId: string;
  action:
    | {
        type: 'upload_track';
        title: string;
        description: string;
        ctaLabel: string;
        target: 'tracks';
      }
    | {
        type: 'add_task' | 'invite_team' | 'launch_pre_save';
        title: string;
        description: string;
        ctaLabel: string;
        href: string;
      }
    | {
        type: 'none';
        title: '';
        description: '';
        ctaLabel: '';
      };
};

export function ReleaseSuggestedActionBanner({ releaseId, action }: ReleaseSuggestedActionBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const sessionStorageKey = useMemo(
    () => `urganize.release.suggested-action.${releaseId}.${action.type}`,
    [action.type, releaseId]
  );

  useEffect(() => {
    if (action.type === 'none') {
      setIsDismissed(true);
      return;
    }

    const storedValue = window.sessionStorage.getItem(sessionStorageKey);
    setIsDismissed(storedValue === 'dismissed');
  }, [action.type, sessionStorageKey]);

  if (action.type === 'none' || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    window.sessionStorage.setItem(sessionStorageKey, 'dismissed');
    captureAnalyticsEvent({
      name: 'next_action_banner_dismissed',
      properties: {
        release_id: releaseId,
        action: action.type,
      },
    });
    setIsDismissed(true);
  };

  const handleScrollToTracks = () => {
    const target = document.querySelector<HTMLElement>('[data-onboarding-target="tracks"]');
    captureAnalyticsEvent({
      name: 'next_action_banner_clicked',
      properties: {
        release_id: releaseId,
        action: action.type,
      },
    });
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      data-onboarding-target="next-action"
      className="rounded-[28px] border border-brand/20 bg-brand/8 p-5 shadow-[0_24px_60px_-40px_rgba(62,207,142,0.42)] sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Next suggested action</p>
          <h2 className="mt-3 text-2xl tracking-tight text-content-primary">{action.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-content-secondary">{action.description}</p>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition hover:text-content-primary"
          aria-label="Dismiss suggested action"
        >
          ×
        </button>
      </div>

      <div className="mt-5">
        {'href' in action ? (
          <Link
            href={action.href}
            onClick={() =>
              captureAnalyticsEvent({
                name: 'next_action_banner_clicked',
                properties: {
                  release_id: releaseId,
                  action: action.type,
                },
              })
            }
            className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover"
          >
            {action.ctaLabel}
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleScrollToTracks}
            className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover"
          >
            {action.ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}

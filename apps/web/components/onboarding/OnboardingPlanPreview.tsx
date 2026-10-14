'use client';

import { useEffect, useMemo, useRef } from 'react';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { buildOnboardingPlanPreview } from '@/lib/onboarding-plan-preview';

/**
 * The read-only week-by-week preview (URG-251, option B). Built from the
 * playbook and their release date, entirely in the browser, so it needs no
 * account. Nothing on it can be tapped except the wizard's own Continue.
 */
export function OnboardingPlanPreview({
  releaseType,
  releaseDate,
  title,
}: {
  releaseType: string | null;
  releaseDate: string;
  title: string;
}) {
  const preview = useMemo(
    () => buildOnboardingPlanPreview({ releaseType, releaseDate, now: Date.now() }),
    [releaseType, releaseDate]
  );
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!preview || reportedRef.current) return;
    reportedRef.current = true;
    captureAnalyticsEvent({
      name: 'onboarding_preview_viewed',
      properties: {
        release_type: releaseType ?? 'single',
        weeks: preview.weeks.length,
        activities: preview.activityCount,
      },
    });
  }, [preview, releaseType]);

  if (!preview) {
    return (
      <p className="mt-5 text-sm leading-relaxed text-content-secondary">
        Your plan is built around your release date. Go back one step to add it.
      </p>
    );
  }

  const name = title.trim() || 'your rollout';

  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm leading-relaxed text-content-secondary">
        Here&apos;s how {name} could run, {preview.activityCount} activities across {preview.weeks.length}{' '}
        weeks. UrgAns tailors the real plan after you sign up.
      </p>
      <ol className="max-h-[26rem] space-y-2 overflow-y-auto pr-1" aria-label="Your plan, week by week">
        {preview.weeks.map((week) => (
          <li
            key={week.key}
            className={`rounded-xl border px-4 py-3 ${
              week.isReleaseWeek ? 'border-brand bg-brand/8' : 'border-stroke-default bg-bg-elevated'
            }`}
          >
            <p
              className={`text-xs font-semibold uppercase tracking-[0.14em] ${
                week.isReleaseWeek ? 'text-brand' : 'text-content-tertiary'
              }`}
            >
              {week.label}
            </p>
            <ul className="mt-1.5 space-y-1">
              {week.tasks.map((task, index) => (
                <li key={`${week.key}-${index}`} className="text-sm text-content-primary">
                  {task}
                </li>
              ))}
            </ul>
            {week.more > 0 ? (
              <p className="mt-1 text-xs text-content-tertiary">+{week.more} more</p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

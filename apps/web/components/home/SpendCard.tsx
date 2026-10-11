'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from '@/components/icons';
import { BarList } from '@/components/shared/BarList';
import { HOME_BLOCK_LABELS } from '@/lib/home/sections';
import { spendSceneHref } from '@/lib/home/spend-card';
import type { HomeReleaseSummary } from '@/lib/home/types';
import { formatNaira } from '@/lib/money';
import { SPEND_COPY } from '@/lib/release-spend';
import type { SpendSummary } from '@/lib/release-spend-server';
import { formatShare } from '@/lib/usage-metrics-format';
import { HomeStack } from './HomeStack';

/**
 * Where the team's money went over the last 90 days, by category, as a one-card
 * group. Drawn for a manager (lib/home/sections.ts) when there is spend or a
 * rollout they may track spend on. The server has already added up just the
 * rollouts this person may see.
 *
 * Actionable since 2026-10-11 (founder call). Tapping the card opens a rollout's
 * Spend scene, the same scene as the rollout menu's Track spend row; "Add spend"
 * opens it with the add form already open (`field=add`). With several rollouts
 * a picker chooses which one, defaulting to the next one coming out
 * (lib/home/spend-card.ts). With none to open (spend only on rollouts no longer
 * in flight) the card stays display only.
 */
export function SpendCard({
  summary,
  rollouts,
}: {
  summary: SpendSummary;
  /** The rollouts the card may open, default first (useSpendRollouts). */
  rollouts: readonly HomeReleaseSummary[];
}) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const target = rollouts.find((rollout) => rollout.id === chosenId) ?? rollouts[0] ?? null;
  const hasSpend = summary.totalKobo > 0;

  return (
    <HomeStack
      label={HOME_BLOCK_LABELS.spend}
      items={[summary]}
      showCount={false}
      getKey={() => 'spend'}
      renderItem={(spend) => (
        <div>
          {/* The whole card is the way in: a stretched link under the picker
              and the button, which sit above it (z-10) and keep their own taps. */}
          {target ? (
            <Link
              href={spendSceneHref(target.id)}
              aria-label={`${SPEND_COPY.homeTitle}: open spend for ${target.title || 'this rollout'}`}
              className="motion-focus absolute inset-0 z-0 rounded-2xl"
            />
          ) : null}

          {hasSpend ? (
            <>
              <p className="font-display text-2xl font-semibold tabular-nums text-content-primary">
                {formatNaira(spend.totalKobo)}
              </p>
              <p className="mt-0.5 text-xs text-content-tertiary">{SPEND_COPY.homePeriod}</p>
              <div className="mt-4">
                <BarList
                  label={HOME_BLOCK_LABELS.spend}
                  rows={spend.categories.map((category) => ({
                    key: category.category,
                    label: category.label,
                    value: category.amountKobo,
                  }))}
                  formatValue={formatNaira}
                  formatShare={formatShare}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-content-secondary">{SPEND_COPY.homeEmpty}</p>
          )}

          {target ? (
            <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2">
              <Link
                href={spendSceneHref(target.id, { add: true })}
                className="motion-focus motion-press inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {SPEND_COPY.addButton}
              </Link>
              {rollouts.length > 1 ? (
                <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-content-tertiary sm:flex-none">
                  <span className="shrink-0">{SPEND_COPY.homePickerLabel}</span>
                  <select
                    value={target.id}
                    onChange={(event) => setChosenId(event.target.value)}
                    className="motion-focus min-h-11 min-w-0 flex-1 truncate rounded-full border border-stroke-control bg-bg-base px-3 text-sm text-content-primary hover:border-content-secondary sm:max-w-[14rem]"
                  >
                    {rollouts.map((rollout) => (
                      <option key={rollout.id} value={rollout.id}>
                        {rollout.title || 'Untitled'}
                        {rollout.artistName ? ` · ${rollout.artistName}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="min-w-0 truncate text-xs text-content-tertiary">{target.title}</span>
              )}
            </div>
          ) : null}
        </div>
      )}
    />
  );
}

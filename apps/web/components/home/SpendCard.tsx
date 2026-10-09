'use client';

import { BarList } from '@/components/shared/BarList';
import { HOME_BLOCK_LABELS } from '@/lib/home/sections';
import { formatNaira } from '@/lib/money';
import { SPEND_COPY } from '@/lib/release-spend';
import type { SpendSummary } from '@/lib/release-spend-server';
import { formatShare } from '@/lib/usage-metrics-format';
import { HomeStack } from './HomeStack';

/**
 * Where the team's money went over the last 90 days, by category, as a one-card
 * group. Drawn only for a manager with something spent (lib/home/sections.ts),
 * so Home never shows an empty one. Display only: the server has already added
 * up just the rollouts this person may see.
 */
export function SpendCard({ summary }: { summary: SpendSummary }) {
  return (
    <HomeStack
      label={HOME_BLOCK_LABELS.spend}
      items={[summary]}
      showCount={false}
      getKey={() => 'spend'}
      renderItem={(spend) => (
        <div>
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
        </div>
      )}
    />
  );
}

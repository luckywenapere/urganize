'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from '@/components/icons';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { loadGrantSuggestions } from '@/components/opportunities/load-grant-suggestions';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { grantSuggestionsEnabled } from '@/lib/grants/grant-suggestions-flag';
import type { GrantSuggestionView } from '@/lib/grants/suggestions';
import {
  HOME_OPPORTUNITIES_COPY,
  HOME_OPPORTUNITIES_HREF,
  homeOpportunitiesView,
  homeOpportunityMeta,
  pickHomeOpportunities,
  type HomeOpportunityItem,
} from '@/lib/home/opportunities-card';
import { todayKey } from '@/lib/opportunities';
import { useOpportunitiesStore } from '@/stores/useOpportunitiesStore';

/**
 * The top of Home (URG-266, 2026-10-14): up to three open opportunities that
 * fit the team, matched grant suggestions first, then the team's own open ones,
 * and See all into /dashboard/opportunities. The rules are in
 * lib/home/opportunities-card.ts. Live at merge, no flag of its own; the
 * suggestions half follows NEXT_PUBLIC_FEATURE_GRANT_SUGGESTIONS like the
 * Opportunities page does.
 *
 * Unlike Home's other groups this one shows an empty state, so a team with
 * nothing open still sees where grants and deals will land.
 */
export function OpportunitiesCard() {
  const headingId = useId();
  const opportunities = useOpportunitiesStore((state) => state.opportunities);
  const opportunitiesLoading = useOpportunitiesStore((state) => state.isInitialLoading);
  const opportunitiesError = useOpportunitiesStore((state) => state.error);
  const loadOpportunities = useOpportunitiesStore((state) => state.load);

  const suggestionsOn = grantSuggestionsEnabled();
  const [suggestions, setSuggestions] = useState<GrantSuggestionView[]>([]);
  const [suggestionsSettled, setSuggestionsSettled] = useState(!suggestionsOn);

  useEffect(() => {
    void loadOpportunities();
  }, [loadOpportunities]);

  useEffect(() => {
    if (!suggestionsOn) return;
    let live = true;
    void loadGrantSuggestions().then((result) => {
      if (!live) return;
      setSuggestions(result.suggestions);
      setSuggestionsSettled(true);
    });
    return () => {
      live = false;
    };
  }, [suggestionsOn]);

  if (opportunitiesLoading || !suggestionsSettled) {
    return <SkeletonBlock className="h-[7.5rem] rounded-2xl" />;
  }

  const items = pickHomeOpportunities({ suggestions, opportunities }, todayKey());
  const view = homeOpportunitiesView({ opportunitiesOk: !opportunitiesError, items });
  if (view === 'hidden') return null;

  const track = (target: 'item' | 'see_all' | 'empty', item?: HomeOpportunityItem, position?: number) =>
    captureAnalyticsEvent({
      name: 'home_opportunity_clicked',
      properties: {
        target,
        source: item?.source ?? null,
        kind: item?.kind ?? null,
        position: position ?? null,
        shown: items.length,
      },
    });

  return (
    <section aria-labelledby={headingId} className="relative pt-3.5" data-home-card="opportunities">
      <h2 className="absolute left-3 top-0 z-20">
        <span
          id={headingId}
          className="inline-flex h-7 items-center rounded-full border border-stroke-strong bg-bg-base px-2.5 text-[11px] font-semibold text-content-secondary"
        >
          {HOME_OPPORTUNITIES_COPY.label}
        </span>
      </h2>

      <div className="relative z-10 rounded-2xl border border-stroke-default bg-bg-surface px-4 pb-2 pt-6">
        {view === 'empty' ? (
          <div className="pb-2">
            <p className="text-sm font-semibold text-content-primary">{HOME_OPPORTUNITIES_COPY.emptyTitle}</p>
            <p className="mt-1 text-sm text-content-secondary">{HOME_OPPORTUNITIES_COPY.emptyDescription}</p>
            <Link
              href={HOME_OPPORTUNITIES_HREF}
              onClick={() => track('empty')}
              className="motion-focus motion-press mt-3 inline-flex min-h-11 items-center rounded-full border border-stroke-default bg-bg-base px-4 text-sm font-semibold text-content-primary hover:border-stroke-strong"
            >
              {HOME_OPPORTUNITIES_COPY.emptyAction}
            </Link>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-stroke-subtle">
              {items.map((item, index) => (
                <li key={item.key}>
                  <Link
                    href={HOME_OPPORTUNITIES_HREF}
                    onClick={() => track('item', item, index + 1)}
                    className="motion-focus group -mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-content-primary group-hover:underline">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-content-tertiary">
                        {homeOpportunityMeta(item)}
                      </span>
                      {item.detail ? (
                        <span className="mt-0.5 block truncate text-xs text-content-secondary">{item.detail}</span>
                      ) : null}
                    </span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-content-tertiary" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex justify-end border-t border-stroke-subtle pt-1">
              <Link
                href={HOME_OPPORTUNITIES_HREF}
                onClick={() => track('see_all')}
                className="motion-focus inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-content-secondary hover:text-content-primary"
              >
                {HOME_OPPORTUNITIES_COPY.seeAll}
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

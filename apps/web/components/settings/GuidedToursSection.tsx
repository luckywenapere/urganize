'use client';

import { useRouter } from 'next/navigation';

import { panelClass } from './panelClass';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTourStore } from '@/stores/useTourStore';
import { ROLLOUT_TOUR_STEPS, type TourId } from '@/lib/tours';

const TOURS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TOURS === 'true';

/**
 * Replay, from the one surface a phone can reach.
 *
 * The `?` HelpMenu is the other entry point and it is `hidden md:block`, so on
 * a phone this section IS the way back to a tour — the same reasoning that put
 * issue reporting in Settings → Account.
 *
 * Neither button runs a tour here: Settings has nothing to point at. They park
 * a request in the store and navigate, and the surface that CAN run it picks
 * the request up on arrival (useCatalogTourAutoStart for the catalog; the
 * rollout one starts directly once a rollout is scoped, which is why it needs
 * one to exist).
 *
 * Renders nothing when NEXT_PUBLIC_FEATURE_TOURS is off, gated here rather
 * than by the tab so the gate travels with the component.
 */
export function GuidedToursSection() {
  const router = useRouter();
  const requestReplay = useTourStore((state) => state.requestReplay);
  const start = useTourStore((state) => state.start);
  const releases = useReleaseStore((state) => state.releases);

  const firstReleaseId = releases[0]?.id ?? null;

  const replayCatalog = () => {
    requestReplay('catalog');
    router.push('/dashboard');
  };

  const replayRollout = () => {
    if (!firstReleaseId) return;
    // Started directly rather than parked: the rollout tour's anchors are all
    // on the scoped view, so navigating there IS the whole precondition, and
    // there is no hook watching for a pending rollout replay the way
    // useCatalogTourAutoStart watches for a catalog one.
    router.push(`/dashboard?release=${firstReleaseId}`);
    start('rollout', ROLLOUT_TOUR_STEPS);
  };

  if (!TOURS_ENABLED) return null;

  const rows: Array<{ id: TourId; label: string; hint: string; onClick: () => void; disabled: boolean }> = [
    {
      id: 'catalog',
      label: 'Show me the catalog again',
      hint: 'Where your rollouts live and how to ask UrgAns for things.',
      onClick: replayCatalog,
      disabled: false,
    },
    {
      id: 'rollout',
      label: 'Show me a rollout again',
      hint: firstReleaseId
        ? 'Activities, the rollout menu and bringing your team in.'
        : 'Plan a rollout first.',
      onClick: replayRollout,
      disabled: !firstReleaseId,
    },
  ];

  return (
    <section className={panelClass}>
      <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Guided tours
      </h2>
      <div className="divide-y divide-stroke-subtle">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm text-content-primary">{row.label}</p>
              <p className="mt-0.5 text-xs text-content-tertiary">{row.hint}</p>
            </div>
            <button
              type="button"
              onClick={row.onClick}
              disabled={row.disabled}
              className="shrink-0 rounded-lg border border-stroke-default bg-bg-surface px-3 py-1.5 text-xs font-semibold text-content-primary transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Show me
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

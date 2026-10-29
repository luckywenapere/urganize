'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from '@/components/icons';
import { DistributionSection } from '@/components/releases/DistributionSection';
import { SmartLinkSection } from '@/components/releases/SmartLinkSection';
import { isAltlinkEnabled } from '@/lib/altlink/rules';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import type { DistributeRow } from '@/lib/distribute-summary';
import { useReleaseStore } from '@/stores/useReleaseStore';

/**
 * A rollout's Distribute step, opened from the Distribute tab (2026-10-14), so
 * the tab row keeps Distribute lit instead of jumping to Rollouts. Same section
 * the rollout's own menu opens; only the frame differs.
 *
 * The check's Fix buttons open a rollout scene (Metadata, Cover art...) through
 * useSceneOverlay, which keeps the current path. Those scenes live on the
 * rollout, so when one lands here as `?scene=` it is handed straight across to
 * the rollout with the same params.
 *
 * Three tabs (Oct 29, 2026, #850): Stores (the step above, unchanged), Smart
 * link (the same view the rollout menu opens) and Numbers (the link's Altlink
 * numbers). `?tab=link` / `?tab=numbers`; no tab is Stores.
 *
 * The two link tabs show only once the rollout has a link or could have one
 * (a UPC or ISRC and a release date), the same rule as the list's tag; until
 * then the page is Stores alone (Altlink call, Oct 28, 2026, #852).
 */

type Tab = 'stores' | 'link' | 'numbers';
const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: 'stores', label: 'Stores' },
  { key: 'link', label: 'Smart link' },
  { key: 'numbers', label: 'Numbers' },
];
const readTab = (value: string | null): Tab =>
  isAltlinkEnabled() && (value === 'link' || value === 'numbers') ? value : 'stores';
export default function DistributeReleaseClient({ releaseId }: { releaseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authLoading = useAuthStore((state) => state.isLoading);
  const releases = useReleaseStore((state) => state.releases);
  const initialLoading = useReleaseStore((state) => state.isInitialLoading);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);

  const scene = searchParams.get('scene');
  const [linkReady, setLinkReady] = useState(false);
  useEffect(() => {
    if (!isAltlinkEnabled()) return;
    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const response = await fetch(`/api/distribute/summary?ids=${encodeURIComponent(releaseId)}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        });
        if (!response.ok) return;
        const body = (await response.json()) as { rows?: Record<string, DistributeRow> };
        if (!cancelled) setLinkReady(Boolean(body.rows?.[releaseId]?.link));
      } catch {
        // Stores stands on its own.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [releaseId]);
  const tab = linkReady ? readTab(searchParams.get('tab')) : 'stores';
  const pickTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'stores') params.delete('tab');
    else params.set('tab', next);
    const query = params.toString();
    router.replace(`/dashboard/distribute/${encodeURIComponent(releaseId)}${query ? `?${query}` : ''}`, { scroll: false });
  };
  useEffect(() => {
    if (!scene || scene === 'distribute') return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('release', releaseId);
    router.replace(`/dashboard?${next.toString()}`);
  }, [scene, searchParams, releaseId, router]);

  useEffect(() => {
    void loadCommandCenter();
  }, [loadCommandCenter]);

  const release = releases.find((entry) => entry.id === releaseId) ?? null;
  const loading = (authLoading || initialLoading) && !release;

  return (
    <div className="pt-5 sm:pt-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/distribute"
          aria-label="Back to Distribute"
          className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        {release ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
              {release.artistName || 'Unassigned artist'}
            </p>
            <h2 className="truncate font-display text-lg font-semibold leading-tight text-content-primary">
              {release.title}
            </h2>
          </div>
        ) : null}
      </div>

      {release && linkReady ? (
        <div role="tablist" aria-label="Distribute" className="mt-5 flex gap-1 rounded-full bg-bg-elevated p-1 sm:max-w-md">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              onClick={() => pickTab(entry.key)}
              className={`motion-focus min-h-10 flex-1 rounded-full px-3 text-sm font-semibold transition-colors ${
                tab === entry.key ? 'bg-content-primary text-content-inverse' : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}

      {release ? (
        tab === 'stores' ? (
          <DistributionSection release={release} />
        ) : (
          <SmartLinkSection
            key={tab}
            releaseId={release.id}
            part={tab === 'numbers' ? 'numbers' : 'link'}
            onOpenLink={() => pickTab('link')}
          />
        )
      ) : loading ? (
        <div className="mt-8 h-64 animate-pulse border border-stroke-default bg-bg-surface" aria-busy="true" />
      ) : (
        <p className="mt-8 text-sm text-content-secondary">We could not find this rollout.</p>
      )}
    </div>
  );
}

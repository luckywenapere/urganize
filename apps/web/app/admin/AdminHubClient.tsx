'use client';

// The admin hub overview: the founder cockpit (2026-10-09), then one card per
// internal dashboard, grouped into Numbers / Operations / Content. The gate is
// GET /api/admin/me (verifyAdmin / ADMIN_EMAILS) — anyone else bounces to /dashboard, the same shape as the
// other admin page clients. The cockpit loads AFTER the gate from its own route
// (GET /api/admin/cockpit), so the links show at once while its numbers, which
// take a few seconds to work out, fill in above them. A cockpit failure shows
// its own message and never hides the links.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, LayoutDashboard } from '@/components/icons';
import { ADMIN_NAV_ITEMS } from '@/components/admin/AdminNav';
import { ADMIN_SECTIONS, ADMIN_SECTION_GROUPS, sectionsInGroup } from '@/lib/admin-sections';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { InfoTip } from '@/components/shared/HelpTip';
import { FounderCockpitView } from '@/components/admin/FounderCockpitView';
import type { FounderCockpit } from '@/lib/founder-cockpit';
import type { AdminFunnel } from '@/lib/admin-funnel';
import type { UrgansUsage } from '@/lib/admin-urgans-usage';
import type { ChurnSummary } from '@/lib/admin-churn';
import type { AdminReadSource } from '@/lib/admin-read-server';

type CockpitPayload = {
  cockpit: FounderCockpit;
  funnels: AdminFunnel[];
  urgans: UrgansUsage | null;
  churn: ChurnSummary | null;
  sources: AdminReadSource[];
};
type CockpitState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: CockpitPayload };

// The links under "All dashboards": every side-menu section, grouped into
// Numbers / Operations / Content (lib/admin-sections.ts, iteration 4). Icons
// come from the menu itself so the two can never show different ones.
const NAV_ICONS = new Map(ADMIN_NAV_ITEMS.map((item) => [item.key, item.icon]));

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export default function AdminHubClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [checked, setChecked] = useState(false);
  const [cockpit, setCockpit] = useState<CockpitState>({ status: 'loading' });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const response = await fetch('/api/admin/me', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!response.ok) {
          router.replace('/dashboard');
          return;
        }
        setChecked(true);
      } catch {
        if (!cancelled) router.replace('/dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!checked) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const response = await fetch('/api/admin/cockpit', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = (await response.json().catch(() => ({}))) as Partial<CockpitPayload> & {
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !body.cockpit) {
          setCockpit({ status: 'error', message: body.error || 'Could not work out this week\'s numbers.' });
          return;
        }
        setCockpit({
          status: 'ready',
          payload: {
            cockpit: body.cockpit,
            funnels: body.funnels ?? [],
            urgans: body.urgans ?? null,
            churn: body.churn ?? null,
            sources: body.sources ?? [],
          },
        });
      } catch {
        if (!cancelled) setCockpit({ status: 'error', message: 'Could not work out this week\'s numbers.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checked]);

  if (authLoading || !user || !checked) {
    return <AdminPageSkeleton titleWidth="w-64" descriptionLines={2} hubGrid={ADMIN_SECTIONS.length} />;
  }

  return (
    <div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </p>
      <div className="mt-2 flex items-center gap-2">
        {/* Named like its row in the side menu. What the page is sits behind
            the icon (house rule: no grey sentence stacked under a heading). */}
        <h1 className="font-display text-3xl font-semibold">Overview</h1>
        <InfoTip
          label="Overview"
          text="This week's numbers, then every internal dashboard. Only the ADMIN_EMAILS allowlist can open these pages."
        />
      </div>

      {cockpit.status === 'ready' ? (
        <FounderCockpitView
          cockpit={cockpit.payload.cockpit}
          funnels={cockpit.payload.funnels}
          urgans={cockpit.payload.urgans}
          churn={cockpit.payload.churn}
          sources={cockpit.payload.sources}
        />
      ) : cockpit.status === 'error' ? (
        <p role="alert" className="mt-8 rounded-xl border border-stroke-default bg-bg-surface p-4 text-sm text-content-secondary">
          {cockpit.message}
        </p>
      ) : (
        <div role="status" aria-busy="true" aria-label="Loading this week's numbers" className="mt-8">
          <SkeletonBlock className="h-6 w-32" />
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <SkeletonBlock className="h-32 rounded-xl" />
            <SkeletonBlock className="h-32 rounded-xl" />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 5 }, (_, index) => (
              <SkeletonBlock key={index} className="h-24 rounded-xl" />
            ))}
          </div>
        </div>
      )}

      <h2 className="mt-10 font-display text-lg font-semibold text-content-primary">All dashboards</h2>
      {ADMIN_SECTION_GROUPS.map((group) => (
        <section key={group.key} aria-labelledby={`admin-group-${group.key}`} className="mt-4">
          <h3
            id={`admin-group-${group.key}`}
            className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary"
          >
            {group.label}
          </h3>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sectionsInGroup(group.key).map((section) => {
              const Icon = NAV_ICONS.get(section.key) ?? LayoutDashboard;
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  className="motion-focus group flex items-start gap-3 rounded-lg border border-stroke-default bg-bg-surface p-4 transition-colors hover:bg-bg-hover"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-sm font-semibold text-content-primary">
                      {section.label}
                      <ChevronRight
                        className="h-3.5 w-3.5 text-content-tertiary transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-0.5 block text-sm leading-5 text-content-secondary">
                      {section.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

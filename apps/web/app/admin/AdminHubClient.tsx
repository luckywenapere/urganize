'use client';

// The admin hub overview: the founder cockpit (2026-10-09), then one card per
// internal dashboard. The gate is GET /api/admin/me (verifyAdmin /
// ADMIN_EMAILS) — anyone else bounces to /dashboard, the same shape as the
// other admin page clients. The cockpit loads AFTER the gate from its own route
// (GET /api/admin/cockpit), so the links show at once while its numbers, which
// take a few seconds to work out, fill in above them. A cockpit failure shows
// its own message and never hides the links.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  BellRing,
  ChevronRight,
  ClipboardList,
  Gauge,
  ListMusic,
  Mail,
  Mic,
  TrendingUp,
  Users,
  Building2,
  Link2,
} from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { FounderCockpitView } from '@/components/admin/FounderCockpitView';
import type { FounderCockpit } from '@/lib/founder-cockpit';
import type { AdminReadSource } from '@/lib/admin-read-server';

type CockpitPayload = { cockpit: FounderCockpit; sources: AdminReadSource[] };
type CockpitState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; payload: CockpitPayload };

const SECTIONS: Array<{
  href: string;
  label: string;
  description: string;
  icon: typeof Users;
}> = [
  {
    href: '/admin/scoreboard',
    label: 'Scoreboard',
    description: 'Weekly active paying teams, MRR, second releases, retention, trials and activation, worked out live.',
    icon: Gauge,
  },
  {
    href: '/admin/metrics',
    label: 'Metrics',
    description: 'Who is online now, active people, rollouts and how their plans were made, and who has gone quiet. Updates every minute.',
    icon: Activity,
  },
  {
    href: '/admin/onboarding',
    label: 'Onboarding',
    description: 'What signups pick during the setup wizard — roles, rollout types, where their process breaks.',
    icon: ClipboardList,
  },
  {
    href: '/admin/emails',
    label: 'Emails',
    description: 'Everything Urganize emails, write your own to any group, and the onboarding emails.',
    icon: Mail,
  },
  {
    href: '/admin/notifications',
    label: 'Notifications',
    description: 'Edit the copy and timing for rollout reminders, motivational nudges, and deadline reminders.',
    icon: BellRing,
  },
  {
    href: '/admin/curator-invites',
    label: 'Playlist owners',
    description: 'Invite links for playlist owners, and who has used them.',
    icon: ListMusic,
  },
  {
    href: '/admin/teams',
    label: 'Teams',
    description: 'Trials, wall dates and deals. Extend, comp, or record a payment settled by invoice.',
    icon: Building2,
  },
  {
    href: '/admin/referrals',
    label: 'Referrals',
    description: 'Partner codes, the teams they brought in, and the commission owed each month.',
    icon: Link2,
  },
  {
    href: '/admin/waitlist',
    label: 'Waitlist',
    description: 'Marketing-site waitlist signups — searchable, with role breakdowns.',
    icon: Users,
  },
  {
    href: '/admin/growth',
    label: 'Growth',
    description: 'New accounts each month, and waitlist signups each week.',
    icon: TrendingUp,
  },
  {
    href: '/admin/interviews',
    label: 'Interviews',
    description: 'Artist interview slots booked through the marketing site.',
    icon: Mic,
  },
];

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
        setCockpit({ status: 'ready', payload: { cockpit: body.cockpit, sources: body.sources ?? [] } });
      } catch {
        if (!cancelled) setCockpit({ status: 'error', message: 'Could not work out this week\'s numbers.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checked]);

  if (authLoading || !user || !checked) {
    return <AdminPageSkeleton titleWidth="w-64" descriptionLines={2} hubGrid={SECTIONS.length} />;
  }

  return (
    <div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Internal dashboards</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Everything internal in one place. Access is limited to the ADMIN_EMAILS
        allowlist — these pages have no nav entries in the product itself.
      </p>

      {cockpit.status === 'ready' ? (
        <FounderCockpitView cockpit={cockpit.payload.cockpit} sources={cockpit.payload.sources} />
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
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="motion-focus group flex items-start gap-4 rounded-lg border border-stroke-default bg-bg-surface p-5 transition-colors hover:bg-bg-hover"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
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
                <span className="mt-1 block text-sm leading-5 text-content-secondary">
                  {section.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

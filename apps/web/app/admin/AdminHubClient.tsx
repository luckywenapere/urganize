'use client';

// The admin hub overview: one card per internal dashboard. The gate is
// GET /api/admin/me (verifyAdmin / ADMIN_EMAILS) — anyone else bounces to
// /dashboard, the same shape as the other admin page clients.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeDollarSign,
  BellRing,
  ChevronRight,
  ClipboardList,
  ListMusic,
  Mic,
  Radio,
  TrendingUp,
  Users,
  Building2,
} from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';

const SECTIONS: Array<{
  href: string;
  label: string;
  description: string;
  icon: typeof Users;
}> = [
  {
    href: '/admin/onboarding',
    label: 'Onboarding',
    description: 'What signups pick during the setup wizard — roles, rollout types, where their process breaks.',
    icon: ClipboardList,
  },
  {
    href: '/admin/broadcast',
    label: 'Broadcast',
    description: 'Send a push notification to every device with notifications turned on.',
    icon: Radio,
  },
  {
    href: '/admin/notifications',
    label: 'Notifications',
    description: 'Edit the copy and timing for rollout reminders, motivational nudges, and deadline reminders.',
    icon: BellRing,
  },
  {
    href: '/admin/pricing-validation',
    label: 'Pricing validation',
    description: 'Willingness-to-pay survey responses, by price band and placement.',
    icon: BadgeDollarSign,
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
    href: '/admin/waitlist',
    label: 'Waitlist',
    description: 'Marketing-site waitlist signups — searchable, with role breakdowns.',
    icon: Users,
  },
  {
    href: '/admin/growth',
    label: 'Growth',
    description: 'Cumulative signups per week over the last 12 weeks.',
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

  if (authLoading || !user || !checked) {
    return <AdminPageSkeleton titleWidth="w-64" descriptionLines={2} hubGrid />;
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

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
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

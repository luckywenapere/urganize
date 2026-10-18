'use client';

// /admin/more (2026-10-18, URG-369): every internal dashboard, as rows grouped
// into Numbers / Operations / Content, with runway and default alive on top
// (moved from the Overview: it changes monthly and is typed in by hand). The
// side menu's More row and the Overview's "All dashboards" row both open it.
//
// Gate: GET /api/admin/me (verifyAdmin / ADMIN_EMAILS), anyone else bounces to
// /dashboard, as on every admin page. The runway form saves through
// PUT /api/admin/runway (DELETE to clear), then the cockpit is read again so
// runway is worked out on the server, in one place.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, LayoutDashboard } from '@/components/icons';
import { ADMIN_SECTION_ICONS } from '@/components/admin/AdminNav';
import { ADMIN_SECTION_GROUPS, sectionsInGroup } from '@/lib/admin-sections';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { CockpitSlot } from '@/components/admin/CockpitSlot';
import { RunwayPanel, type RunwayFormValues } from '@/components/admin/RunwayPanel';
import { Card, SectionLabel, Separator } from '@/components/admin/ui';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

async function writeRunway(method: 'PUT' | 'DELETE', values?: RunwayFormValues): Promise<string | null> {
  try {
    const response = await fetch('/api/admin/runway', {
      method,
      headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
      body: values ? JSON.stringify(values) : undefined,
      cache: 'no-store',
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return response.ok ? null : body.error || 'Could not save the figures.';
  } catch {
    return 'Could not save the figures.';
  }
}

export default function MoreAdminPageClient() {
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
        const response = await fetch('/api/admin/me', {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
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
    return <AdminPageSkeleton titleWidth="w-28" table={{ columns: 2, rows: 10 }} />;
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-content-primary">More</h1>

      <CockpitSlot label="runway" skeletonClassName="h-32">
        {(cockpit, reload) =>
          cockpit.runway || !cockpit.runwayReadable ? (
            <RunwayPanel
              runway={cockpit.runway}
              readable={cockpit.runwayReadable}
              onSave={async (values) => {
                const error = await writeRunway('PUT', values);
                if (!error) await reload();
                return error;
              }}
              onClear={async () => {
                const error = await writeRunway('DELETE');
                if (!error) await reload();
                return error;
              }}
            />
          ) : null
        }
      </CockpitSlot>

      {ADMIN_SECTION_GROUPS.map((group) => {
        const sections = sectionsInGroup(group.key);
        return (
          <section key={group.key} aria-labelledby={`more-${group.key}`} className="mt-8">
            <SectionLabel id={`more-${group.key}`}>{group.label}</SectionLabel>
            <Card>
              <ul>
                {sections.map((section, index) => {
                  const Icon = ADMIN_SECTION_ICONS[section.key] ?? LayoutDashboard;
                  return (
                    <li key={section.href}>
                      {index > 0 ? <Separator className="ml-12" /> : null}
                      <Link
                        href={section.href}
                        className="motion-focus group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-hover"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-content-primary">{section.label}</span>
                          <span className="block truncate text-xs text-content-secondary">{section.description}</span>
                        </span>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-content-tertiary transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        );
      })}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleHelp, LogOut, MessageSquare, Search, X } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { useReportIssueStore } from '@/stores/useReportIssueStore';
import { readSettingsFlags, visibleSettingsSegments } from '@/lib/settings-nav';
import { searchSettings } from '@/lib/settings-search';
import { isCreditsEnabled } from '@/lib/credits/config';
import { deskHref, deskMenu, deskPageForSegment, type DeskPage } from '@/lib/settings-desk';
import { useHelpMenuGroups } from '@/components/app/HelpMenu';
import { AvatarFace } from '@/components/shell/swipe/AvatarMenu';
import { useDeskCounts } from './useDeskCounts';

const CREDITS_ON = isCreditsEnabled();
const REPORT_ISSUE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_REPORT_ISSUE === 'true';

/**
 * Settings on a computer (#1226, founder approved docs/mocks/account-team-desktop):
 * a left menu in two groups, "Your team" and "You", and the chosen page on the
 * right. Team, AI credits and Trash keep their own addresses and draw this same
 * frame, so every old link still lands. Phones never mount it.
 */
export function SettingsDesk({
  active,
  title,
  lead,
  actions,
  children,
}: {
  active: DeskPage;
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-[1120px] grid-cols-[220px_minmax(0,1fr)] items-start gap-8 pb-12 pt-2 xl:grid-cols-[240px_minmax(0,1fr)]">
      <DeskMenu active={active} />
      <section className="min-w-0" aria-labelledby="settings-desk-title">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 id="settings-desk-title" className="font-display text-[30px] leading-[38px] text-content-primary">
              {title}
            </h1>
            {lead ? <p className="mt-1 text-sm text-content-secondary">{lead}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-4">{actions}</div> : null}
        </div>
        {children}
      </section>
    </div>
  );
}

function DeskMenu({ active }: { active: DeskPage }) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isAdmin = useWorkspaceIdentityStore((state) => state.isAdmin);
  const teamName = useWorkspaceIdentityStore((state) => state.name);
  const openReportIssue = useReportIssueStore((state) => state.openReportIssue);
  const helpItems = useHelpMenuGroups().flat();
  const flags = useMemo(() => readSettingsFlags(), []);
  const menu = useMemo(
    () => deskMenu({ role: user?.role, isAdmin }, flags, { credits: CREDITS_ON }),
    [user?.role, isAdmin, flags]
  );
  const counts = useDeskCounts(Boolean(user?.id));
  const [query, setQuery] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);

  // Search reuses the settings keyword catalog; a hit opens the page that
  // holds it on this menu, with its section when it has one.
  const visibleSegments = useMemo(
    () => visibleSettingsSegments({ role: user?.role, isAdmin }, flags),
    [user?.role, isAdmin, flags]
  );
  const pages = useMemo(() => new Set(menu.flatMap((group) => group.items.map((item) => item.key))), [menu]);
  const results = useMemo(() => {
    const seen = new Set<string>();
    return searchSettings(query, visibleSegments).flatMap((result) => {
      const page = deskPageForSegment(result.segment, result.section);
      if (!page || !pages.has(page)) return [];
      const href =
        result.section && !deskHref(page).startsWith('/dashboard/team')
          ? `${deskHref(page)}${deskHref(page).includes('?') ? '&' : '?'}section=${encodeURIComponent(result.section)}`
          : deskHref(page);
      const key = `${href}:${result.label}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ href, label: result.label }];
    });
  }, [query, visibleSegments, pages]);

  const name = user?.name || user?.email || '';
  const subline = teamName || user?.email || '';

  return (
    <nav aria-label="Settings" className="sticky top-4">
      <div className="flex items-center gap-3 px-2 pb-4 pt-1">
        <AvatarFace size={40} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-content-primary">{name}</p>
          {subline && subline !== name ? <p className="truncate text-[13px] text-content-secondary">{subline}</p> : null}
        </div>
      </div>

      <label className="mx-1 mb-1 flex h-9 items-center gap-2 rounded-full border border-stroke-default bg-bg-surface px-3 focus-within:border-stroke-control">
        <Search className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('');
          }}
          placeholder="Search settings"
          aria-label="Search settings"
          className="min-w-0 flex-1 bg-transparent text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none"
        />
        {query ? (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-content-tertiary hover:text-content-primary">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </label>

      {query.trim() ? (
        results.length === 0 ? (
          <p className="px-3 py-4 text-sm text-content-secondary">Nothing matches that.</p>
        ) : (
          <ul className="mt-2" aria-label="Search results">
            {results.map((result) => (
              <li key={`${result.href}:${result.label}`}>
                <Link
                  href={result.href}
                  onClick={() => setQuery('')}
                  className="motion-focus flex rounded-[10px] px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                >
                  {result.label}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        menu.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 pt-4 text-xs font-bold uppercase tracking-[0.08em] text-content-tertiary">{group.label}</p>
            <ul>
              {group.items.map((item) => {
                const on = item.key === active;
                const count = item.key === 'team' ? counts.team : item.key === 'trash' ? counts.trash : null;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={on ? 'page' : undefined}
                      className={`motion-focus flex items-center justify-between rounded-[10px] px-3 py-2 text-sm ${
                        on
                          ? 'bg-bg-sidebar-active font-semibold text-content-primary'
                          : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                      }`}
                    >
                      <span>{item.label}</span>
                      {count ? <span className="text-xs font-normal tabular-nums text-content-tertiary">{count}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}

      <div className="mt-4 border-t border-stroke-default pt-3">
        {helpItems.length > 0 ? (
          <>
            <button
              type="button"
              aria-expanded={helpOpen}
              onClick={() => setHelpOpen((open) => !open)}
              className="motion-focus flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
            >
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
              Help
            </button>
            {helpOpen ? (
              <ul className="mb-1 ml-6">
                {helpItems.map((item) => (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => item.onClick()}
                      className="motion-focus flex w-full items-center rounded-[10px] px-3 py-1.5 text-left text-[13px] text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        {REPORT_ISSUE_ENABLED ? (
          <button
            type="button"
            onClick={() => openReportIssue('bug')}
            className="motion-focus flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Send feedback
          </button>
        ) : null}
        <SignOut onDone={() => router.push('/auth')} />
      </div>
    </nav>
  );
}

function SignOut({ onDone }: { onDone: () => void }) {
  const logout = useAuthStore((state) => state.logout);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await logout();
          onDone();
        } finally {
          setBusy(false);
        }
      }}
      className="motion-focus flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      Sign out
    </button>
  );
}

/** Scroll to ?section= once the page under the menu has drawn it. */
export function useDeskSection(section: string | null) {
  useEffect(() => {
    if (!section) return;
    const timer = window.setTimeout(() => {
      document.getElementById(section)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [section]);
}

/** The page's own loading shape: the menu column and a block of rows. */
export function SettingsDeskSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      aria-busy="true"
      className="mx-auto grid w-full max-w-[1120px] grid-cols-[220px_minmax(0,1fr)] items-start gap-8 pb-12 pt-2 xl:grid-cols-[240px_minmax(0,1fr)]"
    >
      <div className="space-y-2 px-2 pt-1">
        <div className="mb-4 flex items-center gap-3">
          <span className="h-10 w-10 animate-pulse rounded-full bg-bg-hover" />
          <span className="h-4 w-24 animate-pulse rounded bg-bg-hover" />
        </div>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((key) => (
          <span key={key} className="block h-8 animate-pulse rounded-[10px] bg-bg-hover/70" />
        ))}
      </div>
      <div>
        <span className="block h-9 w-40 animate-pulse rounded bg-bg-hover" />
        <span className="mt-2 block h-4 w-72 animate-pulse rounded bg-bg-hover" />
        <div className="mt-5 rounded-2xl border border-stroke-default bg-bg-surface">
          {Array.from({ length: rows }, (_, key) => (
            <div key={key} className="flex h-14 items-center gap-4 border-t border-stroke-default px-5 first:border-t-0">
              <span className="h-8 w-8 animate-pulse rounded-full bg-bg-hover" />
              <span className="h-4 w-48 animate-pulse rounded bg-bg-hover" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

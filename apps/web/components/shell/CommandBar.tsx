'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ArrowRight, Disc3, Search, Sparkles } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { appPageHaystack, buildAppPages } from '@/lib/app-pages';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { searchReleases } from '@/lib/release-search';
import { matchesSearchTerms, parseSearchTerms } from '@/lib/task-search';
import { useAuthStore } from '@/lib/auth-store';
import { useChappiStore } from '@/stores/useChappiStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useShellStore } from '@/stores/useShellStore';

type Result = { key: string; group: 'Ask' | 'Pages' | 'Rollouts'; label: string; hint?: string; run: () => void };

const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';
const MAX_PER_GROUP = 6;

/**
 * The search and ask bar (Ctrl or Command K, and the top bar's search button).
 * One box that finds a page, a rollout, or hands the question to UrgAns, which is
 * Deel's "Search for people, pages, apps or ask Deel AI" with our nouns.
 *
 * Asking UrgAns fills the chat's composer and opens the drawer; the person
 * reviews and sends. It never sends for them, so a half-typed search can never
 * spend credits.
 */
export function CommandBar() {
  const open = useShellStore((state) => state.commandOpen);
  const openCommand = useShellStore((state) => state.openCommand);
  const closeCommand = useShellStore((state) => state.closeCommand);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (useShellStore.getState().commandOpen) closeCommand();
        else openCommand();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAuthenticated, openCommand, closeCommand]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(<CommandPalette onClose={closeCommand} />, document.body);
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const releases = useReleaseStore((state) => state.releases);
  const hasCuratorProfile = useAuthStore((state) => state.hasCuratorProfile);
  const setInput = useChappiStore((state) => state.setInput);
  const setRailOpen = useChappiStore((state) => state.setRailOpen);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo<Result[]>(() => {
    const terms = parseSearchTerms(query);
    const out: Result[] = [];

    if (CHAPPI_ENABLED && query.trim()) {
      out.push({
        key: 'ask',
        group: 'Ask',
        label: `Ask UrgAns: ${query.trim()}`,
        run: () => {
          setInput(query.trim());
          if (window.matchMedia('(min-width: 1024px)').matches) setRailOpen(true);
          else router.push('/dashboard/urgans');
        },
      });
    }

    const pages = buildAppPages({ hasCuratorProfile }).filter(
      (page) => terms.length === 0 || matchesSearchTerms(appPageHaystack(page), terms)
    );
    for (const page of pages.slice(0, MAX_PER_GROUP)) {
      out.push({
        key: `page-${page.key}`,
        group: 'Pages',
        label: page.label,
        run: () => {
          if (page.leavesRelease) leaveReleaseForCatalog();
          router.push(page.href);
        },
      });
    }

    if (terms.length > 0) {
      const found = searchReleases(
        releases.map((release) => ({ release })),
        query
      ).slice(0, MAX_PER_GROUP);
      for (const { release } of found) {
        out.push({
          key: `release-${release.id}`,
          group: 'Rollouts',
          label: release.title,
          hint: release.artistName ?? undefined,
          run: () => router.push(`/dashboard?release=${release.id}`),
        });
      }
    }
    return out;
  }, [query, releases, hasCuratorProfile, setInput, setRailOpen, router]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (result: Result | undefined) => {
    if (!result) return;
    onClose();
    result.run();
  };

  const groups = ['Ask', 'Pages', 'Rollouts'] as const;

  return (
    <div className="fixed inset-0 z-[170] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <DialogPanel
        label="Search or ask UrgAns"
        onClose={onClose}
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface shadow-lg"
      >
        <div className="flex items-center gap-3 border-b border-stroke-subtle px-4">
          <Search className="h-5 w-5 shrink-0 text-content-tertiary" aria-hidden="true" />
          <input
            data-autofocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((value) => Math.min(value + 1, results.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                choose(results[active]);
              }
            }}
            placeholder="Search rollouts and pages, or ask UrgAns"
            aria-label="Search rollouts and pages, or ask UrgAns"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-content-primary outline-none placeholder:text-content-tertiary"
          />
        </div>
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-content-secondary">Nothing found. Try another word.</li>
          ) : null}
          {groups.map((group) => {
            const items = results.filter((result) => result.group === group);
            if (items.length === 0) return null;
            return (
              <li key={group}>
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">
                  {group}
                </p>
                <ul>
                  {items.map((result) => {
                    const index = results.indexOf(result);
                    const isActive = index === active;
                    const Icon = group === 'Ask' ? Sparkles : group === 'Rollouts' ? Disc3 : ArrowRight;
                    return (
                      <li key={result.key}>
                        <button
                          type="button"
                          data-active={isActive}
                          onMouseMove={() => setActive(index)}
                          onClick={() => choose(result)}
                          className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm ${
                            isActive ? 'bg-bg-hover text-content-primary' : 'text-content-secondary'
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{result.label}</span>
                          {result.hint ? (
                            <span className="shrink-0 text-xs text-content-tertiary">{result.hint}</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </DialogPanel>
    </div>
  );
}

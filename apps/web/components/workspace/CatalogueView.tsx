'use client';

import { PullReveal } from '@/components/shared/PullReveal';
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import Image from 'next/image';
import { ChevronDown, Plus, Search, X } from '@/components/icons';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shell/PageHeader';
import {
  SORT_OPTIONS,
  STATUS_FILTERS,
  filterCatalogueRows,
  progressPercent,
  sortCatalogueRows,
  statusCounts,
  statusGroup,
  type CatalogueRow,
  type SortKey,
  type StatusFilterKey,
} from '@/lib/catalogue-table';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { useShellStore } from '@/stores/useShellStore';
import { WorkspaceReleaseCard } from './WorkspaceReleaseCard';
import type { TestReleaseEntry } from './catalogue-types';
import type { Release } from '@/types/releases';

type CatalogueViewProps = {
  rows: CatalogueRow[];
  onOpen: (releaseId: string) => void;
  onCreate: () => void;
  testRelease?: TestReleaseEntry;
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  planning: 'Planning',
  in_progress: 'In progress',
  ready: 'Ready',
  released: 'Released',
  archived: 'Archived',
};

/** Tone per status group, as a coloured dot and a soft tinted pill (Deel's
 *  "Active / Invited / Onboarding" pills in our status colours). */
const STATUS_TONE: Record<ReturnType<typeof statusGroup>, string> = {
  planning: 'bg-status-info/10 text-status-info',
  active: 'bg-brand/10 text-brand',
  released: 'bg-status-success/10 text-status-success',
  archived: 'bg-bg-hover text-content-tertiary',
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[statusGroup(status)]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABEL[status] ?? status.replace(/_/g, ' ')}
    </span>
  );
}

function Cover({ row, className }: { row: CatalogueRow; className: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const show = Boolean(row.coverArtUrl) && row.coverArtUrl !== failed;
  return (
    <span className={`relative shrink-0 overflow-hidden rounded-lg bg-bg-elevated ${className}`} aria-hidden="true">
      {show ? (
        <Image
          src={row.coverArtUrl as string}
          alt=""
          fill
          sizes="56px"
          unoptimized
          className="object-cover"
          onError={() => setFailed(row.coverArtUrl)}
        />
      ) : (
        <span className="grid h-full w-full place-items-center">
          <Image
            src="/images/urganize-mark.png"
            alt=""
            width={161}
            height={173}
            className="app-wordmark h-4 w-auto opacity-35"
          />
        </span>
      )}
    </span>
  );
}

function ProgressBar({ row }: { row: CatalogueRow }) {
  const percent = progressPercent(row);
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-full min-w-[56px] max-w-[120px] rounded-full bg-stroke-strong" aria-hidden="true">
        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
      <span className="shrink-0 font-mono text-xs tabular-nums text-content-secondary">
        {row.tasksDone}/{row.tasksTotal}
      </span>
    </div>
  );
}

function nextUpLabel(row: CatalogueRow): ReactNode {
  if (row.tasksTotal === 0) return <span className="text-content-tertiary">No activities yet</span>;
  if (!row.nextTask) return <span className="text-status-success">All done</span>;
  const due = formatDate(row.nextTask.dueDate);
  return (
    <span className="block min-w-0">
      <span className="block truncate text-sm text-content-primary">{row.nextTask.title}</span>
      {due ? <span className="block text-xs text-content-tertiary">{due}</span> : null}
    </span>
  );
}

/** The search and filter bar appears only above this many rollouts. */
const FILTER_BAR_MIN_ROWS = 20;

const COLUMNS =
  'md:grid-cols-[minmax(240px,2.4fr)_130px_130px_minmax(150px,1fr)_minmax(180px,1.6fr)]';

/**
 * The Catalogue at rest (design overhaul, 2026-10-04): Deel's People table with
 * our nouns. A page title and the one primary action, a filter bar (search,
 * status chips, sort), then one dense row per rollout.
 *
 * The artist comes from the top bar, so choosing Dorian there narrows this to
 * Dorian's rollouts without a second control here; a small chip says so and lets
 * you clear it from here too.
 *
 * Below `md` the rows become cards (cover, title, status, progress, next up),
 * because a six-column table on a phone is a horizontal scroll nobody wants. At
 * `md` and up a toggle swaps the table for the cover-art grid.
 *
 * A row is a real link, so middle-click and "open in a new tab" work; a plain
 * click goes through `onOpen` (WorkspaceView's own scope logic, which remembers
 * scenes and clears the right params).
 */
export function CatalogueView({ rows, onOpen, onCreate, testRelease }: CatalogueViewProps) {
  const selectedArtistId = useShellStore((state) => state.selectedArtistId);
  const setSelectedArtistId = useShellStore((state) => state.setSelectedArtistId);
  const artists = useArtistRosterStore((state) => state.artists);
  const [queryState, setQuery] = useState('');
  const [statusState, setStatus] = useState<StatusFilterKey>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  // The filter bar only earns its place once the list is long enough to need it.
  const showFilters = rows.length > FILTER_BAR_MIN_ROWS;
  const query = showFilters ? queryState : '';
  const status: StatusFilterKey = showFilters ? statusState : 'all';
  const [view, setView] = useState<'table' | 'cards'>('table');

  const artistName = artists.find((artist) => artist.id === selectedArtistId)?.name ?? null;
  const base = { query, artistId: selectedArtistId };
  const visible = useMemo(
    () => sortCatalogueRows(filterCatalogueRows(rows, { ...base, status }), sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, query, selectedArtistId, status, sort]
  );
  const counts = useMemo(
    () => statusCounts(rows, base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, query, selectedArtistId]
  );

  const addButton = (
    <button
      type="button"
      onClick={onCreate}
      disabled={testRelease?.isStarting}
      data-tour="new-rollout"
      className="motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 rounded-full bg-content-primary px-4 text-sm font-semibold text-content-inverse hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add rollout
    </button>
  );

  const open = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onOpen(id);
  };

  if (rows.length === 0) {
    return (
      <div>
        <EmptyState
          mascot="resting"
          title="No rollouts yet"
          description="Create your first rollout to start planning activities."
          action={
            <div className="flex flex-col items-center gap-2.5">
              {addButton}
              {testRelease ? (
                <>
                  <button
                    type="button"
                    onClick={testRelease.start}
                    disabled={testRelease.isStarting}
                    className="motion-focus motion-press inline-flex h-10 items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {testRelease.isStarting ? 'Setting up your test rollout…' : 'Try a test rollout'}
                  </button>
                  {testRelease.error ? (
                    <p role="alert" className="text-xs text-status-error">
                      {testRelease.error}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div>
      {artistName ? (
        <PageHeader
          description={
            <span className="inline-flex items-center gap-2">
              Showing {artistName}
              <button
                type="button"
                onClick={() => setSelectedArtistId(null)}
                className="motion-focus inline-flex items-center gap-1 rounded-full bg-bg-hover px-2 py-0.5 text-xs text-content-secondary hover:text-content-primary"
              >
                Show all artists
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          }
        />
      ) : (
        <div className="pt-5 sm:pt-6" />
      )}

      {showFilters ? (
      <PullReveal filtering={Boolean(query.trim()) || status !== 'all'}>
      <div className="mb-4 rounded-2xl border border-stroke-default bg-bg-surface p-3 sm:mb-0 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="relative w-full sm:min-w-[200px] sm:max-w-xs sm:flex-1">
            <span className="sr-only">Search rollouts</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search rollouts"
              className="h-11 w-full rounded-full border border-stroke-control bg-bg-base pl-10 pr-4 text-base text-content-primary placeholder:text-content-tertiary hover:border-content-secondary"
            />
          </label>

          <div
            role="group"
            aria-label="Filter by status"
            className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
          >
            {STATUS_FILTERS.map((filter) => {
              const active = status === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setStatus(filter.key)}
                  aria-pressed={active}
                  className={`motion-focus motion-press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors ${
                    active
                      ? 'border-content-primary bg-bg-base text-content-primary'
                      : 'border-stroke-control text-content-secondary hover:border-content-secondary hover:text-content-primary'
                  }`}
                >
                  {filter.label}
                  <span className="font-mono text-xs tabular-nums text-content-tertiary">{counts[filter.key]}</span>
                </button>
              );
            })}
          </div>

          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <label className="flex w-full items-center gap-2 text-sm text-content-secondary sm:w-auto">
              <span className="sr-only sm:not-sr-only">Sort</span>
              <span className="relative inline-flex w-full sm:w-auto">
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className="h-11 w-full appearance-none rounded-full sm:w-auto border border-stroke-control bg-bg-base pl-4 pr-10 text-base text-content-primary hover:border-content-secondary"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
                aria-hidden="true"
              />
              </span>
            </label>
            <div role="group" aria-label="Layout" className="hidden items-center rounded-full border border-stroke-control p-0.5 md:flex">
              {(['table', 'cards'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  aria-pressed={view === option}
                  className={`motion-focus h-10 rounded-full px-3.5 text-sm font-medium ${
                    view === option ? 'bg-bg-hover text-content-primary' : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {option === 'table' ? 'Table' : 'Cards'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      </PullReveal>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <p className="text-sm text-content-secondary" aria-live="polite">
            Total {visible.length} {visible.length === 1 ? 'rollout' : 'rollouts'}
          </p>
          {addButton}
        </div>

        {visible.length === 0 ? (
          <div className="border-t border-stroke-subtle px-5 py-10">
            <EmptyState
              title="No rollouts match that"
              description="Try a different word or filter, or clear them to see everything."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setStatus('all');
                  }}
                  className="motion-focus motion-press inline-flex h-10 items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover"
                >
                  Clear filters
                </button>
              }
            />
          </div>
        ) : view === 'cards' ? (
          <div className="hidden grid-cols-2 gap-4 border-t border-stroke-subtle p-4 md:grid xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((row) => (
              <WorkspaceReleaseCard
                key={row.id}
                release={{
                  id: row.id,
                  title: row.title,
                  artistName: row.artistName ?? '',
                  status: row.status as Release['status'],
                  releaseDate: row.releaseDate,
                }}
                tasksDone={row.tasksDone}
                tasksTotal={row.tasksTotal}
                selected={false}
                onSelect={onOpen}
                coverArtUrl={row.coverArtUrl}
                isTest={row.isTest}
              />
            ))}
          </div>
        ) : null}

        {visible.length > 0 ? (
          <div className={view === 'cards' ? 'md:hidden' : ''}>
            <div
              role="row"
              className={`hidden border-y border-stroke-subtle px-5 py-3 text-xs font-medium text-content-tertiary md:grid md:gap-4 ${COLUMNS}`}
            >
              <span role="columnheader">Rollout</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Release date</span>
              <span role="columnheader">Progress</span>
              <span role="columnheader">Next up</span>
            </div>
            <ul role="rowgroup" className="divide-y divide-stroke-subtle">
              {visible.map((row, rowIndex) => {
                const date = formatDate(row.releaseDate);
                return (
                  <li key={row.id} role="row">
                    <a
                      data-tour={rowIndex === 0 ? 'release-card' : undefined}
                      href={`/dashboard?release=${row.id}`}
                      onClick={(event) => open(event, row.id)}
                      className={`motion-focus grid gap-3 px-4 py-4 hover:bg-bg-hover/50 sm:px-5 md:items-center md:gap-4 ${COLUMNS}`}
                    >
                      <span role="cell" className="flex min-w-0 items-center gap-3.5">
                        <Cover row={row} className="h-14 w-14" />
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium text-content-primary">{row.title}</span>
                            {row.isTest ? (
                              <span className="rounded-full border border-stroke-default px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-content-tertiary">
                                Test
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-sm text-content-secondary">
                            {row.artistName || 'Unassigned artist'}
                          </span>
                        </span>
                      </span>
                      <span role="cell" className="flex items-center justify-between gap-3 md:block">
                        <StatusPill status={row.status} />
                        <span className="text-sm text-content-secondary md:hidden">{date ?? ''}</span>
                      </span>
                      <span role="cell" className="hidden text-sm text-content-primary md:block">
                        {date ?? <span className="text-content-tertiary">No date yet</span>}
                      </span>
                      <span role="cell">
                        <ProgressBar row={row} />
                      </span>
                      <span role="cell" className="min-w-0">
                        {nextUpLabel(row)}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

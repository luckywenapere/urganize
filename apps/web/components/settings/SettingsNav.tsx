'use client';

import type { ComponentType, KeyboardEvent } from 'react';
import {
  BadgeDollarSign,
  BellRing,
  ChevronRight,
  Globe,
  LogOut,
  Palette,
  Plug,
  Search,
  ShieldCheck,
  Sparkles,
  UserCircle,
  Users,
  X,
  type LucideProps,
} from '@/components/icons';
import {
  SETTINGS_SEGMENT_HINTS,
  SETTINGS_SEGMENT_LABELS,
  type SettingsSegment,
} from '@/lib/settings-nav';
import type { SettingsSearchResult } from '@/lib/settings-search';

const SEGMENT_ICONS: Record<SettingsSegment, ComponentType<LucideProps>> = {
  general: UserCircle,
  notifications: BellRing,
  team: Users,
  artists: Palette,
  urgans: Sparkles,
  directory: Globe,
  billing: BadgeDollarSign,
  connections: Plug,
  security: ShieldCheck,
};

/** Shared by the search box and the pop-up's own text fields. Not the app's
 *  `.input` class: its fill is white at 4%, which vanishes on paper mode's
 *  cream, and its radius outranks `rounded-xl` (the ShareSheet found both). A
 *  bg-base well reads as a field in either theme. */
const SEARCH_CLASS =
  'block h-10 w-full rounded-xl border border-stroke-default bg-bg-base pl-9 pr-9 text-sm text-content-primary transition-[border-color,box-shadow] duration-200 placeholder:text-content-tertiary hover:border-stroke-strong focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/15';

type SettingsNavProps = {
  visible: readonly SettingsSegment[];
  /** Highlighted row. Only meaningful in the wide layout, where a pane is
   *  showing beside the list; on a phone the list stands alone. */
  active: SettingsSegment | null;
  query: string;
  onQueryChange: (query: string) => void;
  results: SettingsSearchResult[];
  onSelect: (segment: SettingsSegment, section?: string | null) => void;
  onClose: () => void;
  email: string;
  onLogout: () => void;
  isLogoutPending: boolean;
};

/**
 * The left column: close, search, the segment list, and Log out pinned to the
 * foot. On a phone it IS the first screen (a title replaces the bare close
 * button, and each row carries a one-line hint and a chevron, since a bare word
 * is a thin thing to tap); on a wide screen it sits beside the pane and the
 * hints drop away.
 *
 * Log out lives here rather than inside a segment, so it is one tap from any of
 * them and there is never a moment in Settings where it is out of reach.
 */
export function SettingsNav({
  visible,
  active,
  query,
  onQueryChange,
  results,
  onSelect,
  onClose,
  email,
  onLogout,
  isLogoutPending,
}: SettingsNavProps) {
  const searching = query.trim().length > 0;

  // Escape clears a query before it closes anything — the box is the one thing
  // in the pop-up with its own idea of what Escape means, and closing the whole
  // pop-up on a person who only meant to empty the box is the surprising half.
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && query) {
      event.stopPropagation();
      onQueryChange('');
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col sm:w-[260px] sm:flex-none sm:border-r sm:border-stroke-subtle">
      <div className="flex shrink-0 flex-row-reverse items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:flex-row sm:justify-start sm:px-4 sm:pt-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="motion-focus motion-press grid h-9 w-9 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <h2 className="font-display text-xl font-semibold tracking-tight text-content-primary sm:sr-only">
          Settings
        </h2>
      </div>

      <div className="shrink-0 px-4 pb-3">
        <label className="relative block">
          <span className="sr-only">Search settings</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search settings"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            // Deliberately NOT autofocused: focusing a field on open raises the
            // phone keyboard over the list it is meant to search, and iOS zooms
            // the page for anything it deems too small.
            className={SEARCH_CLASS}
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
              className="motion-focus absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </div>

      <nav
        aria-label="Settings sections"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 sm:px-3"
      >
        {searching ? (
          results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-content-secondary">
              Nothing matches &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <ul>
              {results.map((result) => (
                <li key={`${result.segment}/${result.section ?? ''}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(result.segment, result.section)}
                    className="motion-focus flex w-full flex-col items-start rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-bg-hover"
                  >
                    <span className="text-sm text-content-primary">{result.label}</span>
                    <span className="text-xs text-content-tertiary">{result.segmentLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <ul>
            {visible.map((segment) => {
              const Icon = SEGMENT_ICONS[segment];
              const isActive = active === segment;
              return (
                <li key={segment}>
                  <button
                    type="button"
                    onClick={() => onSelect(segment)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`motion-focus mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors sm:py-2 ${
                      isActive
                        ? 'bg-brand/10 text-brand'
                        : 'text-content-primary hover:bg-bg-hover sm:text-content-secondary sm:hover:text-content-primary'
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] sm:text-sm">
                        {SETTINGS_SEGMENT_LABELS[segment]}
                      </span>
                      <span className="block truncate text-xs text-content-tertiary sm:hidden">
                        {SETTINGS_SEGMENT_HINTS[segment]}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-content-tertiary sm:hidden"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="shrink-0 border-t border-stroke-subtle px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {email ? (
          <p className="mb-2 truncate text-xs text-content-tertiary">Signed in as {email}</p>
        ) : null}
        <button
          type="button"
          onClick={onLogout}
          disabled={isLogoutPending}
          className="motion-focus motion-press inline-flex h-10 w-full items-center gap-2 rounded-lg border border-stroke-default bg-bg-surface px-3 text-sm font-medium text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
        >
          <LogOut className="h-4 w-4 text-content-tertiary" aria-hidden="true" />
          {isLogoutPending ? 'Logging out…' : 'Log out'}
        </button>
      </div>
    </div>
  );
}

'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, X } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import {
  SETTINGS_MENU,
  SETTINGS_SEGMENT_LABELS,
  readSettingsFlags,
  readSettingsRequest,
  resolveDesktopSegment,
  resolveSettingsView,
  visibleSettingsSegments,
  type SettingsSegment,
} from '@/lib/settings-nav';
import { decideSettingsClose } from '@/lib/settings-dirty';
import { searchSettings } from '@/lib/settings-search';
import { useSettingsDirtyStore } from '@/stores/useSettingsDirtyStore';
import { getAccessToken } from './getAccessToken';
import { SettingsNav } from './SettingsNav';
import { useCloseSettings, useOpenSettings } from './useOpenSettings';
import { useIsWide } from './useIsWide';
import { useTeammates } from './useTeammates';
import { useWorkspaceSettings } from './useWorkspaceSettings';
import { ArtistsBrandSegment } from './segments/ArtistsBrandSegment';
import { BillingSegment } from './segments/BillingSegment';
import { ConnectionsSegment } from './segments/ConnectionsSegment';
import { DirectorySegment } from './segments/DirectorySegment';
import { GeneralSegment } from './segments/GeneralSegment';
import { NotificationsSegment } from './segments/NotificationsSegment';
import { SecuritySegment } from './segments/SecuritySegment';
import { TeamSegment } from './segments/TeamSegment';
import { UrgansSegment } from './segments/UrgansSegment';

/**
 * The settings pop-up (2026-09-29). Settings used to be a page at /settings with
 * four tabs, and the Account tab alone stacked thirteen sections. Founder call:
 * make it work like ChatGPT's — a pop-up over the page you are on, a left list of
 * focused segments, one pane, a search box, an X.
 *
 * Mounted ONCE by AppShell (on pages that carry app chrome) and opened by the
 * URL: `?settings=<segment>` plus an optional `&section=<id>`. Nothing is
 * mirrored into state — refresh, Back, a typed URL and every old `/settings…`
 * link (through the redirect stub) all resolve through the one read below, the
 * `useSceneOverlay` model. That read is inside its own Suspense boundary so it
 * cannot pull `/auth`, `/onboarding`, `/settings` or `/dashboard` out of static
 * prerendering.
 *
 * Layout: at `sm` and up the list and the pane sit side by side; below it the
 * pop-up is a full screen showing the list, and tapping a row drills into that
 * segment with a back arrow (the iOS / ChatGPT mobile shape).
 *
 * Sheet mechanics follow the house contract (ShareSheet): portal to
 * document.body because AppShell's lazy-fade transform would otherwise make
 * `position: fixed` relative to it, the shared ref-counted body scroll lock,
 * Escape and Tab handled on the dialog itself so one keypress can never close
 * two things, and z-[170]. While it holds the scroll lock the first-rollout
 * prompt, the catalog tour and the first-share offer decline to fire, which is
 * the intended reading of `isBodyScrollLocked()`.
 */

export function SettingsModalHost() {
  return (
    <Suspense fallback={null}>
      <SettingsModalGate />
    </Suspense>
  );
}

function SettingsModalGate() {
  const searchParams = useSearchParams();
  const state = readSettingsRequest(searchParams);
  const user = useAuthStore((s) => s.user);

  if (!state || !user || typeof document === 'undefined') return null;
  return createPortal(
    <SettingsDialog request={state.request} section={state.section} />,
    document.body
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function SettingsDialog({
  request,
  section,
}: {
  request: Parameters<typeof resolveSettingsView>[0];
  section: string | null;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const userId = user?.id ?? '';

  const closeSettings = useCloseSettings();
  const openSettings = useOpenSettings();
  const wide = useIsWide();

  const flags = useMemo(() => readSettingsFlags(), []);
  const visible = useMemo(
    () => visibleSettingsSegments({ role: user?.role }, flags),
    [user?.role, flags]
  );

  const view = resolveSettingsView(request, visible);
  // Wide: always a segment, since list and pane share the screen. Phone: the
  // list is its own screen, so "no segment" is a real state.
  const shown: SettingsSegment | null = wide
    ? resolveDesktopSegment(view, visible)
    : view === SETTINGS_MENU
      ? null
      : view;

  // Segments a person has opened stay mounted (hidden) until the pop-up closes,
  // which is what keeps a half-typed draft alive across a segment switch and
  // spares the segment's fetches from running twice. State adjusted during
  // render rather than in an effect: React re-renders immediately with the new
  // value, so no frame ever paints the segment missing.
  const [visited, setVisited] = useState<SettingsSegment[]>([]);
  if (shown && !visited.includes(shown)) setVisited([...visited, shown]);

  // ── Data the manager segments share ───────────────────────────────────────
  // Resolved once per open, and only fetched for the accounts that get the
  // segments that read it, so a teammate opening Settings pays for neither.
  const [accessToken, setAccessToken] = useState('');
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void getAccessToken().then((token) => {
      if (!cancelled) setAccessToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const teammates = useTeammates(visible.includes('team') ? userId : '', accessToken);
  const workspace = useWorkspaceSettings(visible.includes('artists') ? userId : '', accessToken);

  // ── Search ────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchSettings(query, visible), [query, visible]);

  // ── Closing, and the "discard changes?" question ──────────────────────────
  const dirtyKeys = useSettingsDirtyStore((s) => s.keys);
  const resetDirty = useSettingsDirtyStore((s) => s.reset);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  useEffect(() => lockBodyScroll(), []);
  // A stale mark must never survive the pop-up: the fields that set it are gone.
  useEffect(() => () => resetDirty(), [resetDirty]);

  const requestClose = useCallback(() => {
    if (decideSettingsClose(dirtyKeys) === 'confirm') {
      setConfirmingDiscard(true);
      return;
    }
    closeSettings();
  }, [dirtyKeys, closeSettings]);

  const discardAndClose = () => {
    setConfirmingDiscard(false);
    resetDirty();
    closeSettings();
  };

  // ── Focus, keyboard ───────────────────────────────────────────────────────
  const panelRef = useRef<HTMLDivElement>(null);
  // The "Discard changes?" prompt sits inside this panel, so while it is up it
  // is the dialog that owns Tab. Trapping against the whole panel let Tab walk
  // off the prompt into the settings behind its scrim.
  const discardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (confirmingDiscard) setConfirmingDiscard(false);
      else requestClose();
      return;
    }
    const container = (confirmingDiscard ? discardRef.current : null) ?? panelRef.current;
    if (event.key !== 'Tab' || !container) return;
    // Keep Tab inside: the page behind is inert while this is open.
    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // ── Deep link: scroll to a section once its segment is showing ────────────
  // Retried a few times because most sections render a skeleton until their own
  // fetch resolves, and scrolling to an id that is not there yet lands nowhere.
  const paneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!section || !shown) return;
    const timers: number[] = [];
    let done = false;
    const attempt = () => {
      if (done) return;
      const target = document.getElementById(section);
      if (target && paneRef.current?.contains(target)) {
        done = true;
        target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    };
    for (const delay of [0, 250, 800, 1600]) timers.push(window.setTimeout(attempt, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [section, shown]);

  // A section id belongs to the segment it was asked for; picking another
  // segment must not carry a stale one along (openSettings drops it).
  const select = (segment: SettingsSegment, targetSection?: string | null) => {
    setQuery('');
    openSettings({ segment, section: targetSection ?? null });
  };

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      resetDirty();
      router.push('/auth');
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (visible.length === 0) return null;

  const showNav = wide || shown === null;
  const showPane = shown !== null;

  const renderSegment = (segment: SettingsSegment) => {
    switch (segment) {
      case 'general':
        return <GeneralSegment />;
      case 'notifications':
        return <NotificationsSegment />;
      case 'team':
        return (
          <TeamSegment
            teammates={teammates.teammates}
            isLoadingTeammates={teammates.isLoadingTeammates}
            onTeammatesChange={teammates.setTeammates}
            onRefetch={teammates.refetch}
            seatLimit={teammates.seatLimit}
            artists={workspace.artists}
          />
        );
      case 'artists':
        return <ArtistsBrandSegment workspace={workspace} />;
      case 'urgans':
        return <UrgansSegment />;
      case 'directory':
        return <DirectorySegment />;
      case 'billing':
        return <BillingSegment />;
      case 'connections':
        return <ConnectionsSegment />;
      case 'security':
        return <SecuritySegment />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[170] bg-bg-surface sm:flex sm:items-center sm:justify-center sm:bg-black/55 sm:p-6 sm:backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        // focus-visible:outline-none, not a bare outline-none: the panel takes
        // focus only to carry the keyboard in, and the app-wide :focus-visible
        // ring outranks a plain outline-none (the ShareSheet found this).
        className="task-outcome-sheet relative flex h-full w-full flex-col overflow-hidden bg-bg-surface outline-none focus-visible:outline-none sm:h-[min(640px,88dvh)] sm:max-w-[900px] sm:flex-row sm:rounded-2xl sm:border sm:border-stroke-strong sm:shadow-[0_28px_80px_-38px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))]"
      >
        {showNav ? (
          <SettingsNav
            visible={visible}
            active={shown}
            query={query}
            onQueryChange={setQuery}
            results={results}
            onSelect={select}
            onClose={requestClose}
            email={user?.email ?? ''}
            onLogout={() => void handleLogout()}
            isLogoutPending={isLoggingOut}
          />
        ) : null}

        {/* Always mounted once anything has been opened, only hidden while the
            phone shows its list, so a draft outlives a trip back to the list. */}
        <div className={showPane ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'hidden'}>
          {shown ? (
            <div className="flex shrink-0 items-center gap-1 border-b border-stroke-subtle px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pb-4 sm:pt-5">
              <button
                type="button"
                onClick={() => openSettings({ segment: SETTINGS_MENU })}
                aria-label="Back to all settings"
                className="motion-focus motion-press -ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary sm:hidden"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <h2 className="min-w-0 flex-1 truncate font-display text-xl font-semibold tracking-tight text-content-primary">
                {SETTINGS_SEGMENT_LABELS[shown]}
              </h2>
              {/* The list's own X is offscreen while a segment shows on a
                  phone, so the pane carries one too. On a wide screen the list
                  (always showing) holds the only one. */}
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close settings"
                className="motion-focus motion-press grid h-9 w-9 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary sm:hidden"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <div
            ref={paneRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6"
          >
            {visited.map((segment) => (
              <div key={segment} hidden={segment !== shown}>
                {renderSegment(segment)}
              </div>
            ))}
          </div>
        </div>

        {confirmingDiscard ? (
          <div
            className="absolute inset-0 z-10 grid place-items-center bg-black/45 p-6"
            onClick={(event) => {
              if (event.target === event.currentTarget) setConfirmingDiscard(false);
            }}
          >
            <div
              ref={discardRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="settings-discard-title"
              className="w-full max-w-sm rounded-2xl border border-stroke-strong bg-bg-surface p-5 shadow-xl"
            >
              <h3 id="settings-discard-title" className="font-display text-lg font-semibold text-content-primary">
                Discard changes?
              </h3>
              <p className="mt-1 text-sm text-content-secondary">
                You have changes that are not saved yet. If you close now, they are lost.
              </p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={discardAndClose}
                  className="motion-focus motion-press h-10 rounded-lg border border-stroke-default bg-bg-surface px-4 text-sm font-medium text-content-primary hover:bg-bg-hover"
                >
                  Discard
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setConfirmingDiscard(false)}
                  className="motion-focus motion-press h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                >
                  Keep editing
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

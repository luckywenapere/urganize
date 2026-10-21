'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, X } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import {
  SETTINGS_MENU,
  SETTINGS_SEGMENT_LABELS,
  closeSettingsUrl,
  SETTINGS_PARAM,
  isPlainLeftClick,
  readSettingsFlags,
  readSettingsRequest,
  resolveDesktopSegment,
  resolveSettingsView,
  settingsLeaveHref,
  visibleSettingsSegments,
  type SettingsSegment,
} from '@/lib/settings-nav';
import { decideSettingsClose } from '@/lib/settings-dirty';
import { clearSettingsEntryMark, clearSettingsSegmentEntries, decideSettingsPopstate } from '@/lib/settings-history';
import { searchSettings } from '@/lib/settings-search';
import { useSettingsDirtyStore } from '@/stores/useSettingsDirtyStore';
import { getAccessToken } from './getAccessToken';
import { SettingsNav } from './SettingsNav';
import { useCloseSettings, useOpenSettings, writeSettingsUrl } from './useOpenSettings';
import { useIsWide } from './useIsWide';
import { useTeammates } from './useTeammates';
import { useWorkspaceSettings } from './useWorkspaceSettings';
import { AdminSegment } from './segments/AdminSegment';
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
 * prompt and the first-share offer decline to fire, which is
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
  const isAdmin = useWorkspaceIdentityStore((s) => s.isAdmin);
  const userId = user?.id ?? '';

  const closeSettings = useCloseSettings();
  const openSettings = useOpenSettings();
  const wide = useIsWide();

  const flags = useMemo(() => readSettingsFlags(), []);
  const visible = useMemo(
    () => visibleSettingsSegments({ role: user?.role, isAdmin }, flags),
    [user?.role, isAdmin, flags]
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

  // Where to go once "Discard" is confirmed, when the close was really a
  // navigation (a link inside the pop-up) rather than a plain close.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Leaving for another page from inside the pop-up. The open-Settings URL is
  // REPLACED with the page's own URL first and the destination pushed after, so
  // history reads [page, destination]. Pushing straight from the open URL left
  // an "open Settings" entry behind, and Back (or a redirect that replaced the
  // destination) walked the person into Settings again — the report that Home
  // "finds a way back to settings".
  const leaveTo = useCallback(
    (href: string) => {
      resetDirty();
      clearSettingsEntryMark();
      writeSettingsUrl(closeSettingsUrl(window.location.pathname, window.location.search), 'replace');
      router.push(href);
    },
    [resetDirty, router]
  );

  const discardAndClose = () => {
    setConfirmingDiscard(false);
    if (pendingHref) {
      const href = pendingHref;
      setPendingHref(null);
      leaveTo(href);
      return;
    }
    resetDirty();
    closeSettings();
  };

  // The OS back-swipe (or Back) while the pop-up is open pops its history entry.
  // With unsaved edits that must ask first: put the entry back and show the
  // "Discard changes?" prompt; with none, let it close.
  const dirtyRef = useRef(false);
  const lastOpenUrl = useRef('');
  useEffect(() => {
    dirtyRef.current = decideSettingsClose(dirtyKeys) === 'confirm';
    lastOpenUrl.current = `${window.location.pathname}${window.location.search}`;
  });
  useEffect(() => {
    const onPop = () => {
      const action = decideSettingsPopstate({
        settingsInUrl: new URLSearchParams(window.location.search).has(SETTINGS_PARAM),
        dirty: dirtyRef.current,
      });
      if (action === 'closed') clearSettingsEntryMark();
      // Back from a segment to the menu used up the segment's entry.
      if (new URLSearchParams(window.location.search).get(SETTINGS_PARAM) === 'menu') clearSettingsSegmentEntries();
      if (action === 'reprompt' && lastOpenUrl.current) {
        writeSettingsUrl(lastOpenUrl.current, 'push');
        setConfirmingDiscard(true);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const keepEditing = () => {
    setConfirmingDiscard(false);
    setPendingHref(null);
  };

  // Bubble phase on purpose: a link that opens or re-points the pop-up has its
  // own onClick (it calls preventDefault), which runs first, so
  // isPlainLeftClick sees defaultPrevented and this stays out of its way.
  const onPanelClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!isPlainLeftClick(event)) return;
    const anchor = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = settingsLeaveHref(
      { href: anchor.href, target: anchor.target, download: anchor.hasAttribute('download') },
      window.location.href
    );
    if (!href) return;
    event.preventDefault();
    if (decideSettingsClose(dirtyKeys) === 'confirm') {
      setPendingHref(href);
      setConfirmingDiscard(true);
      return;
    }
    leaveTo(href);
  };

  // ── Focus, keyboard ───────────────────────────────────────────────────────
  const panelRef = useRef<HTMLDivElement>(null);
  // The shared dialog contract: focus moves onto the panel (so the label is
  // read first), Tab stays inside, and focus returns to the opener. The
  // "Discard changes?" prompt is its own dialog on the same stack, so while it
  // is up it owns Tab.
  useDialogFocus(true, panelRef, { initialFocus: 'panel' });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (confirmingDiscard) keepEditing();
    else requestClose();
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
      case 'admin':
        return <AdminSegment />;
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
        onClick={onPanelClick}
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
                className="motion-focus motion-press -ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary sm:hidden"
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
                className="motion-focus motion-press grid h-11 w-11 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary sm:hidden"
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
              if (event.target === event.currentTarget) keepEditing();
            }}
          >
            <DiscardPrompt>
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
                  data-autofocus
                  onClick={keepEditing}
                  className="motion-focus motion-press h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                >
                  Keep editing
                </button>
              </div>
            </DiscardPrompt>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The "Discard changes?" question. Its own dialog on the shared stack, so while
 * it is up it owns Tab (the settings behind its scrim are inert) and focus
 * lands on the safe answer, "Keep editing", via `data-autofocus`.
 */
function DiscardPrompt({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(true, ref);
  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="settings-discard-title"
      className="w-full max-w-sm rounded-2xl border border-stroke-strong bg-bg-surface p-5 shadow-xl"
    >
      {children}
    </div>
  );
}

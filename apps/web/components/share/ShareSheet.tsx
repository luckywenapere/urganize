'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
} from 'react';
import { createPortal } from 'react-dom';
// The real brand marks, the same set the content calendar's platform tabs use:
// a person looking for the X or Snapchat button is looking for that logo.
import { SiSnapchat, SiX } from 'react-icons/si';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  Copy,
  Download,
  Gift,
  Instagram,
  Loader2,
  MessageCircle,
  Palette,
  RefreshCw,
  Send,
  Share2,
  X,
} from '@/components/icons';
import { usePathname } from 'next/navigation';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import {
  clearDeferredShare,
  decideDeferredShareOffer,
  isInFirstSession,
  readFirstSessionRecord,
  readFirstSessionTabId,
} from '@/lib/first-session';
import { HOME_PATH } from '@/lib/home-path';
import { useAuthStore } from '@/lib/auth-store';
import { isBodyScrollLocked, lockBodyScroll } from '@/lib/body-scroll-lock';
import { openExternalUrl } from '@/lib/external-link';
import {
  canShareFilesToApps,
  canShareTextToApps,
  copyText,
  downloadFile,
  shareFileToApps,
  shareTextToApps,
} from '@/lib/share-file';
import {
  MAX_SHARE_LINE_CHARS,
  SHARE_CHANNEL_FORMAT,
  X_MAX_POST_WEIGHT,
  buildDmMessage,
  buildInstagramCaption,
  buildShareHeadline,
  buildSnapchatCaption,
  buildStatusCaption,
  buildXIntentUrl,
  buildXPost,
  defaultShareVoice,
  describeShareTiming,
  normalizeFanLink,
  normalizeShareLine,
  releaseNoun,
  shareDisplayTitle,
  shareImageFileName,
  shareTimingAnchor,
  toLocalYmd,
  xPostWeight,
  type ShareAnswers,
  type ShareFormat,
  type ShareImageChannel,
  type ShareReleaseFacts,
} from '@/lib/social-share';
import { BRAND_COLORS_SETTINGS_ANCHOR, isBrandColorsEnabled } from '@/lib/social-share-colors';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import {
  clearPendingFirstShare,
  hasOfferedFirstShare,
  markFirstShareOffered,
  readPendingFirstShare,
  readSavedShareAnswers,
  saveShareAnswers,
} from '@/lib/social-share-offer';
import { buildWhatsAppShareUrl } from '@/lib/team-logins';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useShareStore, type ShareRequest } from '@/stores/useShareStore';
import { tourBlocksPrompts } from '@/stores/useTourStore';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';
import { onRadioGroupKeyDown } from '@/lib/radio-group-keys';
import { InfoTip } from '@/components/shared/HelpTip';
import { SHARE_REWARD_OFFER, SHARE_REWARD_OFFER_DETAIL } from '@/lib/share-reward';
import { useShareImages, type ShareImageState } from './useShareImages';
import { useShareReward, type ShareRewardState } from './useShareReward';

/**
 * Share to socials (founder request, 2026-09-23): the one sheet that turns a
 * rollout into an Instagram post, a WhatsApp status, an X post, a Snapchat
 * story (both added 2026-09-24) and a message somebody can DM to anybody.
 *
 * Two steps, and the order is the founder's: ASK, then SHARE. The four
 * questions come first every time the sheet opens ("always ask questions for
 * clarity"), filled in with last time's answers so a second visit is one tap.
 * Nothing is posted anywhere by us. Instagram, WhatsApp, X and Snapchat are
 * reached through the phone's own share sheet, which is the only door those
 * apps open to a web page; X also has its own "write a post" link. On a
 * computer the images are saved instead.
 *
 * Mounted ONCE, in AppShell, and opened through useShareStore. The sheet
 * mechanics follow the house contract (z-[170], the shared task-outcome-sheet
 * entrance, swipe to dismiss on the handle, backdrop to close, body scroll
 * locked) and it portals to document.body, because AppShell's lazy-fade
 * transform would otherwise make `position: fixed` relative to it (the
 * DeleteReleaseDialog trap).
 *
 * Escape closes it, and unlike the window listeners the house rule warns
 * about, this one lives on the dialog itself: it only fires while focus is
 * inside the sheet, so one keypress can never close two things.
 */

const SWIPE_DISMISS_PX = 80;
const PENDING_OFFER_DELAY_MS = 1500;
const PENDING_OFFER_MAX_ATTEMPTS = 40;
const INSTAGRAM_INBOX_URL = 'https://www.instagram.com/direct/inbox/';

type Step = 'ask' | 'share';
type Tab = 'instagram' | 'status' | 'x' | 'snapchat' | 'message';
/** The tabs that send an image, each with the channel its file is named for. */
type ImageTab = Exclude<Tab, 'message'>;
type Feedback = { tone: 'ok' | 'error'; text: string };
type CaptionEdits = Partial<Record<Tab, string>>;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The sheet's text fields, and deliberately NOT the shared `.input` class: its
 * fill is white at 4%, which is invisible on paper mode's cream, and its radius
 * rule outranks `rounded-xl`, so the fields came out square. A bg-base well
 * reads as a field in both themes, and it is the same well the toggles sit in,
 * so the whole sheet shares one idea of "something you set".
 */
const FIELD_CLASS =
  'block w-full rounded-xl border border-stroke-control bg-bg-base px-4 text-[15px] text-content-primary transition-[border-color,box-shadow] duration-200 placeholder:text-content-tertiary hover:border-content-secondary focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/15';

/**
 * The track behind the toggles and the tabs. The house pattern (the Shows
 * modal's "One show / Several" switch): a bg-base well with a bg-surface thumb,
 * which is the only pairing in this palette that reads as a raised thumb in
 * BOTH themes. bg-elevated is two shades off bg-surface in the dark theme and
 * the identical colour in the light one, so a track made of it vanished there.
 */
const TRACK_CLASS = 'gap-1 rounded-full border border-stroke-default bg-bg-base p-1';

// ── The host ────────────────────────────────────────────────────────────────

export function ShareSheet() {
  const request = useShareStore((state) => state.request);
  const registerSheet = useShareStore((state) => state.registerSheet);

  useEffect(() => registerSheet(), [registerSheet]);
  usePendingFirstShareOffer();
  useDeferredFirstShareOffer();

  if (!request || typeof document === 'undefined') return null;
  // Keyed by the request token, so every open starts fresh.
  return createPortal(<ShareDialog key={request.token} request={request} />, document.body);
}

/**
 * The onboarding hand-off. Onboarding creates most people's first rollout and
 * then finishes on pages outside the app, so it leaves a pending marker in this
 * tab and this picks it up once the person lands in the app.
 *
 * It waits for a quiet moment rather than opening on arrival: never over
 * another modal (the body scroll lock is held), never over a guided tour, and
 * never twice. It gives up after about a minute of other things being open,
 * because an offer arriving long after the moment is an interruption.
 */
function usePendingFirstShareOffer() {
  useEffect(() => {
    if (!readPendingFirstShare()) return;
    let attempts = 0;
    let timer: number | undefined;

    const tick = () => {
      attempts += 1;
      const busy =
        isBodyScrollLocked() || tourBlocksPrompts() || useShareStore.getState().request !== null;
      if (busy) {
        if (attempts < PENDING_OFFER_MAX_ATTEMPTS) {
          timer = window.setTimeout(tick, PENDING_OFFER_DELAY_MS);
        }
        return;
      }
      // Never in the first session after onboarding (lib/first-session.ts):
      // onboarding no longer leaves this marker, and this is the belt to that.
      if (isInFirstSession()) {
        clearPendingFirstShare();
        return;
      }
      const releaseId = readPendingFirstShare();
      clearPendingFirstShare();
      if (!releaseId) return;
      const userId = useAuthStore.getState().user?.id;
      if (hasOfferedFirstShare(userId)) return;
      markFirstShareOffered(userId);
      useShareStore.getState().open({ releaseId, source: 'first_release' });
    };

    timer = window.setTimeout(tick, PENDING_OFFER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
}

/**
 * The first-rollout share offer onboarding deferred (2026-10-11, founder call):
 * "Tell people it's coming" is not shown in the first session, it is shown
 * once on Home at the start of the NEXT visit (lib/first-session.ts decides
 * which visit that is). Same quiet-moment rules as the pending offer above,
 * and the same once-per-person record, so it can never show twice.
 */
function useDeferredFirstShareOffer() {
  const pathname = usePathname();
  const onHome = pathname === HOME_PATH;
  useEffect(() => {
    if (!onHome) return;
    const initial = decideDeferredShareOffer({
      record: readFirstSessionRecord(),
      tabId: readFirstSessionTabId(),
      now: Date.now(),
      onHome: true,
    });
    if (!initial) return;
    let attempts = 0;
    let timer: number | undefined;

    const tick = () => {
      attempts += 1;
      const busy =
        isBodyScrollLocked() || tourBlocksPrompts() || useShareStore.getState().request !== null;
      if (busy) {
        if (attempts < PENDING_OFFER_MAX_ATTEMPTS) {
          timer = window.setTimeout(tick, PENDING_OFFER_DELAY_MS);
        }
        return;
      }
      const releaseId = decideDeferredShareOffer({
        record: readFirstSessionRecord(),
        tabId: readFirstSessionTabId(),
        now: Date.now(),
        onHome: window.location.pathname === HOME_PATH,
      });
      if (!releaseId) return;
      clearDeferredShare();
      const userId = useAuthStore.getState().user?.id;
      if (hasOfferedFirstShare(userId)) return;
      markFirstShareOffered(userId);
      useShareStore.getState().open({ releaseId, source: 'first_release' });
    };

    timer = window.setTimeout(tick, PENDING_OFFER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [onHome]);
}

// ── The dialog ──────────────────────────────────────────────────────────────

function ShareDialog({ request }: { request: ShareRequest }) {
  const close = useShareStore((state) => state.close);
  const openSettings = useOpenSettings();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const role = useAuthStore((state) => state.user?.role ?? null);
  const storeRelease = useReleaseStore(
    (state) => state.releases.find((release) => release.id === request.releaseId) ?? null
  );
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);

  // One "today" per open, from the viewer's own clock, so the caption and the
  // images agree on "out today" versus "out October 3" for the whole visit.
  const [todayYmd] = useState(() => toLocalYmd());

  // The facts the posts are built from: the catalog's copy, or what the caller
  // handed over when the catalog has not caught up with a brand new rollout.
  const snapshot = request.snapshot;
  const title = storeRelease?.title ?? snapshot?.title;
  const artistName = storeRelease?.artistName ?? snapshot?.artistName ?? '';
  const releaseType = storeRelease?.releaseType ?? snapshot?.releaseType ?? 'single';
  const releaseDate =
    storeRelease?.releaseDate !== undefined ? storeRelease.releaseDate : snapshot?.releaseDate ?? null;
  const facts = useMemo<ShareReleaseFacts | null>(
    () =>
      title === undefined ? null : { title, artistName, releaseType, releaseDate: releaseDate ?? null },
    [title, artistName, releaseType, releaseDate]
  );

  // Neither the catalog nor the caller knows this rollout yet: ask the catalog
  // once. If it still is not there, the person cannot see it, and saying so
  // beats a sheet that spins forever.
  const [lookupFailed, setLookupFailed] = useState(false);
  useEffect(() => {
    if (facts) return;
    let active = true;
    void loadCommandCenter().then(() => {
      if (!active) return;
      const found = useReleaseStore
        .getState()
        .releases.some((release) => release.id === request.releaseId);
      if (!found) setLookupFailed(true);
    });
    return () => {
      active = false;
    };
  }, [facts, loadCommandCenter, request.releaseId]);

  useEffect(() => lockBodyScroll(), []);

  useEffect(() => {
    captureAnalyticsEvent({
      name: 'social_share_opened',
      properties: { release_id: request.releaseId, source: request.source },
    });
  }, [request.releaseId, request.source]);

  // Focus moves into the sheet on open and back to where it was on close.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const [step, setStep] = useState<Step>('ask');

  // Moving between the two steps. Two things have to travel with it, and both
  // were missing until the sheet was looked at in a browser. The scroll: a new
  // step starts at its top, not wherever the last one was left (the share step
  // used to open with its poster half scrolled off). And the keyboard: the
  // button that was pressed has just unmounted, so focus falls to <body>, and
  // Escape and the Tab trap, which both live on this panel, stop hearing
  // anything. The share step hands focus to its selected tab; going back hands
  // it to the panel. A layout effect so neither is ever painted wrong.
  const bodyRef = useRef<HTMLDivElement>(null);
  const stepSettled = useRef(false);
  useIsomorphicLayoutEffect(() => {
    if (!stepSettled.current) {
      stepSettled.current = true;
      return;
    }
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    const selectedTab = panelRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    (step === 'share' && selectedTab ? selectedTab : panelRef.current)?.focus();
  }, [step]);
  const [answers, setAnswers] = useState<ShareAnswers>(
    () =>
      readSavedShareAnswers(userId, request.releaseId) ?? {
        voice: defaultShareVoice(role),
        dateMode: 'show',
        fanLink: '',
        extraLine: '',
      }
  );

  // The posters and any caption edits live HERE, not in the share step, so
  // stepping back to change an answer and returning is instant and keeps what
  // the person typed. The images start on the first "Make my posts" and not
  // before: rendering on open would spend somebody's mobile data on posters
  // for a sheet they may close with "Not now".
  const [imagesStarted, setImagesStarted] = useState(false);
  const { images, retry } = useShareImages({
    enabled: imagesStarted && facts !== null,
    releaseId: request.releaseId,
    title: facts?.title ?? '',
    dateMode: answers.dateMode,
    extraLine: answers.extraLine,
    todayYmd,
  });
  const [edits, setEdits] = useState<CaptionEdits>({});

  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const onTouchStart = (event: TouchEvent) => {
    dragStartY.current = event.touches[0]?.clientY ?? null;
  };
  const onTouchMove = (event: TouchEvent) => {
    if (dragStartY.current === null) return;
    setDragOffset(Math.max(0, (event.touches[0]?.clientY ?? 0) - dragStartY.current));
  };
  const onTouchEnd = () => {
    dragStartY.current = null;
    if (dragOffset > SWIPE_DISMISS_PX) {
      close();
      return;
    }
    setDragOffset(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    // Keep Tab inside the sheet: the page behind it is inert while it is open.
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
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

  const isFirst = request.source === 'first_release';

  // The share reward (2026-10-11): one month free, once per team, claimed on
  // the first tap of any share, copy, save or send button. Claimed on the next
  // tick so nothing runs inside the tap before the share call itself: Web
  // Share only opens from a live gesture, and its call is the tap's first await.
  const reward = useShareReward();
  const claimReward = reward.claim;
  const onShareTap = useCallback(() => {
    window.setTimeout(claimReward, 0);
  }, [claimReward]);

  return (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-sheet-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        // focus-visible:outline-none, not just outline-none: the panel takes
        // focus only to carry the keyboard into the dialog, and the app-wide
        // :focus-visible ring in globals.css outranks a bare outline-none. The
        // first-rollout sheet opens on a timer with no click before it, which
        // is exactly when a browser decides that programmatic focus should
        // show the ring, so without this it arrived wearing a green rim.
        className={`task-outcome-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-stroke-strong bg-bg-surface shadow-[0_28px_80px_-38px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))] outline-none focus-visible:outline-none sm:rounded-2xl sm:border ${
          step === 'share' ? 'max-sm:h-[92dvh] sm:max-w-3xl' : 'sm:max-w-lg'
        }`}
        style={
          dragOffset > 0
            ? { transform: `translateY(${dragOffset}px)`, transition: 'none' }
            : {
                transform: 'translateY(0)',
                // Inline, and both properties together: an inline transition
                // replaces the class's, so the width animation between the two
                // steps has to be named here or it silently stops.
                transition: 'transform 180ms var(--motion-out), max-width 300ms var(--motion-out)',
              }
        }
      >
        {/* The drag region is the handle and header only, so a swipe never
            fights a text field or a scrolling preview. */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="shrink-0 px-5 pt-3 sm:px-6 sm:pt-5"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stroke-strong sm:hidden" aria-hidden="true" />
          <div className="flex h-9 items-center justify-between gap-2">
            {step === 'share' ? (
              <button
                type="button"
                onClick={() => setStep('ask')}
                className="motion-focus motion-press -ml-2 inline-flex h-9 items-center gap-1 rounded-full px-2 text-sm font-medium text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Edit answers
              </button>
            ) : (
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                {isFirst ? 'Your first rollout' : 'Share to socials'}
              </p>
            )}
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="motion-focus motion-press -mr-2 grid h-9 w-9 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-6"
        >
          {facts ? <ShareRewardBanner state={reward.state} /> : null}
          {!facts ? (
            lookupFailed ? (
              <div className="py-8 text-center">
                <p id="share-sheet-title" className="font-display text-xl text-content-primary">
                  We couldn&apos;t find this rollout
                </p>
                <p className="mt-2 text-sm text-content-secondary">
                  It may have been moved or deleted. Close this and try again from the rollout.
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-content-secondary">
                <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />
                <span id="share-sheet-title">Getting your rollout…</span>
              </div>
            )
          ) : step === 'ask' ? (
            <AskStep
              facts={facts}
              answers={answers}
              todayYmd={todayYmd}
              isFirst={isFirst}
              coverArtUrl={storeRelease?.coverArtUrl ?? null}
              onDismiss={close}
              onDone={(next) => {
                // New answers mean new captions; the same answers keep the
                // person's own edits.
                if (JSON.stringify(next) !== JSON.stringify(answers)) setEdits({});
                setAnswers(next);
                setImagesStarted(true);
                saveShareAnswers(userId, request.releaseId, next);
                captureAnalyticsEvent({
                  name: 'social_share_made',
                  properties: {
                    release_id: request.releaseId,
                    voice: next.voice,
                    date_mode: next.dateMode,
                    has_link: Boolean(next.fanLink),
                    has_line: Boolean(next.extraLine),
                  },
                });
                setStep('share');
              }}
            />
          ) : (
            <ShareStep
              releaseId={request.releaseId}
              facts={facts}
              answers={answers}
              todayYmd={todayYmd}
              images={images}
              onRetry={retry}
              edits={edits}
              onEdit={(tab, value) => setEdits((current) => ({ ...current, [tab]: value }))}
              onDone={close}
              onShareTap={onShareTap}
              onOpenBrandColors={
                isBrandColorsEnabled()
                  ? () => {
                      // Close first: the sheet is mounted app-wide, so it would
                      // otherwise sit open on top of Settings. Settings opens over
                      // the page in place, so the rollout stays scoped behind it.
                      //
                      // close() also runs the create flow's own continuation,
                      // which can navigate to the new rollout. Opening Settings
                      // in the same tick raced that push, so Settings opened
                      // over the wrong URL and could not be closed cleanly.
                      // Wait for the navigation to land, then open it.
                      const releaseId = request.releaseId;
                      const expectsNavigation = Boolean(request.then);
                      close();
                      const open = () =>
                        openSettings({ segment: 'artists', section: BRAND_COLORS_SETTINGS_ANCHOR });
                      if (!expectsNavigation) {
                        open();
                        return;
                      }
                      const started = Date.now();
                      const timer = window.setInterval(() => {
                        const landed = window.location.search.includes(`release=${releaseId}`);
                        if (landed || Date.now() - started > 2000) {
                          window.clearInterval(timer);
                          open();
                        }
                      }, 50);
                    }
                  : null
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: the four questions ──────────────────────────────────────────────

function AskStep({
  facts,
  answers,
  todayYmd,
  isFirst,
  coverArtUrl,
  onDismiss,
  onDone,
}: {
  facts: ShareReleaseFacts;
  answers: ShareAnswers;
  todayYmd: string;
  isFirst: boolean;
  coverArtUrl: string | null;
  onDismiss: () => void;
  onDone: (answers: ShareAnswers) => void;
}) {
  const [voice, setVoice] = useState(answers.voice);
  const [dateMode, setDateMode] = useState(answers.dateMode);
  const [link, setLink] = useState(answers.fanLink);
  const [line, setLine] = useState(answers.extraLine);
  const [linkError, setLinkError] = useState('');
  const linkRef = useRef<HTMLInputElement>(null);

  // Where the date is, as if it were shown: this decides whether the date
  // question is a real choice (an upcoming date) or a statement of fact.
  const dateAsShown = describeShareTiming(facts.releaseDate, 'show', todayYmd);
  const liveTiming = describeShareTiming(facts.releaseDate, dateMode, todayYmd);
  const isOut = liveTiming.kind === 'today' || liveTiming.kind === 'out';
  const untitled = shareDisplayTitle(facts.title) === null;

  const submit = () => {
    const normalized = normalizeFanLink(link);
    if (!normalized.ok) {
      setLinkError(normalized.error);
      linkRef.current?.focus();
      return;
    }
    onDone({ voice, dateMode, fanLink: normalized.value, extraLine: normalizeShareLine(line) });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      noValidate
    >
      <h2 id="share-sheet-title" className="font-display text-[22px] leading-tight text-content-primary">
        {isOut ? 'Tell people it’s out' : 'Tell people it’s coming'}
      </h2>
      <p className="mt-1.5 text-sm leading-6 text-content-secondary">
        {isFirst ? 'Your first rollout is set up. ' : ''}
        Answer four quick questions and we&apos;ll make posts for Instagram, WhatsApp status, X and
        Snapchat, plus a message you can send to anyone.
      </p>

      <ReleaseChip facts={facts} coverArtUrl={coverArtUrl} />
      {untitled ? (
        <p className="mt-2 text-xs leading-5 text-content-tertiary">
          This rollout has no name yet, so the posts leave it out.
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        <Question label="Who’s posting?" hint={`Posts say: ${buildShareHeadline(facts, voice)}`}>
          <Segmented
            name="voice"
            value={voice}
            onChange={setVoice}
            options={[
              { value: 'artist', label: 'The artist' },
              { value: 'team', label: 'The team' },
            ]}
          />
        </Question>

        <Question
          label="Can people know the date?"
          hint={
            dateAsShown.kind === 'upcoming'
              ? `Posts say: ${shareTimingAnchor(liveTiming)}`
              : dateAsShown.kind === 'soon'
                ? 'No date yet, so your posts say “Coming soon”.'
                : `It’s out, so your posts say “${shareTimingAnchor(dateAsShown)}”.`
          }
        >
          {dateAsShown.kind === 'upcoming' ? (
            <Segmented
              name="date"
              value={dateMode}
              onChange={setDateMode}
              options={[
                { value: 'show', label: `Yes, ${dateAsShown.label}` },
                { value: 'secret', label: 'Not yet' },
              ]}
            />
          ) : null}
        </Question>

        <Question
          label="Got a link for fans?"
          htmlFor="share-fan-link"
          hint={linkError ? undefined : 'Optional. It goes in your message and captions.'}
        >
          <input
            ref={linkRef}
            id="share-fan-link"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={link}
            onChange={(event) => {
              setLink(event.target.value);
              if (linkError) setLinkError('');
            }}
            placeholder="Paste a pre-save or smart link"
            aria-invalid={linkError ? true : undefined}
            aria-describedby={linkError ? 'share-fan-link-error' : undefined}
            className={`${FIELD_CLASS} h-11 aria-[invalid=true]:border-status-error`}
          />
          {linkError ? (
            <p role="alert" id="share-fan-link-error" className="mt-1.5 flex items-start gap-1.5 text-xs text-status-error">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {linkError}
            </p>
          ) : null}
        </Question>

        <Question
          label="Anything to add?"
          htmlFor="share-extra-line"
          hint="Optional. One short line."
          aside={`${line.length}/${MAX_SHARE_LINE_CHARS}`}
        >
          <input
            id="share-extra-line"
            type="text"
            value={line}
            maxLength={MAX_SHARE_LINE_CHARS}
            onChange={(event) => setLine(event.target.value)}
            placeholder="Featuring Tems"
            className={`${FIELD_CLASS} h-11`}
          />
        </Question>
      </div>

      {/* Pinned to the bottom of the sheet, so the main action stays on screen
          while the questions scroll: on a 1280x800 laptop, and on most phones,
          the form is taller than the sheet and the button used to sit below
          the fold. The negative offset and margin match the scroll body's own
          bottom padding, so the footer covers that strip rather than letting
          the questions show through beneath it, and the padding is not doubled
          once it is scrolled to the end. */}
      <div className="sticky -bottom-[max(1.25rem,env(safe-area-inset-bottom))] -mx-5 -mb-[max(1.25rem,env(safe-area-inset-bottom))] mt-6 border-t border-stroke-subtle bg-bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6">
        <button
          type="submit"
          className="motion-focus motion-press inline-flex h-12 w-full items-center justify-center rounded-full border border-brand/25 bg-brand text-[15px] font-semibold text-content-inverse transition-colors hover:bg-brand-hover"
        >
          Make my posts
        </button>
        {isFirst ? (
          <button
            type="button"
            onClick={onDismiss}
            className="motion-focus mt-3 block w-full text-center text-xs font-medium text-content-secondary underline decoration-content-tertiary underline-offset-4 transition-colors hover:text-content-primary"
          >
            Not now
          </button>
        ) : null}
      </div>
    </form>
  );
}

function ReleaseChip({ facts, coverArtUrl }: { facts: ShareReleaseFacts; coverArtUrl: string | null }) {
  const timing = describeShareTiming(facts.releaseDate, 'show', toLocalYmd());
  const meta = [
    facts.artistName.trim(),
    releaseNoun(facts.releaseType).toUpperCase(),
    timing.kind === 'upcoming' ? timing.shortLabel : timing.kind === 'soon' ? 'NO DATE' : 'OUT',
  ].filter(Boolean);
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl border border-stroke-default p-2.5">
      <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-stroke-subtle bg-bg-base">
        {coverArtUrl ? (
          // Plain img: a short-lived signed URL the optimizer would cache past its expiry.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverArtUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Share2 className="h-4 w-4 text-content-tertiary" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-content-primary">
          {shareDisplayTitle(facts.title) ?? 'Untitled'}
        </p>
        <p className="truncate font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary">
          {meta.join(' · ')}
        </p>
      </div>
    </div>
  );
}

function Question({
  label,
  hint,
  aside,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  aside?: string;
  htmlFor?: string;
  children?: ReactNode;
}) {
  const labelClass = 'text-sm font-medium text-content-primary';
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        {/* A real label when there is a field to point at; the two segmented
            questions carry their own radio semantics instead. */}
        {htmlFor ? (
          <label htmlFor={htmlFor} className={labelClass}>
            {label}
          </label>
        ) : (
          <p className={labelClass}>{label}</p>
        )}
        {aside ? <span className="font-mono text-[11px] text-content-tertiary">{aside}</span> : null}
      </div>
      {children}
      {hint ? <p className="mt-1.5 text-xs leading-5 text-content-tertiary">{hint}</p> : null}
    </div>
  );
}

/** An iOS-style segmented control, as a radio group for assistive tech. */
function Segmented<Value extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: Value;
  onChange: (value: Value) => void;
  options: Array<{ value: Value; label: string }>;
}) {
  return (
    <div
      role="radiogroup"
      onKeyDown={(event) =>
        onRadioGroupKeyDown(
          event,
          options.findIndex((option) => option.value === value),
          (index) => onChange(options[index].value)
        )
      }
      className={`grid grid-cols-2 ${TRACK_CLASS}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            name={name}
            onClick={() => onChange(option.value)}
            className={`motion-focus motion-press h-9 truncate rounded-full px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-200 ${
              selected
                ? 'bg-bg-surface text-content-primary shadow-[0_1px_3px_rgb(var(--shadow-ink)/calc(0.25*var(--shadow-alpha-scale)))]'
                : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Step 2: the things to send ──────────────────────────────────────────────

type TabIcon = ComponentType<{ className?: string }>;

// The brand marks are filled shapes, so they sit a size smaller than lucide's
// outlines or they read as heavier than the tabs beside them.
const BRAND_MARK_CLASS = 'h-3.5 w-3.5';

const TABS: Array<{ id: Tab; label: string; icon: TabIcon; iconClass?: string }> = [
  { id: 'instagram', label: 'Instagram', icon: Instagram },
  { id: 'status', label: 'Status', icon: MessageCircle },
  { id: 'x', label: 'X', icon: SiX, iconClass: BRAND_MARK_CLASS },
  { id: 'snapchat', label: 'Snapchat', icon: SiSnapchat, iconClass: BRAND_MARK_CLASS },
  { id: 'message', label: 'Message', icon: Send },
];

/**
 * Five tabs, so the track is its own class rather than TRACK_CLASS. Below sm
 * each tab stacks its icon over a small label, because five inline labels do
 * not fit across a phone; a fully rounded track around stacked tabs would give
 * the end tabs semicircle corners, so it rounds to match them instead.
 */
const TAB_TRACK_CLASS = 'gap-1 rounded-[20px] border border-stroke-default bg-bg-base p-1 sm:rounded-full';

/** The channel each image tab's file is named for. */
const IMAGE_TAB_CHANNEL: Record<ImageTab, ShareImageChannel> = {
  instagram: 'instagram',
  status: 'whatsapp',
  x: 'x',
  snapchat: 'snapchat',
};

type SentMethod = 'share' | 'download' | 'copy' | 'whatsapp' | 'instagram_dm' | 'more' | 'x_intent';
type SentChannel = 'instagram' | 'whatsapp_status' | 'x' | 'snapchat' | 'message';

const SENT_CHANNEL: Record<ImageTab, SentChannel> = {
  instagram: 'instagram',
  status: 'whatsapp_status',
  x: 'x',
  snapchat: 'snapchat',
};

const formatForTab = (tab: ImageTab): ShareFormat => SHARE_CHANNEL_FORMAT[IMAGE_TAB_CHANNEL[tab]];

/**
 * The file for one tab, named for where it is going. The post and the status
 * are fetched once and shared by two tabs each, so X's copy of the post is
 * renamed rather than fetched again. Synchronous, so it can run inside the tap.
 */
function fileForTab(file: File, title: string, tab: ImageTab): File {
  const name = shareImageFileName(title, formatForTab(tab), IMAGE_TAB_CHANNEL[tab]);
  return name === file.name ? file : new File([file], name, { type: file.type });
}

/** What to say once an image has gone to another app. */
function sharedFeedback(tab: ImageTab, didCopy: boolean, hasLink: boolean): string {
  switch (tab) {
    case 'instagram':
      return didCopy
        ? 'Caption copied. Paste it into Instagram.'
        : 'Shared. Copy the caption above and paste it into Instagram.';
    case 'x':
      return didCopy ? 'Shared. Your post is copied too, in case X leaves it out.' : 'Shared.';
    case 'snapchat':
      if (hasLink) {
        return didCopy
          ? 'Link copied. In Snapchat, tap the paperclip and paste it.'
          : 'Shared. Copy your link below and add it with the paperclip in Snapchat.';
      }
      return didCopy ? 'Caption copied. Paste it onto your snap.' : 'Shared.';
    default:
      return 'Shared.';
  }
}

/** What to say once an image has been saved instead (a computer). */
function savedFeedback(tab: ImageTab, didCopy: boolean): string {
  if (tab === 'snapchat') return 'Saved to your downloads. Post it from Snapchat on your phone.';
  if (tab === 'x') {
    return didCopy ? 'Saved to your downloads. Your post is copied too.' : 'Saved to your downloads.';
  }
  return didCopy ? 'Saved to your downloads. Your caption is copied too.' : 'Saved to your downloads.';
}

function ShareStep({
  releaseId,
  facts,
  answers,
  todayYmd,
  images,
  onRetry,
  edits,
  onEdit,
  onDone,
  onShareTap,
  onOpenBrandColors,
}: {
  releaseId: string;
  facts: ShareReleaseFacts;
  answers: ShareAnswers;
  todayYmd: string;
  images: Record<ShareFormat, ShareImageState>;
  onRetry: () => void;
  edits: CaptionEdits;
  onEdit: (tab: Tab, value: string) => void;
  onDone: () => void;
  /** Any share, copy, save or send tap. Claims the share reward the first time. */
  onShareTap: () => void;
  /** Closes the sheet and opens the Settings editor; null when the flag is off. */
  onOpenBrandColors: (() => void) | null;
}) {
  const [tab, setTab] = useState<Tab>('instagram');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);

  const defaults = useMemo(
    () => ({
      instagram: buildInstagramCaption(facts, answers, todayYmd),
      status: buildStatusCaption(facts, answers, todayYmd),
      x: buildXPost(facts, answers, todayYmd),
      snapchat: buildSnapchatCaption(facts, answers, todayYmd),
      message: buildDmMessage(facts, answers, todayYmd),
    }),
    [facts, answers, todayYmd]
  );
  // Edits sit beside the generated text rather than replacing it, so the
  // person's own words survive switching tabs, and a caption nobody touched
  // keeps following the answers.
  const textFor = (key: Tab) => edits[key] ?? defaults[key];

  const selectTab = (next: Tab) => {
    setTab(next);
    setFeedback(null);
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TABS.findIndex((item) => item.id === tab);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    selectTab(next.id);
    document.getElementById(`share-tab-${next.id}`)?.focus();
  };

  const report = useCallback(
    (channel: SentChannel, method: SentMethod) => {
      captureAnalyticsEvent({
        name: 'social_share_sent',
        properties: { release_id: releaseId, channel, method },
      });
    },
    [releaseId]
  );

  const sendImage = async (imageTab: ImageTab) => {
    const state = images[formatForTab(imageTab)];
    if (state.kind !== 'ready' || busy) return;
    onShareTap();
    const file = fileForTab(state.file, facts.title, imageTab);
    const caption = textFor(imageTab);
    const channel = SENT_CHANNEL[imageTab];
    // Snapchat takes no text from another app, and the one thing worth
    // pasting there is the link, into its link sticker. Everywhere else it is
    // the caption. Both started inside this tap, before anything is awaited:
    // the browser only allows the clipboard and the share sheet from a live
    // gesture.
    const copied = copyText(imageTab === 'snapchat' && answers.fanLink ? answers.fanLink : caption);
    if (!canShareFilesToApps(file)) {
      downloadFile(file, file.name);
      report(channel, 'download');
      setFeedback({ tone: 'ok', text: savedFeedback(imageTab, await copied) });
      return;
    }
    setBusy(true);
    try {
      const outcome = await shareFileToApps({
        file,
        title: facts.title,
        // WhatsApp and X keep text beside an image. Instagram and Snapchat
        // ignore it and some builds refuse the pair, so theirs travels by
        // clipboard.
        text: imageTab === 'status' || imageTab === 'x' ? caption : undefined,
      });
      const didCopy = await copied;
      if (outcome === 'shared') {
        report(channel, 'share');
        setFeedback({ tone: 'ok', text: sharedFeedback(imageTab, didCopy, Boolean(answers.fanLink)) });
      } else if (outcome === 'downloaded') {
        report(channel, 'download');
        setFeedback({ tone: 'ok', text: 'Saved to your downloads.' });
      } else if (outcome === 'unsupported') {
        setFeedback({
          tone: 'error',
          text: 'Sharing needs the newest version of the app. Open Urganize in your browser to share.',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const copyAndSay = async (text: string, channel: SentChannel, ok: string) => {
    onShareTap();
    const didCopy = await copyText(text);
    if (didCopy) report(channel, 'copy');
    setFeedback(
      didCopy
        ? { tone: 'ok', text: ok }
        : { tone: 'error', text: 'Could not copy. Press and hold the text to copy it.' }
    );
  };

  const panelId = `share-panel-${tab}`;
  // Whose colors the posters are in, once the route has said. Both images are
  // drawn from the same palette, so the post answers for both.
  const paletteIsBrand = images.post.kind === 'ready' ? images.post.brand : null;

  return (
    // min-h-full resolves only where the panel has a fixed height (a phone, on
    // this step), so on a computer this is the plain column it always was.
    <div className="flex min-h-full flex-col">
      <div
        role="tablist"
        aria-label="Where to share"
        onKeyDown={onTabKeyDown}
        className={`grid grid-cols-5 ${TAB_TRACK_CLASS}`}
      >
        {TABS.map((item) => {
          const selected = item.id === tab;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              id={`share-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`share-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(item.id)}
              className={`motion-focus motion-press flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] px-0.5 text-[11px] font-medium leading-none tracking-tight transition-[background-color,color,box-shadow] duration-200 sm:h-9 sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-2 sm:text-sm sm:tracking-normal ${
                selected
                  ? 'bg-bg-surface text-content-primary shadow-[0_1px_3px_rgb(var(--shadow-ink)/calc(0.25*var(--shadow-alpha-scale)))]'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              <Icon className={`${item.iconClass ?? 'h-4 w-4'} shrink-0`} aria-hidden="true" />
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={`share-tab-${tab}`} className="mt-5">
        {tab === 'message' ? (
          <MessagePanel
            text={textFor('message')}
            onChange={(value) => onEdit('message', value)}
            onWhatsApp={() => {
              onShareTap();
              report('message', 'whatsapp');
              void openExternalUrl(buildWhatsAppShareUrl(textFor('message')));
            }}
            onCopy={() => void copyAndSay(textFor('message'), 'message', 'Message copied.')}
            onInstagramDm={() => {
              // Copy inside the tap, then open the inbox. Instagram has no way
              // for a web page to fill in a DM, so pasting is the honest route.
              const copied = copyText(textFor('message'));
              void openExternalUrl(INSTAGRAM_INBOX_URL);
              onShareTap();
              void copied.then((didCopy) => {
                if (didCopy) report('message', 'instagram_dm');
                setFeedback(
                  didCopy
                    ? { tone: 'ok', text: 'Message copied. Paste it into the chat.' }
                    : { tone: 'error', text: 'Could not copy. Press and hold the message to copy it.' }
                );
              });
            }}
            onMore={
              canShareTextToApps()
                ? () => {
                    onShareTap();
                    void shareTextToApps({ text: textFor('message') }).then((outcome) => {
                      if (outcome === 'shared') report('message', 'more');
                    });
                  }
                : null
            }
          />
        ) : (
          <ImagePanel
            tab={tab}
            image={images[formatForTab(tab)]}
            caption={textFor(tab)}
            onCaptionChange={(value) => onEdit(tab, value)}
            onCopyCaption={() =>
              void copyAndSay(textFor(tab), SENT_CHANNEL[tab], tab === 'x' ? 'Post copied.' : 'Caption copied.')
            }
            fanLink={answers.fanLink}
            onCopyLink={() => void copyAndSay(answers.fanLink, SENT_CHANNEL[tab], 'Link copied.')}
            onOpenX={() => {
              // X's own "write a post" page, text filled in. It cannot carry
              // the image, which the main button shares or saves.
              onShareTap();
              report('x', 'x_intent');
              void openExternalUrl(buildXIntentUrl(textFor('x')));
            }}
            busy={busy}
            onSend={() => void sendImage(tab)}
            onRetry={onRetry}
          />
        )}
      </div>

      <div className="mt-auto">
        {onOpenBrandColors && paletteIsBrand !== null ? (
          <BrandColorsNote
            artistName={facts.artistName}
            isBrand={paletteIsBrand}
            onOpen={onOpenBrandColors}
          />
        ) : null}

        <p aria-live="polite" className="mt-3 min-h-5 text-center text-xs font-medium">
          {feedback ? (
            <span
              className={`inline-flex items-center gap-1.5 ${
                feedback.tone === 'ok' ? 'text-brand' : 'text-status-error'
              }`}
            >
              {feedback.tone === 'ok' ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {feedback.text}
            </span>
          ) : null}
        </p>

        <button
          type="button"
          onClick={onDone}
          className="motion-focus motion-press mt-2 inline-flex h-11 w-full items-center justify-center rounded-full border border-stroke-default bg-bg-surface text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/**
 * The share reward's line (founder call, 2026-10-11). One line, no grey
 * sentence under it (the 2026-10-05 rule): the how-it-works sits behind the
 * info icon. Once claimed it turns into the confirmation, announced politely.
 * Only shown to an owner or admin of a team that has not claimed yet; the
 * server decides that, and every failure shows nothing.
 */
function ShareRewardBanner({ state }: { state: ShareRewardState }) {
  if (state.status === 'hidden') return null;
  const claimed = state.status === 'claimed';
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex items-center gap-2.5 rounded-xl border border-brand/25 bg-brand/10 px-3.5 py-2.5 text-sm font-medium text-content-primary"
    >
      {claimed ? (
        <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
      ) : state.status === 'claiming' ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" aria-hidden="true" />
      ) : (
        <Gift className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 leading-5">{claimed ? state.message : SHARE_REWARD_OFFER}</span>
      {claimed ? null : <InfoTip label="How the free month works" text={SHARE_REWARD_OFFER_DETAIL} />}
    </div>
  );
}

/**
 * The shortcut to Settings (founder call, 2026-09-24): one quiet line that
 * says whose colors the posters are in and where to change them. Shown only
 * once the route has answered, so it never says "brand colors" about an image
 * that turns out to be in ours.
 */
function BrandColorsNote({
  artistName,
  isBrand,
  onOpen,
}: {
  artistName: string;
  isBrand: boolean;
  onOpen: () => void;
}) {
  const artist = artistName.trim();
  const owner = artist ? `${artist}’s` : 'your';
  return (
    <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 text-center text-xs leading-5 text-content-tertiary">
      <Palette className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{isBrand ? `These use ${owner} brand colors.` : `Want ${owner} own colors on these?`}</span>
      <button
        type="button"
        onClick={onOpen}
        className="motion-focus font-semibold text-content-secondary underline decoration-content-tertiary underline-offset-4 transition-colors hover:text-content-primary"
      >
        {isBrand ? 'Change them' : 'Set brand colors'}
      </button>
    </p>
  );
}

/** Everything that differs between the four image tabs, in one place. */
const IMAGE_PANEL_COPY: Record<
  ImageTab,
  {
    shareLabel: string;
    icon: TabIcon;
    iconClass?: string;
    alt: string;
    making: string;
    captionLabel: string;
    shareNote: (hasLink: boolean) => string;
    saveNote: string;
  }
> = {
  instagram: {
    shareLabel: 'Share to Instagram',
    icon: Instagram,
    alt: 'Your Instagram post',
    making: 'Making your post…',
    captionLabel: 'Caption',
    shareNote: () => 'We copy the caption for you. Paste it when Instagram opens.',
    saveNote: 'Post it from your phone, or at instagram.com. Your caption is copied when you save.',
  },
  status: {
    shareLabel: 'Post to status',
    icon: MessageCircle,
    alt: 'Your WhatsApp status',
    making: 'Making your status…',
    captionLabel: 'Caption',
    shareNote: () => 'Pick WhatsApp, then My status. It works as an Instagram story too.',
    saveNote: 'Save it, then post it from your phone. It works as an Instagram story too.',
  },
  x: {
    shareLabel: 'Share to X',
    icon: SiX,
    iconClass: BRAND_MARK_CLASS,
    alt: 'Your X post',
    making: 'Making your post…',
    captionLabel: 'Post',
    shareNote: () => 'Pick X. We copy your post too, in case X leaves it out.',
    saveNote: 'Save the image, then add it to your post on X. Your post is copied when you save.',
  },
  snapchat: {
    shareLabel: 'Share to Snapchat',
    icon: SiSnapchat,
    iconClass: BRAND_MARK_CLASS,
    alt: 'Your Snapchat story',
    making: 'Making your story…',
    captionLabel: 'Caption',
    shareNote: (hasLink) =>
      hasLink
        ? 'Pick Snapchat. Your link is copied, so tap the paperclip and paste it.'
        : 'Pick Snapchat, then add it to your story.',
    saveNote: 'Save it, then post it from Snapchat on your phone.',
  },
};

const SECONDARY_BUTTON_CLASS =
  'motion-focus motion-press inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-sm font-medium text-content-primary transition-colors hover:bg-bg-hover';

function ImagePanel({
  tab,
  image,
  caption,
  onCaptionChange,
  onCopyCaption,
  fanLink,
  onCopyLink,
  onOpenX,
  busy,
  onSend,
  onRetry,
}: {
  tab: ImageTab;
  image: ShareImageState;
  caption: string;
  onCaptionChange: (value: string) => void;
  onCopyCaption: () => void;
  fanLink: string;
  onCopyLink: () => void;
  onOpenX: () => void;
  busy: boolean;
  onSend: () => void;
  onRetry: () => void;
}) {
  const copy = IMAGE_PANEL_COPY[tab];
  const isPost = formatForTab(tab) === 'post';
  const ready = image.kind === 'ready';
  // A failed image turns the main button into the retry. Left as it was, the
  // button sat disabled still saying "Making your post…" under an error that
  // said otherwise.
  const failed = image.kind === 'error';
  // Decided against the file itself, once it exists: a touch browser whose
  // share sheet takes files shares, everything else saves.
  const canShare = useMemo(() => (image.kind === 'ready' ? canShareFilesToApps(image.file) : false), [image]);

  const label = canShare ? copy.shareLabel : 'Save image';
  const ActionIcon: TabIcon = canShare ? copy.icon : Download;
  const actionIconClass = canShare && copy.iconClass ? copy.iconClass : 'h-4 w-4';
  const footnote = canShare ? copy.shareNote(Boolean(fanLink)) : copy.saveNote;
  // X refuses a post over 280. Only measured on the X tab, where it is the
  // difference between a post that goes and one that does not.
  const xWeight = tab === 'x' ? xPostWeight(caption) : 0;
  const xOver = xWeight > X_MAX_POST_WEIGHT;

  return (
    <div className="sm:grid sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-start sm:gap-6">
      <div
        className={`relative mx-auto overflow-hidden rounded-xl border border-stroke-default bg-bg-base sm:mx-0 sm:w-full ${
          isPost
            ? 'aspect-[4/5] w-[min(100%,calc(40dvh*0.8))]'
            : 'aspect-[9/16] w-[min(100%,calc(40dvh*0.5625))] sm:w-[11.5rem] sm:justify-self-center'
        }`}
      >
        {image.kind === 'ready' ? (
          // Plain img: an object URL of the exact file that will be shared.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt={copy.alt} className="h-full w-full object-cover" />
        ) : image.kind === 'error' ? (
          // The message only. The retry is the big button below, so there is
          // one "Try again" on screen rather than two.
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertCircle className="h-5 w-5 text-status-error" aria-hidden="true" />
            <p className="text-xs leading-5 text-content-secondary">{image.message}</p>
          </div>
        ) : (
          <div className="flex h-full animate-pulse flex-col items-center justify-center gap-2 text-content-tertiary">
            <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden="true" />
            <p className="text-xs">{copy.making}</p>
          </div>
        )}
      </div>

      <div className="mt-4 sm:mt-0">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={`share-caption-${tab}`} className="text-sm font-medium text-content-primary">
            {copy.captionLabel}
          </label>
          <div className="flex items-center gap-1">
            {tab === 'x' ? (
              <span
                className={`font-mono text-[11px] ${xOver ? 'text-status-error' : 'text-content-tertiary'}`}
              >
                {xWeight}/{X_MAX_POST_WEIGHT}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onCopyCaption}
              className="motion-focus motion-press -mr-1 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copy
            </button>
          </div>
        </div>
        <textarea
          id={`share-caption-${tab}`}
          value={caption}
          onChange={(event) => onCaptionChange(event.target.value)}
          // Four for all: the status caption is shorter, but its raw link wraps
          // on a phone, and at three rows the last line of it sat cut off under
          // the edge.
          rows={4}
          aria-invalid={xOver ? true : undefined}
          className={`${FIELD_CLASS} resize-none py-2.5 leading-6 aria-[invalid=true]:border-status-error`}
        />
        {tab === 'instagram' && fanLink ? (
          <p className="mt-1.5 text-xs leading-5 text-content-tertiary">
            Links don&apos;t work in Instagram captions, so put yours in your bio.
          </p>
        ) : null}
        {tab === 'x' && xOver ? (
          <p role="status" className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-status-error">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            X allows {X_MAX_POST_WEIGHT} characters. Make it a little shorter.
          </p>
        ) : null}
        {tab === 'snapchat' && fanLink ? (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-content-primary">Your link</p>
              <button
                type="button"
                onClick={onCopyLink}
                className="motion-focus motion-press -mr-1 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Copy
              </button>
            </div>
            <p className="truncate rounded-xl border border-stroke-default bg-bg-base px-4 py-2.5 font-mono text-xs text-content-secondary">
              {fanLink}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-content-tertiary">
              Links don&apos;t work in snap text. Add yours with the paperclip.
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={failed ? onRetry : onSend}
          disabled={(!ready && !failed) || busy}
          className="motion-focus motion-press mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-brand/25 bg-brand text-[15px] font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : failed ? (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ActionIcon className={actionIconClass} aria-hidden="true" />
          )}
          {ready ? label : failed ? 'Try again' : copy.making}
        </button>
        {tab === 'x' ? (
          <button type="button" onClick={onOpenX} className={`${SECONDARY_BUTTON_CLASS} mt-2`}>
            <SiX className={BRAND_MARK_CLASS} aria-hidden="true" />
            Open X with this post
          </button>
        ) : null}
        <p className="mt-2 text-center text-xs leading-5 text-content-tertiary">{footnote}</p>
      </div>
    </div>
  );
}

function MessagePanel({
  text,
  onChange,
  onWhatsApp,
  onCopy,
  onInstagramDm,
  onMore,
}: {
  text: string;
  onChange: (value: string) => void;
  onWhatsApp: () => void;
  onCopy: () => void;
  onInstagramDm: () => void;
  onMore: (() => void) | null;
}) {
  const secondary =
    'motion-focus motion-press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-sm font-medium text-content-primary transition-colors hover:bg-bg-hover';
  return (
    <div className="mx-auto max-w-md">
      <label htmlFor="share-message" className="mb-1.5 block text-sm font-medium text-content-primary">
        Message
      </label>
      {/* Shaped like a sent message, so it reads as the thing going out. */}
      <div className="rounded-[20px] rounded-br-md border border-brand/20 bg-brand/10 p-1">
        <textarea
          id="share-message"
          value={text}
          onChange={(event) => onChange(event.target.value)}
          rows={6}
          className="w-full resize-none rounded-[16px] bg-transparent px-3 py-2.5 text-[15px] leading-6 text-content-primary outline-none"
        />
      </div>

      <button
        type="button"
        onClick={onWhatsApp}
        className="motion-focus motion-press mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-brand/25 bg-brand text-[15px] font-semibold text-content-inverse transition-colors hover:bg-brand-hover"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        Send on WhatsApp
      </button>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onCopy} className={secondary}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy
        </button>
        <button type="button" onClick={onInstagramDm} className={secondary}>
          <Instagram className="h-4 w-4" aria-hidden="true" />
          Instagram DM
        </button>
        {onMore ? (
          <button type="button" onClick={onMore} className={secondary}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            More
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-center text-xs leading-5 text-content-tertiary">
        Send it to anyone. It pastes into any DM.
      </p>
    </div>
  );
}

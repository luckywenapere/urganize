'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  Copy,
  Download,
  Instagram,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Share2,
  X,
} from '@/components/icons';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
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
  buildDmMessage,
  buildInstagramCaption,
  buildShareHeadline,
  buildStatusCaption,
  defaultShareVoice,
  describeShareTiming,
  normalizeFanLink,
  normalizeShareLine,
  releaseNoun,
  shareDisplayTitle,
  shareTimingAnchor,
  toLocalYmd,
  type ShareAnswers,
  type ShareFormat,
  type ShareReleaseFacts,
} from '@/lib/social-share';
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
import { useShareImages, type ShareImageState } from './useShareImages';

/**
 * Share to socials (founder request, 2026-09-23): the one sheet that turns a
 * rollout into an Instagram post, a WhatsApp status and a message somebody can
 * DM to anybody.
 *
 * Two steps, and the order is the founder's: ASK, then SHARE. The four
 * questions come first every time the sheet opens ("always ask questions for
 * clarity"), filled in with last time's answers so a second visit is one tap.
 * Nothing is posted anywhere by us. Instagram and WhatsApp are reached through
 * the phone's own share sheet, which is the only door either app opens to a
 * web page, and on a computer the images are saved instead.
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
type Tab = 'instagram' | 'status' | 'message';
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
  'block w-full rounded-xl border border-stroke-default bg-bg-base px-4 text-[15px] text-content-primary transition-[border-color,box-shadow] duration-200 placeholder:text-content-tertiary hover:border-stroke-strong focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/15';

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

// ── The dialog ──────────────────────────────────────────────────────────────

function ShareDialog({ request }: { request: ShareRequest }) {
  const close = useShareStore((state) => state.close);
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
        Answer four quick questions and we&apos;ll make an Instagram post, a WhatsApp status and a
        message you can send to anyone.
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
            <p id="share-fan-link-error" className="mt-1.5 flex items-start gap-1.5 text-xs text-status-error">
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
    <div role="radiogroup" className={`grid grid-cols-2 ${TRACK_CLASS}`}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
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

// ── Step 2: the three things to send ────────────────────────────────────────

const TABS: Array<{ id: Tab; label: string; icon: typeof Instagram }> = [
  { id: 'instagram', label: 'Instagram', icon: Instagram },
  { id: 'status', label: 'Status', icon: MessageCircle },
  { id: 'message', label: 'Message', icon: Send },
];

type SentMethod = 'share' | 'download' | 'copy' | 'whatsapp' | 'instagram_dm' | 'more';
type SentChannel = 'instagram' | 'whatsapp_status' | 'message';

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
}) {
  const [tab, setTab] = useState<Tab>('instagram');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);

  const defaults = useMemo(
    () => ({
      instagram: buildInstagramCaption(facts, answers, todayYmd),
      status: buildStatusCaption(facts, answers, todayYmd),
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

  const sendImage = async (format: ShareFormat) => {
    const state = images[format];
    if (state.kind !== 'ready' || busy) return;
    const caption = textFor(format === 'post' ? 'instagram' : 'status');
    const channel = format === 'post' ? 'instagram' : 'whatsapp_status';
    // Both started inside this tap, before anything is awaited: the browser
    // only allows the clipboard and the share sheet from a live gesture.
    const copied = copyText(caption);
    if (!canShareFilesToApps(state.file)) {
      downloadFile(state.file, state.file.name);
      report(channel, 'download');
      setFeedback({
        tone: 'ok',
        text: (await copied)
          ? 'Saved to your downloads. Your caption is copied too.'
          : 'Saved to your downloads.',
      });
      return;
    }
    setBusy(true);
    try {
      const outcome = await shareFileToApps({
        file: state.file,
        title: facts.title,
        // Instagram ignores text beside an image and some builds refuse the
        // pair, so the caption travels by clipboard. WhatsApp keeps it.
        text: format === 'status' ? caption : undefined,
      });
      const didCopy = await copied;
      if (outcome === 'shared') {
        report(channel, 'share');
        setFeedback({
          tone: 'ok',
          text:
            format === 'post'
              ? didCopy
                ? 'Caption copied. Paste it into Instagram.'
                : 'Shared. Copy the caption above and paste it into Instagram.'
              : 'Shared.',
        });
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
    const didCopy = await copyText(text);
    if (didCopy) report(channel, 'copy');
    setFeedback(
      didCopy
        ? { tone: 'ok', text: ok }
        : { tone: 'error', text: 'Could not copy. Press and hold the text to copy it.' }
    );
  };

  const panelId = `share-panel-${tab}`;

  return (
    // min-h-full resolves only where the panel has a fixed height (a phone, on
    // this step), so on a computer this is the plain column it always was.
    <div className="flex min-h-full flex-col">
      <div
        role="tablist"
        aria-label="Where to share"
        onKeyDown={onTabKeyDown}
        className={`grid grid-cols-3 ${TRACK_CLASS}`}
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
              className={`motion-focus motion-press inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-200 ${
                selected
                  ? 'bg-bg-surface text-content-primary shadow-[0_1px_3px_rgb(var(--shadow-ink)/calc(0.25*var(--shadow-alpha-scale)))]'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
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
              report('message', 'whatsapp');
              void openExternalUrl(buildWhatsAppShareUrl(textFor('message')));
            }}
            onCopy={() => void copyAndSay(textFor('message'), 'message', 'Message copied.')}
            onInstagramDm={() => {
              // Copy inside the tap, then open the inbox. Instagram has no way
              // for a web page to fill in a DM, so pasting is the honest route.
              const copied = copyText(textFor('message'));
              void openExternalUrl(INSTAGRAM_INBOX_URL);
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
                    void shareTextToApps({ text: textFor('message') }).then((outcome) => {
                      if (outcome === 'shared') report('message', 'more');
                    });
                  }
                : null
            }
          />
        ) : (
          <ImagePanel
            format={tab === 'instagram' ? 'post' : 'status'}
            image={images[tab === 'instagram' ? 'post' : 'status']}
            caption={textFor(tab)}
            onCaptionChange={(value) => onEdit(tab, value)}
            onCopyCaption={() =>
              void copyAndSay(textFor(tab), tab === 'instagram' ? 'instagram' : 'whatsapp_status', 'Caption copied.')
            }
            hasLink={Boolean(answers.fanLink)}
            busy={busy}
            onSend={() => void sendImage(tab === 'instagram' ? 'post' : 'status')}
            onRetry={onRetry}
          />
        )}
      </div>

      <div className="mt-auto">
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

function ImagePanel({
  format,
  image,
  caption,
  onCaptionChange,
  onCopyCaption,
  hasLink,
  busy,
  onSend,
  onRetry,
}: {
  format: ShareFormat;
  image: ShareImageState;
  caption: string;
  onCaptionChange: (value: string) => void;
  onCopyCaption: () => void;
  hasLink: boolean;
  busy: boolean;
  onSend: () => void;
  onRetry: () => void;
}) {
  const isPost = format === 'post';
  const ready = image.kind === 'ready';
  // A failed image turns the main button into the retry. Left as it was, the
  // button sat disabled still saying "Making your post…" under an error that
  // said otherwise.
  const failed = image.kind === 'error';
  // Decided against the file itself, once it exists: a touch browser whose
  // share sheet takes files shares, everything else saves.
  const canShare = useMemo(() => (image.kind === 'ready' ? canShareFilesToApps(image.file) : false), [image]);

  const label = isPost
    ? canShare
      ? 'Share to Instagram'
      : 'Save image'
    : canShare
      ? 'Post to status'
      : 'Save image';
  const ActionIcon = canShare ? (isPost ? Instagram : MessageCircle) : Download;
  const footnote = isPost
    ? canShare
      ? 'We copy the caption for you. Paste it when Instagram opens.'
      : 'Post it from your phone, or at instagram.com. Your caption is copied when you save.'
    : canShare
      ? 'Pick WhatsApp, then My status. It works as an Instagram story too.'
      : 'Save it, then post it from your phone. It works as an Instagram story too.';

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
          <img
            src={image.url}
            alt={isPost ? 'Your Instagram post' : 'Your WhatsApp status'}
            className="h-full w-full object-cover"
          />
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
            <p className="text-xs">{isPost ? 'Making your post…' : 'Making your status…'}</p>
          </div>
        )}
      </div>

      <div className="mt-4 sm:mt-0">
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor={`share-caption-${format}`} className="text-sm font-medium text-content-primary">
            Caption
          </label>
          <button
            type="button"
            onClick={onCopyCaption}
            className="motion-focus motion-press -mr-1 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Copy
          </button>
        </div>
        <textarea
          id={`share-caption-${format}`}
          value={caption}
          onChange={(event) => onCaptionChange(event.target.value)}
          // Four for both: the status caption is shorter, but its raw link wraps on a
          // phone, and at three rows the last line of it sat cut off under the edge.
          rows={4}
          className={`${FIELD_CLASS} resize-none py-2.5 leading-6`}
        />
        {isPost && hasLink ? (
          <p className="mt-1.5 text-xs leading-5 text-content-tertiary">
            Links don&apos;t work in Instagram captions, so put yours in your bio.
          </p>
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
            <ActionIcon className="h-4 w-4" aria-hidden="true" />
          )}
          {ready ? label : failed ? 'Try again' : isPost ? 'Making your post…' : 'Making your status…'}
        </button>
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

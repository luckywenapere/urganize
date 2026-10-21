'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ArrowLeft, CalendarDays, Check, Loader2, X } from '@/components/icons';
import { Button, IconButton } from '@urganize/ui';
import { BlankSheetIllustration, PlanIllustration } from '@/components/app/BrandIcons';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { onRadioGroupKeyDown } from '@/lib/radio-group-keys';
import { supabase } from '@/lib/supabase/client';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { useFirstReleaseRequired } from './useFirstReleaseRequired';
import {
  getAvailableReleaseTypes,
  getTemplate,
  getTemplateLeadTimeDays,
} from '@/lib/release-templates/loader';
import { DEFAULT_RELEASE_TITLE, TITLE_SKIP_TIP, type DbReleaseType } from '@/types/releases';
import { InfoTip } from '@/components/shared/HelpTip';
import { isBrowserOnline } from '@/lib/offline/status';

// The release types this modal can create: authored AND switched on AND
// storable. getAvailableReleaseTypes is the loader's flag gate, so with
// NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES off this is just ['single'] and no
// picker renders — exactly the behavior before the picker existed. music_video
// is filtered out because the release_type DB enum cannot store it.
//
// Module scope is right here: NEXT_PUBLIC_* is inlined at build time, and the
// onboarding step-0 picker derives its options the same way.
const CREATABLE_RELEASE_TYPES = getAvailableReleaseTypes().filter(
  (releaseType): releaseType is DbReleaseType => releaseType !== 'music_video'
);
const SHOW_TYPE_PICKER = CREATABLE_RELEASE_TYPES.length > 1;

const RELEASE_TYPE_LABELS: Record<DbReleaseType, string> = {
  single: 'Single',
  ep: 'EP',
  album: 'Album',
};

// With the planner on, choosing a rollout plan here does not create activities:
// it creates the release, and the manager plans it with UrgAns next. Only the
// wording changes, so the flag is read for copy alone.
const PLANNER_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_PLANNER === 'true';

// Type-first create (founder call, 2026-09-01). When on, this modal is ONE
// screen: no plan chooser (every type-first release is a rollout release;
// "start blank" is covered by never setting a date and adding your own
// activities, the existing SetReleaseDateCard escape hatch), and no date,
// which is prompted later inside the release (ReleaseSetupSheet).
//
// AMENDED 2026-10-09 (v1.91.3): the screen now carries an optional title
// field, and the Single / EP / Album cards are a choice rather than the
// submit: pick one (and change your mind freely), then "Create rollout". The
// tap-to-create version had no way to name the rollout, so every one was an
// "Untitled rollout", and the cards locked the moment one was tapped. An
// empty title still means "Untitled rollout", and ReleaseSetupSheet still
// asks for a name only while the title is the default. Flag off, the
// two-step modal below is unchanged.
const TYPE_FIRST_CREATE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_TYPE_FIRST_CREATE === 'true';

function formatYmdLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatYmdHuman(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

export type ReleasePlanChoice = 'template' | 'blank';

type CreateReleaseModalProps = {
  open: boolean;
  onClose: () => void;
  /** Starts past the plan chooser with this plan already picked. Only the
   *  first-rollout focus passes it, after asking the manager itself. */
  /** Start on this artist (opened from an artist's page). */
  initialArtistId?: string | null;
  initialPlan?: ReleasePlanChoice | null;
  /** `plan` tells the caller HOW the release was created — template
   * creations get the post-create rollout guide (?new=1); blank ones don't
   * (its copy describes the plan that doesn't exist).
   *
   * `plannerPending` is what the server actually did: with the planner on, a
   * template creation makes no activities at all and the manager plans it
   * with UrgAns, so the guide would be describing a plan nobody has yet. */
  onCreated: (
    releaseId: string,
    plan: ReleasePlanChoice,
    result?: {
      plannerPending: boolean;
      /** The title as typed, or null when the user left it blank and the
       * route defaulted it. Callers use it for copy that names the release
       * without waiting on the store resync. */
      title?: string | null;
      /** The title the server actually saved (trimmed and sanitised; the
       * default when none was typed). The planner sends it with its
       * abandoned-shell discard, which only accepts an exact match. */
      savedTitle?: string | null;
      /** The playbook picked in this modal's type picker, or null when the
       * picker never rendered (single-playbook environments, where the row's
       * 'single' is a default, not an answer). Callers hand it to the planner
       * intake as a prefill so its own type question isn't asked twice —
       * prefill only what was actually asked. */
      releaseType?: DbReleaseType | null;
      /** The person's first real rollout (the server's answer, test rollouts
       * excluded). The caller saves the once-only share offer for the next
       * visit off the back of it (withFirstShareOffer). */
      firstRelease?: boolean;
    }
  ) => void;
  /**
   * The one-tap test path (NEXT_PUBLIC_FEATURE_TEST_RELEASE). When provided
   * AND this is a first release, the chooser step carries a quiet
   * "Just looking? Try a test rollout instead" link that closes the modal
   * and runs it. Threaded from the mount sites rather than instantiated
   * here on purpose: this modal deliberately holds no router, and the test
   * path's defining act is a navigation. Callers pass it flag-gated, so
   * flag-off renders are byte-identical to before the prop existed.
   */
  onStartTestRelease?: () => void;
};

type CreateReleaseResponse = {
  releaseId?: string;
  id?: string;
  release?: {
    id?: string;
    title?: string;
    artistName?: string;
    releaseType?: string;
    releaseDate?: string | null;
  };
  redirectTo?: string;
  /** True when the release was created ready to be planned with UrgAns. */
  plannerPending?: boolean;
  /** True when this was the person's first real rollout. */
  firstRelease?: boolean;
  error?: string;
};

type FieldErrors = Partial<Record<'title' | 'releaseDate', string>>;

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

// Both fields are optional as of URG-230 (founder call): creating a release
// should have zero required fields. An empty date is valid and simply means
// "not decided yet" — the activities view then carries a card to set it, and
// for a Rollout-plan release that card is what builds the plan. Only a
// malformed date is an error.
function validateReleaseDate(value: string): string {
  if (!value) {
    return '';
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return 'Use a valid release date.';
  }

  return '';
}

export function CreateReleaseModal({
  open,
  onClose,
  onCreated,
  onStartTestRelease,
  initialPlan = null,
  initialArtistId = null,
}: CreateReleaseModalProps) {
  // COPY ONLY. This modal is always dismissible — the wall URG-217 built here
  // (no Escape, no backdrop, no X, no Cancel, a Sign out escape hatch) was
  // removed 2026-08-28 (founder call): it trapped exactly the people it was
  // built around, like an invited teammate who shouldn't be creating releases
  // at all. The zero-release nudge now lives in useFirstReleasePrompt (a
  // deferred, once-per-session open); dismissing lands on the "No releases
  // yet" empty state, whose Create release button reopens this. The predicate
  // is still read here so a first release keeps its warmer framing below.
  const isFirstRelease = useFirstReleaseRequired();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Step 1 (founder call, 2026-07-23): pick HOW to start — the rollout plan
  // (template, recommended) or a blank release. null = the chooser screen;
  // picking one advances to the title/date form. Resets on every open.
  const [plan, setPlan] = useState<ReleasePlanChoice | null>(null);

  // Which playbook the release follows. Always sent, so the server never has to
  // infer it; defaults to 'single', which is what every release created here
  // was implicitly before the picker existed.
  const [releaseType, setReleaseType] = useState<DbReleaseType>('single');

  // Type-first only: whether a card has been chosen yet. The cards used to be
  // the submit, so a type was always an explicit answer; they are a choice now,
  // and the planner is told the type only because somebody picked it. With a
  // single playbook there is nothing to choose, so it counts as picked.
  const [typeFirstPicked, setTypeFirstPicked] = useState(!SHOW_TYPE_PICKER);

  // WHOSE release this is. Read from the shared roster store rather than
  // fetched here: this modal opens often, and it shipped with a per-open fetch
  // that the store's recency guard now collapses to one request.
  //
  // FAILS OPEN in the strongest sense: an empty list, a failed fetch and a
  // still-loading one all render no picker and send no artistId, which drops
  // straight back to the implicit-artist path the server has always had. So a
  // one-artist team sees exactly what it saw before this existed, and a broken
  // fetch cannot block release creation.
  const artists = useArtistRosterStore((state) => state.artists);
  const loadRoster = useArtistRosterStore((state) => state.load);
  const [artistId, setArtistId] = useState('');
  const showArtistPicker = artists.length > 1;
  // DERIVED, not seeded by an effect: an empty choice falls through to the
  // team's original artist, which is the first row and the one the server would
  // have picked anyway. So the picker changes what is VISIBLE, never what a
  // manager gets by leaving it alone — and a roster that arrives after the
  // modal opened seeds itself with no cascading render.
  const selectedArtistId = artistId || (showArtistPicker ? (artists[0]?.id ?? '') : '');

  // Portal mount-guard. The modal renders into document.body via createPortal
  // to escape AppShell's `lazy-fade` wrapper, which carries a `transform` —
  // any transformed ancestor turns `position: fixed` into "fixed relative to
  // that ancestor," so scrolling the page would push the modal off-screen.
  // The mounted guard avoids touching `document` during SSR.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fresh chooser on every open.
  useEffect(() => {
    if (open) {
      // initialPlan skips the chooser: the first-rollout focus already asked
      // (lib/first-release-focus.ts) and must not ask a second time.
      setPlan(initialPlan);
      setReleaseType('single');
      setTypeFirstPicked(!SHOW_TYPE_PICKER);
      setArtistId(initialArtistId ?? '');
    }
  }, [open, initialPlan, initialArtistId]);

  // Refresh the roster on open. The store's recency guard makes this free on a
  // reopen, and it never surfaces an error — see the fail-open note above.
  useEffect(() => {
    if (!open) return;
    void loadRoster();
  }, [open, loadRoster]);

  // Focus lands on the dialog when it opens (the type chooser has no field to
  // focus, and the title input only exists once a plan is picked), stays inside
  // while it is open, and returns to the button that opened it. This replaced a
  // hand-rolled window-level Tab trap that never moved focus in at all, and
  // that fought any modal opened above it (the quick-create modal can be).
  useDialogFocus(open && isMounted, panelRef, {
    initialFocus: 'panel',
    onBackClose: () => {
      if (!isSubmitting) onClose();
    },
  });

  useEffect(() => {
    if (!open || (!plan && !TYPE_FIRST_CREATE_ENABLED)) {
      return;
    }

    const timer = window.setTimeout(() => titleInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open, plan]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // Escape closes, unless a create is in flight.
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSubmitting, onClose, open]);

  // Lock background scroll while the modal is open — the shared ref-counted
  // lock (lib/body-scroll-lock.ts) captures/restores overflow + scrollbar
  // padding exactly once across any stack of concurrent modals.
  useEffect(() => {
    if (!open) {
      return;
    }
    return lockBodyScroll();
  }, [open]);

  // Nothing to require (URG-230) — an untitled, undated release is valid and
  // the server fills in a default name. The plan choice is already made by
  // this point (the form is hidden until it is), so submission is only
  // gated on not already being in flight.
  const canSubmit = useMemo(() => !isSubmitting, [isSubmitting]);

  // Anchor "today" once per modal mount so the `min` attribute stays stable
  // for the duration of the dialog. (The lead-time explainer moved to the
  // post-create guide, NewReleaseGuide — founder call, 2026-07-23.)
  const todayYmd = useMemo(() => formatYmdLocal(new Date()), []);

  // Calm "compressed runway" note: only fires when the picked date is valid AND
  // sooner than the template's lead time. The note frames the consequence in
  // the catch-up language commit 2 surfaces in the tasks panel — it doesn't
  // block submission; the user can proceed with any future date.
  // Per playbook, not per app: an EP needs 13 weeks of runway and an album 17,
  // so the same date that is comfortable for a single is heavily compressed for
  // an album. Safe to call getTemplate here — the picker only ever offers types
  // the loader resolved.
  const leadTimeDays = useMemo(
    () => getTemplateLeadTimeDays(getTemplate(releaseType)),
    [releaseType]
  );

  const compressedNote = useMemo(() => {
    if (!releaseDate) return null;
    const picked = new Date(`${releaseDate}T00:00:00`);
    if (Number.isNaN(picked.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    picked.setHours(0, 0, 0, 0);
    const daysOut = Math.round((picked.getTime() - today.getTime()) / 86400000);
    if (daysOut >= leadTimeDays) return null;
    const compressedWeeks = Math.max(1, Math.ceil((leadTimeDays - daysOut) / 7));
    return {
      compressedWeeks,
      displayDate: formatYmdHuman(releaseDate),
    };
  }, [releaseDate, leadTimeDays]);

  if (!open || !isMounted) {
    return null;
  }

  const validateForm = () => {
    const nextErrors: FieldErrors = {};

    // An empty title is fine (URG-230) — the server names it. Length is
    // still enforced because the column is capped at 140.
    if (title.trim().length > 140) {
      nextErrors.title = 'Rollout title must be 140 characters or fewer.';
    }

    const dateError = validateReleaseDate(releaseDate);
    if (dateError) {
      nextErrors.releaseDate = dateError;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // The one create call, shared by the step-2 form submit and the type-first
  // cards (which ARE the submit under NEXT_PUBLIC_FEATURE_TYPE_FIRST_CREATE).
  const performCreate = async (input: {
    title?: string;
    releaseDate?: string;
    releaseType: DbReleaseType;
    plan: ReleasePlanChoice;
    /** Sent only when the artist picker actually rendered (see handleSubmit);
     * the type-first cards never render it, so they always take the server's
     * implicit-artist path. */
    artistId?: string;
    /** Whether the type was an explicit pick (the type-first cards, or the
     * step-2 picker when it rendered) — callers hand an explicit pick to the
     * planner intake as a prefill; a default is not an answer. */
    typeWasPicked: boolean;
  }) => {
    // Release creation needs the server: artist resolution, the release
    // cap check, and (for a template plan) task instantiation all happen
    // there, and the flow branches on the id it returns. There is nothing
    // useful to queue, so say so plainly instead of firing a request that
    // can only time out.
    if (!isBrowserOnline()) {
      setSubmitError("You're offline. Creating a rollout needs a connection. Try again once you're back online.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch('/api/releases', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Both may be empty — the route defaults the title and treats a
          // missing date as "not decided yet" (URG-230).
          title: input.title || undefined,
          releaseDate: input.releaseDate || undefined,
          releaseType: input.releaseType,
          // Omitted unless the picker actually rendered, so a one-artist team
          // keeps taking the server's implicit-artist path untouched.
          artistId: input.artistId,
          source: 'dashboard',
          plan: input.plan,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as CreateReleaseResponse;
      if (!response.ok) {
        throw new Error(payload.error || 'Could not create rollout.');
      }

      const releaseId = payload.release?.id || payload.releaseId || payload.id || '';
      if (!releaseId) {
        throw new Error('Rollout created, but no rollout id was returned.');
      }

      setTitle('');
      setReleaseDate('');
      setErrors({});
      // Resync the store here, with force, so the new release is guaranteed
      // to appear no matter which caller opened the modal. Callers' own
      // follow-up non-forced loadCommandCenter() calls piggyback on this
      // in-flight load instead of firing a duplicate fetch.
      void useReleaseStore.getState().loadCommandCenter({ force: true });
      onCreated(releaseId, input.plan, {
        plannerPending: payload.plannerPending === true,
        title: input.title || null,
        savedTitle: payload.release?.title ?? null,
        releaseType: input.typeWasPicked ? input.releaseType : null,
        firstRelease: payload.firstRelease === true,
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not create rollout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!validateForm()) {
      return;
    }
    if (TYPE_FIRST_CREATE_ENABLED) {
      // The type-first screen: title (optional) plus the chosen card. Enter in
      // the title field lands here too, so an unpicked type is said plainly
      // rather than silently defaulted to Single.
      if (!typeFirstPicked) {
        setSubmitError('Choose Single, EP or Album first.');
        return;
      }
      await performCreate({
        title: title.trim(),
        releaseType,
        plan: initialPlan ?? 'template',
        typeWasPicked: true,
      });
      return;
    }
    await performCreate({
      title: title.trim(),
      releaseDate,
      releaseType,
      plan: plan || 'template',
      artistId: showArtistPicker && selectedArtistId ? selectedArtistId : undefined,
      typeWasPicked: SHOW_TYPE_PICKER,
    });
  };

  // Type-first create: a card is a choice, not the submit (v1.91.3), so it
  // can be changed until "Create rollout" is pressed.
  const handleTypeFirstPick = (option: DbReleaseType) => {
    if (isSubmitting) return;
    setReleaseType(option);
    setTypeFirstPicked(true);
    setSubmitError('');
  };

  const modal = (
    // `fixed inset-x-0 top-0 h-[100dvh]` pins to the viewport using the
    // *dynamic* viewport height (excludes mobile browser chrome). Using
    // `inset-0` alone falls back to the layout viewport on iOS, pushing the
    // bottom of the modal under the address bar / bottom toolbar.
    <div
      className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-center justify-center bg-black/72 px-4 py-4 backdrop-blur-sm sm:py-8"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close create rollout modal"
        className="absolute inset-0"
        onClick={() => {
          if (!isSubmitting) {
            onClose();
          }
        }}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-release-title"
        className="relative mx-auto w-full max-w-3xl focus:outline-none"
      >
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden urg-cartouche rounded-2xl border border-stroke-default bg-bg-surface shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.76*var(--shadow-alpha-scale)))] sm:max-h-[calc(100dvh-4rem)]"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stroke-subtle p-4 sm:p-5">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
                {isFirstRelease ? 'Welcome to Urganize' : 'Create rollout'}
                {plan ? (
                  <button
                    type="button"
                    onClick={() => setPlan(null)}
                    disabled={isSubmitting}
                    className="motion-focus inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-secondary"
                  >
                    <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                    {plan === 'template' ? 'Rollout plan' : 'Blank rollout'}
                  </button>
                ) : null}
              </p>
              <h2 id="create-release-title" className="mt-2 font-display text-2xl font-semibold text-content-primary">
                {TYPE_FIRST_CREATE_ENABLED
                  ? 'What are you releasing?'
                  : isFirstRelease
                    ? plan
                      ? 'Your first rollout'
                      : 'Create your first rollout'
                    : plan
                      ? 'New rollout'
                      : 'How do you want to start?'}
              </h2>
              {/* First-run context, echoing the onboarding wizard's own line
                  so the two first-run surfaces sound like one product. */}
              {isFirstRelease ? (
                <p className="mt-2 max-w-xl text-sm leading-6 text-content-secondary">
                  Every rollout gets its own place for activities, files and your team.
                  Start with this one and everything else follows.
                </p>
              ) : null}
            </div>
            <IconButton
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close modal"
              className="shrink-0 border-stroke-default bg-[rgb(var(--color-stroke)/0.02)]"
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          {/* Type-first create (founder call, 2026-09-01): ONE screen, no plan
              chooser (every type-first release is a rollout release). Each card
              is just the type's name; the playbook numbers were dropped
              (founder call, 2026-09-29). Since v1.91.3 the screen opens on an
              optional title field, the cards are a radio choice that stays
              changeable, and the footer's "Create rollout" is the submit. */}
          {TYPE_FIRST_CREATE_ENABLED ? (
            <div className="space-y-5 overflow-y-auto p-4 sm:p-5">
              <label className="block">
                <span className="mb-2 flex items-baseline gap-2 text-sm font-medium text-content-primary">
                  What&apos;s it called?
                  <span className="text-xs font-normal text-content-tertiary">Optional</span>
                  <InfoTip label="About the name" text={TITLE_SKIP_TIP} />
                </span>
                <input
                  ref={titleInputRef}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={isSubmitting}
                  className="input rounded-lg border-stroke-control bg-bg-elevated"
                  placeholder={DEFAULT_RELEASE_TITLE}
                  maxLength={140}
                  aria-invalid={Boolean(errors.title)}
                />
                {errors.title ? (
                  <p role="alert" className="mt-2 text-xs text-status-error">{errors.title}</p>
                ) : null}
              </label>

              {SHOW_TYPE_PICKER ? (
                <div
                  role="radiogroup"
                  aria-label="Format"
                  onKeyDown={(event) =>
                    onRadioGroupKeyDown(event, CREATABLE_RELEASE_TYPES.indexOf(releaseType), (index) =>
                      handleTypeFirstPick(CREATABLE_RELEASE_TYPES[index])
                    )
                  }
                >
                  <span className="mb-2 block text-sm font-medium text-content-primary">Format</span>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {CREATABLE_RELEASE_TYPES.map((option, index) => {
                      const isSelected = typeFirstPicked && option === releaseType;
                      // Roving tabindex: the chosen card, or the first one
                      // before anything is chosen, is the group's one Tab stop.
                      const isTabStop = typeFirstPicked ? isSelected : index === 0;
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={isTabStop ? 0 : -1}
                          onClick={() => handleTypeFirstPick(option)}
                          disabled={isSubmitting}
                          className={`motion-focus motion-press group flex items-center gap-2 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:p-5 ${
                            isSelected
                              ? 'border-brand bg-brand/10'
                              : 'border-stroke-default bg-bg-elevated hover:border-brand/50 hover:bg-bg-hover'
                          }`}
                        >
                          {isSelected ? (
                            <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                          ) : null}
                          <span className="font-display text-base font-semibold text-content-primary">
                            {RELEASE_TYPE_LABELS[option]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Step 1 — the chooser (founder call, 2026-07-23): two option
              cards side by side, Linear-style. Rollout plan is the
              recommended default; Blank is the empty canvas. */}
          {!TYPE_FIRST_CREATE_ENABLED && !plan ? (
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <button
                type="button"
                onClick={() => setPlan('template')}
                className="motion-focus motion-press group flex flex-col items-start gap-3 rounded-xl border border-stroke-default bg-bg-elevated p-4 text-left transition-colors hover:border-brand/50 hover:bg-bg-hover sm:p-5"
              >
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand/10 text-brand">
                  <PlanIllustration className="h-7 w-7" />
                </span>
                <span className="flex items-center gap-2 font-display text-base font-semibold text-content-primary">
                  Rollout plan
                  <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                    Recommended
                  </span>
                </span>
                <span className="text-sm leading-6 text-content-secondary">
                  {PLANNER_ENABLED
                    ? 'Plan it with UrgAns. A few questions, then a draft rollout you can edit before anything is scheduled.'
                    : 'Start with the proven rollout plan. Every activity from first prep to release day is scheduled around your date and ready to edit. No date yet? It waits for one.'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPlan('blank')}
                className="motion-focus motion-press group flex flex-col items-start gap-3 rounded-xl border border-stroke-default bg-bg-elevated p-4 text-left transition-colors hover:border-stroke-strong hover:bg-bg-hover sm:p-5"
              >
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-bg-surface text-content-secondary">
                  <BlankSheetIllustration className="h-7 w-7" />
                </span>
                <span className="font-display text-base font-semibold text-content-primary">
                  Blank rollout
                </span>
                <span className="text-sm leading-6 text-content-secondary">
                  An empty rollout with no plan attached. Add your own
                  activities as you go. You know your process.
                </span>
              </button>

              {/* The test path's second entry point (first-release mode
                  only): a quiet link under the two real choices, for someone
                  who was offered this modal before they were ready to commit
                  real release details. Close-then-run so the modal is gone
                  before the navigation lands. */}
              {isFirstRelease && onStartTestRelease ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartTestRelease();
                  }}
                  disabled={isSubmitting}
                  className="motion-focus justify-self-center rounded-lg px-3 py-2 text-sm font-medium text-content-secondary transition-colors hover:text-content-primary sm:col-span-2"
                >
                  Just looking? Try a test rollout instead
                </button>
              ) : null}
            </div>
          ) : null}

          {/* The body scrolls internally when the form exceeds the viewport
              (small phones). Header + footer stay pinned via `shrink-0` so the
              submit button is always reachable without scrolling the page. */}
          <div className={plan ? 'flex-1 space-y-4 overflow-y-auto p-4 sm:p-5' : 'hidden'}>
              {/* Release type leads the form: it decides which playbook builds
                  the plan, so it has to be answered before the date field's
                  runway warning means anything. Renders only when more than one
                  playbook is switched on — with the EP/album flag off there is
                  nothing to choose and the release is a single, as before.
                  Deliberately not part of step 1, which asks a different
                  question (rollout plan vs blank); a blank EP is legitimate and
                  should still stamp the row's type. */}
              {/* WHOSE release. Above the type picker because it is the more
                  fundamental question, and above the date for the same reason
                  the type picker is. Renders only when the team has more than
                  one artist — the release-type picker's precedent exactly: no
                  control until there is a real choice, so every one-artist team
                  sees the form it saw before rosters existed. A <select>
                  rather than a radio row because a roster can be long, unlike
                  the three fixed release types. */}
              {showArtistPicker ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-content-primary">
                    Artist
                  </span>
                  <select
                    value={selectedArtistId}
                    onChange={(event) => setArtistId(event.target.value)}
                    className="w-full rounded-lg border border-stroke-control bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                  >
                    {artists.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {SHOW_TYPE_PICKER ? (
                <div
                  role="radiogroup"
                  aria-label="Format"
                  onKeyDown={(event) =>
                    onRadioGroupKeyDown(event, CREATABLE_RELEASE_TYPES.indexOf(releaseType), (index) =>
                      setReleaseType(CREATABLE_RELEASE_TYPES[index])
                    )
                  }
                >
                  <span className="mb-2 block text-sm font-medium text-content-primary">
                    Format
                  </span>
                  <div className="flex gap-2">
                    {CREATABLE_RELEASE_TYPES.map((option) => {
                      const isSelected = option === releaseType;
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={isSelected ? 0 : -1}
                          onClick={() => setReleaseType(option)}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                            isSelected
                              ? 'border-brand bg-brand/10 text-content-primary'
                              : 'border-stroke-default bg-bg-elevated text-content-secondary hover:text-content-primary'
                          }`}
                        >
                          {isSelected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                          {RELEASE_TYPE_LABELS[option]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Both fields optional (URG-230). "Optional" sits in the label
                  itself rather than as placeholder text, so it survives the
                  field being filled in and is read out by screen readers with
                  the label. */}
              <label className="block">
                <span className="mb-2 flex items-baseline gap-2 text-sm font-medium text-content-primary">
                  Title
                  <span className="text-xs font-normal text-content-tertiary">Optional</span>
                  <InfoTip label="About the title" text={TITLE_SKIP_TIP} />
                </span>
                <input
                  ref={titleInputRef}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="input rounded-lg border-stroke-control bg-bg-elevated"
                  placeholder={DEFAULT_RELEASE_TITLE}
                  maxLength={140}
                  aria-invalid={Boolean(errors.title)}
                />
                {errors.title ? (
                  <p role="alert" className="mt-2 text-xs text-status-error">{errors.title}</p>
                ) : null}
              </label>

              <label className="block">
                <span className="mb-2 flex items-baseline gap-2 text-sm font-medium text-content-primary">
                  <CalendarDays
                    className="h-4 w-4 self-center text-content-tertiary"
                    aria-hidden="true"
                  />
                  Release date
                  <span className="text-xs font-normal text-content-tertiary">Optional</span>
                </span>
                <input
                  type="date"
                  min={todayYmd}
                  value={releaseDate}
                  onChange={(event) => setReleaseDate(event.target.value)}
                  className="input rounded-lg border-stroke-control bg-bg-elevated"
                  aria-invalid={Boolean(errors.releaseDate)}
                />
                {errors.releaseDate ? (
                  <p role="alert" className="mt-2 text-xs text-status-error">{errors.releaseDate}</p>
                ) : compressedNote && plan === 'template' ? (
                  <p className="mt-2 text-xs leading-5 text-content-secondary">
                    Heads up. A release date of {compressedNote.displayDate} compresses the first ~
                    {compressedNote.compressedWeeks}{' '}
                    {compressedNote.compressedWeeks === 1 ? 'week' : 'weeks'} of prep. Those
                    early tasks will show as &ldquo;Catch up&rdquo; so you can prioritize them.
                  </p>
                ) : !releaseDate ? (
                  // States the actual consequence of skipping, which differs
                  // by plan: a rollout plan is dated off release day, so it
                  // genuinely cannot be built yet.
                  <p className="mt-2 text-xs leading-5 text-content-secondary">
                    {plan === 'template'
                      ? PLANNER_ENABLED
                        ? "Don't have one yet? Skip it. UrgAns can suggest a date while you plan."
                        : "Don't have one yet? Skip it. Your rollout plan gets built the moment you set a date."
                      : "Don't have one yet? Skip it and add it whenever it's confirmed."}
                  </p>
                ) : null}
              </label>
          </div>

          {submitError ? (
            <div role="alert" className="mx-4 mb-4 flex shrink-0 items-start gap-3 border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error sm:mx-5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{submitError}</p>
            </div>
          ) : null}

          {plan || TYPE_FIRST_CREATE_ENABLED ? (
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-stroke-subtle p-4 sm:flex-row sm:justify-end sm:p-5">
              <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit}
                isLoading={isSubmitting}
                leftIcon={isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
              >
                Create rollout
              </Button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

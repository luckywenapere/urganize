'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ArrowLeft, CalendarDays, Loader2, X } from 'lucide-react';
import { Button, IconButton } from '@urganize/ui';
import { BlankSheetIllustration, PlanIllustration } from '@/components/app/BrandIcons';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { supabase } from '@/lib/supabase/client';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { getTemplate, getTemplateLeadTimeDays } from '@/lib/release-templates/loader';

// The modal currently only creates 'single' releases (CreateReleaseBody on the
// API also defaults releaseType to 'single'). When the modal grows a type
// picker, look this up dynamically from the picked type instead.
const ACTIVE_TEMPLATE = getTemplate('single');
const LEAD_TIME_DAYS = getTemplateLeadTimeDays(ACTIVE_TEMPLATE);

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
  /** `plan` tells the caller HOW the release was created — template
   * creations get the post-create rollout guide (?new=1); blank ones don't
   * (its copy describes the plan that doesn't exist). */
  onCreated: (releaseId: string, plan: ReleasePlanChoice) => void;
};

type CreateReleaseResponse = {
  releaseId?: string;
  id?: string;
  release?: {
    id?: string;
  };
  redirectTo?: string;
  error?: string;
};

type FieldErrors = Partial<Record<'title' | 'releaseDate', string>>;

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

function validateReleaseDate(value: string): string {
  if (!value) {
    return 'Release date is required.';
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return 'Use a valid release date.';
  }

  return '';
}

export function CreateReleaseModal({ open, onClose, onCreated }: CreateReleaseModalProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Step 1 (founder call, 2026-07-23): pick HOW to start — the rollout plan
  // (template, recommended) or a blank release. null = the chooser screen;
  // picking one advances to the title/date form. Resets on every open.
  const [plan, setPlan] = useState<ReleasePlanChoice | null>(null);

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
      setPlan(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !plan) {
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

  const canSubmit = useMemo(
    () => title.trim().length > 0 && releaseDate.length > 0 && !isSubmitting,
    [isSubmitting, releaseDate, title]
  );

  // Anchor "today" once per modal mount so the `min` attribute stays stable
  // for the duration of the dialog. (The lead-time explainer moved to the
  // post-create guide, NewReleaseGuide — founder call, 2026-07-23.)
  const todayYmd = useMemo(() => formatYmdLocal(new Date()), []);

  // Calm "compressed runway" note: only fires when the picked date is valid AND
  // sooner than the template's lead time. The note frames the consequence in
  // the catch-up language commit 2 surfaces in the tasks panel — it doesn't
  // block submission; the user can proceed with any future date.
  const compressedNote = useMemo(() => {
    if (!releaseDate) return null;
    const picked = new Date(`${releaseDate}T00:00:00`);
    if (Number.isNaN(picked.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    picked.setHours(0, 0, 0, 0);
    const daysOut = Math.round((picked.getTime() - today.getTime()) / 86400000);
    if (daysOut >= LEAD_TIME_DAYS) return null;
    const compressedWeeks = Math.max(1, Math.ceil((LEAD_TIME_DAYS - daysOut) / 7));
    return {
      compressedWeeks,
      displayDate: formatYmdHuman(releaseDate),
    };
  }, [releaseDate]);

  if (!open || !isMounted) {
    return null;
  }

  const validateForm = () => {
    const nextErrors: FieldErrors = {};

    if (!title.trim()) {
      nextErrors.title = 'Release title is required.';
    } else if (title.trim().length > 140) {
      nextErrors.title = 'Release title must be 140 characters or fewer.';
    }

    const dateError = validateReleaseDate(releaseDate);
    if (dateError) {
      nextErrors.releaseDate = dateError;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateForm()) {
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
          title: title.trim(),
          releaseDate: releaseDate || undefined,
          source: 'dashboard',
          plan: plan || 'template',
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as CreateReleaseResponse;
      if (!response.ok) {
        throw new Error(payload.error || 'Could not create release.');
      }

      const releaseId = payload.release?.id || payload.releaseId || payload.id || '';
      if (!releaseId) {
        throw new Error('Release created, but no release id was returned.');
      }

      setTitle('');
      setReleaseDate('');
      setErrors({});
      // Resync the store here, with force, so the new release is guaranteed
      // to appear no matter which caller opened the modal. Callers' own
      // follow-up non-forced loadCommandCenter() calls piggyback on this
      // in-flight load instead of firing a duplicate fetch.
      void useReleaseStore.getState().loadCommandCenter({ force: true });
      onCreated(releaseId, plan || 'template');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not create release.');
    } finally {
      setIsSubmitting(false);
    }
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
        aria-label="Close create release modal"
        className="absolute inset-0"
        onClick={() => {
          if (!isSubmitting) {
            onClose();
          }
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-release-title"
        className="relative mx-auto w-full max-w-3xl"
      >
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.76*var(--shadow-alpha-scale)))] sm:max-h-[calc(100dvh-4rem)]"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stroke-subtle p-4 sm:p-5">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
                Create release
                {plan ? (
                  <button
                    type="button"
                    onClick={() => setPlan(null)}
                    disabled={isSubmitting}
                    className="motion-focus inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-secondary"
                  >
                    <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                    {plan === 'template' ? 'Rollout plan' : 'Blank release'}
                  </button>
                ) : null}
              </p>
              <h2 id="create-release-title" className="mt-2 font-display text-2xl font-semibold text-content-primary">
                {plan ? 'New release' : 'How do you want to start?'}
              </h2>
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

          {/* Step 1 — the chooser (founder call, 2026-07-23): two option
              cards side by side, Linear-style. Rollout plan is the
              recommended default; Blank is the empty canvas. */}
          {!plan ? (
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
                  Start with the proven release plan — every activity from first
                  prep to release day, scheduled around your date and ready to
                  edit.
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
                  Blank release
                </span>
                <span className="text-sm leading-6 text-content-secondary">
                  An empty release with no plan attached. Add your own
                  activities as you go — you know your process.
                </span>
              </button>
            </div>
          ) : null}

          {/* The body scrolls internally when the form exceeds the viewport
              (small phones). Header + footer stay pinned via `shrink-0` so the
              submit button is always reachable without scrolling the page. */}
          <div className={plan ? 'flex-1 space-y-4 overflow-y-auto p-4 sm:p-5' : 'hidden'}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-content-primary">Release title</span>
                <input
                  ref={titleInputRef}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="input rounded-lg border-stroke-default bg-bg-elevated"
                  placeholder="Midnight Drive"
                  maxLength={140}
                  aria-invalid={Boolean(errors.title)}
                />
                {errors.title ? <p className="mt-2 text-xs text-status-error">{errors.title}</p> : null}
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-content-primary">
                  <CalendarDays className="h-4 w-4 text-content-tertiary" />
                  Release date
                </span>
                <input
                  type="date"
                  required
                  min={todayYmd}
                  value={releaseDate}
                  onChange={(event) => setReleaseDate(event.target.value)}
                  className="input rounded-lg border-stroke-default bg-bg-elevated"
                  aria-invalid={Boolean(errors.releaseDate)}
                  aria-required="true"
                />
                {errors.releaseDate ? <p className="mt-2 text-xs text-status-error">{errors.releaseDate}</p> : null}
                {!errors.releaseDate && compressedNote && plan === 'template' ? (
                  <p className="mt-2 text-xs leading-5 text-content-secondary">
                    Heads up — a {compressedNote.displayDate} release compresses the first ~
                    {compressedNote.compressedWeeks}{' '}
                    {compressedNote.compressedWeeks === 1 ? 'week' : 'weeks'} of prep. Those
                    early tasks will show as &ldquo;Catch up&rdquo; so you can prioritize them.
                  </p>
                ) : null}
              </label>
          </div>

          {submitError ? (
            <div className="mx-4 mb-4 flex shrink-0 items-start gap-3 border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error sm:mx-5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{submitError}</p>
            </div>
          ) : null}

          {plan ? (
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
                Create release
              </Button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

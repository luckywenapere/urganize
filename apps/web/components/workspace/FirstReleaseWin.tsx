'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { getTemplate, getTemplateSpanDays } from '@/lib/release-templates/loader';

type FirstReleaseWinProps = {
  releaseId: string;
  /** Called to dismiss the moment and continue into the release. */
  onDone: () => void;
};

// How long to wait for the freshly-created plan (tasks) to land in the store
// before showing the reveal anyway, so a slow/failed instantiation never hangs
// the moment.
const SETTLE_TIMEOUT_MS = 5000;

const TEMPLATE_SPAN_WEEKS = (() => {
  const template = getTemplate('single');
  return template ? Math.round(getTemplateSpanDays(template) / 7) : 11;
})();

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

function formatDueLabel(dueDate: string | null): string {
  if (!dueDate) return '';
  const parsed = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(
    parsed
  );
}

function isValidEmail(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value.trim());
}

/**
 * The "first win" moment (URG-107). Fires once, after a new user creates their
 * FIRST release: dramatizes the auto-generated rollout plan (chaos → structure),
 * then leads with a teammate invite as the primary momentum hook (always
 * skippable — our ICP is the solo manager, so it must never gate the win).
 */
export function FirstReleaseWin({ releaseId, onDone }: FirstReleaseWinProps) {
  const release = useReleaseStore((state) => state.releases.find((r) => r.id === releaseId));
  const tasks = useTaskStore((state) => state.tasks);
  const [isMounted, setIsMounted] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [step, setStep] = useState<'reveal' | 'invite'>('reveal');

  // Invite state.
  const [email, setEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [invitedEmail, setInvitedEmail] = useState('');

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => lockBodyScroll(), []);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), SETTLE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const releaseTasks = useMemo(
    () => tasks.filter((task) => task.releaseId === releaseId),
    [tasks, releaseId]
  );

  const firstTask = useMemo(() => {
    const dated = releaseTasks
      .filter((task) => task.dueDate)
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
    return dated[0] ?? releaseTasks[0] ?? null;
  }, [releaseTasks]);

  // Ready once the plan has materialized (release + its tasks are in the store)
  // or the settle timeout elapsed — whichever comes first.
  const ready = (Boolean(release) && releaseTasks.length > 0) || timedOut;

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!isValidEmail(trimmed) || isInviting) {
      if (!isValidEmail(trimmed)) setInviteError('Enter a valid email address.');
      return;
    }
    setIsInviting(true);
    setInviteError('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/workspace/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: trimmed }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not send the invite.');
      setInvitedEmail(trimmed);
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Could not send the invite.');
    } finally {
      setIsInviting(false);
    }
  };

  if (!isMounted) return null;

  const overlay = (
    <div className="fixed inset-x-0 top-0 z-[230] grid h-[100dvh] place-items-center bg-black/80 px-4 py-8 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your first release is planned"
        className={`relative w-full max-w-lg rounded-2xl border border-stroke-default bg-bg-surface p-6 shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.76*var(--shadow-alpha-scale)))] transition-all duration-500 sm:p-8 ${
          isMounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        {!ready ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden="true" />
            <p className="text-sm text-content-secondary">Structuring your rollout…</p>
          </div>
        ) : step === 'reveal' ? (
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                Your plan is ready
              </span>
            </div>
            <h2 className="mt-3 font-display text-2xl font-semibold leading-tight text-content-primary sm:text-3xl">
              “{release?.title || 'Your release'}” is planned.
            </h2>

            <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <p className="font-display text-4xl font-semibold text-brand">
                  {releaseTasks.length || '—'}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-content-tertiary">
                  activities
                </p>
              </div>
              <div>
                <p className="font-display text-4xl font-semibold text-content-primary">
                  {TEMPLATE_SPAN_WEEKS}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-content-tertiary">
                  weeks
                </p>
              </div>
            </div>

            {firstTask ? (
              <p className="mt-5 text-sm text-content-secondary">
                First up:{' '}
                <span className="text-content-primary">{firstTask.title}</span>
                {formatDueLabel(firstTask.dueDate ?? null)
                  ? ` — due ${formatDueLabel(firstTask.dueDate ?? null)}`
                  : ''}
                .
              </p>
            ) : null}
            <p className="mt-2 text-sm text-content-secondary">
              Your whole rollout, structured in seconds.
            </p>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={() => setStep('invite')}
                rightIcon={<ArrowRight className="h-4 w-4" />}
                className="w-full sm:w-auto"
              >
                Bring your team in
              </Button>
              <button
                type="button"
                onClick={onDone}
                className="motion-focus w-full px-4 py-2 text-sm text-content-secondary transition-colors hover:text-content-primary sm:w-auto"
              >
                Go to my plan
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                Bring your team in
              </span>
            </div>
            <h2 className="mt-3 font-display text-2xl font-semibold leading-tight text-content-primary">
              Assign activities to your team
            </h2>
            <p className="mt-2 text-sm text-content-secondary">
              Invite a teammate to “{release?.title || 'this release'}” so you can hand off activities —
              or do it later from Settings.
            </p>

            {invitedEmail ? (
              <div className="mt-5">
                <div className="flex items-center gap-2 border border-brand/40 bg-brand/10 p-3 text-sm text-content-primary">
                  <Check className="h-4 w-4 text-brand" aria-hidden="true" />
                  <span>
                    Invite sent to <span className="font-medium">{invitedEmail}</span>.
                  </span>
                </div>
                <Button type="button" onClick={onDone} className="mt-5 w-full sm:w-auto">
                  Go to my plan
                </Button>
              </div>
            ) : (
              <form onSubmit={(event) => void handleInvite(event)} className="mt-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-content-primary">
                    Teammate email
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="teammate@email.com"
                    autoFocus
                    className="w-full border border-stroke-default bg-bg-base px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
                  />
                </label>
                {inviteError ? (
                  <p className="mt-2 text-xs text-status-error">{inviteError}</p>
                ) : null}
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="submit"
                    isLoading={isInviting}
                    disabled={!email.trim()}
                    className="w-full sm:w-auto"
                  >
                    Send invite
                  </Button>
                  <button
                    type="button"
                    onClick={onDone}
                    className="motion-focus w-full px-4 py-2 text-sm text-content-secondary transition-colors hover:text-content-primary sm:w-auto"
                  >
                    Skip for now
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

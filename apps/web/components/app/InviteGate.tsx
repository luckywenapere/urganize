'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, Users } from '@/components/icons';
import { Button } from '@urganize/ui';
import { supabase } from '@/lib/supabase/client';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { useAuthStore } from '@/lib/auth-store';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import {
  INVITE_GATE_OFF,
  INVITE_GATE_ONBOARDING_SKIP_KEY,
  inviteGateContinueUrl,
  isInviteGateHeldBack,
  inviteGateSkipKey,
  inviteGateStorageKey,
  isInviteGateEnabled,
  isInviteGateSkipped,
  isPlanView,
  isScrollInsideDialog,
  TEAMMATE_INVITED_EVENT,
  type InviteGateAnswer,
} from '@/lib/invite-gate';
import { useNextMovesStore } from '@/stores/useNextMovesStore';
import { isInFirstSession } from '@/lib/first-session';

// InviteGate (founder request, 2026-10-11). Mounted once by AppShell.
//
// Asks the server whether this person must invite a teammate (see
// lib/invite-gate.ts), and once they start scrolling their first plan, covers
// the whole app with a dialog that an invite clears for good. "Skip for now"
// (or Escape) hides it on this device for a day (2026-10-13). Until it is
// skipped or answered, it comes straight back on any page, so a reload or a
// jump to Settings cannot slip past it. The server's fresh answer is always
// the one that decides; this component never decides who is gated.

const ENABLED = isInviteGateEnabled();
// Re-ask at most this often while waiting for a plan to appear.
const REFRESH_MS = 15_000;

const ROLE_OPTIONS = [
  { value: 'team-member', label: 'Team member' },
  { value: 'artist', label: 'Artist' },
  { value: 'manager', label: 'Manager' },
] as const;

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

async function fetchAnswer(): Promise<InviteGateAnswer> {
  try {
    const token = await getAccessToken();
    if (!token) return INVITE_GATE_OFF;
    const response = await fetch('/api/workspace/invite-gate', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return INVITE_GATE_OFF;
    const payload = (await response.json()) as Partial<InviteGateAnswer>;
    return {
      required: payload.required === true,
      workspaceId: payload.workspaceId ?? null,
      workspaceName: payload.workspaceName ?? null,
    };
  } catch {
    return INVITE_GATE_OFF;
  }
}

function readTriggered(workspaceId: string | null): boolean {
  if (!workspaceId || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(inviteGateStorageKey(workspaceId)) === '1';
  } catch {
    return false;
  }
}

function writeTriggered(workspaceId: string | null, value: boolean) {
  if (!workspaceId || typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(inviteGateStorageKey(workspaceId), '1');
    else window.localStorage.removeItem(inviteGateStorageKey(workspaceId));
  } catch {
    // Private mode: the gate still fires on the next scroll.
  }
}

function readOnboardingSkippedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(INVITE_GATE_ONBOARDING_SKIP_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function readSkipped(workspaceId: string | null): boolean {
  if (!workspaceId || typeof window === 'undefined') return false;
  // URG-274: the first session, and a skip on onboarding's team step, hold it back.
  if (
    isInviteGateHeldBack({
      inFirstSession: isInFirstSession(),
      onboardingSkippedAt: readOnboardingSkippedAt(),
      now: Date.now(),
    })
  ) {
    return true;
  }
  try {
    const raw = window.localStorage.getItem(inviteGateSkipKey(workspaceId));
    return isInviteGateSkipped(raw === null ? null : Number(raw), Date.now());
  } catch {
    return false;
  }
}

function writeSkipped(workspaceId: string | null) {
  if (!workspaceId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(inviteGateSkipKey(workspaceId), String(Date.now()));
  } catch {
    // Private mode: the skip lasts until the next scroll of the plan.
  }
}

/** Fired once and not skipped: hold the gate open on any page. */
function isHeld(workspaceId: string | null): boolean {
  return readTriggered(workspaceId) && !readSkipped(workspaceId);
}

function isValidEmail(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value.trim());
}

export function InviteGate() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const releaseParam = searchParams?.get('release') ?? null;
  const onPlan = isPlanView(pathname, releaseParam);

  const [answer, setAnswer] = useState<InviteGateAnswer>(INVITE_GATE_OFF);
  const [open, setOpen] = useState(false);
  const fetchedAtRef = useRef(0);
  const inFlightRef = useRef<Promise<InviteGateAnswer> | null>(null);

  const refresh = useCallback(async (): Promise<InviteGateAnswer> => {
    if (inFlightRef.current) return inFlightRef.current;
    const pending = fetchAnswer().then((next) => {
      fetchedAtRef.current = Date.now();
      inFlightRef.current = null;
      setAnswer(next);
      return next;
    });
    inFlightRef.current = pending;
    return pending;
  }, []);

  // Ask on sign-in and whenever the scoped rollout changes (a brand new plan
  // lands on /dashboard?release=<id>).
  useEffect(() => {
    if (!ENABLED || !isAuthenticated) return;
    void refresh().then((next) => {
      if (next.required && isHeld(next.workspaceId)) setOpen(true);
      if (!next.required) {
        writeTriggered(next.workspaceId, false);
        setOpen(false);
      }
    });
  }, [isAuthenticated, releaseParam, refresh]);

  // An invite sent anywhere else (the first-win reveal, Settings) clears the
  // gate on the spot, whatever the last answer said.
  useEffect(() => {
    if (!ENABLED) return;
    const onInvited = () => {
      setAnswer((current) => {
        writeTriggered(current.workspaceId, false);
        return INVITE_GATE_OFF;
      });
      setOpen(false);
    };
    window.addEventListener(TEAMMATE_INVITED_EVENT, onInvited);
    return () => window.removeEventListener(TEAMMATE_INVITED_EVENT, onInvited);
  }, []);

  // Once fired, follow the person to any page, unless they skipped it.
  useEffect(() => {
    if (answer.required && isHeld(answer.workspaceId)) setOpen(true);
  }, [pathname, answer]);

  useEffect(() => {
    if (open) captureAnalyticsEvent({ name: 'invite_gate_shown', properties: {} });
  }, [open]);

  // Watch for the first scroll through the plan.
  useEffect(() => {
    if (!ENABLED || !isAuthenticated || !onPlan || open) return;

    let stopped = false;
    const fire = (workspaceId: string | null) => {
      if (stopped) return;
      writeTriggered(workspaceId, true);
      setOpen(true);
    };

    const onScroll = (event: Event) => {
      if (stopped || isScrollInsideDialog(event.target)) return;
      // Skipped on this device: stay away, and do not ask the server on every
      // scroll event while it is.
      if (answer.required && readSkipped(answer.workspaceId)) return;
      // Never freeze the app on a remembered answer. A "yes" can be stale:
      // the first-win reveal asks for an invite too, and someone who sent one
      // there was then frozen again by the gate's earlier answer (founder
      // report, 2026-10-11). So a remembered "yes" is always re-checked with
      // the server before the gate opens; a remembered "no" is re-asked,
      // throttled, because it may predate the plan's activities landing.
      if (!answer.required && Date.now() - fetchedAtRef.current < REFRESH_MS) return;
      void refresh().then((next) => {
        if (next.required && !readSkipped(next.workspaceId)) fire(next.workspaceId);
      });
    };

    const options: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('scroll', onScroll, options);
    window.addEventListener('wheel', onScroll, options);
    window.addEventListener('touchmove', onScroll, options);
    return () => {
      stopped = true;
      window.removeEventListener('scroll', onScroll, options);
      window.removeEventListener('wheel', onScroll, options);
      window.removeEventListener('touchmove', onScroll, options);
    };
  }, [isAuthenticated, onPlan, open, answer, refresh]);

  if (!ENABLED || !open) return null;

  return (
    <InviteGateDialog
      workspaceName={answer.workspaceName}
      onReleased={() => {
        writeTriggered(answer.workspaceId, false);
        setAnswer(INVITE_GATE_OFF);
        setOpen(false);
      }}
      onSkip={() => {
        // The answer stays "required": the gate asks again once the skip runs
        // out, the next time they scroll the plan.
        writeSkipped(answer.workspaceId);
        writeTriggered(answer.workspaceId, false);
        setOpen(false);
        captureAnalyticsEvent({ name: 'invite_gate_skipped', properties: {} });
      }}
    />
  );
}

function InviteGateDialog({
  workspaceName,
  onReleased,
  onSkip,
}: {
  workspaceName: string | null;
  onReleased: () => void;
  onSkip: () => void;
}) {
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();

  // "Continue to my plan" means the plan: close Settings (or any other panel
  // that was open when the gate fired) on the way out, so it is the rollout
  // that is on screen. Replace, so Back does not reopen the panel.
  const continueToPlan = () => {
    onReleased();
    if (typeof window === 'undefined') return;
    const next = inviteGateContinueUrl(window.location.pathname, window.location.search);
    if (next !== `${window.location.pathname}${window.location.search}`) {
      router.replace(next, { scroll: false });
    }
  };
  const [isMounted, setIsMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('team-member');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ email: string; emailSent: boolean; inviteUrl: string | null } | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setIsMounted(true), []);
  useEffect(() => lockBodyScroll(), []);
  useDialogFocus(isMounted, panelRef);

  // Escape skips (or, once an invite is sent, continues to the plan). It is
  // caught in the capture phase so it never also closes a panel underneath,
  // such as Settings. A backdrop click does nothing: too easy to do by accident.
  const escapeRef = useRef<() => void>(onSkip);
  useEffect(() => {
    escapeRef.current = sent ? continueToPlan : onSkip;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      escapeRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    if (isSending) return;
    setIsSending(true);
    setError('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Your session expired. Sign in again.');
      const response = await fetch('/api/workspace/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: trimmed, role }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        inviteUrl?: string | null;
        emailSent?: boolean;
      };
      if (response.status === 409) {
        // The plan has no room for another person. The gate must never be a
        // wall nobody can climb, so let them through.
        onReleased();
        return;
      }
      if (!response.ok) throw new Error(payload.error || 'Could not send the invite.');
      useNextMovesStore.getState().markHasTeam();
      setSent({ email: trimmed, emailSent: payload.emailSent === true, inviteUrl: payload.inviteUrl ?? null });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the invite.');
    } finally {
      setIsSending(false);
    }
  };

  const copyLink = async () => {
    if (!sent?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(sent.inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (!isMounted) return null;

  const whatsappHref = sent?.inviteUrl
    ? `https://wa.me/?text=${encodeURIComponent(`Join me on Urganize: ${sent.inviteUrl}`)}`
    : null;

  const overlay = (
    <div className="fixed inset-x-0 top-0 z-[260] grid h-[100dvh] place-items-center bg-black/85 px-4 py-8 backdrop-blur-sm">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-gate-title"
        className="relative w-full max-w-lg urg-cartouche rounded-2xl border border-stroke-default bg-bg-surface p-6 shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.76*var(--shadow-alpha-scale)))] sm:p-8"
      >
        <div className="flex items-center gap-2 text-brand">
          <Users className="h-4 w-4" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">One step to keep going</span>
        </div>

        {sent ? (
          <div>
            <h2
              id="invite-gate-title"
              className="mt-3 font-display text-2xl font-semibold leading-tight text-content-primary"
            >
              You&rsquo;re all set.
            </h2>
            <div className="mt-5 flex items-center gap-2 border border-brand/40 bg-brand/10 p-3 text-sm text-content-primary">
              <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <span>
                {sent.emailSent ? 'Invite sent to ' : 'Invite ready for '}
                <span className="font-medium">{sent.email}</span>.
              </span>
            </div>
            {sent.inviteUrl ? (
              <p className="mt-3 text-sm text-content-secondary">
                {sent.emailSent
                  ? 'Send them the link on WhatsApp too, so they see it sooner.'
                  : 'We could not email it, so send them the link yourself.'}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button type="button" onClick={continueToPlan} className="w-full sm:w-auto">
                Continue to my plan
              </Button>
              {whatsappHref ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  className="motion-focus w-full border border-stroke-control px-4 py-2 text-center text-sm text-content-primary transition-colors hover:border-brand sm:w-auto"
                >
                  Share on WhatsApp
                </a>
              ) : null}
              {sent.inviteUrl ? (
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="motion-focus w-full px-4 py-2 text-sm text-content-secondary transition-colors hover:text-content-primary sm:w-auto"
                >
                  {copied ? 'Link copied' : 'Copy link'}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div>
            <h2
              id="invite-gate-title"
              className="mt-3 font-display text-2xl font-semibold leading-tight text-content-primary"
            >
              Invite one teammate to keep going
            </h2>
            <p className="mt-2 text-sm text-content-secondary">
              Your plan works when your team can see it. Invite your artist, a manager or anyone helping
              with this rollout to {workspaceName ? `“${workspaceName}”` : 'your team'}, and your plan opens
              right back up.
            </p>

            <form onSubmit={(event) => void handleSubmit(event)} className="mt-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-content-primary">Their email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="teammate@email.com"
                  autoFocus
                  autoComplete="email"
                  className="w-full border border-stroke-control bg-bg-base px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </label>
              <label className="mt-3 block">
                <span className="mb-2 block text-sm font-medium text-content-primary">They are</span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="w-full border border-stroke-control bg-bg-base px-3 py-2 text-sm text-content-primary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {error ? (
                <p role="alert" className="mt-2 text-xs text-status-error">
                  {error}
                </p>
              ) : null}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button type="submit" isLoading={isSending} disabled={!email.trim()} className="w-full sm:w-auto">
                  Send invite
                </Button>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={onSkip}
                    className="motion-focus min-h-11 w-full touch-manipulation rounded-full px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary sm:w-auto"
                  >
                    Skip for now
                  </button>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="motion-focus w-full px-4 py-2 text-xs text-content-tertiary transition-colors hover:text-content-secondary sm:w-auto"
                  >
                    Log out
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

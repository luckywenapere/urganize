'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@urganize/ui';
import { ArrowLeft, Check, Loader2, Mic } from '@/components/icons';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { settingsDeepLink } from '@/lib/settings-nav';
import { READ_ONLY_REACTIVATE_HREF } from '@/lib/team-billing';
import {
  CANCEL_DISCOUNT_BONUS_DAYS,
  CANCEL_INVITE_EXTENSION_DAYS,
  CANCEL_REASONS,
  CANCEL_TEXT_MAX,
  CANCEL_THANKS_NOTE,
  buildCancelSteps,
  cancelThanksTitle,
  followUpFor,
  formatCancelDate,
  formatNaira,
  nextCancelStep,
  retentionOfferLabel,
  type BudgetBandId,
  type CancelFlowKind,
  type CancelFlowOffer,
  type CancelReasonId,
  type CancelStep,
  type PauseOptionId,
  type PublicRetentionOffer,
  type RetentionTierId,
} from '@/lib/cancel-flow';

// The cancel flow (2026-10-14, founder-approved). The order and every rule
// about which screen shows live in lib/cancel-flow.ts; this file renders the
// current step and calls /api/billing/cancel-flow. Minimal words on purpose:
// one title, at most one line, the choice, and a plain "Continue to cancel" on
// every screen so leaving is as easy as joining.

type Band = {
  id: BudgetBandId;
  label: string;
  offer: PublicRetentionOffer | null;
};

type Context = {
  available: true;
  kind: CancelFlowKind;
  state: 'active' | 'cancelled' | 'paused';
  firstName: string;
  tier: RetentionTierId | null;
  interval: 'monthly' | 'annual' | null;
  accessUntil: string | null;
  discountAvailable: boolean;
  inviteAvailable: boolean;
  pauseAvailable: boolean;
  pauseOptions: Array<{ id: PauseOptionId; label: string; pausedFrom: string; pausedUntil: string }>;
  bands: Band[];
  pause: { from: string | null; until: string } | null;
  canResumeInPlace: boolean;
};

const BILLING_HREF = settingsDeepLink({ segment: 'billing' });

const primaryClass =
  'motion-focus inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-content-primary px-4 py-2.5 text-sm font-semibold text-content-inverse hover:opacity-90 motion-press disabled:opacity-60';
const plainClass =
  'motion-focus inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-stroke-default px-4 py-2.5 text-sm font-medium text-content-primary hover:bg-bg-hover disabled:opacity-60';
const fieldClass =
  'w-full rounded-lg border border-stroke-control bg-bg-surface px-3 py-2.5 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none';

function newFlowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return '00000000-0000-4000-8000-000000000000'.replace(/0/g, () => Math.floor(Math.random() * 16).toString(16));
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = await getAccessToken();
  const response = await fetch('/api/billing/cancel-flow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Something went wrong.');
  return payload;
}

const OFFER_FOR_STEP: Partial<Record<CancelStep, CancelFlowOffer>> = {
  discount: 'discount',
  invite: 'invite_extension',
  pause: 'pause',
};

export function CancelFlow() {
  const router = useRouter();
  const flowId = useMemo(() => newFlowId(), []);
  const [context, setContext] = useState<Context | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [step, setStep] = useState<CancelStep | null>(null);
  const [reason, setReason] = useState<CancelReasonId | null>(null);
  const [band, setBand] = useState<BudgetBandId | null>(null);
  const [followText, setFollowText] = useState('');
  const [anythingText, setAnythingText] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [pauseOption, setPauseOption] = useState<PauseOptionId>('1m');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [kept, setKept] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const shown = useRef(new Set<CancelStep>());

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const token = await getAccessToken();
        const response = await fetch('/api/billing/cancel-flow', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as Partial<Context> & { available?: boolean };
        if (!live) return;
        if (!payload.available) {
          setUnavailable(true);
          return;
        }
        const ctx = payload as Context;
        setContext(ctx);
        if (ctx.state === 'active') {
          setStep(
            buildCancelSteps({
              kind: ctx.kind,
              discountAvailable: ctx.discountAvailable,
              inviteAvailable: ctx.inviteAvailable,
              pauseAvailable: ctx.pauseAvailable,
              reason: null,
            })[0]
          );
          void post({ action: 'event', flowId, event: 'flow_started' }).catch(() => undefined);
        }
      } catch {
        if (live) setUnavailable(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [flowId]);

  // Effective reason for the step list: a budget answer with no bands to show
  // (a legacy plan) skips the follow-up rather than showing an empty screen.
  const stepReason: CancelReasonId | null =
    reason === 'budget' && (context?.bands.length ?? 0) === 0 ? null : reason;

  const stepsInput = useMemo(
    () =>
      context
        ? {
            kind: context.kind,
            discountAvailable: context.discountAvailable,
            inviteAvailable: context.inviteAvailable,
            pauseAvailable: context.pauseAvailable,
            reason: stepReason,
          }
        : null,
    [context, stepReason]
  );

  // Record each offer screen once, when it first shows.
  useEffect(() => {
    if (!step) return;
    const offer = OFFER_FOR_STEP[step];
    if (!offer || shown.current.has(step)) return;
    shown.current.add(step);
    void post({ action: 'event', flowId, event: 'offer_shown', offer, step }).catch(() => undefined);
  }, [step, flowId]);

  const advance = useCallback(
    (from: CancelStep, nextReason: CancelReasonId | null = stepReason) => {
      if (!stepsInput) return;
      setError('');
      setStep(nextCancelStep(from, { ...stepsInput, reason: nextReason }));
    },
    [stepsInput, stepReason]
  );

  /** "Continue to cancel" on an offer screen: records the no, moves on. */
  const decline = (from: CancelStep) => {
    const offer = OFFER_FOR_STEP[from];
    if (offer) void post({ action: 'event', flowId, event: 'offer_declined', offer, step: from }).catch(() => undefined);
    advance(from);
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  // ---- screens ------------------------------------------------------------

  if (unavailable) {
    return (
      <Shell>
        <Title>Nothing to cancel here</Title>
        <Line>Only the team owner can change the plan.</Line>
        <Link href={BILLING_HREF} className={plainClass}>
          Back to Billing
        </Link>
      </Shell>
    );
  }

  if (!context) {
    return (
      <Shell>
        <SkeletonBlock className="h-8 w-2/3 rounded-lg" />
        <SkeletonBlock className="mt-4 h-24 w-full rounded-lg" />
      </Shell>
    );
  }

  if (kept) {
    return (
      <Shell>
        <Mark />
        <Title>Done</Title>
        <Line>{kept}</Line>
        <Link href={BILLING_HREF} className={primaryClass}>
          Back to Billing
        </Link>
      </Shell>
    );
  }

  // Already paused or cancelled: say so, and make coming back one tap.
  if (context.state !== 'active' && step !== 'done') {
    const until = formatCancelDate(context.pause?.until ?? null);
    return (
      <Shell>
        <Title>{context.state === 'paused' ? `Paused until ${until}` : 'Already cancelled'}</Title>
        {context.accessUntil && context.state === 'cancelled' ? (
          <Line>You can keep working until {formatCancelDate(context.accessUntil)}.</Line>
        ) : null}
        <ResumeButton label={context.state === 'paused' ? 'Resume now' : 'Resume my plan'} flowId={flowId} />
        <Link href={BILLING_HREF} className={plainClass}>
          Back to Billing
        </Link>
      </Shell>
    );
  }

  const isTrial = context.kind === 'trial';
  const continueToCancel = (from: CancelStep) => (
    <button type="button" className={plainClass} disabled={busy} onClick={() => decline(from)}>
      Continue to cancel
    </button>
  );

  if (step === 'discount') {
    return (
      <Shell>
        <Title>Stay for 10% off?</Title>
        <Line>
          We add {CANCEL_DISCOUNT_BONUS_DAYS} free days to your {isTrial ? 'trial' : 'plan'}.
        </Line>
        <ErrorLine error={error} />
        <button
          type="button"
          className={primaryClass}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await post({ action: 'discount', flowId });
              const until = formatCancelDate(typeof result.accessUntil === 'string' ? result.accessUntil : null);
              setKept(until ? `${CANCEL_DISCOUNT_BONUS_DAYS} free days added. You're set until ${until}.` : `${CANCEL_DISCOUNT_BONUS_DAYS} free days added.`);
            })
          }
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Take 10% off
        </button>
        {continueToCancel('discount')}
      </Shell>
    );
  }

  if (step === 'invite') {
    const validEmail = /\S+@\S+\.\S+/.test(inviteEmail.trim());
    return (
      <Shell>
        <Title>Get {CANCEL_INVITE_EXTENSION_DAYS} more days free</Title>
        <Line>Invite one teammate to your trial.</Line>
        <label className="sr-only" htmlFor="cancel-invite-email">
          Teammate&apos;s email
        </label>
        <input
          id="cancel-invite-email"
          type="email"
          autoComplete="off"
          placeholder="teammate@email.com"
          value={inviteEmail}
          onChange={(event) => setInviteEmail(event.target.value)}
          className={fieldClass}
        />
        <ErrorLine error={error} />
        <button
          type="button"
          className={primaryClass}
          disabled={busy || !validEmail}
          onClick={() =>
            void run(async () => {
              const token = await getAccessToken();
              const response = await fetch('/api/workspace/members/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ email: inviteEmail.trim(), role: 'member' }),
              });
              const payload = (await response.json().catch(() => ({}))) as { error?: string };
              if (!response.ok) throw new Error(payload.error || 'Could not send the invite.');
              const result = await post({ action: 'invite_extension', flowId });
              const until = formatCancelDate(typeof result.accessUntil === 'string' ? result.accessUntil : null);
              setKept(until ? `Invite sent. Your trial now runs until ${until}.` : 'Invite sent. 7 days added.');
            })
          }
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Invite and add {CANCEL_INVITE_EXTENSION_DAYS} days
        </button>
        {continueToCancel('invite')}
      </Shell>
    );
  }

  if (step === 'pause') {
    const chosen = context.pauseOptions.find((option) => option.id === pauseOption) ?? context.pauseOptions[0];
    return (
      <Shell>
        <Title>Take a break instead?</Title>
        <label className="sr-only" htmlFor="cancel-pause-length">
          Pause for
        </label>
        <select
          id="cancel-pause-length"
          value={chosen?.id}
          onChange={(event) => setPauseOption(event.target.value as PauseOptionId)}
          className={fieldClass}
        >
          {context.pauseOptions.map((option) => (
            <option key={option.id} value={option.id}>
              Pause for {option.label}
            </option>
          ))}
        </select>
        {chosen ? (
          <Line>
            Pauses {formatCancelDate(chosen.pausedFrom)}. Back on <strong className="font-semibold text-content-primary">{formatCancelDate(chosen.pausedUntil)}</strong>. No charge while paused.
          </Line>
        ) : null}
        <ErrorLine error={error} />
        <button
          type="button"
          className={primaryClass}
          disabled={busy || !chosen}
          onClick={() =>
            void run(async () => {
              const result = await post({ action: 'pause', flowId, option: chosen?.id });
              const until = formatCancelDate(typeof result.pausedUntil === 'string' ? result.pausedUntil : null);
              setKept(until ? `Paused until ${until}. We'll email you a few days before.` : 'Paused.');
            })
          }
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Pause my plan
        </button>
        {continueToCancel('pause')}
      </Shell>
    );
  }

  if (step === 'reason') {
    return (
      <Shell>
        <Title>{context.firstName ? `We're sorry to see you go, ${context.firstName}` : "We're sorry to see you go"}</Title>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-content-secondary">Why are you leaving?</legend>
          {CANCEL_REASONS.map((option) => (
            <Choice
              key={option.id}
              name="cancel-reason"
              checked={reason === option.id}
              onSelect={() => setReason(option.id)}
              label={option.label}
            />
          ))}
        </fieldset>
        <button
          type="button"
          className={primaryClass}
          disabled={busy}
          onClick={() => {
            if (reason) void post({ action: 'event', flowId, event: 'reason_selected', reason, step }).catch(() => undefined);
            const effective = reason === 'budget' && context.bands.length === 0 ? null : reason;
            advance('reason', effective);
          }}
        >
          Continue to cancel
        </button>
      </Shell>
    );
  }

  if (step === 'followup') {
    const followUp = followUpFor(stepReason);
    if (followUp?.kind === 'budget') {
      const picked = context.bands.find((candidate) => candidate.id === band) ?? null;
      const offer = picked?.offer ?? null;
      return (
        <Shell>
          <Title>{followUp.title}</Title>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">A month</legend>
            {context.bands.map((option) => (
              <Choice
                key={option.id}
                name="cancel-band"
                checked={band === option.id}
                onSelect={() => {
                  setBand(option.id);
                  void post({ action: 'event', flowId, event: 'budget_band_selected', band: option.id, reason: 'budget' }).catch(
                    () => undefined
                  );
                }}
                label={`${option.label} a month`}
              />
            ))}
          </fieldset>
          {offer ? (
            <div className="rounded-lg border border-brand/40 bg-brand/8 p-4">
              <p className="text-sm font-semibold text-content-primary">{offerTitle(offer, isTrial)}</p>
              <ErrorLine error={error} />
              <button
                type="button"
                className={`${primaryClass} mt-3`}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (offer.kind === 'switch_plan') {
                      void post({
                        action: 'event',
                        flowId,
                        event: 'offer_accepted',
                        offer: 'budget_switch_plan',
                        band,
                        reason: 'budget',
                      }).catch(() => undefined);
                      if (isTrial) {
                        router.push(READ_ONLY_REACTIVATE_HREF);
                        return;
                      }
                      const token = await getAccessToken();
                      const response = await fetch('/api/billing/change-plan', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        body: JSON.stringify({ plan: offer.tier, interval: context.interval ?? 'monthly' }),
                      });
                      const payload = (await response.json().catch(() => ({}))) as { error?: string };
                      if (!response.ok) throw new Error(payload.error || 'Could not switch plans.');
                      setKept(`You move to the cheaper plan when this period ends. Nothing else changes.`);
                      return;
                    }
                    await post({ action: 'retention_offer', flowId, band });
                    setKept(`Your next ${offer.months} months are ${formatNaira(offer.price)} each.`);
                  })
                }
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isTrial && offer.kind === 'switch_plan' ? 'See plans' : 'Take it'}
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className={plainClass}
            disabled={busy}
            onClick={() => {
              if (offer) {
                void post({
                  action: 'event',
                  flowId,
                  event: 'offer_declined',
                  offer: offer.kind === 'switch_plan' ? 'budget_switch_plan' : 'budget_discounted_plan',
                  band,
                }).catch(() => undefined);
              }
              advance('followup');
            }}
          >
            Continue to cancel
          </button>
        </Shell>
      );
    }
    return (
      <Shell>
        <Title>{followUp?.title ?? 'Tell us more'}</Title>
        <TextBox value={followText} onChange={setFollowText} label={followUp?.title ?? 'Tell us more'} />
        <button
          type="button"
          className={plainClass}
          onClick={() => {
            if (followText.trim()) {
              void post({ action: 'event', flowId, event: 'feedback_given', reason, text: followText, step }).catch(
                () => undefined
              );
            }
            advance('followup');
          }}
        >
          Continue to cancel
        </button>
      </Shell>
    );
  }

  if (step === 'anything') {
    return (
      <Shell>
        <Title>Anything else?</Title>
        <TextBox value={anythingText} onChange={setAnythingText} label="Anything else? (optional)" />
        <button
          type="button"
          className={plainClass}
          onClick={() => {
            if (anythingText.trim()) {
              void post({ action: 'event', flowId, event: 'final_note_given', reason, text: anythingText, step }).catch(
                () => undefined
              );
            }
            advance('anything');
          }}
        >
          Continue to cancel
        </button>
      </Shell>
    );
  }

  if (step === 'confirm') {
    const until = formatCancelDate(context.accessUntil);
    return (
      <Shell>
        <Title>Cancel your {isTrial ? 'trial' : 'plan'}?</Title>
        <Line>
          {until ? `You keep working until ${until}. ` : ''}After that, everything stays here to read.
        </Line>
        <ErrorLine error={error} />
        <button
          type="button"
          data-dropping={dropping ? 'true' : 'false'}
          className="cancel-mic-button motion-focus inline-flex min-h-[52px] w-full items-center justify-center gap-3 rounded-lg bg-brand px-4 py-3 font-display text-base font-bold text-content-inverse hover:bg-brand-hover disabled:opacity-70"
          disabled={busy}
          aria-label={`Drop the mic: cancel my ${isTrial ? 'trial' : 'plan'}`}
          onClick={() =>
            void run(async () => {
              setDropping(true);
              await post({ action: 'cancel', flowId, reason });
              setStep('done');
            }).finally(() => setDropping(false))
          }
        >
          <Mic className="cancel-mic h-5 w-5" aria-hidden />
          <span className="flex flex-col items-start leading-tight">
            <span>Drop the mic</span>
            <span className="font-sans text-[11px] font-medium uppercase tracking-[0.16em] opacity-80">
              Cancel {isTrial ? 'trial' : 'plan'}
            </span>
          </span>
        </button>
        <Link href={BILLING_HREF} className={plainClass}>
          Keep my {isTrial ? 'trial' : 'plan'}
        </Link>
      </Shell>
    );
  }

  // done
  return (
    <Shell>
      <Mark />
      <Title>{cancelThanksTitle(context.firstName)}</Title>
      <Line>{CANCEL_THANKS_NOTE}</Line>
      <Link href={BILLING_HREF} className={primaryClass}>
        Come back anytime
      </Link>
    </Shell>
  );
}

function offerTitle(offer: PublicRetentionOffer, isTrial: boolean): string {
  if (isTrial && offer.kind === 'switch_plan') {
    return `Start on the cheaper plan for ${formatNaira(offer.price)}/month`;
  }
  return retentionOfferLabel(offer.kind === 'switch_plan' ? offer : { ...offer, planCode: '' });
}

function ResumeButton({ label, flowId }: { label: string; flowId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <ErrorLine error={error} />
      <button
        type="button"
        className={primaryClass}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const result = await post({ action: 'resume', flowId });
            if (result.resumed) {
              router.push(BILLING_HREF);
            } else {
              router.push(typeof result.href === 'string' ? result.href : READ_ONLY_REACTIVATE_HREF);
            }
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Something went wrong.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {label}
      </button>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-5 py-10">
      <Link
        href={BILLING_HREF}
        className="motion-focus mb-8 inline-flex w-fit items-center gap-1.5 text-sm text-content-tertiary hover:text-content-secondary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Billing
      </Link>
      <div className="flex animate-fade-in flex-col gap-4">{children}</div>
    </main>
  );
}

function Mark() {
  return (
    <div className="mb-2">
      <Logo size="lg" variant="square" />
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="font-display text-2xl font-semibold leading-tight text-content-primary">{children}</h1>;
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-content-secondary">{children}</p>;
}

function ErrorLine({ error }: { error: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-status-error">
      {error}
    </p>
  );
}

function Choice({
  name,
  checked,
  onSelect,
  label,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <label
      className={`motion-focus flex min-h-[48px] cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition-colors ${
        checked ? 'border-brand bg-brand/8 text-content-primary' : 'border-stroke-default text-content-primary hover:bg-bg-hover'
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      <span>{label}</span>
      <span
        aria-hidden
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          checked ? 'border-brand bg-brand text-content-inverse' : 'border-stroke-strong'
        }`}
      >
        {checked ? <Check className="h-3 w-3" /> : null}
      </span>
    </label>
  );
}

function TextBox({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <textarea
      aria-label={label}
      rows={4}
      maxLength={CANCEL_TEXT_MAX}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${fieldClass} resize-none`}
    />
  );
}

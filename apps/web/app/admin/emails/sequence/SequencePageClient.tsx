'use client';

// /admin/emails/sequence — the five onboarding emails, for reading and
// approving (founder request, 2026-09-30). Each one can be previewed exactly as
// it will be sent, or sent to yourself as a test.
//
// There is no on/off button here on purpose: the switch is the
// EMAIL_ONBOARDING_SEQUENCE env var, so turning on email to every new signup is
// a deliberate deploy rather than a stray click. The words live in
// lib/email/onboarding-sequence.ts.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import type { SequenceOverview } from '@/lib/email/sequence-server';
import type { OnboardingStepKey } from '@/lib/email/onboarding-sequence';
import { adminRequest, describeBudget, type BudgetPayload } from '../emailAdminApi';

type SequencePayload = SequenceOverview & { budget: BudgetPayload };

export default function SequencePageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [payload, setPayload] = useState<SequencePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openStep, setOpenStep] = useState<OnboardingStepKey | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<OnboardingStepKey, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Shown under the email it is about, so a test sent from day 7 reports beside
  // day 7 rather than at the top of the page, off screen.
  const [notice, setNotice] = useState<{ tone: 'done' | 'error'; text: string; step: OnboardingStepKey } | null>(
    null
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await adminRequest<SequencePayload>('/api/admin/emails/sequence');
      if (cancelled) return;
      if (result.ok) setPayload(result.data);
      else if (result.forbidden) router.replace('/dashboard');
      else setError(result.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, router]);

  const togglePreview = async (step: OnboardingStepKey) => {
    if (openStep === step) {
      setOpenStep(null);
      return;
    }
    setOpenStep(step);
    if (previews[step]) return;
    setBusy(`preview-${step}`);
    const result = await adminRequest<{ html: string }>('/api/admin/emails/preview', {
      method: 'POST',
      body: { kind: 'sequence', step },
    });
    setBusy(null);
    if (result.ok) setPreviews((current) => ({ ...current, [step]: result.data.html }));
    else setNotice({ tone: 'error', text: result.error, step });
  };

  const sendTest = async (step: OnboardingStepKey) => {
    setNotice(null);
    setBusy(`test-${step}`);
    const result = await adminRequest<{ to: string }>('/api/admin/emails/test', {
      method: 'POST',
      body: { kind: 'sequence', step },
    });
    setBusy(null);
    setNotice(
      result.ok
        ? { tone: 'done', text: `Test sent to ${result.data.to}. Check your inbox.`, step }
        : { tone: 'error', text: result.error, step }
    );
  };

  if (authLoading || !user || (!payload && !error)) {
    return <AdminPageSkeleton titleWidth="w-64" descriptionLines={2} table={{ columns: 3, rows: 5 }} />;
  }

  return (
    <div className="w-full max-w-[760px]">
      <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        <Mail className="h-4 w-4" aria-hidden="true" />
        Onboarding emails
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">A new signup&rsquo;s first week</h1>
      <p className="mt-2 text-sm leading-6 text-content-secondary">
        Five short notes from you. Day 1 goes out the moment someone finishes signing up. The rest go out at 9am
        Lagos time on days 2, 3, 5 and 7. Replies come to your inbox, and anyone who unsubscribes gets no more.{' '}
        {describeBudget(payload?.budget)}
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      {payload ? (
        <p
          className={`mt-6 rounded-lg border px-3 py-2 text-sm ${
            payload.enabled
              ? 'border-brand/35 bg-brand/10 text-brand'
              : 'border-status-warning/40 bg-status-warning/10 text-status-warning'
          }`}
        >
          {payload.enabled
            ? 'Switched on. Every new signup gets these five emails.'
            : 'Switched off. New signups get the old single welcome email until these are approved and switched on.'}
        </p>
      ) : null}
      {payload?.countsError ? (
        <p className="mt-3 text-sm text-status-error">{payload.countsError}</p>
      ) : null}
      {/* Always mounted, so a screen reader hears each result; the visible copy
          sits under its own email and is not live itself. */}
      <p className="sr-only" aria-live="polite">
        {notice?.text ?? ''}
      </p>

      <ol className="mt-6 space-y-3">
        {payload?.steps.map((step) => {
          const waiting = step.counts.queued;
          return (
            <li key={step.key} className="border border-stroke-default bg-bg-surface p-4">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-content-tertiary">
                Day {step.day} · {step.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-content-primary">{step.subject}</p>
              <p className="mt-0.5 text-xs text-content-secondary">{step.preview}</p>
              <p className="mt-2 text-xs text-content-tertiary">
                {step.counts.sent} sent
                {waiting ? ` · ${waiting} waiting` : ''}
                {step.counts.skipped ? ` · ${step.counts.skipped} unsubscribed` : ''}
                {step.counts.failed ? ` · ${step.counts.failed} failed` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void togglePreview(step.key)}
                  aria-expanded={openStep === step.key}
                  className="motion-focus inline-flex items-center gap-2 rounded-full border border-stroke-default px-3 py-1.5 text-xs font-medium text-content-primary hover:border-stroke-strong"
                >
                  {busy === `preview-${step.key}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : null}
                  {openStep === step.key ? 'Hide' : 'Preview'}
                </button>
                <button
                  type="button"
                  onClick={() => void sendTest(step.key)}
                  disabled={busy === `test-${step.key}`}
                  className="motion-focus inline-flex items-center gap-2 rounded-full border border-stroke-default px-3 py-1.5 text-xs font-medium text-content-primary hover:border-stroke-strong disabled:opacity-50"
                >
                  {busy === `test-${step.key}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : null}
                  Send me a test
                </button>
              </div>
              {notice?.step === step.key ? (
                <p
                  className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                    notice.tone === 'done'
                      ? 'border-brand/35 bg-brand/10 text-brand'
                      : 'border-status-error/35 bg-status-error/10 text-status-error'
                  }`}
                >
                  {notice.text}
                </p>
              ) : null}
              {openStep === step.key && previews[step.key] ? (
                <iframe
                  title={`Day ${step.day} email preview`}
                  sandbox=""
                  srcDoc={previews[step.key]}
                  className="mt-3 h-[560px] w-full rounded-lg border border-stroke-default bg-white"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

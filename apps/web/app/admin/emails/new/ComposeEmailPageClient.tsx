'use client';

// /admin/emails/new — write an email and send it to everyone, a group, one
// person or the waitlist (founder request, 2026-09-30).
//
// Sending is two steps on purpose. "Send" saves the email and queues one row per
// person (POST /broadcasts), then this page calls /broadcasts/[id]/send until
// the queue is empty or the day's email limit is reached. Whatever the limit
// holds back goes out at 9am the next morning from the cron, so closing this
// page never loses an email. The limit and why it exists: lib/email/outbox.ts.
//
// Not flag-gated (the /admin/teams precedent): access is ADMIN_EMAILS on every
// backing route, and a non-admin is bounced home.
//
// A link can fill the form in (iteration 5 of the admin dashboard,
// 2026-10-10): ?to=one@address&subject=…&body=… opens it aimed at that one
// person with the draft written (lib/email/compose-prefill.ts checks and cleans
// all three). It is only a draft: the send still needs Send and its confirm.
// The founder cockpit's "Needs a message" list uses it. page.tsx wraps this in
// a Suspense boundary because it reads the query string.
//
// On a computer since 2026-11-12 (#1241, approved mock): the form on the left
// and the email as it will arrive on the right, redrawn as you type (the same
// /preview route, addressed to the first person on the list). Sending, the
// two-step confirm, the queue and the daily limit are unchanged.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { AUDIENCE_GROUPS, AUDIENCE_GROUP_LABELS, DEFAULT_RECENT_DAYS, isValidEmailAddress } from '@/lib/email/audience';
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_SUBJECT_MAX } from '@/lib/email/announcement';
import type { BroadcastCounts, BroadcastSummary } from '@/lib/email/broadcast-server';
import {
  audienceKey,
  audienceRequest,
  countedFor,
  type AudienceChoice,
  type AudienceKind,
  type Counted,
} from '@/lib/email/compose-audience';
import { parseComposePrefill } from '@/lib/email/compose-prefill';
import { adminRequest, describeBudget, type BudgetPayload } from '../emailAdminApi';

type GroupKey = (typeof AUDIENCE_GROUPS)[number];

type Overview = {
  broadcasts: BroadcastSummary[];
  broadcastsError: string | null;
  budget: BudgetPayload;
  emailConfigured: boolean;
  from: string | null;
  replyTo: string | null;
};

type AudienceInfo = {
  label: string;
  count: number;
  suppressedCount: number;
  invalidCount: number;
  sample: Array<{ email: string; name: string }>;
};

type SendRun = { sent: number; skipped: number; failed: number; requeued: number; stoppedReason: string | null };
type SendResponse = { run: SendRun; counts: BroadcastCounts | null; budget: BudgetPayload };

type Progress = {
  broadcastId: string;
  counts: BroadcastCounts | null;
  running: boolean;
  message: string;
  tone: 'info' | 'done' | 'warn' | 'error';
};

const KIND_OPTIONS: Array<{ value: AudienceKind; label: string; hint: string }> = [
  { value: 'everyone', label: 'Everyone', hint: 'Everyone with an account.' },
  { value: 'group', label: 'A group', hint: 'On a trial, paying, new, and more.' },
  { value: 'person', label: 'One person', hint: 'Type their email address.' },
  { value: 'waitlist', label: 'The waitlist', hint: 'People who joined the waitlist but have no account.' },
];

/** '1 person', '107 people'. Never 'persons'. */
const people = (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`;

const formatDate = (value: string | null): string => {
  if (!value) return '';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
    new Date(ms)
  );
};

function describeProgress(counts: BroadcastCounts | null, run: SendRun | null, budget: BudgetPayload | null) {
  const sent = counts?.sent ?? 0;
  const waiting = (counts?.queued ?? 0) + (counts?.sending ?? 0);
  const skipped = counts?.skipped ?? 0;
  const failed = counts?.failed ?? 0;
  const extras = [
    skipped ? `${people(skipped)} had unsubscribed.` : '',
    failed ? `${failed} could not be sent (see the Emails page).` : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (waiting === 0) {
    return { tone: 'done' as const, finished: true, message: `Done. Sent to ${people(sent)}. ${extras}`.trim() };
  }
  if (run?.stoppedReason === 'limit' || run?.stoppedReason === 'rate_limited') {
    const limit = budget?.dailyLimit ?? 100;
    return {
      tone: 'warn' as const,
      finished: true,
      message: `${sent} sent so far. The other ${waiting} go out tomorrow at 9am on their own. Your email plan allows ${limit} emails a day, and some are kept free for invites. ${extras}`.trim(),
    };
  }
  if (run?.stoppedReason === 'not_configured') {
    return { tone: 'error' as const, finished: true, message: 'Email is not set up on this deployment, so sending stopped.' };
  }
  if (run?.stoppedReason === 'unreadable') {
    return {
      tone: 'error' as const,
      finished: true,
      message: 'Could not check how many emails went out today, so sending stopped to be safe. Try Keep sending in a minute.',
    };
  }
  const progressed = run ? run.sent + run.skipped + run.failed : 0;
  if (run && progressed === 0 && run.stoppedReason !== 'time') {
    return {
      tone: 'warn' as const,
      finished: true,
      message: `${sent} sent. ${waiting} are waiting to try again and will go out on their own. ${extras}`.trim(),
    };
  }
  return { tone: 'info' as const, finished: false, message: `Sending… ${sent} sent, ${waiting} to go.` };
}

export default function ComposeEmailPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Read once, on the first render: a draft from a link (see the top of file).
  const searchParams = useSearchParams();
  const [prefill] = useState(() => parseComposePrefill(searchParams));

  const [kind, setKind] = useState<AudienceKind>(prefill?.to ? 'person' : 'everyone');
  const [group, setGroup] = useState<GroupKey>('trial');
  const [days, setDays] = useState(String(DEFAULT_RECENT_DAYS));
  const [personEmail, setPersonEmail] = useState(prefill?.to ?? '');
  // The count, with the audience it was made for. It is shown only while that
  // is the audience chosen now (countedFor, #1274), so the button can never
  // carry a number from a different audience than the one that will be sent.
  const [counted, setCounted] = useState<Counted<AudienceInfo> | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  // The choice as it stands now, for a recount that was not started by a click.
  const choiceRef = useRef<AudienceChoice>({
    kind: prefill?.to ? 'person' : 'everyone',
    group: 'trial',
    days: String(DEFAULT_RECENT_DAYS),
    personEmail: prefill?.to ?? '',
  });
  const audienceSeq = useRef(0);
  const audienceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [subject, setSubject] = useState(prefill?.subject ?? '');
  const [body, setBody] = useState(prefill?.body ?? '');
  const [includeGreeting, setIncludeGreeting] = useState(true);
  const [signOff, setSignOff] = useState(true);

  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [testMessage, setTestMessage] = useState<{ tone: 'done' | 'error'; text: string } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const previewSeq = useRef(0);
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    const result = await adminRequest<Overview>('/api/admin/emails/broadcasts');
    if (!result.ok) {
      if (result.forbidden) router.replace('/dashboard');
      else setPageError(result.error);
      return false;
    }
    setOverview(result.data);
    return true;
  }, [router]);

  const checkAudience = useCallback((next: AudienceChoice) => {
    if (audienceTimer.current) clearTimeout(audienceTimer.current);
    const seq = ++audienceSeq.current;
    if (next.kind === 'person' && !isValidEmailAddress(next.personEmail)) {
      setCounted(null);
      setAudienceLoading(false);
      return;
    }
    setAudienceLoading(true);
    const key = audienceKey(next);
    audienceTimer.current = setTimeout(async () => {
      const result = await adminRequest<AudienceInfo>('/api/admin/emails/audience', {
        method: 'POST',
        body: { audience: audienceRequest(next) },
      });
      if (seq !== audienceSeq.current) return; // a newer choice replaced this one
      setAudienceLoading(false);
      setCounted(result.ok ? { key, info: result.data, error: null } : { key, info: null, error: result.error });
      // A number that lands under an open confirm is a number the admin has
      // not read yet: ask again.
      setConfirming(false);
    }, 350);
  }, []);

  // Runs once per signed-in person, not on every refresh of the sign-in. It
  // used to depend on the whole `user` object, so a background refresh ran it
  // again and recounted the STARTING audience over the one chosen since (#1274).
  const userId = user?.id ?? null;
  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      router.replace('/auth');
      return;
    }
    let cancelled = false;
    (async () => {
      const ok = await loadOverview();
      if (!cancelled && ok) checkAudience(choiceRef.current);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, router, loadOverview, checkAudience]);

  useEffect(
    () => () => {
      if (audienceTimer.current) clearTimeout(audienceTimer.current);
    },
    []
  );

  const chooseAudience = (patch: Partial<{ kind: AudienceKind; group: GroupKey; days: string; personEmail: string }>) => {
    const next: AudienceChoice = { kind, group, days, personEmail, ...patch };
    choiceRef.current = next;
    if (patch.kind !== undefined) setKind(patch.kind);
    if (patch.group !== undefined) setGroup(patch.group);
    if (patch.days !== undefined) setDays(patch.days);
    if (patch.personEmail !== undefined) setPersonEmail(patch.personEmail);
    setConfirming(false);
    checkAudience(next);
  };

  // The count for the audience chosen right now, or nothing while it is being counted.
  const current = countedFor(counted, { kind, group, days, personEmail });
  const audienceInfo = current?.info ?? null;
  const audienceError = current?.error ?? null;

  const draft = { subject: subject.trim(), body, includeGreeting, signOff };
  const hasDraft = draft.subject.length > 0 && body.trim().length > 0;
  const recipientCount = audienceInfo?.count ?? 0;
  const emailConfigured = overview?.emailConfigured !== false;
  const canSend = hasDraft && recipientCount > 0 && !audienceLoading && !creating && !progress?.running && emailConfigured;

  const previewName = audienceInfo?.sample[0]?.name || '';

  const handlePreview = useCallback(
    async (input: { subject: string; body: string; includeGreeting: boolean; signOff: boolean; name: string }) => {
      const seq = ++previewSeq.current;
      setPreviewLoading(true);
      const result = await adminRequest<{ subject: string; html: string }>('/api/admin/emails/preview', {
        method: 'POST',
        body: {
          kind: 'announcement',
          subject: input.subject,
          body: input.body,
          includeGreeting: input.includeGreeting,
          signOff: input.signOff,
          recipientName: input.name || undefined,
        },
      });
      if (seq !== previewSeq.current) return; // a newer draft replaced this one
      setPreviewLoading(false);
      if (result.ok) setPreview(result.data);
    },
    []
  );

  // The live preview: redrawn half a second after you stop typing.
  const previewSubject = subject.trim();
  const previewReady = previewSubject.length > 0 && body.trim().length > 0;
  useEffect(() => {
    if (!previewReady) {
      previewSeq.current += 1; // drop any answer still on its way
      return;
    }
    const timer = setTimeout(() => {
      void handlePreview({ subject: previewSubject, body, includeGreeting, signOff, name: previewName });
    }, 500);
    return () => clearTimeout(timer);
  }, [previewReady, previewSubject, body, includeGreeting, signOff, previewName, handlePreview]);

  const handleTest = async () => {
    setFormError(null);
    setTestMessage(null);
    setTestLoading(true);
    const result = await adminRequest<{ to: string }>('/api/admin/emails/test', {
      method: 'POST',
      body: { kind: 'announcement', ...draft },
    });
    setTestLoading(false);
    setTestMessage(
      result.ok
        ? { tone: 'done', text: `Test sent to ${result.data.to}. Check your inbox.` }
        : { tone: 'error', text: result.error }
    );
  };

  const runSending = async (broadcastId: string) => {
    setProgress({ broadcastId, counts: null, running: true, message: 'Sending…', tone: 'info' });
    for (let round = 0; round < 250; round += 1) {
      const result = await adminRequest<SendResponse>(`/api/admin/emails/broadcasts/${broadcastId}/send`, {
        method: 'POST',
      });
      if (!result.ok) {
        setProgress({
          broadcastId,
          counts: null,
          running: false,
          tone: 'error',
          message: `${result.error} Anything not sent yet goes out tomorrow at 9am, or press Keep sending.`,
        });
        break;
      }
      const { run, counts, budget } = result.data;
      setOverview((current) => (current ? { ...current, budget } : current));
      const status = describeProgress(counts, run, budget);
      setProgress({ broadcastId, counts, running: !status.finished, tone: status.tone, message: status.message });
      if (status.finished) break;
    }
    await loadOverview();
  };

  const handleSend = async () => {
    if (!canSend) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setFormError(null);
    setCreating(true);
    const result = await adminRequest<{ broadcastId: string; total: number }>('/api/admin/emails/broadcasts', {
      method: 'POST',
      body: { audience: audienceRequest({ kind, group, days, personEmail }), draft },
    });
    setCreating(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setSubject('');
    setBody('');
    setPreview(null);
    setTestMessage(null);
    void runSending(result.data.broadcastId);
  };

  const handleStop = async (broadcastId: string) => {
    if (!window.confirm('Stop this email? Anyone who has not had it yet will not get it.')) return;
    setStopping(broadcastId);
    const result = await adminRequest<{ cancelled: number }>(`/api/admin/emails/broadcasts/${broadcastId}/cancel`, {
      method: 'POST',
    });
    setStopping(null);
    if (!result.ok) setPageError(result.error);
    await loadOverview();
  };

  if (authLoading || !user || (!overview && !pageError)) {
    return <AdminPageSkeleton titleWidth="w-56" descriptionLines={2} formFields={4} />;
  }

  const budget = overview?.budget;
  // One always-mounted live region reads out whatever just happened (a form
  // error, a test result, sending progress). A region that only mounts with its
  // text is often not announced at all (the 2026-09-30 accessibility pass,
  // rule 6), so the visible messages below are not live themselves.
  const liveMessage = formError ?? testMessage?.text ?? progress?.message ?? '';
  const toneClass: Record<Progress['tone'], string> = {
    info: 'border-stroke-default bg-bg-surface text-content-secondary',
    done: 'border-brand/35 bg-brand/10 text-brand',
    warn: 'border-status-warning/40 bg-status-warning/10 text-status-warning',
    error: 'border-status-error/35 bg-status-error/10 text-status-error',
  };

  return (
    <div className="w-full max-w-[720px] lg:max-w-none">
      <h1 className="font-display text-3xl font-semibold">Send an email</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-content-secondary">
        {overview?.from ? <>It comes from {overview.from}. </> : null}
        Replies go to {overview?.replyTo || 'that inbox'}. Everyone gets an unsubscribe link, and anyone who already
        unsubscribed is left out. {describeBudget(budget)}
      </p>

      {prefill ? (
        <p className="mt-4 rounded-lg border border-brand/35 bg-brand/10 px-3 py-2 text-sm text-content-primary">
          A draft is filled in{prefill.to ? <> for {prefill.to}</> : null}. Read it and change anything you like. Nothing
          is sent until you press Send.
        </p>
      ) : null}
      {pageError ? (
        <p className="mt-4 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {pageError}
        </p>
      ) : null}
      {!emailConfigured ? (
        <p className="mt-4 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          Email is not set up on this deployment, so nothing can be sent from here.
        </p>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {liveMessage}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start lg:gap-6">
      <div className="min-w-0 lg:rounded-2xl lg:border lg:border-stroke-default lg:bg-bg-surface lg:p-6">
      <section>
        <h2 className="text-sm font-semibold text-content-primary">Who gets it</h2>
        <div role="radiogroup" aria-label="Who gets it" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {KIND_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`motion-focus flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                kind === option.value
                  ? 'border-brand bg-brand/10'
                  : 'border-stroke-default bg-bg-surface hover:border-stroke-strong'
              }`}
            >
              <input
                type="radio"
                name="audience-kind"
                value={option.value}
                checked={kind === option.value}
                onChange={() => chooseAudience({ kind: option.value })}
                className="mt-1 h-4 w-4 accent-brand"
              />
              <span>
                <span className="block text-sm font-medium text-content-primary">{option.label}</span>
                <span className="block text-xs text-content-secondary">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {kind === 'group' ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={group}
              onChange={(event) => chooseAudience({ group: event.target.value as GroupKey })}
              aria-label="Which group"
              className="input field-native h-10 max-w-sm rounded-lg border-stroke-control bg-bg-elevated"
            >
              {AUDIENCE_GROUPS.map((key) => (
                <option key={key} value={key}>
                  {AUDIENCE_GROUP_LABELS[key]}
                </option>
              ))}
            </select>
            {group === 'recent' ? (
              <label className="flex items-center gap-2 text-sm text-content-secondary">
                in the last
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(event) => chooseAudience({ days: event.target.value })}
                  className="input h-10 w-20 rounded-lg border-stroke-control bg-bg-elevated"
                />
                days
              </label>
            ) : null}
          </div>
        ) : null}

        {kind === 'person' ? (
          <input
            type="email"
            value={personEmail}
            onChange={(event) => chooseAudience({ personEmail: event.target.value })}
            placeholder="name@example.com"
            aria-label="Their email address"
            className="input mt-3 max-w-sm rounded-lg border-stroke-control bg-bg-elevated"
          />
        ) : null}

        <p className="mt-3 min-h-[1.25rem] text-sm text-content-secondary" aria-live="polite">
          {audienceLoading ? (
            'Counting…'
          ) : audienceError ? (
            <span className="text-status-error">{audienceError}</span>
          ) : audienceInfo ? (
            <>
              Goes to <strong className="text-content-primary">{people(audienceInfo.count)}</strong>.
              {audienceInfo.suppressedCount
                ? ` ${people(audienceInfo.suppressedCount)} who unsubscribed ${audienceInfo.suppressedCount === 1 ? 'is' : 'are'} left out.`
                : ''}
              {audienceInfo.sample.length ? (
                <span className="block text-xs text-content-tertiary">
                  For example: {audienceInfo.sample.map((row) => row.name || row.email).join(', ')}
                  {audienceInfo.count > audienceInfo.sample.length
                    ? ` and ${audienceInfo.count - audienceInfo.sample.length} more`
                    : ''}
                  .
                </span>
              ) : null}
            </>
          ) : kind === 'person' ? (
            'Type an email address.'
          ) : null}
        </p>
      </section>

      <section className="mt-8 space-y-5">
        <h2 className="text-sm font-semibold text-content-primary">The email</h2>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Subject</span>
          <input
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              setConfirming(false);
            }}
            maxLength={ANNOUNCEMENT_SUBJECT_MAX}
            placeholder="Something new in Urganize"
            className="input rounded-lg border-stroke-control bg-bg-elevated"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Message</span>
          <textarea
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setConfirming(false);
            }}
            maxLength={ANNOUNCEMENT_BODY_MAX}
            rows={12}
            placeholder={'Write it the way you would write to one person.\n\nA blank line starts a new paragraph.'}
            className="input rounded-lg border-stroke-control bg-bg-elevated"
          />
          <span className="mt-1 block text-xs text-content-tertiary">
            A blank line starts a new paragraph. To add a link, paste it, or write [the words](https://the-link).
          </span>
        </label>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-content-secondary">
            <input
              type="checkbox"
              checked={includeGreeting}
              onChange={(event) => setIncludeGreeting(event.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            Start with &ldquo;Hey&rdquo; and their first name
          </label>
          <label className="flex items-center gap-2 text-sm text-content-secondary">
            <input
              type="checkbox"
              checked={signOff}
              onChange={(event) => setSignOff(event.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            Sign it &ldquo;Wena, Founder, Urganize&rdquo;
          </label>
        </div>

        {formError ? (
          <p className="rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
            {formError}
          </p>
        ) : null}
        {testMessage ? (
          <p
            className={`rounded-lg border px-3 py-2 text-sm ${
              testMessage.tone === 'done'
                ? 'border-brand/35 bg-brand/10 text-brand'
                : 'border-status-error/35 bg-status-error/10 text-status-error'
            }`}
          >
            {testMessage.text}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={!hasDraft || testLoading || !emailConfigured}
            className="motion-focus inline-flex items-center gap-2 rounded-full border border-stroke-default px-4 py-2 text-sm font-medium text-content-primary hover:border-stroke-strong disabled:opacity-50"
          >
            {testLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Send me a test
          </button>
          <span className="hidden flex-1 lg:block" aria-hidden="true" />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className={`motion-focus motion-press inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-content-inverse transition-colors disabled:opacity-50 ${
              confirming ? 'bg-status-error hover:opacity-90' : 'bg-brand hover:bg-brand-hover'
            }`}
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {creating
              ? 'Saving…'
              : confirming
                ? `Yes, send to ${people(recipientCount)}`
                : `Send to ${people(recipientCount)}`}
          </button>
          {confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="motion-focus text-sm text-content-secondary hover:text-content-primary"
            >
              Cancel
            </button>
          ) : null}
        </div>

        {progress ? (
          <p className={`rounded-lg border px-3 py-2 text-sm ${toneClass[progress.tone]}`}>
            {progress.running ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {progress.message}
          </p>
        ) : null}

      </section>
      </div>

      <section aria-labelledby="compose-preview" className="min-w-0 lg:sticky lg:top-8">
        <h2 id="compose-preview" className="flex items-center gap-2 text-sm font-semibold text-content-secondary">
          What they get
          {previewReady && previewLoading ? <Loader2 className="h-4 w-4 animate-spin text-content-tertiary" aria-hidden="true" /> : null}
        </h2>
        {previewReady && preview ? (
          <div className="mt-2">
            <p className="text-xs text-content-tertiary">
              Subject: <span className="text-content-secondary">{preview.subject}</span>.{' '}
              {previewName ? <>Addressed to {previewName}, the first on the list.</> : 'The name shown is an example.'}
            </p>
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={preview.html}
              className="mt-2 h-[560px] w-full rounded-xl border border-stroke-default bg-white lg:h-[640px]"
            />
          </div>
        ) : (
          <p className="mt-2 rounded-xl border border-dashed border-stroke-default p-6 text-sm text-content-secondary">
            Write a subject and a message to see the email here.
          </p>
        )}
      </section>
      </div>

      <section className="mt-12">
        <h2 className="font-display text-lg font-semibold text-content-primary">Recent emails</h2>
        {overview?.broadcastsError ? (
          <p className="mt-3 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
            {overview.broadcastsError}
          </p>
        ) : null}
        {!overview?.broadcasts.length ? (
          <p className="mt-3 border border-stroke-default bg-bg-surface p-6 text-sm text-content-secondary">
            Nothing sent from here yet.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {overview.broadcasts.map((row) => {
              const waiting = row.counts.queued + row.counts.sending;
              const isActive = progress?.running && progress.broadcastId === row.id;
              return (
                <article key={row.id} className="border border-stroke-default bg-bg-surface p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold text-content-primary">{row.subject}</p>
                    <span className="text-xs text-content-tertiary">{formatDate(row.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-content-secondary">
                    {row.audienceLabel} · {row.counts.sent} of {row.total} sent
                    {waiting ? ` · ${waiting} waiting` : ''}
                    {row.counts.skipped ? ` · ${row.counts.skipped} unsubscribed` : ''}
                    {row.counts.failed ? ` · ${row.counts.failed} failed` : ''}
                    {row.cancelledAt ? ' · stopped' : ''}
                  </p>
                  {waiting && !row.cancelledAt ? (
                    <div className="mt-2 flex gap-3">
                      <button
                        type="button"
                        onClick={() => void runSending(row.id)}
                        disabled={Boolean(progress?.running) || !emailConfigured}
                        className="motion-focus text-xs font-semibold text-brand hover:underline disabled:opacity-50"
                      >
                        {isActive ? 'Sending…' : 'Keep sending'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStop(row.id)}
                        disabled={stopping === row.id || Boolean(isActive)}
                        className="motion-focus text-xs font-semibold text-status-error hover:underline disabled:opacity-50"
                      >
                        {stopping === row.id ? 'Stopping…' : 'Stop'}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

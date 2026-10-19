'use client';

// The email-confirmation screens (URG-386), built to the approved v2 mocks
// (Oyin, Oct 18, 2026): Check your inbox (Gmail button only for Gmail, the
// account chip that changes the address, "Your plan for X is saved" only when
// there is a plan, a quiet Resend with a cooldown ring), the live-waiting line
// for every other mail provider, This link has expired (with or without a
// known address), and the "You're in" moment that the onboarding hand-off
// drives. One hero sentence, one accent action, everything else quiet.
//
// Pure presentation plus the resend call. The hosts (onboarding, invite,
// curator, /auth, /auth/callback) own the flow around them.

import { useEffect, useId, useState, type ReactNode } from 'react';
import { LogoIcon } from '@urganize/ui/Logo';
import {
  GMAIL_CONFIRMATION_SEARCH_URL,
  formatCooldown,
  isGmailAddress,
  normalizeEmail,
  resendCooldownLeft,
  RESEND_COOLDOWN_MS,
} from '@/lib/email-confirmation';
import { resendConfirmationEmail } from '@/lib/email-confirmation-client';

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

/**
 * Page frame: one soft green bloom, the mark centred on a phone and the
 * mark + name top-left on a desktop, the content centred.
 */
export function ConfirmShell({ children, dimGlow = false }: { children: ReactNode; dimGlow?: boolean }) {
  return (
    <main className="ec-shell relative min-h-screen overflow-hidden text-content-primary">
      <div className={`ec-glow ${dimGlow ? 'ec-glow-dim' : ''}`} aria-hidden="true" />
      <div className="absolute left-1/2 top-[calc(18px+env(safe-area-inset-top,0px))] z-[3] -translate-x-1/2 md:left-10 md:top-8 md:flex md:translate-x-0 md:items-center md:gap-2.5">
        <LogoIcon size={26} priority className="opacity-90 md:h-7 md:w-7" />
        <span className="hidden text-[15px] font-semibold tracking-[-0.01em] md:inline">Urganize</span>
      </div>
      <div className="relative z-[2] mx-auto w-full max-w-[420px] px-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-[calc(80px+env(safe-area-inset-top,0px))] md:flex md:min-h-screen md:max-w-none md:flex-col md:items-center md:justify-center md:p-10">
        {children}
      </div>
    </main>
  );
}

/**
 * The card. On a phone only the top block is the card and the actions sit
 * under it; on a desktop the whole thing is one card (the mocks' 1a phone vs
 * desktop). `top` is the card's content, `bottom` the actions.
 */
function ConfirmCard({ top, bottom, role }: { top: ReactNode; bottom?: ReactNode; role?: 'status' }) {
  return (
    <section
      role={role}
      aria-live={role === 'status' ? 'polite' : undefined}
      className="w-full text-center md:ec-surface md:w-[468px] md:px-11 md:pb-7 md:pt-12"
    >
      <div className="ec-surface px-6 pb-[26px] pt-9 md:contents">{top}</div>
      {bottom}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Envelope({ expired = false }: { expired?: boolean }) {
  const gradientId = useId();
  if (expired) {
    return (
      <svg viewBox="0 0 46 46" fill="none" strokeLinecap="round" strokeLinejoin="round" className="h-[50px] w-[50px] overflow-visible" aria-hidden="true">
        <rect x="5" y="11" width="36" height="26" rx="5" stroke="currentColor" strokeOpacity=".5" strokeWidth="2" />
        <path d="M7 14l16 11 16-11" stroke="currentColor" strokeOpacity=".5" strokeWidth="2" />
        <circle cx="37" cy="34" r="8.5" className="fill-bg-elevated" stroke="currentColor" strokeOpacity=".7" strokeWidth="1.8" />
        <path d="M37 30v4.4l2.6 1.6" stroke="currentColor" strokeOpacity=".85" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 46 46" fill="none" strokeLinecap="round" strokeLinejoin="round" className="h-[50px] w-[50px] overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2f2f0" />
          <stop offset="1" stopColor="#cfcfcb" />
        </linearGradient>
      </defs>
      <rect x="11" y="4" width="24" height="22" rx="3" fill={`url(#${gradientId})`} />
      <path d="M16 11h14M16 16h9" stroke="#0c0c0d" strokeOpacity=".28" strokeWidth="2" />
      <path d="M5 19.5 23 31l18-11.5V37a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" className="fill-bg-elevated" stroke="currentColor" strokeOpacity=".85" strokeWidth="2" />
      <path d="M5.5 39.5 18.5 28M40.5 39.5 27.5 28" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.6" />
      <circle cx="23" cy="31" r="4.2" className="fill-brand" />
    </svg>
  );
}

/** The 112 px mark: a sweeping ring while we wait, a still ring when expired, a filled check when in. */
function Mark({ state }: { state: 'sent' | 'waiting' | 'expired' | 'success' }) {
  if (state === 'success') {
    return (
      <div className="ec-mark ec-mark-success" aria-hidden="true">
        <span className="ec-ring ec-ring-full" />
        <span className="ec-pulse" style={{ inset: -12 }} />
        <span className="ec-pulse ec-pulse-far" style={{ inset: -28 }} />
        <span className="ec-disc ec-disc-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      </div>
    );
  }
  return (
    <div className="ec-mark" aria-hidden="true">
      {state === 'waiting' ? (
        <>
          <span className="ec-pulse ec-pulse-live" style={{ inset: -14 }} />
          <span className="ec-pulse ec-pulse-live ec-pulse-far" style={{ inset: -30 }} />
        </>
      ) : null}
      <span className="ec-ring ec-ring-track" />
      {state === 'expired' ? null : (
        <span className="ec-sweep">
          <span className="ec-ring ec-ring-sweep" />
          <span className="ec-head" />
        </span>
      )}
      <span className="ec-disc text-content-primary">
        <Envelope expired={state === 'expired'} />
      </span>
    </div>
  );
}

function Hero({ children }: { children: ReactNode }) {
  return (
    <h1 className="mt-[26px] text-balance font-display text-[31px] font-normal leading-[1.1] tracking-[-0.012em] text-content-primary md:mt-[30px] md:text-[40px] md:leading-[1.08]">
      {children}
    </h1>
  );
}

/** Google-style account chip. Tapping it goes back to the email field, filled in. */
function AccountChip({ email, onChange }: { email: string; onChange?: () => void }) {
  const initial = email.charAt(0).toUpperCase() || '·';
  const content = (
    <>
      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-brand/20 text-sm font-semibold text-brand">
        {initial}
      </span>
      {/* A long address gives up its name, never its domain: the domain is
          what tells someone they typed the wrong address. */}
      <span className="flex min-w-0">
        <span className="min-w-[3ch] truncate">{email.slice(0, Math.max(0, email.lastIndexOf('@')))}</span>
        <span className="max-w-[80%] shrink-0 truncate">{email.slice(Math.max(0, email.lastIndexOf('@')))}</span>
      </span>
      {onChange ? (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="-ml-0.5 h-4 w-4 shrink-0 text-content-primary/55" aria-hidden="true">
          <path d="M4.5 6.5 8 10l3.5-3.5" />
        </svg>
      ) : null}
    </>
  );
  const className =
    'mt-5 inline-flex h-10 max-w-full items-center gap-2.5 rounded-full border border-stroke-strong bg-content-primary/[0.025] pl-[5px] pr-3 text-[15px] font-medium tracking-[-0.005em] text-content-primary';
  if (!onChange) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onChange}
      aria-label={`${email}. Use a different email`}
      className={`${className} motion-press transition-colors duration-fast ease-standard hover:bg-bg-hover`}
    >
      {content}
    </button>
  );
}

/** Decorative cover tile: the rollout has no art yet, so it gets the warm gradient from the mock. */
function CoverTile({ size = 44, muted = false }: { size?: number; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`ec-cover shrink-0 ${muted ? 'ec-cover-muted' : ''}`}
      style={{ width: size, height: size, borderRadius: size >= 44 ? 10 : 9 }}
    />
  );
}

/** "Your plan for Honest is saved." Renders nothing without a title (empty blocks never render). */
function PlanRow({ releaseTitle, variant }: { releaseTitle?: string | null; variant: 'saved' | 'safe' }) {
  const title = String(releaseTitle || '').trim();
  if (!title) return null;
  return (
    <div className="mt-[26px] flex items-center gap-3.5 border-t border-stroke-default pt-5 text-left">
      <CoverTile muted={variant === 'safe'} />
      <div className="min-w-0">
        <p className="text-[15px] font-medium leading-[1.35] tracking-[-0.005em] text-content-primary">
          Your plan for <b className="font-semibold">{title}</b> is {variant === 'saved' ? 'saved' : 'safe'}.
        </p>
        <p className="mt-0.5 text-[13px] leading-[1.4] text-content-primary/55">
          {variant === 'saved' ? 'Confirm to open it.' : 'Links last an hour, for your security.'}
        </p>
      </div>
    </div>
  );
}

const primaryClass =
  'motion-press flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-brand text-[17px] font-semibold tracking-[-0.01em] text-content-inverse shadow-[0_10px_30px_-8px_rgb(var(--color-brand)/0.45)] transition-colors duration-fast ease-standard hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';

function GmailGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2 6.5A2.5 2.5 0 0 1 4.5 4h.3L12 9.4 19.2 4h.3A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5H18V9.8l-6 4.5-6-4.5V20H4.5A2.5 2.5 0 0 1 2 17.5z"
      />
    </svg>
  );
}

function CountdownRing({ leftMs }: { leftMs: number }) {
  const r = 7;
  const circumference = 2 * Math.PI * r;
  const fraction = Math.max(0, Math.min(1, leftMs / RESEND_COOLDOWN_MS));
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px] -rotate-90" aria-hidden="true">
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth="2" />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        className="stroke-brand"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${(circumference * fraction).toFixed(2)} ${circumference.toFixed(2)}`}
      />
    </svg>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** Quiet text button with the 60 s cooldown ring. */
function ResendButton({ email, sentAt, onSent }: { email: string; sentAt: number; onSent: (sentAt: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const now = useNow(true);
  const left = resendCooldownLeft(sentAt, now);
  const cooling = left > 0;

  const resend = async () => {
    if (busy || cooling) return;
    setBusy(true);
    setFailed(false);
    const { outcome, pending } = await resendConfirmationEmail(email);
    setBusy(false);
    if (outcome === 'failed') {
      setFailed(true);
      return;
    }
    onSent(pending?.sentAt ?? Date.now());
    if (outcome === 'sent') setJustSent(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void resend()}
        disabled={busy || cooling}
        aria-live="polite"
        className={`mt-2.5 inline-flex h-11 items-center gap-[9px] rounded-full px-4 text-[15px] font-medium tracking-[-0.005em] transition-colors duration-fast ease-standard ${
          cooling ? 'cursor-default text-content-primary/55' : 'text-content-primary/85 hover:bg-bg-hover'
        }`}
      >
        {cooling ? (
          <>
            <CountdownRing leftMs={left} />
            <span>
              Resend in <span className="tabular-nums text-content-primary/80">{formatCooldown(left)}</span>
            </span>
          </>
        ) : busy ? (
          'Sending…'
        ) : (
          'Resend link'
        )}
      </button>
      {justSent && cooling ? (
        <span className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          New link sent
        </span>
      ) : null}
      {failed ? (
        <span className="mt-0.5 text-[13px] text-content-primary/55" role="status">
          Could not send. Try again in a moment.
        </span>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

export type CheckInboxProps = {
  email: string;
  firstName?: string | null;
  /** Rollout title from the persisted wizard draft. No title, no row. */
  releaseTitle?: string | null;
  /** Epoch ms the last link went out (cooldown). */
  sentAt: number;
  onSentAgain?: (sentAt: number) => void;
  /** The account chip: back to the email field with the address filled in. */
  onChangeEmail?: () => void;
};

/** Mocks 1a (Gmail), 1b (any other address) and 1c (cooldown). */
export function CheckInbox({ email, firstName, releaseTitle, sentAt, onSentAgain, onChangeEmail }: CheckInboxProps) {
  const [lastSent, setLastSent] = useState(sentAt);
  useEffect(() => setLastSent(sentAt), [sentAt]);
  const address = normalizeEmail(email);
  const gmail = isGmailAddress(address);
  const name = String(firstName || '').trim();

  const live = gmail ? null : (
    <div className="mt-[22px] flex items-center justify-center gap-3 rounded-[18px] border border-brand/15 bg-brand/[0.06] px-[18px] py-3.5 text-left">
      <span className="ec-live-dot" aria-hidden="true" />
      <p className="text-pretty text-sm leading-[1.45] text-content-primary/80">
        Keep this page open. Confirm on this device and it signs you in.
      </p>
    </div>
  );

  return (
    <ConfirmShell>
      <ConfirmCard
        top={
          <>
            <Mark state={gmail ? 'sent' : 'waiting'} />
            <Hero>
              {name ? (
                <>
                  Check your inbox,
                  <br />
                  {name}.
                </>
              ) : (
                'Check your inbox.'
              )}
            </Hero>
            <AccountChip email={address} onChange={onChangeEmail} />
            <PlanRow releaseTitle={releaseTitle} variant="saved" />
          </>
        }
        bottom={
          <>
            {live}
            <div className="relative z-[1] mt-[22px] flex flex-col items-center md:mt-7">
              {gmail ? (
                <a href={GMAIL_CONFIRMATION_SEARCH_URL} target="_blank" rel="noreferrer" className={primaryClass}>
                  <GmailGlyph />
                  Open Gmail
                </a>
              ) : null}
              <ResendButton
                email={address}
                sentAt={lastSent}
                onSent={(at) => {
                  setLastSent(at);
                  onSentAgain?.(at);
                }}
              />
            </div>
            <p className="mt-3.5 text-center text-[13px] leading-[1.5] text-content-primary/55 md:hidden">
              Not there? Check Spam or Promotions.
            </p>
          </>
        }
      />
      <p className="mt-[22px] hidden text-center text-[13px] leading-[1.5] text-content-primary/55 md:block">
        Not there? Check Spam or Promotions.
      </p>
    </ConfirmShell>
  );
}

export type LinkExpiredProps = {
  /** Last address we know of. Null shows the field (mock 2b). */
  email?: string | null;
  releaseTitle?: string | null;
  /** Called after a new link went out (or the send was rate limited): show Check your inbox. */
  onSent: (email: string, sentAt: number) => void;
  onChangeEmail?: () => void;
};

/** Mocks 2a (address known) and 2b (no address). */
export function LinkExpired({ email, releaseTitle, onSent, onChangeEmail }: LinkExpiredProps) {
  const known = normalizeEmail(email);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fieldId = useId();
  const target = known || normalizeEmail(typed);

  const send = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    if (!target.includes('@')) {
      setError('Enter your email address.');
      return;
    }
    setBusy(true);
    setError('');
    const { outcome, pending } = await resendConfirmationEmail(target);
    setBusy(false);
    if (outcome === 'failed') {
      setError('Could not send a new link. Try again in a moment.');
      return;
    }
    onSent(target, pending?.sentAt ?? Date.now());
  };

  const action = (
    <div className="relative z-[1] mt-[22px] flex flex-col items-center md:mt-7">
      <button type="submit" disabled={busy} className={primaryClass}>
        {busy ? 'Sending…' : 'Send a new link'}
      </button>
      {error ? (
        <p className="mt-3 text-center text-[13px] text-content-primary/70" role="alert">
          {error}
        </p>
      ) : null}
      {/* A link tapped twice lands here too, after it already worked. */}
      <a
        href="/auth"
        className="mt-3 inline-flex h-11 items-center rounded-full px-4 text-[15px] font-medium tracking-[-0.005em] text-content-primary/70 transition-colors duration-fast ease-standard hover:bg-bg-hover"
      >
        Already confirmed? Log in
      </a>
    </div>
  );

  return (
    <ConfirmShell dimGlow>
      <form onSubmit={(event) => void send(event)} className="w-full md:w-auto">
        <ConfirmCard
          top={
            <>
              <Mark state="expired" />
              <Hero>
                This link has
                <br />
                expired.
              </Hero>
              {known ? (
                <>
                  <AccountChip email={known} onChange={onChangeEmail} />
                  <PlanRow releaseTitle={releaseTitle} variant="safe" />
                </>
              ) : (
                <div className="mt-6 text-left">
                  <label htmlFor={fieldId} className="sr-only">
                    Email
                  </label>
                  <input
                    id={fieldId}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={typed}
                    onChange={(event) => {
                      setTyped(event.target.value);
                      if (error) setError('');
                    }}
                    className="block h-[54px] w-full rounded-2xl border border-stroke-control bg-content-primary/[0.03] px-[18px] text-base text-content-primary outline-none placeholder:text-content-primary/40 focus:border-brand"
                  />
                </div>
              )}
            </>
          }
          bottom={action}
        />
      </form>
    </ConfirmShell>
  );
}

export type YoureInRow = { title: string; when: string };

export type YoureInProps = {
  firstName?: string | null;
  /** The rollout being opened. Absent for invite/curator sign-ups: just the mark and the line. */
  release?: { title: string; meta: string } | null;
  /** The plan's first rows, revealed as the real hand-off moves on. */
  rows?: YoureInRow[];
  /** How many rows are revealed (the rest render as one skeleton row). */
  revealed?: number;
  /** 0..1, from the real hand-off phase. */
  progress?: number;
  /** Line under the hero. Defaults to "Opening <title>…" with a release. */
  subline?: string | null;
  error?: string | null;
  onRetry?: () => void;
  /** Quiet extra action (e.g. "Continue here"). */
  footer?: ReactNode;
};

/** Mock 3. role="status" so a screen reader announces the moment. */
export function YoureIn({ firstName, release, rows = [], revealed = 0, progress = 0, subline, error, onRetry, footer }: YoureInProps) {
  const name = String(firstName || '').trim();
  const line = subline === undefined ? (release ? `Opening ${release.title}…` : null) : subline;
  const shown = rows.slice(0, Math.max(0, revealed));
  const pending = rows.length > shown.length;
  return (
    <ConfirmShell>
      <ConfirmCard
        role="status"
        top={
          <>
            <div className="mb-[22px] mt-4">
              <Mark state="success" />
            </div>
            <h1 className="text-balance font-display text-[31px] font-normal leading-[1.1] tracking-[-0.012em] text-content-primary md:text-[40px] md:leading-[1.08]">
              {name ? `You’re in, ${name}.` : 'You’re in.'}
            </h1>
            {line ? <p className="mt-2.5 text-[15px] leading-[1.45] text-content-primary/55">{line}</p> : null}
            {release && !error ? (
              <>
                <div className="ec-plan relative mt-[26px] overflow-hidden rounded-[22px] border border-stroke-default bg-bg-base/55 px-4 pb-1.5 pt-4 text-left">
                  <div className="flex items-center gap-3 border-b border-stroke-default pb-3.5">
                    <CoverTile size={40} />
                    <div className="min-w-0">
                      <p className="truncate font-display text-[19px] leading-[1.1]">{release.title}</p>
                      <p className="mt-[3px] text-[13px] text-content-primary/55">{release.meta}</p>
                    </div>
                  </div>
                  {shown.map((row, index) => (
                    <div
                      key={`${row.title}-${index}`}
                      className="ec-row-in flex items-center gap-3 border-stroke-default px-0.5 py-3 text-sm font-medium tracking-[-0.005em] [&+&]:border-t"
                      style={{ opacity: Math.max(0.5, 1 - index * 0.22) }}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full border-[1.5px] border-content-primary/50" aria-hidden="true" />
                      <span className="min-w-0 truncate">{row.title}</span>
                      <span className="ml-auto shrink-0 text-[13px] font-normal tabular-nums text-content-primary/55">{row.when}</span>
                    </div>
                  ))}
                  {pending ? (
                    <div className={`flex items-center gap-3 px-0.5 py-3 opacity-60 ${shown.length ? 'border-t border-stroke-default' : ''}`} aria-hidden="true">
                      <span className="h-2 w-2 shrink-0 rounded-full border-[1.5px] border-content-primary/20" />
                      <span className="skeleton-shimmer h-2.5 w-[46%] rounded-md bg-content-primary/[0.08]" />
                      <span className="skeleton-shimmer ml-auto h-2.5 w-11 rounded-md bg-content-primary/[0.06]" />
                    </div>
                  ) : null}
                </div>
                <div className="mt-[22px] h-[3px] overflow-hidden rounded-[3px] bg-content-primary/[0.08]" aria-hidden="true">
                  <i
                    className="block h-full rounded-[3px] bg-gradient-to-r from-brand/30 to-brand transition-[width] duration-500 ease-standard"
                    style={{ width: `${Math.round(Math.max(0.06, Math.min(1, progress)) * 100)}%` }}
                  />
                </div>
              </>
            ) : null}
            {error ? (
              <div className="mt-6">
                <p className="text-sm leading-relaxed text-content-primary/80" role="alert">
                  {error}
                </p>
                {onRetry ? (
                  <button type="button" onClick={onRetry} className={`${primaryClass} mt-5`}>
                    Try again
                  </button>
                ) : null}
              </div>
            ) : null}
            {footer ? <div className="mt-5">{footer}</div> : null}
          </>
        }
      />
    </ConfirmShell>
  );
}

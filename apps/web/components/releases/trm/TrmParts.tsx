'use client';

import type { ReactNode, LiHTMLAttributes } from 'react';
import { Check, ExternalLink } from '@/components/icons';
import { FAN_PAYMENTS_PARTNER } from '@/lib/fan-payments';
import { openExternalUrl } from '@/lib/external-link';
import { TRM_TERMS_URL } from '@/lib/trm/release';
import type { TrmOwner } from '@/lib/trm/server';

// The building blocks the Send to TRM mocks (URG-392) are made of: one serif
// hero, a Space Mono meta line, tick rows in one bordered list, quiet partner
// lines. Kept in one place so every state reads the same.

// From lg up (#1210) the step reads like the rest of the app: normal sentence
// case in the body font and rounded cards and buttons. The phone keeps the
// mono labels and square boxes it was approved with.
export const MONO =
  'font-mono text-[11px] uppercase tracking-[0.08em] text-content-secondary lg:font-sans lg:text-[13px] lg:normal-case lg:tracking-normal';
export const PRIMARY =
  'motion-focus motion-press inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap border border-brand/25 bg-brand px-5 text-[15px] font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto lg:rounded-full';
export const OUTLINE =
  'motion-focus motion-press inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap border border-stroke-strong px-5 text-[15px] font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto lg:rounded-full';
export const ROW_BUTTON =
  'motion-focus motion-press inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap border border-stroke-strong px-3.5 text-[13.5px] font-semibold text-content-primary transition-colors hover:bg-bg-hover lg:rounded-full';
export const ROW_PRIMARY =
  'motion-focus motion-press inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap border border-brand/25 bg-brand px-3.5 text-[13.5px] font-semibold text-content-inverse transition-colors hover:bg-brand-hover lg:rounded-full';
export const QUIET_LINK =
  'motion-focus inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-content-secondary underline decoration-stroke-strong underline-offset-[3px] hover:text-content-primary';

export function Hero({ title, meta, chip }: { title: string; meta?: ReactNode; chip?: ReactNode }) {
  return (
    <div>
      <div className="flex min-h-[26px] items-center justify-between gap-3">
        <p className={MONO}>Distribute</p>
        {chip}
      </div>
      <h3 className="mt-3 font-display text-[30px] leading-[1.08] tracking-[-0.02em] text-content-primary sm:text-[44px]">
        {title}
      </h3>
      {meta ? <p className={`mt-3 ${MONO}`}>{meta}</p> : null}
    </div>
  );
}

export function Chip({ label, tone }: { label: string; tone: 'live' | 'error' | 'done' | 'quiet' }) {
  const toneClass =
    tone === 'error'
      ? 'border-transparent bg-status-error/10 text-status-error'
      : tone === 'done'
        ? 'border-transparent bg-brand/10 text-brand'
        : 'border-stroke-strong text-content-primary';
  const dot =
    tone === 'error' ? 'bg-status-error' : tone === 'quiet' ? 'bg-content-secondary' : 'bg-brand';
  return (
    <span
      role="status"
      className={`inline-flex h-[26px] shrink-0 items-center gap-[7px] border px-2.5 font-mono text-[10.5px] uppercase tracking-[0.08em] lg:h-7 lg:rounded-full lg:px-3 lg:font-sans lg:text-xs lg:font-semibold lg:normal-case lg:tracking-normal ${toneClass}`}
    >
      <i
        aria-hidden="true"
        className={`block h-[7px] w-[7px] rounded-full ${dot} ${tone === 'live' ? 'shadow-[0_0_0_4px_rgba(127,217,154,0.14)]' : ''}`}
      />
      {label}
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className={`mb-3 ${MONO}`}>{children}</p>;
}

export function Tick() {
  return (
    <span aria-hidden="true" className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
      <Check className="h-[13px] w-[13px]" strokeWidth={2.4} />
    </span>
  );
}

export function Todo() {
  return <span aria-hidden="true" className="h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px] border-status-error" />;
}

export function Ring() {
  return <span aria-hidden="true" className="h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px] border-stroke-strong" />;
}

const FACE_TONES = ['bg-status-info', 'bg-status-warning'] as const;

export function Face({ owner }: { owner: TrmOwner }) {
  // Your own initial (a bare "Y") says nothing; only a teammate's is worth a circle.
  if (owner.isYou) return null;
  return (
    <span
      title={owner.name}
      aria-label={owner.name}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-content-inverse ${owner.isYou ? FACE_TONES[0] : FACE_TONES[1]}`}
    >
      {owner.initial}
    </span>
  );
}

export function List({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="border border-stroke-default bg-bg-surface lg:overflow-hidden lg:rounded-2xl">
      {children}
    </ul>
  );
}

export function Row({
  mark,
  title,
  detail,
  right,
  dim = false,
  children,
  itemProps,
}: {
  mark: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  right?: ReactNode;
  dim?: boolean;
  children?: ReactNode;
  /** Extra props for the <li> (drag and drop on the songs list). */
  itemProps?: LiHTMLAttributes<HTMLLIElement>;
}) {
  return (
    <li {...itemProps} className="flex min-h-16 items-center gap-3.5 border-b border-stroke-default px-4 py-3 last:border-b-0 sm:px-[18px]">
      {mark}
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] font-semibold ${dim ? 'text-content-secondary' : 'text-content-primary'}`}>{title}</p>
        {detail ? (
          <p className="mt-[3px] break-words font-mono text-[11.5px] tracking-[0.02em] text-content-secondary lg:font-sans lg:text-xs lg:tracking-normal">{detail}</p>
        ) : null}
        {children}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-3">{right}</div> : null}
    </li>
  );
}

export function PartnerLine({ sending = false }: { sending?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 text-sm text-content-secondary sm:px-[18px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/partners/therealmusic.png" alt="" className="h-[22px] w-auto shrink-0 bg-white px-1.5 py-0.5" />
      <span className="min-w-0 flex-1">{sending ? 'Sending with TRM Distro' : 'With TRM Distro'}</span>
      <a href={TRM_TERMS_URL} target="_blank" rel="noopener noreferrer" className={QUIET_LINK}>
        Their terms
      </a>
    </div>
  );
}

export function FanLine() {
  return (
    <div className="flex items-center gap-3 px-4 py-4 text-sm text-content-secondary sm:px-[18px]">
      <span className="min-w-0 flex-1">Fan payments with {FAN_PAYMENTS_PARTNER.name}</span>
      <button type="button" onClick={() => void openExternalUrl(FAN_PAYMENTS_PARTNER.signupUrl)} className={QUIET_LINK}>
        Sign up
        <ExternalLink className="h-[13px] w-[13px]" aria-hidden="true" />
      </button>
    </div>
  );
}

/** The quiet partner lines at the foot of the step. */
export function Partners({ trm = true, sending = false, fan = true }: { trm?: boolean; sending?: boolean; fan?: boolean }) {
  if (!trm && !fan) return null;
  return (
    <div className="divide-y divide-stroke-default border border-stroke-default lg:rounded-2xl lg:bg-bg-surface">
      {trm ? <PartnerLine sending={sending} /> : null}
      {fan ? <FanLine /> : null}
    </div>
  );
}

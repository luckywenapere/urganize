'use client';

import type { ReactNode } from 'react';
import { Check } from '@/components/icons';
import { TRM_TERMS_URL } from '@/lib/trm/release';
import type { DistributeRow } from '@/lib/trm/distribute-checklist';
import type { TrmRow } from '@/lib/trm/release';

// The desktop Distribute page (#1210, part of #1175), built to the approved
// mock docs/mocks/distribute-desktop/mock.html: the checklist on the left, the
// send card, the distributor and the plan's allowance on the right. Rounded
// cards and plain sentences, like the rest of the app. Rendered from lg up
// only; the phone keeps the column TrmDistribute has always drawn.

export const DESK_CARD = 'rounded-2xl border border-stroke-default bg-bg-surface';
export const DESK_ROW_LINK =
  'motion-focus inline-flex shrink-0 items-center text-[13px] font-semibold text-brand underline underline-offset-[3px] hover:text-brand-hover';
export const DESK_ROW_BUTTON =
  'motion-focus motion-press inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-stroke-strong px-4 text-[13px] font-medium text-content-primary transition-colors hover:bg-bg-hover';

/** Heading plus the line under it, at the top of the left column. */
export function DeskHeading({ title, sub, chip }: { title: string; sub?: ReactNode; chip?: ReactNode }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-display text-[32px] leading-10 text-content-primary">{title}</h3>
        {chip ? <div className="pt-1.5">{chip}</div> : null}
      </div>
      {sub ? <p className="mt-1 text-sm text-content-secondary">{sub}</p> : null}
    </div>
  );
}

/** The two columns: about 1120 wide, the right one 380. */
export function DeskColumns({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="mx-auto mt-2 grid w-full max-w-[1120px] grid-cols-[minmax(0,1fr)_340px] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">{left}</div>
      <div className="flex min-w-0 flex-col gap-4">{right}</div>
    </div>
  );
}

export function DeskMark({ state }: { state: 'ready' | 'todo' | 'at_send' }) {
  if (state === 'ready') {
    return (
      <span aria-hidden="true" className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand text-content-inverse">
        <Check className="h-3 w-3" strokeWidth={2.6} />
      </span>
    );
  }
  if (state === 'todo') {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-status-error text-xs font-bold text-status-error"
      >
        !
      </span>
    );
  }
  return <span aria-hidden="true" className="h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px] border-stroke-strong" />;
}

const STATE_WORDS = { ready: 'Ready', todo: 'Needs work', at_send: 'Added when you send' } as const;

/** One row of the checklist card. `thumb` is the cover, `action` the one button,
 *  `children` the issue lines and the open editor under it. */
export function DeskItem({
  row,
  thumb,
  action,
  children,
}: {
  row: Pick<DistributeRow<TrmRow>, 'title' | 'state' | 'detail'>;
  thumb?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="border-t border-stroke-default first:border-t-0">
      <div className="flex items-center gap-3.5 py-3.5">
        <DeskMark state={row.state} />
        <span className="sr-only">{STATE_WORDS[row.state]}:</span>
        {thumb}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-content-primary">{row.title}</p>
          {row.detail ? (
            <p
              className={`mt-0.5 break-words text-xs leading-4 ${row.state === 'todo' ? 'font-semibold text-status-error' : 'text-content-secondary'}`}
            >
              {row.detail}
            </p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-3">{action}</div> : null}
      </div>
      {children}
    </li>
  );
}

/** The checklist card. */
export function DeskCard({ title, count, children, label }: { title?: string; count?: string; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label ?? title} className={`${DESK_CARD} px-5 pb-2 pt-1.5`}>
      {title ? (
        <div className="flex items-baseline justify-between pb-2 pt-3">
          <h4 className="font-display text-lg leading-6 text-content-primary">
            {title}
            {count ? <span className="font-sans text-[13px] font-medium text-content-secondary"> · {count}</span> : null}
          </h4>
        </div>
      ) : null}
      <ul>{children}</ul>
    </section>
  );
}

/** A problem line under a red row, with its own fix. */
export function DeskIssue({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="mb-2 ml-9 flex items-center gap-3 rounded-xl bg-status-error/5 px-3 py-2">
      <p className="min-w-0 flex-1 text-[13px] text-content-primary">
        <span className="font-semibold">{title}</span>
        <span className="text-content-secondary"> · {detail}</span>
      </p>
      {action}
    </div>
  );
}

/** An editor (cover art, details) opened inside its row. */
export function DeskEditor({ label, onDone, children }: { label: string; onDone: () => void; children: ReactNode }) {
  return (
    <div className="mb-3 ml-9 rounded-xl border border-stroke-default p-4" role="region" aria-label={label}>
      <div className="[&>*:first-child]:mt-0">{children}</div>
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onDone} className={DESK_ROW_BUTTON}>
          Done
        </button>
      </div>
    </div>
  );
}

/** The dark send card at the top of the right column. */
export function DeskSendCard({ title, reason, children }: { title: string; reason?: ReactNode; children?: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-2xl bg-content-primary p-5 text-content-inverse">
      <h4 className="font-display text-[22px] leading-7">{title}</h4>
      {reason ? <p className="mt-1.5 text-sm text-content-inverse/75">{reason}</p> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

export const DESK_SEND_BUTTON =
  'motion-focus motion-press inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-content-inverse px-5 text-sm font-semibold text-content-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-content-inverse/15 disabled:text-content-inverse/70 disabled:hover:opacity-100';

export const DESK_SEND_OUTLINE =
  'motion-focus motion-press inline-flex h-11 w-full items-center justify-center rounded-full border border-content-inverse/40 px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-content-inverse/10 disabled:cursor-not-allowed disabled:opacity-50';

/** "Sending with TRM Distro" and their terms. */
export function DeskPartner({ sending }: { sending: boolean }) {
  return (
    <div className={`${DESK_CARD} flex items-center gap-3 px-5 py-3.5`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/partners/therealmusic.png" alt="" className="h-7 w-auto shrink-0 rounded-md bg-white px-1.5 py-1" />
      <span className="min-w-0 flex-1 text-sm font-medium text-content-primary">{sending ? 'Sending with TRM Distro' : 'With TRM Distro'}</span>
      <a href={TRM_TERMS_URL} target="_blank" rel="noopener noreferrer" className={DESK_ROW_LINK}>
        Their terms
      </a>
    </div>
  );
}

/** Submitted, Received by TRM, Delivering, In stores. */
export function DeskProgress({ steps }: { steps: Array<{ label: string; done: boolean; at: string }> }) {
  return (
    <ol className="mt-5 grid grid-cols-4 gap-2">
      {steps.map((step) => (
        <li
          key={step.label}
          className={`border-t-[3px] pt-2.5 text-sm ${step.done ? 'border-brand font-semibold text-content-primary' : 'border-stroke-strong text-content-secondary'}`}
        >
          {step.label}
          {step.at ? <small className="block text-xs font-normal text-content-secondary">{step.at}</small> : null}
        </li>
      ))}
    </ol>
  );
}

/** The page's shape while it loads: heading, checklist, send card, allowance. */
export function DistributeDeskSkeleton() {
  return (
    <div className="mt-6" aria-busy="true" aria-label="Loading">
      <DeskColumns
        left={
          <>
            <div>
              <div className="h-10 w-80 animate-pulse rounded-lg bg-bg-surface" />
              <div className="mt-2 h-4 w-96 animate-pulse rounded bg-bg-surface" />
            </div>
            <div className={`${DESK_CARD} px-5 py-1.5`}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3.5 border-t border-stroke-default py-4 first:border-t-0">
                  <span className="h-[22px] w-[22px] shrink-0 animate-pulse rounded-full bg-bg-hover" />
                  <div className="flex-1">
                    <div className="h-3.5 w-28 animate-pulse rounded bg-bg-hover" />
                    <div className="mt-1.5 h-3 w-52 animate-pulse rounded bg-bg-hover" />
                  </div>
                  <div className="h-4 w-14 animate-pulse rounded bg-bg-hover" />
                </div>
              ))}
            </div>
          </>
        }
        right={
          <>
            <div className="h-[164px] animate-pulse rounded-2xl bg-content-primary/15" />
            <div className="h-[104px] animate-pulse rounded-2xl border border-stroke-default bg-bg-surface" />
          </>
        }
      />
    </div>
  );
}

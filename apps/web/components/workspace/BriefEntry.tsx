/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight } from '@/components/icons';
import { briefCall } from '@/components/releases/brief-shared';
import { RELEASE_BRIEF_ENABLED } from '@/lib/release-brief-flag';
import { useSceneOverlay } from './useSceneOverlay';

/**
 * The plan's way into the brief (#902, founder 2026-10-30: "the work the plan
 * should be first and priority then this brief can be a button inside work the
 * plan"; mock docs/mocks/plan-first-brief/mock.html). A rollout with a plan
 * opens on the plan; this button sits on the plan's title line (the line that
 * never folds) and opens the brief on the whole screen. The way back is
 * `BriefBackButton`, Esc, or the browser's back button.
 */

type Summary = { line: string; written: boolean };

// One read per rollout per page; the button remounts when you come back from
// the brief, and reads again then, so an edit shows straight away.
function useBriefSummary(releaseId: string): Summary | null {
  const [summary, setSummary] = useState<{ id: string; value: Summary } | null>(null);
  useEffect(() => {
    if (!RELEASE_BRIEF_ENABLED) return;
    let live = true;
    void briefCall<Summary>(`/api/releases/${encodeURIComponent(releaseId)}/brief/summary`, { method: 'GET' }).then(
      (result) => {
        if (live && result.ok) setSummary({ id: releaseId, value: result.data });
      }
    );
    return () => {
      live = false;
    };
  }, [releaseId]);
  return summary?.id === releaseId ? summary.value : null;
}

function initialsOf(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? 'B').slice(0, 2)).toUpperCase();
}

/** The cover, or a flat tile with the title's initials (no gradient placeholders). */
function CoverThumb({ coverUrl, title, size }: { coverUrl: string | null | undefined; title: string; size: number }) {
  const box = { width: size, height: size };
  if (coverUrl) {
    return <img src={coverUrl} alt="" style={box} className="shrink-0 rounded-lg object-cover" />;
  }
  return (
    <span
      aria-hidden="true"
      style={box}
      className="grid shrink-0 place-items-center rounded-lg bg-bg-hover font-display text-[12px] text-content-secondary"
    >
      {initialsOf(title)}
    </span>
  );
}

/** Computer: on the plan's title line, beside the done count. */
export function BriefEntryButton({
  releaseId,
  title,
  coverUrl,
}: {
  releaseId: string;
  title: string;
  coverUrl: string | null | undefined;
}) {
  const { openScene } = useSceneOverlay();
  const summary = useBriefSummary(releaseId);
  if (!RELEASE_BRIEF_ENABLED) return null;
  const line = summary ? (summary.written ? summary.line : 'Write the brief') : '';
  return (
    <button
      type="button"
      onClick={() => openScene('brief', releaseId)}
      aria-label={line ? `Brief: ${line}` : 'Open the brief'}
      className="motion-focus motion-press group inline-flex h-[40px] max-w-[22rem] shrink-0 items-center gap-2.5 rounded-xl border border-stroke-control bg-bg-surface py-1 pl-1 pr-3 text-left transition-colors hover:bg-bg-hover"
    >
      <CoverThumb coverUrl={coverUrl} title={title} size={32} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[13px] font-semibold text-content-primary">Brief</span>
        {line ? <span className="truncate text-[12px] text-content-tertiary">{line}</span> : null}
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-content-tertiary group-hover:text-content-primary" aria-hidden="true" />
    </button>
  );
}

/** Phone: a card under the rollout's title. */
export function BriefEntryCard({
  releaseId,
  title,
  coverUrl,
  cover,
}: {
  releaseId: string;
  title: string;
  coverUrl: string | null | undefined;
  /** An editable cover in place of the plain thumb (the phone, Oct 31, 2026:
   *  the slim header has no cover, so the cover is changed here). */
  cover?: ReactNode;
}) {
  const { openScene } = useSceneOverlay();
  const summary = useBriefSummary(releaseId);
  // With the brief off, the cover still needs a home on the phone.
  if (!RELEASE_BRIEF_ENABLED) return cover ? <div className="mb-4">{cover}</div> : null;
  const line = summary ? (summary.written ? summary.line : 'Write the brief') : '';
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-[14px] font-semibold text-content-primary">Brief</span>
        <span className="truncate text-[13px] text-content-tertiary">{line || 'Open the brief'}</span>
      </span>
      <ChevronRight className="mr-1 h-5 w-5 shrink-0 text-content-tertiary" aria-hidden="true" />
    </>
  );
  if (cover) {
    // Two taps on one card: the cover edits the cover, the rest opens the brief.
    return (
      <div className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-stroke-control bg-bg-surface p-2">
        {cover}
        <button
          type="button"
          onClick={() => openScene('brief', releaseId)}
          className="motion-focus motion-press -my-2 -mr-2 flex min-h-[60px] min-w-0 flex-1 touch-manipulation items-center gap-3 rounded-r-2xl py-2 pr-2 text-left transition-colors hover:bg-bg-hover"
        >
          {body}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => openScene('brief', releaseId)}
      className="motion-focus motion-press mb-4 flex w-full touch-manipulation items-center gap-3 rounded-2xl border border-stroke-control bg-bg-surface p-2 text-left transition-colors hover:bg-bg-hover"
    >
      <CoverThumb coverUrl={coverUrl} title={title} size={44} />
      {body}
    </button>
  );
}

/** The one way back from the brief, in the same place on every screen. */
export function BriefBackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="motion-focus motion-press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-stroke-control bg-bg-surface pl-2.5 pr-3.5 text-[13.5px] font-semibold text-content-primary transition-colors hover:bg-bg-hover"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * Esc leaves the brief for the plan, unless a field, a dialog or the board's
 * own arrange mode wants the key (they call preventDefault or own the focus).
 */
export function useEscapeToPlan(active: boolean, onBack: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onBack]);
}

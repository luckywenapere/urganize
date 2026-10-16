'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Check, ChevronDown } from '@/components/icons';
import { useSceneOverlay } from '@/components/workspace/useSceneOverlay';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import {
  EMPTY_CHECKLIST_RECORD,
  buildChecklist,
  checklistProgressLabel,
  isChecklistRecord,
  reconcileChecklist,
  toggleChecklistTick,
  type ChecklistEntry,
  type ChecklistItem,
  type ChecklistRecord,
} from '@/lib/distribution-checklist';
import { fixDestinationFor, type FixAvailability } from '@/lib/distribution-fix';
import type { DistributionIssue } from '@/lib/distribution-rules';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';

// The same inlined flags DistributionIssueList reads: a Fix button must only
// appear for a scene that exists.
const SCENE_FLAGS = {
  metadata: process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true',
  song: process.env.NEXT_PUBLIC_FEATURE_SONG_UPLOAD === 'true',
  coverArt: process.env.NEXT_PUBLIC_FEATURE_COVER_ART === 'true',
};

const STORAGE_VERSION = 1;
const storageKey = (releaseId: string) => `urganize.distribution-checklist.${releaseId}`;

function readRecord(releaseId: string): ChecklistRecord {
  try {
    return readPersistedState(storageKey(releaseId), STORAGE_VERSION, isChecklistRecord) ?? EMPTY_CHECKLIST_RECORD;
  } catch {
    return EMPTY_CHECKLIST_RECORD;
  }
}

function writeRecord(releaseId: string, record: ChecklistRecord): void {
  try {
    writePersistedState(storageKey(releaseId), STORAGE_VERSION, record);
  } catch {
    // Losing the record costs the "done" rows until the next read, nothing more.
  }
}

/** Whether this browser has a checklist on record for the rollout, so a fully
 *  worked-through checklist keeps its section instead of the strip collapsing
 *  to nothing the moment the last item is fixed. */
export function hasChecklistRecord(releaseId: string): boolean {
  return readRecord(releaseId).entries.length > 0;
}

type DistributionChecklistProps = {
  releaseId: string;
  errors: DistributionIssue[];
  warnings: DistributionIssue[];
  onOpenDetails?: () => void;
  onChangeArtist?: () => void;
  /** Folded, a 36px line that fits beside the timeline's phases (2026-10-16). */
  compact?: boolean;
};

/**
 * The check before distribution as a checklist on the rollout (2026-10-11,
 * founder call; the rules are in lib/distribution-checklist.ts).
 *
 * It replaced a collapsed "Fix these before you order distribution (8)" header
 * that opened onto every item at once. Now the header says how far along the
 * team is, the next open item is always in view with its own Fix button, and the
 * rest open on one tap. It stays on the rollout until the order is handed off,
 * so ticking things off over days is the way it is meant to be used.
 */
export function DistributionChecklist({
  releaseId,
  errors,
  warnings,
  onOpenDetails,
  onChangeArtist,
  compact = false,
}: DistributionChecklistProps) {
  const { openScene } = useSceneOverlay();
  const [record, setRecord] = useState<ChecklistRecord>(EMPTY_CHECKLIST_RECORD);
  const [expanded, setExpanded] = useState(false);

  // Fold every fresh read of the check into the stored record. Read from storage
  // here rather than from state, so a second run of this effect (React's dev
  // double-invoke, or the same data arriving twice) finds the record already
  // updated and reports nothing twice.
  useEffect(() => {
    const stored = readRecord(releaseId);
    const { record: next, newlyFixed } = reconcileChecklist(stored, { errors, warnings });
    writeRecord(releaseId, next);
    setRecord(next);
    if (newlyFixed.length > 0) {
      const after = buildChecklist(next, { errors, warnings });
      for (const entry of newlyFixed) report(releaseId, entry, 'fixed', after.doneCount, after.total);
    }
  }, [releaseId, errors, warnings]);

  const checklist = useMemo(() => buildChecklist(record, { errors, warnings }), [record, errors, warnings]);

  const availability: FixAvailability = {
    ...SCENE_FLAGS,
    canEditDetails: Boolean(onOpenDetails),
    canChangeArtist: Boolean(onChangeArtist),
  };

  const fix = (issue: DistributionIssue) => {
    const destination = fixDestinationFor(issue.fieldPath, availability);
    if (!destination) return;
    if (destination.kind === 'scene') {
      openScene(destination.scene, releaseId, { field: destination.field });
    } else if (destination.kind === 'details') {
      onOpenDetails?.();
    } else {
      onChangeArtist?.();
    }
  };

  const tick = (item: ChecklistItem) => {
    const result = toggleChecklistTick(readRecord(releaseId), item.key);
    if (!result) return;
    writeRecord(releaseId, result.record);
    setRecord(result.record);
    if (result.ticked) {
      const after = buildChecklist(result.record, { errors, warnings });
      report(releaseId, item, 'ticked', after.doneCount, after.total);
    }
  };

  if (checklist.total === 0) return null;

  const allDone = checklist.doneCount === checklist.total;
  const hasOpenErrors = checklist.items.some((item) => !item.done && item.level === 'error');
  const percent = Math.round((checklist.doneCount / checklist.total) * 100);
  const nextOpen = checklist.items.find((item) => !item.done) ?? null;
  const bodyId = `distribution-checklist-${releaseId}`;

  const nextCanFix =
    nextOpen?.issue ? fixDestinationFor(nextOpen.issue.fieldPath, availability) !== null : false;
  const progress = checklistProgressLabel(checklist);

  // One line until it is opened (2026-10-14 declutter, founder: "you decide
  // the best based on how a user would use it"). It is ticked off over days,
  // so it stays on the rollout, but folded it is one row: where you stand,
  // the next thing to do and its Fix button. Opening it shows the bar and
  // every item with its tick, as before.
  return (
    <div className={`overflow-hidden border border-stroke-default bg-bg-surface ${compact ? 'rounded-lg' : 'rounded-xl'}`}>
      <div className={`flex items-center ${compact ? 'h-9 gap-2 pl-3 pr-1' : 'min-h-12 gap-3 py-1 pl-4 pr-2'}`}>
        {allDone ? (
          <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        ) : hasOpenErrors ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-status-error" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className={`motion-focus flex min-w-0 flex-1 items-center gap-2 rounded-md text-left ${compact ? 'h-8' : 'min-h-10'}`}
        >
          <h3 className={`shrink-0 font-semibold text-content-primary ${compact ? 'text-xs' : 'text-sm'}`}>
            {compact
              ? allDone
                ? 'Ready to distribute'
                : 'Before distribution'
              : allDone
                ? 'Ready to order distribution'
                : 'Before you order distribution'}
          </h3>
          {!expanded && nextOpen ? (
            <span className={`hidden min-w-0 truncate text-content-secondary sm:inline ${compact ? 'text-xs' : 'text-sm'}`}>
              <span aria-hidden="true">· </span>
              {nextOpen.message}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 pl-2 text-xs tabular-nums text-content-secondary">{progress}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
        {!expanded && nextOpen && nextCanFix && nextOpen.issue ? (
          <button
            type="button"
            onClick={() => fix(nextOpen.issue as DistributionIssue)}
            aria-label={`Fix: ${nextOpen.message}`}
            className={`motion-focus inline-flex shrink-0 items-center justify-center rounded-md text-xs font-semibold text-brand transition-colors hover:bg-brand/10 ${compact ? 'h-7 px-2.5' : 'h-11 min-w-14 rounded-lg px-3 lg:h-9'}`}
          >
            Fix
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div id={bodyId} className="border-t border-stroke-subtle">
          <div
            role="progressbar"
            aria-label="Checklist before distribution"
            aria-valuemin={0}
            aria-valuemax={checklist.total}
            aria-valuenow={checklist.doneCount}
            aria-valuetext={progress}
            className="mx-4 mt-3 h-1.5 overflow-hidden rounded-full bg-stroke-strong"
          >
            <div className="h-full rounded-full bg-brand transition-[width] duration-base" style={{ width: `${percent}%` }} />
          </div>
          <ul className="mt-2 divide-y divide-stroke-subtle">
            {checklist.items.map((item) => {
              const canFix = item.issue ? fixDestinationFor(item.issue.fieldPath, availability) !== null : false;
              return (
                <li key={item.key} className="flex min-h-14 items-center gap-2 py-1 pl-1.5 pr-3">
                  <TickControl item={item} onTick={() => tick(item)} />
                  <p
                    className={`min-w-0 flex-1 text-sm ${
                      item.done ? 'text-content-tertiary line-through decoration-content-tertiary' : 'text-content-primary'
                    }`}
                  >
                    {item.message}
                    {!item.done && item.level === 'error' ? (
                      <span className="sr-only"> Needed before you order. Ticks itself when fixed.</span>
                    ) : null}
                  </p>
                  {!item.done && canFix && item.issue ? (
                    <button
                      type="button"
                      onClick={() => fix(item.issue as DistributionIssue)}
                      aria-label={`Fix: ${item.message}`}
                      className="motion-focus inline-flex h-11 min-w-14 shrink-0 items-center justify-center rounded-lg border border-stroke-control px-3 text-xs font-semibold text-brand transition-colors hover:bg-brand/10"
                    >
                      Fix
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The 44px tick at the start of each row. A warning can be ticked by hand; an
 * error cannot (the distributor would still refuse it), so its control is a
 * plain ring that fills when the check stops raising it.
 */
function TickControl({ item, onTick }: { item: ChecklistItem; onTick: () => void }) {
  const ring = item.done
    ? 'border-brand bg-brand text-content-inverse'
    : item.level === 'error'
      ? 'border-status-error/60'
      : 'border-stroke-strong';
  const mark = (
    <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${ring}`} aria-hidden="true">
      {item.done ? <Check className="h-3 w-3" /> : null}
    </span>
  );
  if (item.canTick || (item.doneBy === 'ticked' && item.level === 'warning')) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={item.done}
        aria-label={item.done ? `Untick: ${item.message}` : `Tick off: ${item.message}`}
        onClick={onTick}
        className="motion-focus grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-bg-hover"
      >
        {mark}
      </button>
    );
  }
  return (
    <span
      role="img"
      aria-label={item.done ? 'Done' : 'Not done yet'}
      className="grid h-11 w-11 shrink-0 place-items-center"
    >
      {mark}
    </span>
  );
}

function report(
  releaseId: string,
  entry: ChecklistEntry,
  how: 'fixed' | 'ticked',
  done: number,
  total: number
): void {
  captureAnalyticsEvent({
    name: 'role_gap_fixed',
    properties: { release_id: releaseId, item: entry.code, level: entry.level, how, done, total },
  });
}

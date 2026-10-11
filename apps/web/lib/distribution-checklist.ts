/**
 * The checklist before distribution (2026-10-11, founder call).
 *
 * WHY IT EXISTS. A new user's first plan showed "Fix these before you order
 * distribution (8)" as one list of everything at once, and the replay shows it
 * closed within six seconds. The founder's answer: keep the same items, but as a
 * standing checklist on the rollout, where each one can be ticked off or fixed
 * from its own row and the header says how far along the team is ("3 of 8
 * done"). Progress is the point: a list that only ever shrinks gives nobody the
 * sense of having done anything.
 *
 * WHERE THE ITEMS COME FROM. The same server check the Distribute scene reads
 * (lib/distribution-rules.ts through useDistributionStatus). Nothing here
 * decides whether a rollout CAN go out; the order route still refuses on any
 * error. This module only remembers what the check has said before, so an item
 * that stops appearing can be shown as done instead of vanishing.
 *
 * THE RECORD IS PER RELEASE AND KEPT IN THE BROWSER (persisted-state, the
 * RoleGapsPanel precedent). No migration: ui_state_drafts is admin-only, and a
 * lost record costs one thing only, the "done" rows, which come back as the
 * check is read again. The open rows are always the live check.
 *
 * TICKING. A warning ("Worth a look") can be ticked by hand, because it never
 * blocks the order and the team may have decided it is fine. An error cannot:
 * the distributor would still refuse it, so a hand tick would be a lie the
 * order button then contradicts. An error ticks itself when the check stops
 * raising it.
 *
 * Pure so vitest (node only, no jsdom) can hold it. The drawing lives in
 * components/workspace/DistributionChecklist.tsx.
 */

import type { DistributionIssue, DistributionIssueLevel } from './distribution-rules';

export type ChecklistEntry = {
  key: string;
  code: DistributionIssue['code'];
  fieldPath: DistributionIssue['fieldPath'];
  level: DistributionIssueLevel;
  /** The last sentence the check used for it, so a done row still reads. */
  message: string;
};

export type ChecklistRecord = {
  /** Every item the check has raised for this rollout, in first-seen order. */
  entries: ChecklistEntry[];
  /** Warnings the team ticked by hand. */
  ticked: string[];
  /** Items the check stopped raising after it had raised them. */
  fixed: string[];
};

export type ChecklistItem = ChecklistEntry & {
  done: boolean;
  /** How it got done: the check stopped raising it, or somebody ticked it. */
  doneBy: 'fixed' | 'ticked' | null;
  /** The live issue, when the check still raises it (the Fix button needs it). */
  issue: DistributionIssue | null;
  /** Only open warnings can be ticked by hand. */
  canTick: boolean;
};

export type Checklist = {
  items: ChecklistItem[];
  doneCount: number;
  total: number;
};

export const EMPTY_CHECKLIST_RECORD: ChecklistRecord = { entries: [], ticked: [], fixed: [] };

/** One identity per rule and field, so the same problem keeps one row while its
 *  wording changes (a title, a date or a count inside the message). */
export function checklistKey(issue: Pick<DistributionIssue, 'code' | 'fieldPath'>): string {
  return `${issue.code}:${issue.fieldPath}`;
}

export function isChecklistRecord(value: unknown): value is ChecklistRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ChecklistRecord>;
  return (
    Array.isArray(record.entries) &&
    record.entries.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof (entry as ChecklistEntry).key === 'string' &&
        typeof (entry as ChecklistEntry).message === 'string' &&
        ((entry as ChecklistEntry).level === 'error' || (entry as ChecklistEntry).level === 'warning')
    ) &&
    Array.isArray(record.ticked) &&
    record.ticked.every((key) => typeof key === 'string') &&
    Array.isArray(record.fixed) &&
    record.fixed.every((key) => typeof key === 'string')
  );
}

type LiveCheck = { errors: DistributionIssue[]; warnings: DistributionIssue[] };

function liveIssues(check: LiveCheck): Array<{ issue: DistributionIssue; level: DistributionIssueLevel }> {
  return [
    ...check.errors.map((issue) => ({ issue, level: 'error' as const })),
    ...check.warnings.map((issue) => ({ issue, level: 'warning' as const })),
  ];
}

/**
 * Folds a fresh read of the check into the record, and says which items became
 * done on this read (each one is a `role_gap_fixed` event).
 *
 * - A new item joins the record.
 * - An item already in it keeps its place and takes the newest wording.
 * - An item the record knew as open that the check no longer raises becomes
 *   fixed, and is reported.
 * - An item that comes BACK (fixed, then broken again) is open again: it leaves
 *   `fixed` and `ticked`, because the check is the authority on what is wrong.
 */
export function reconcileChecklist(
  record: ChecklistRecord,
  check: LiveCheck
): { record: ChecklistRecord; newlyFixed: ChecklistEntry[] } {
  const live = liveIssues(check);
  const liveKeys = new Set(live.map(({ issue }) => checklistKey(issue)));

  const entries = [...record.entries];
  const indexByKey = new Map(entries.map((entry, index) => [entry.key, index]));
  for (const { issue, level } of live) {
    const key = checklistKey(issue);
    const next: ChecklistEntry = { key, code: issue.code, fieldPath: issue.fieldPath, level, message: issue.message };
    const at = indexByKey.get(key);
    if (at === undefined) {
      indexByKey.set(key, entries.length);
      entries.push(next);
    } else {
      entries[at] = next;
    }
  }

  const wasDone = new Set([...record.fixed, ...record.ticked]);
  const newlyFixed: ChecklistEntry[] = [];
  const fixed = record.fixed.filter((key) => !liveKeys.has(key));
  for (const entry of entries) {
    if (liveKeys.has(entry.key)) continue;
    if (wasDone.has(entry.key)) continue;
    fixed.push(entry.key);
    newlyFixed.push(entry);
  }
  // A ticked warning that is no longer raised stays ticked (it was done by hand
  // first); one that is raised again stays ticked too, since ticking a warning
  // is the team saying "we know, it is fine". Only an error coming back reopens.
  const ticked = record.ticked.filter((key) => {
    const entry = entries.find((candidate) => candidate.key === key);
    return entry ? entry.level === 'warning' : false;
  });

  return { record: { entries, ticked, fixed }, newlyFixed };
}

/** Ticks or unticks a warning by hand. Errors are refused (see the header). */
export function toggleChecklistTick(
  record: ChecklistRecord,
  key: string
): { record: ChecklistRecord; ticked: boolean } | null {
  const entry = record.entries.find((candidate) => candidate.key === key);
  if (!entry || entry.level !== 'warning') return null;
  if (record.fixed.includes(key)) return null;
  const isTicked = record.ticked.includes(key);
  return {
    record: {
      ...record,
      ticked: isTicked ? record.ticked.filter((value) => value !== key) : [...record.ticked, key],
    },
    ticked: !isTicked,
  };
}

/** What the checklist draws: open items first (errors, then warnings), done
 *  items after, each group in first-seen order. */
export function buildChecklist(record: ChecklistRecord, check: LiveCheck): Checklist {
  const liveByKey = new Map(liveIssues(check).map(({ issue }) => [checklistKey(issue), issue]));
  const items: ChecklistItem[] = record.entries.map((entry) => {
    const issue = liveByKey.get(entry.key) ?? null;
    const ticked = record.ticked.includes(entry.key);
    const fixed = !issue && record.fixed.includes(entry.key);
    const done = fixed || ticked || !issue;
    return {
      ...entry,
      done,
      doneBy: fixed || (!issue && !ticked) ? 'fixed' : ticked ? 'ticked' : null,
      issue,
      canTick: entry.level === 'warning' && Boolean(issue),
    };
  });
  const rank = (item: ChecklistItem) => (item.done ? 2 : item.level === 'error' ? 0 : 1);
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
  return {
    items: ordered,
    doneCount: ordered.filter((item) => item.done).length,
    total: ordered.length,
  };
}

/** "3 of 8 done". */
export function checklistProgressLabel(checklist: Pick<Checklist, 'doneCount' | 'total'>): string {
  return `${checklist.doneCount} of ${checklist.total} done`;
}

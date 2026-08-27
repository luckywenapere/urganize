/**
 * The collaborator-credits spreadsheet (founder spec Phase 2, 2026-08-27).
 *
 * Pure — no React, no I/O. The owner's Metadata scene already holds every
 * submission in memory, so this needs no route and no second fetch: the client
 * builds the file and hands it to lib/share-file.ts.
 *
 * Escaping comes from lib/csv.ts, per that module's own instruction that new
 * code comes there rather than adding a fifth private copy of the rule.
 */

import { toCsv } from '@/lib/csv';
import { RELEASE_CREDIT_ROLE_LABELS, type ReleaseCreditSubmission } from '@/types/credits';

/**
 * Columns, in the order a distributor handoff reads: who they are, what they
 * did, what they are owed, who collects it, how to reach them, then the extras
 * and the timestamps.
 *
 * UNLIKE the notification email, this prints EVERY column even when blank. A
 * spreadsheet is where completeness beats curation — a missing column breaks a
 * formula, whereas an empty cell is just an empty cell.
 */
export const CREDIT_CSV_HEADER: readonly string[] = [
  'Legal name',
  'Stage name',
  'Roles',
  'What they did',
  'Writing share %',
  'Recording share %',
  'Royalty society (PRO)',
  'Society ID (IPI)',
  'Publisher',
  'Publisher IPI',
  'Email',
  'Phone',
  'Country',
  'Instagram',
  'X',
  'Bio',
  'Confirmed accurate',
  'Submitted',
  'Last updated',
] as const;

/**
 * Roles in one cell, semicolon-separated.
 *
 * `lib/csv.ts` quotes every field, so a comma here would be legal — but this
 * column is the one people split back apart by hand, and a comma-separated
 * list inside a comma-separated file is a foot-gun for whoever does that with a
 * naive parser. The notification email uses ", " because prose reads better
 * that way; a spreadsheet cell does not.
 */
export function csvRoles(submission: Pick<ReleaseCreditSubmission, 'roles'>): string {
  return submission.roles
    .map((role) => RELEASE_CREDIT_ROLE_LABELS[role] || role)
    .filter(Boolean)
    .join('; ');
}

/**
 * A split for the spreadsheet: the RAW NUMBER, never "50%".
 *
 * This is the most important decision in the file. The reason to export splits
 * at all is to total the column and see whether it reaches 100 — and Excel and
 * Sheets cannot sum a cell containing a percent sign, so "50%" would make the
 * export useless for the one job it has. A quoted bare number is still coerced
 * to a number by both, so lib/csv.ts's always-quote rule costs nothing here.
 *
 * An unanswered split stays EMPTY rather than becoming 0: a zero share is a
 * real answer someone can give, and conflating the two would quietly change a
 * total.
 */
export function csvSplit(value: number | null): string {
  if (value === null) return '';
  return String(Math.round(value * 10) / 10);
}

export function buildCreditSubmissionsCsv(
  submissions: readonly ReleaseCreditSubmission[]
): string {
  const rows = submissions.map((submission) => [
    submission.legalName,
    submission.stageName,
    csvRoles(submission),
    submission.contribution,
    csvSplit(submission.songwriterSplit),
    csvSplit(submission.masterSplit),
    submission.proAffiliation,
    submission.ipiNumber,
    submission.publisherName,
    submission.publisherIpi,
    submission.email,
    submission.phone,
    submission.country,
    submission.instagramHandle,
    submission.xHandle,
    submission.bio,
    submission.confirmedAccurate ? 'yes' : 'no',
    // Raw ISO timestamps, the house convention (see buildTaskCsvRows in
    // lib/account-export.ts): lossless, sortable as text, and parsed by both
    // Excel and Sheets.
    submission.createdAt,
    submission.updatedAt,
  ]);
  return toCsv(CREDIT_CSV_HEADER, rows);
}

/** `midnight-ep-credits-2026-08-27.csv`. The release title is in the name
 * because a manager exporting three releases in one sitting would otherwise get
 * three files the browser distinguishes only by "(1)" and "(2)". Slug rule
 * copied from RecapModal's fileNameFor, the other per-release export. */
export function creditsCsvFileName(releaseTitle: string, isoDate: string): string {
  const slug =
    releaseTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'release';
  const day = isoDate.slice(0, 10) || 'export';
  return `${slug}-credits-${day}.csv`;
}

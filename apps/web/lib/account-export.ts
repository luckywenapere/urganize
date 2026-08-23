// Data export — the pure half.
//
// "Export your data anytime" is a promise the entitlement map makes on EVERY
// tier (lib/entitlements.ts, where a test enforces it), so this is the feature
// that makes that promise true. Two properties matter more than anything else
// here, and both are easy to break by accident:
//
//   1. IT MUST NOT BE BEHIND THE PAYWALL. A team that has been walled, or whose
//      card failed, or who cancelled last week, is exactly who needs their data
//      out. The route uses getAuthenticatedUser, never
//      requireActiveAuthenticatedUser. If someone "tidies" that to match the
//      other protected routes, the trust feature becomes a hostage.
//
//   2. IT MUST NOT SILENTLY OMIT ANYTHING. Every table is read with select('*')
//      rather than a column allowlist, precisely so a column added next month
//      is exported without anyone remembering to add it here. Sensitive values
//      are removed by DENYLIST after the fact. An allowlist would quietly
//      shrink the export every time the schema grew.
//
// The scope boundary is deliberately the same one account deletion uses
// (owner_user_id / owner_id, cascading from releases — see
// app/api/account/delete-now/route.ts): you can export exactly what deleting
// your account would destroy. Anything else would be either a promise we break
// or data that is not yours.

/** Keys stripped from every exported row, wherever they appear.
 *
 * These are credentials and provider-side handles, not user data. `email_token`
 * and `paystack_response` are the sharp ones: the latter is a raw provider blob
 * that carries an email_token capable of mutating a live subscription, so it
 * must never land in a file a user forwards to their accountant. Share tokens
 * (EPK, credits, capture) are deliberately NOT here — those are the user's own
 * links, already visible in the app, and useless to export without. */
export const REDACTED_KEYS: readonly string[] = [
  'paystack_response',
  'paystack_customer_code',
  'paystack_subscription_code',
  'email_token',
  'authorization_code',
  'access_token',
  'refresh_token',
] as const;

const REDACTED = new Set<string>(REDACTED_KEYS);

/** Per-table row ceilings. Generous for real workspaces (a release carries ~64
 * activities, so 50,000 is hundreds of releases) but present so one runaway
 * table cannot make the whole export time out. When a cap is hit the envelope
 * says so — see `truncated` — because an export that silently stops halfway is
 * worse than one that refuses. */
export const EXPORT_ROW_CAP = 50_000;

export type ExportFormat = 'json' | 'csv';

export function parseExportFormat(value: unknown): ExportFormat {
  return value === 'csv' ? 'csv' : 'json';
}

export type ExportRow = Record<string, unknown>;

/** Strip credentials from one row. Shallow by design: every table here is flat,
 * and a deep walk would also rewrite user content (a note body mentioning
 * "access_token" is text, not a credential). */
export function redactRow(row: ExportRow): ExportRow {
  const out: ExportRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (REDACTED.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function redactRows(rows: readonly ExportRow[]): ExportRow[] {
  return rows.map(redactRow);
}

/** One table in the export. `unavailable` is how a section that could not be
 * read reports itself — the feature's table may not exist in this environment
 * (a migration not applied, a flag never switched on), and one absent table
 * must not fail the whole export. The reason is recorded so the file is honest
 * about what is missing rather than looking complete. This mirrors the
 * defensive probe lib/release-recap already uses for playlist_pitches. */
export type ExportSection = {
  rows: ExportRow[];
  count: number;
  /** True when the row cap was reached and rows were dropped. */
  truncated: boolean;
  /** Present only when the table could not be read at all. */
  unavailable?: string;
};

export function buildSection(
  rows: readonly ExportRow[] | null,
  error?: string | null
): ExportSection {
  if (error) {
    return { rows: [], count: 0, truncated: false, unavailable: error };
  }
  const all = rows ?? [];
  const truncated = all.length > EXPORT_ROW_CAP;
  const kept = truncated ? all.slice(0, EXPORT_ROW_CAP) : all;
  return { rows: redactRows(kept), count: kept.length, truncated };
}

export type ExportEnvelope = {
  /** Bumped when the SHAPE changes, so a consumer can tell one apart from
   *  another. Not the app version: the export outlives any given release. */
  export_version: 1;
  generated_at: string;
  account: { id: string; email: string | null };
  /** Read this before assuming a section is empty rather than unavailable. */
  notes_for_the_reader: string[];
  sections: Record<string, ExportSection>;
};

export function buildExportEnvelope(input: {
  userId: string;
  email: string | null;
  generatedAt: string;
  sections: Record<string, ExportSection>;
}): ExportEnvelope {
  const unavailable = Object.entries(input.sections)
    .filter(([, section]) => section.unavailable)
    .map(([name]) => name);
  const truncated = Object.entries(input.sections)
    .filter(([, section]) => section.truncated)
    .map(([name]) => name);

  const notes: string[] = [
    'This is everything Urganize holds for your account, and it is the same scope that deleting your account would remove.',
    'Credentials and payment provider handles are removed. Your own share links are kept, because they are yours.',
    'Any file download links expire about an hour after this export was generated. Generate a fresh export if they stop working.',
  ];
  if (unavailable.length > 0) {
    notes.push(
      `These sections could not be read and are empty for that reason, not because you have no data in them: ${unavailable.join(', ')}.`
    );
  }
  if (truncated.length > 0) {
    notes.push(
      `These sections hit the ${EXPORT_ROW_CAP.toLocaleString('en-US')} row export limit and are incomplete: ${truncated.join(', ')}. Get in touch and we will send the rest.`
    );
  }

  return {
    export_version: 1,
    generated_at: input.generatedAt,
    account: { id: input.userId, email: input.email },
    notes_for_the_reader: notes,
    sections: input.sections,
  };
}

/** Filename for the download. Dated so a folder of exports sorts and a user can
 * tell which is which; no time, because two exports in one day is not a case
 * worth uglifying every filename for. */
export function buildExportFileName(format: ExportFormat, generatedAt: string): string {
  const day = generatedAt.slice(0, 10) || 'export';
  return format === 'csv' ? `urganize-activities-${day}.csv` : `urganize-export-${day}.json`;
}

// ── The spreadsheet view ─────────────────────────────────────────────────────
//
// JSON is the complete export. CSV is the one thing people actually open in a
// spreadsheet: every activity, flattened, with enough release context on each
// row to sort and filter. Anything else worth a spreadsheet is derivable from
// this one; a zip of eight CSVs would need an archiver dependency to deliver
// less.

export const TASK_CSV_HEADER: readonly string[] = [
  'Release',
  'Artist',
  'Release date',
  'Activity',
  'Status',
  'Priority',
  'Due date',
  'Assigned to',
  'Notes',
  'Created',
  'Completed',
] as const;

type ReleaseLookup = Map<string, { title: string; artist: string; releaseDate: string }>;

export function buildReleaseLookup(releases: readonly ExportRow[]): ReleaseLookup {
  const lookup: ReleaseLookup = new Map();
  for (const release of releases) {
    const id = typeof release.id === 'string' ? release.id : '';
    if (!id) continue;
    lookup.set(id, {
      title: String(release.title ?? ''),
      artist: String(release.artist_name ?? ''),
      releaseDate: String(release.release_date ?? ''),
    });
  }
  return lookup;
}

/** One row per activity. Member names are resolved through a lookup rather than
 * printing a raw uuid, which is useless in a spreadsheet. An unresolved
 * assignee falls back to blank, never to the uuid: a column of uuids reads as
 * corruption to someone opening this in Excel. */
export function buildTaskCsvRows(
  tasks: readonly ExportRow[],
  releases: readonly ExportRow[],
  memberNamesById: Map<string, string>
): unknown[][] {
  const lookup = buildReleaseLookup(releases);
  return tasks.map((task) => {
    const release = lookup.get(String(task.release_id ?? '')) ?? {
      title: '',
      artist: '',
      releaseDate: '',
    };
    const assignee = String(task.assigned_to_user_id ?? '');
    return [
      release.title,
      release.artist,
      release.releaseDate,
      task.title ?? '',
      task.status ?? '',
      task.priority ?? '',
      task.due_date ?? '',
      memberNamesById.get(assignee) ?? '',
      task.description ?? '',
      task.created_at ?? '',
      task.completed_at ?? '',
    ];
  });
}

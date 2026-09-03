/**
 * Issue reporting — the client-safe pure core.
 *
 * Imported by BOTH the report dialog (pre-submit check + character counters)
 * and `POST /api/issue-reports` (the real guard), so the two cannot drift into
 * a client that accepts what the API rejects — the `asset-constants.ts` /
 * `genre-prediction.ts` rule.
 *
 * No node imports, no env reads, no I/O. Everything here is a pure function so
 * it is unit-testable and can never fail a submission by throwing.
 */

export const ISSUE_KINDS = ['bug', 'request'] as const;

export type IssueKind = (typeof ISSUE_KINDS)[number];

/** Linear renders a long title badly in list view, and a title is a summary. */
export const MAX_ISSUE_TITLE_LENGTH = 120;

/**
 * Generous on purpose: a good bug report pastes an error message. Well under
 * anything Linear's description field or our own jsonb column would object to.
 */
export const MAX_ISSUE_BODY_LENGTH = 4000;

export const ISSUE_KIND_LABELS: Record<IssueKind, string> = {
  bug: 'Bug',
  request: 'Request',
};

export function isIssueKind(value: unknown): value is IssueKind {
  return typeof value === 'string' && (ISSUE_KINDS as readonly string[]).includes(value);
}

export type ValidatedIssueReport = {
  kind: IssueKind;
  title: string;
  body: string;
};

export type IssueReportValidation =
  | { ok: true; value: ValidatedIssueReport }
  | { ok: false; error: string };

/**
 * The one definition of "is this a report we will accept".
 *
 * Length is measured AFTER trimming, so trailing whitespace can never push a
 * legitimate report over a limit. Non-string fields are rejected rather than
 * coerced: `String(null)` is `"null"`, which would file a report titled "null".
 */
export function validateIssueReport(input: unknown): IssueReportValidation {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Send a report to file one.' };
  }

  const payload = input as Record<string, unknown>;

  if (!isIssueKind(payload.kind)) {
    return { ok: false, error: 'Pick whether this is a bug or a request.' };
  }

  if (typeof payload.title !== 'string' || typeof payload.body !== 'string') {
    return { ok: false, error: 'Give this a title and describe what happened.' };
  }

  const title = payload.title.trim();
  const body = payload.body.trim();

  if (!title) {
    return { ok: false, error: 'Give this a title.' };
  }
  if (title.length > MAX_ISSUE_TITLE_LENGTH) {
    return { ok: false, error: `Keep the title under ${MAX_ISSUE_TITLE_LENGTH} characters.` };
  }
  if (!body) {
    return { ok: false, error: 'Describe what happened so we can act on it.' };
  }
  if (body.length > MAX_ISSUE_BODY_LENGTH) {
    return { ok: false, error: `Keep the details under ${MAX_ISSUE_BODY_LENGTH} characters.` };
  }

  return { ok: true, value: { kind: payload.kind, title, body } };
}

/**
 * The context we attach to a report.
 *
 * SPLIT BY WHO CAN BE TRUSTED WITH IT, and that split is a security property
 * rather than tidiness: the CLIENT supplies only what only it knows (the page
 * it was on, the app version it is running). Everything identifying — name,
 * email, team, plan, role, the release — is resolved SERVER-SIDE from the
 * authenticated user id, so nobody can write a fake plan tier onto the Linear
 * board by editing a request body.
 *
 * Every field is optional because every one of them can legitimately be
 * unknown, and an absent field is omitted from the rendered description rather
 * than printed as "unknown".
 */
export type IssueReportContext = {
  reporterName?: string | null;
  reporterEmail?: string | null;
  workspaceName?: string | null;
  plan?: string | null;
  role?: string | null;
  releaseId?: string | null;
  releaseTitle?: string | null;
  pagePath?: string | null;
  appVersion?: string | null;
};

export function buildIssueTitle(kind: IssueKind, title: string): string {
  return `[${ISSUE_KIND_LABELS[kind]}] ${title}`;
}

/** Present, and not just whitespace. A blank string is not a value. */
function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The markdown body posted to Linear.
 *
 * The reporter's own words come FIRST — someone opening the issue should read
 * what happened before they read our metadata. The context block is appended
 * only when there is something to put in it.
 */
export function buildIssueDescription(input: {
  body: string;
  context: IssueReportContext;
}): string {
  const { body, context } = input;
  const lines: string[] = [];

  const who = present(context.reporterName) ? context.reporterName.trim() : null;
  const email = present(context.reporterEmail) ? context.reporterEmail.trim() : null;
  if (who && email) {
    lines.push(`**Reported by:** ${who} (${email})`);
  } else if (who) {
    lines.push(`**Reported by:** ${who}`);
  } else if (email) {
    lines.push(`**Reported by:** ${email}`);
  }

  if (present(context.workspaceName)) {
    const plan = present(context.plan) ? ` · ${context.plan.trim()}` : '';
    const role = present(context.role) ? ` · ${context.role.trim()}` : '';
    lines.push(`**Team:** ${context.workspaceName.trim()}${plan}${role}`);
  } else if (present(context.plan) || present(context.role)) {
    const parts = [context.plan, context.role].filter(present).map((value) => value.trim());
    lines.push(`**Plan:** ${parts.join(' · ')}`);
  }

  if (present(context.releaseId)) {
    const title = present(context.releaseTitle) ? `${context.releaseTitle.trim()} — ` : '';
    lines.push(`**Release:** ${title}${context.releaseId.trim()}`);
  }

  if (present(context.pagePath)) {
    lines.push(`**Page:** ${context.pagePath.trim()}`);
  }

  if (present(context.appVersion)) {
    lines.push(`**Version:** ${context.appVersion.trim()}`);
  }

  if (lines.length === 0) {
    return body;
  }

  return [body, '', '---', '', ...lines, '', '_Filed from Urganize._'].join('\n');
}

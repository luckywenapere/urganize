import type { EmailLogStatus } from './log-server';

// The pure half of /admin/emails: what the recent send log adds up to. Aggregated
// in TypeScript rather than SQL, the lib/urgans-actions/admin-summary.ts call and
// for the same reasons (a view defaults to owner privileges; at this volume the
// arithmetic is free).

export type EmailLogRow = {
  id: string;
  recipient: string;
  subject: string;
  template: string;
  category: string;
  status: EmailLogStatus;
  trigger: string;
  error: string | null;
  created_at: string | null;
};

export type EmailAdminSummary = {
  total: number;
  /** Count per status. Only statuses that occur are present. */
  byStatus: Partial<Record<EmailLogStatus, number>>;
  /** Count per template id, most-sent first. */
  byTemplate: Array<{ template: string; count: number }>;
  /** Of the mail that reached a provider outcome, the share that was delivered.
   *  Null when nothing has an outcome yet, so a fresh table does not read as 0%. */
  deliveredRate: number | null;
  /** Mail that bounced or was marked as spam. The number that hurts sender
   *  reputation, so it is worth its own tile. */
  problems: number;
};

/** Statuses that mean "the provider has told us what happened". `sent` is not
 *  one: it only means Resend accepted the message. */
const OUTCOME: ReadonlySet<EmailLogStatus> = new Set<EmailLogStatus>([
  'delivered',
  'bounced',
  'complained',
]);

export function summarizeEmailLog(rows: EmailLogRow[]): EmailAdminSummary {
  const byStatus: Partial<Record<EmailLogStatus, number>> = {};
  const templates = new Map<string, number>();

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    templates.set(row.template, (templates.get(row.template) ?? 0) + 1);
  }

  const delivered = byStatus.delivered ?? 0;
  const outcomes = [...OUTCOME].reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);

  return {
    total: rows.length,
    byStatus,
    byTemplate: [...templates.entries()]
      .map(([template, count]) => ({ template, count }))
      .sort((a, b) => b.count - a.count || a.template.localeCompare(b.template)),
    deliveredRate: outcomes === 0 ? null : delivered / outcomes,
    problems: (byStatus.bounced ?? 0) + (byStatus.complained ?? 0),
  };
}

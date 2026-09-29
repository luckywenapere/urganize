import { describe, expect, it } from 'vitest';
import { summarizeEmailLog, type EmailLogRow } from './admin-summary';

function row(over: Partial<EmailLogRow> & { status: EmailLogRow['status'] }): EmailLogRow {
  return {
    id: 'x',
    recipient: 'a@b.co',
    subject: 's',
    template: 'welcome',
    category: 'onboarding',
    trigger: 't',
    error: null,
    created_at: null,
    ...over,
  };
}

describe('summarizeEmailLog', () => {
  it('reports an empty log without dividing by zero', () => {
    const s = summarizeEmailLog([]);
    expect(s).toMatchObject({ total: 0, byStatus: {}, byTemplate: [], deliveredRate: null, problems: 0 });
  });

  it('counts each status and template, most-sent template first', () => {
    const s = summarizeEmailLog([
      row({ status: 'sent', template: 'task_assigned' }),
      row({ status: 'delivered', template: 'welcome' }),
      row({ status: 'delivered', template: 'welcome' }),
      row({ status: 'failed', template: 'welcome' }),
    ]);
    expect(s.total).toBe(4);
    expect(s.byStatus).toEqual({ sent: 1, delivered: 2, failed: 1 });
    expect(s.byTemplate).toEqual([
      { template: 'welcome', count: 3 },
      { template: 'task_assigned', count: 1 },
    ]);
  });

  it('breaks template ties alphabetically so the order is stable', () => {
    const s = summarizeEmailLog([row({ status: 'sent', template: 'b' }), row({ status: 'sent', template: 'a' })]);
    expect(s.byTemplate.map((t) => t.template)).toEqual(['a', 'b']);
  });

  it('measures delivery only against mail with a real outcome, never against merely sent', () => {
    const s = summarizeEmailLog([
      row({ status: 'delivered' }),
      row({ status: 'delivered' }),
      row({ status: 'delivered' }),
      row({ status: 'bounced' }),
      row({ status: 'sent' }),
      row({ status: 'sent' }),
      row({ status: 'skipped' }),
      row({ status: 'failed' }),
    ]);
    expect(s.deliveredRate).toBe(0.75);
  });

  it('stays null when everything is still only sent, rather than reading as 0%', () => {
    expect(summarizeEmailLog([row({ status: 'sent' })]).deliveredRate).toBeNull();
  });

  it('counts bounces and spam complaints as problems, and nothing else', () => {
    const s = summarizeEmailLog([
      row({ status: 'bounced' }),
      row({ status: 'complained' }),
      row({ status: 'complained' }),
      row({ status: 'failed' }),
      row({ status: 'unsubscribed' }),
    ]);
    expect(s.problems).toBe(3);
  });
});

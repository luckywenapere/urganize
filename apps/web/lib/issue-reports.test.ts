import { describe, expect, it } from 'vitest';
import {
  MAX_ISSUE_BODY_LENGTH,
  MAX_ISSUE_TITLE_LENGTH,
  buildIssueDescription,
  buildIssueTitle,
  validateIssueReport,
  type IssueReportContext,
} from './issue-reports';

// Pure core — no env, no network, no Supabase. Both the dialog and the POST
// route run these, so a case that passes here can never be rejected on the
// other side of the wire.

describe('validateIssueReport', () => {
  it('accepts a well-formed bug report and trims both fields', () => {
    const result = validateIssueReport({
      kind: 'bug',
      title: '  Cover art upload fails  ',
      body: '  It spins forever on a 20 MB PNG.  ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      kind: 'bug',
      title: 'Cover art upload fails',
      body: 'It spins forever on a 20 MB PNG.',
    });
  });

  it('accepts a request', () => {
    const result = validateIssueReport({ kind: 'request', title: 'Bulk assign', body: 'Please.' });
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown kind', () => {
    const result = validateIssueReport({ kind: 'feedback', title: 'Hi', body: 'There' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('bug');
  });

  it('rejects a missing kind', () => {
    expect(validateIssueReport({ title: 'Hi', body: 'There' }).ok).toBe(false);
  });

  it('rejects an empty or whitespace-only title', () => {
    for (const title of ['', '   ', '\n\t']) {
      const result = validateIssueReport({ kind: 'bug', title, body: 'Something happened.' });
      expect(result.ok, JSON.stringify(title)).toBe(false);
      if (result.ok) continue;
      expect(result.error.toLowerCase()).toContain('title');
    }
  });

  it('rejects an empty or whitespace-only body — a title alone is not a report', () => {
    const result = validateIssueReport({ kind: 'bug', title: 'It broke', body: '   ' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain('describe');
  });

  it('accepts a title at the limit and rejects one past it', () => {
    const atLimit = 'x'.repeat(MAX_ISSUE_TITLE_LENGTH);
    expect(validateIssueReport({ kind: 'bug', title: atLimit, body: 'b' }).ok).toBe(true);

    const overLimit = 'x'.repeat(MAX_ISSUE_TITLE_LENGTH + 1);
    const result = validateIssueReport({ kind: 'bug', title: overLimit, body: 'b' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(String(MAX_ISSUE_TITLE_LENGTH));
  });

  it('accepts a body at the limit and rejects one past it', () => {
    const atLimit = 'y'.repeat(MAX_ISSUE_BODY_LENGTH);
    expect(validateIssueReport({ kind: 'bug', title: 't', body: atLimit }).ok).toBe(true);

    const overLimit = 'y'.repeat(MAX_ISSUE_BODY_LENGTH + 1);
    const result = validateIssueReport({ kind: 'bug', title: 't', body: overLimit }).ok;
    expect(result).toBe(false);
  });

  it('measures length AFTER trimming, so padding never fails a valid report', () => {
    const padded = `   ${'x'.repeat(MAX_ISSUE_TITLE_LENGTH)}   `;
    expect(validateIssueReport({ kind: 'bug', title: padded, body: 'b' }).ok).toBe(true);
  });

  it('rejects non-string fields rather than coercing them', () => {
    expect(validateIssueReport({ kind: 'bug', title: 42, body: 'b' }).ok).toBe(false);
    expect(validateIssueReport({ kind: 'bug', title: 't', body: null }).ok).toBe(false);
  });

  it('rejects a null or non-object payload', () => {
    expect(validateIssueReport(null).ok).toBe(false);
    expect(validateIssueReport('nope').ok).toBe(false);
    expect(validateIssueReport(undefined).ok).toBe(false);
  });
});

describe('buildIssueTitle', () => {
  it('prefixes a bug so the Linear board scans', () => {
    expect(buildIssueTitle('bug', 'Cover art upload fails')).toBe('[Bug] Cover art upload fails');
  });

  it('prefixes a request differently', () => {
    expect(buildIssueTitle('request', 'Bulk assign')).toBe('[Request] Bulk assign');
  });
});

describe('buildIssueDescription', () => {
  const fullContext: IssueReportContext = {
    reporterName: 'Ada Umeh',
    reporterEmail: 'ada@example.com',
    workspaceName: 'Sunrise Records',
    plan: 'manager',
    role: 'owner',
    releaseId: '11111111-2222-3333-4444-555555555555',
    releaseTitle: 'Midnight EP',
    pagePath: '/dashboard?release=11111111-2222-3333-4444-555555555555',
    appVersion: '1.22.0',
  };

  it('leads with the reporter’s own words, before any of our metadata', () => {
    const description = buildIssueDescription({ body: 'It spins forever.', context: fullContext });
    expect(description.indexOf('It spins forever.')).toBeLessThan(description.indexOf('Ada Umeh'));
  });

  it('renders every context field it was given', () => {
    const description = buildIssueDescription({ body: 'b', context: fullContext });
    for (const value of [
      'Ada Umeh',
      'ada@example.com',
      'Sunrise Records',
      'manager',
      'owner',
      '11111111-2222-3333-4444-555555555555',
      'Midnight EP',
      '/dashboard?release=',
      '1.22.0',
    ]) {
      expect(description, value).toContain(value);
    }
  });

  it('omits an absent field entirely rather than printing a stub', () => {
    const description = buildIssueDescription({
      body: 'b',
      context: { reporterEmail: 'ada@example.com', appVersion: '1.22.0' },
    });
    expect(description).toContain('ada@example.com');
    // No labels for what we do not know, and no "unknown"/"null"/"undefined".
    expect(description).not.toContain('Team');
    expect(description).not.toContain('Release');
    expect(description.toLowerCase()).not.toContain('unknown');
    expect(description).not.toContain('undefined');
    expect(description).not.toContain('null');
  });

  it('omits the whole context block when there is no context at all', () => {
    const description = buildIssueDescription({ body: 'Just this.', context: {} });
    expect(description.trim()).toBe('Just this.');
  });

  it('treats a blank string as absent, not as a value worth printing', () => {
    const description = buildIssueDescription({
      body: 'b',
      context: { reporterName: '   ', workspaceName: 'Sunrise Records' },
    });
    expect(description).toContain('Sunrise Records');
    expect(description).not.toContain('Reported by');
  });

  it('marks the report as filed from Urganize so a Linear reader knows the origin', () => {
    expect(buildIssueDescription({ body: 'b', context: fullContext })).toContain('Urganize');
  });
});

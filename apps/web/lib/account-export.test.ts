import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { escapeCsvValue, toCsv, toCsvRow } from './csv';
import {
  EXPORT_ROW_CAP,
  REDACTED_KEYS,
  TASK_CSV_HEADER,
  buildExportEnvelope,
  buildExportFileName,
  buildReleaseLookup,
  buildSection,
  buildTaskCsvRows,
  parseExportFormat,
  redactRow,
  redactRows,
} from './account-export';

describe('CSV escaping', () => {
  it('quotes everything, so no field can be misread', () => {
    expect(escapeCsvValue('plain')).toBe('"plain"');
    expect(escapeCsvValue(42)).toBe('"42"');
  });

  // Each of these breaks a conditional "only quote when needed" rule.
  it('survives the characters that corrupt a spreadsheet', () => {
    expect(escapeCsvValue('Midnight, EP')).toBe('"Midnight, EP"');
    expect(escapeCsvValue('He said "drop it"')).toBe('"He said ""drop it"""');
    expect(escapeCsvValue('line one\nline two')).toBe('"line one\nline two"');
    // A leading zero or a formula-looking string stays intact rather than
    // becoming a number or an expression.
    expect(escapeCsvValue('007')).toBe('"007"');
    expect(escapeCsvValue('=1+1')).toBe('"=1+1"');
  });

  it('writes an empty field for absent values, never the word null', () => {
    expect(escapeCsvValue(null)).toBe('""');
    expect(escapeCsvValue(undefined)).toBe('""');
    expect(escapeCsvValue('')).toBe('""');
  });

  it('builds rows and a CRLF-delimited table', () => {
    expect(toCsvRow(['a', 'b'])).toBe('"a","b"');
    expect(toCsv(['H1', 'H2'], [['a', 'b'], ['c', 'd']])).toBe('"H1","H2"\r\n"a","b"\r\n"c","d"');
  });

  it('emits a header even with no rows, so the file is still readable', () => {
    expect(toCsv(['Release'], [])).toBe('"Release"');
  });
});

// The export is a file a user forwards to an accountant or a lawyer. A
// provider handle in it is a credential in someone else's inbox.
describe('redaction', () => {
  it('drops every denylisted key', () => {
    const row = {
      id: 'r1',
      plan: 'label',
      amount: 8_000_000,
      paystack_response: { email_token: 'secret' },
      paystack_customer_code: 'CUS_x',
      paystack_subscription_code: 'SUB_x',
      email_token: 'secret',
      authorization_code: 'AUTH_x',
    };
    expect(redactRow(row)).toEqual({ id: 'r1', plan: 'label', amount: 8_000_000 });
  });

  it('keeps a payment reference, which is what support asks for', () => {
    expect(redactRow({ reference: 'urg_123', status: 'success' })).toEqual({
      reference: 'urg_123',
      status: 'success',
    });
  });

  // Share tokens are the user's own links, already visible in the app. An
  // export without them would be missing something they need.
  it('keeps share tokens', () => {
    const row = { share_token: 'abc123', release_id: 'r1' };
    expect(redactRow(row)).toEqual(row);
  });

  // Shallow on purpose: a note that happens to mention a denylisted word is
  // user content, not a credential.
  it('does not rewrite user text that mentions a redacted key name', () => {
    const row = { body: 'remember to rotate the access_token on Friday' };
    expect(redactRow(row)).toEqual(row);
  });

  it('redacts every row in a section', () => {
    expect(redactRows([{ a: 1, email_token: 'x' }, { b: 2 }])).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('has no empty strings in the denylist, which would strip every key', () => {
    for (const key of REDACTED_KEYS) expect(key.length).toBeGreaterThan(0);
  });
});

describe('sections', () => {
  it('reports an unreadable table as unavailable rather than as empty', () => {
    const section = buildSection(null, 'relation "content_posts" does not exist');
    expect(section.rows).toEqual([]);
    expect(section.count).toBe(0);
    expect(section.unavailable).toContain('content_posts');
  });

  it('treats a genuinely empty table as empty, with no unavailable marker', () => {
    const section = buildSection([]);
    expect(section.count).toBe(0);
    expect(section.unavailable).toBeUndefined();
    expect(section.truncated).toBe(false);
  });

  it('redacts as it builds, so no caller can forget to', () => {
    expect(buildSection([{ id: 'x', email_token: 'secret' }]).rows).toEqual([{ id: 'x' }]);
  });

  it('flags truncation rather than silently dropping rows', () => {
    const rows = Array.from({ length: EXPORT_ROW_CAP + 5 }, (_, i) => ({ i }));
    const section = buildSection(rows);
    expect(section.truncated).toBe(true);
    expect(section.count).toBe(EXPORT_ROW_CAP);
    expect(section.rows).toHaveLength(EXPORT_ROW_CAP);
  });

  it('does not flag truncation exactly at the cap', () => {
    const rows = Array.from({ length: EXPORT_ROW_CAP }, (_, i) => ({ i }));
    expect(buildSection(rows).truncated).toBe(false);
  });
});

describe('the envelope tells the truth about itself', () => {
  const base = {
    userId: 'user-1',
    email: 'manager@example.com',
    generatedAt: '2026-08-23T09:00:00.000Z',
  };

  it('carries the account, the timestamp and a shape version', () => {
    const envelope = buildExportEnvelope({ ...base, sections: {} });
    expect(envelope.export_version).toBe(1);
    expect(envelope.generated_at).toBe(base.generatedAt);
    expect(envelope.account).toEqual({ id: 'user-1', email: 'manager@example.com' });
  });

  it('names the sections that could not be read, so empty is never ambiguous', () => {
    const envelope = buildExportEnvelope({
      ...base,
      sections: {
        releases: buildSection([{ id: 'r1' }]),
        content_posts: buildSection(null, 'table missing'),
      },
    });
    const notes = envelope.notes_for_the_reader.join(' ');
    expect(notes).toContain('content_posts');
    expect(notes).not.toContain('releases,');
  });

  it('names truncated sections', () => {
    const rows = Array.from({ length: EXPORT_ROW_CAP + 1 }, (_, i) => ({ i }));
    const envelope = buildExportEnvelope({ ...base, sections: { tasks: buildSection(rows) } });
    expect(envelope.notes_for_the_reader.join(' ')).toContain('tasks');
  });

  it('says nothing about missing or truncated data when there is none', () => {
    const envelope = buildExportEnvelope({
      ...base,
      sections: { releases: buildSection([{ id: 'r1' }]) },
    });
    const notes = envelope.notes_for_the_reader.join(' ');
    expect(notes).not.toMatch(/could not be read/);
    expect(notes).not.toMatch(/row export limit/);
  });

  // The export is the honest half of the delete promise, so it should say so.
  it('tells the reader the scope matches account deletion, and warns about link expiry', () => {
    const notes = buildExportEnvelope({ ...base, sections: {} }).notes_for_the_reader.join(' ');
    expect(notes).toMatch(/deleting your account/i);
    expect(notes).toMatch(/expire/i);
  });

  it('handles an account with no email on record', () => {
    const envelope = buildExportEnvelope({ ...base, email: null, sections: {} });
    expect(envelope.account.email).toBeNull();
  });
});

describe('format and filename', () => {
  it('defaults to the complete export, not the spreadsheet', () => {
    expect(parseExportFormat(undefined)).toBe('json');
    expect(parseExportFormat(null)).toBe('json');
    expect(parseExportFormat('nonsense')).toBe('json');
    expect(parseExportFormat('JSON')).toBe('json');
    expect(parseExportFormat('csv')).toBe('csv');
  });

  it('dates the filename and matches the extension to the format', () => {
    expect(buildExportFileName('json', '2026-08-23T09:00:00.000Z')).toBe(
      'urganize-export-2026-08-23.json'
    );
    expect(buildExportFileName('csv', '2026-08-23T09:00:00.000Z')).toBe(
      'urganize-activities-2026-08-23.csv'
    );
  });

  it('still produces a usable filename from a malformed timestamp', () => {
    expect(buildExportFileName('json', '')).toBe('urganize-export-export.json');
  });
});

describe('the activities spreadsheet', () => {
  const releases = [
    { id: 'r1', title: 'Midnight', artist_name: 'Tems', release_date: '2026-09-01' },
    { id: 'r2', title: 'Free', artist_name: 'Tems', release_date: null },
  ];
  const members = new Map([['u1', 'Ada']]);

  it('puts release context on every activity row', () => {
    const rows = buildTaskCsvRows(
      [{ release_id: 'r1', title: 'Lock the master', status: 'done', priority: 'high' }],
      releases,
      members
    );
    expect(rows[0].slice(0, 6)).toEqual([
      'Midnight',
      'Tems',
      '2026-09-01',
      'Lock the master',
      'done',
      'high',
    ]);
  });

  it('resolves an assignee to a name, and never prints a raw uuid', () => {
    const [known, unknown] = buildTaskCsvRows(
      [
        { release_id: 'r1', title: 'A', assigned_to_user_id: 'u1' },
        { release_id: 'r1', title: 'B', assigned_to_user_id: 'u-missing' },
      ],
      releases,
      members
    );
    expect(known[7]).toBe('Ada');
    // Blank, not the uuid: a column of uuids reads as corruption in Excel.
    expect(unknown[7]).toBe('');
  });

  it('keeps an activity whose release is missing from the lookup', () => {
    const rows = buildTaskCsvRows([{ release_id: 'gone', title: 'Orphan' }], releases, members);
    expect(rows[0][0]).toBe('');
    expect(rows[0][3]).toBe('Orphan');
  });

  it('turns nulls into blanks, not the word null', () => {
    const rows = buildTaskCsvRows([{ release_id: 'r2', title: 'A', due_date: null }], releases, members);
    expect(rows[0][2]).toBe('');
    expect(rows[0][6]).toBe('');
  });

  it('emits exactly one column per header', () => {
    const rows = buildTaskCsvRows([{ release_id: 'r1', title: 'A' }], releases, members);
    expect(rows[0]).toHaveLength(TASK_CSV_HEADER.length);
  });

  it('renders end to end through the CSV writer', () => {
    const csv = toCsv(
      TASK_CSV_HEADER,
      buildTaskCsvRows([{ release_id: 'r1', title: 'Brief the "designer"' }], releases, members)
    );
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('"Brief the ""designer"""');
  });

  it('ignores a release row with no id when building the lookup', () => {
    expect(buildReleaseLookup([{ title: 'No id' }]).size).toBe(0);
  });
});

// ── The guard that matters ───────────────────────────────────────────────────
//
// The entire trust property of this feature is one import. If the export route
// is ever "tidied" to use requireActiveAuthenticatedUser like its neighbours,
// then a walled team, a failed card and a cancellation inside its 90-day window
// all lose the ability to get their data out — silently, and exactly when they
// need it. A comment cannot defend that. This can.
//
// Modelled on lib/schema-fallback-guard.test.ts, which freezes a pattern
// baseline the same way.
describe('the export route is never put behind the paywall', () => {
  const routePath = join(process.cwd(), 'app/api/account/export/route.ts');
  const raw = readFileSync(routePath, 'utf8');

  // Comments are stripped before matching, and that is not a convenience: the
  // route's header comment NAMES the wrappers it deliberately does not use, so
  // a raw grep would fail on the very prose that explains the rule. The guard
  // has to read code.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('uses the open-route auth helper', () => {
    expect(source).toContain('getAuthenticatedUser');
  });

  it('does not use any paywall-gated auth wrapper', () => {
    // requireActiveAuthenticatedUser and requireAuthenticatedAdmin both run
    // requireActiveAccount, which 402s a walled team.
    expect(source).not.toMatch(/requireActiveAuthenticatedUser/);
    expect(source).not.toMatch(/requireAuthenticatedAdmin/);
    expect(source).not.toMatch(/requireActiveAccount/);
  });

  it('does not consult team access or the hard paywall flag', () => {
    expect(source).not.toMatch(/getTeamAccessForUser/);
    expect(source).not.toMatch(/isHardPaywallEnabled/);
  });

  it('reads every table with select(*), so the export cannot silently shrink', () => {
    // A column allowlist would omit anything added to the schema later.
    expect(source).toContain(".select('*')");
  });
});

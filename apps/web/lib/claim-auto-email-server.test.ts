import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Runs the REAL automatic claim step, the real claim-link path
// (lib/claim-owner-server.ts, lib/claim-server.ts) and the real rules, against
// an in-memory stand-in for the tables. Only the edges are mocked: the email
// sender (so nothing is sent), today's email count, and PostHog.

const sent: Array<{ templateId: string; to: string; props: Record<string, unknown>; idempotencyKey?: string }> = [];
let nextResult: { ok: boolean; skipped?: boolean; reason?: 'not_configured' | 'suppressed'; error?: string } = { ok: true };
let sentToday: number | null = 0;
const captured: Array<{ distinctId: string; name: string; properties: unknown }> = [];

vi.mock('./email', () => ({
  isEmailConfigured: () => true,
  sendEmail: vi.fn(async (_admin: unknown, params: { templateId: string; to: string; props: Record<string, unknown>; idempotencyKey?: string }) => {
    const result = nextResult;
    if (result.ok) sent.push({ templateId: params.templateId, to: params.to, props: params.props, idempotencyKey: params.idempotencyKey });
    return result;
  }),
}));
vi.mock('./email/outbox-server', () => ({ countEmailsSentToday: async () => sentToday }));
vi.mock('./analytics/server', () => ({
  createServerPostHogClient: () => ({}),
  shutdownServerAnalytics: async () => undefined,
  captureServerAnalyticsEvent: (_client: unknown, distinctId: string, event: { name: string; properties: unknown }) =>
    captured.push({ distinctId, name: event.name, properties: event.properties }),
}));

const { runClaimAutoEmailSweep } = await import('./claim-auto-email-server');
const { inviteCreditedPerson, listCreditClaims } = await import('./claim-owner-server');

type Row = Record<string, unknown>;

const UNIQUE: Record<string, string[][]> = {
  person_claim_emails: [['person_id', 'kind']],
};

class FakeDb {
  tables: Record<string, Row[]> = {
    release_credit_submissions: [],
    releases: [],
    tasks: [],
    artists: [],
    workspaces: [],
    person_profiles: [],
    person_claim_invites: [],
    person_claim_emails: [],
    seeded_profiles: [],
  };
  /** Tables whose reads fail, to test the fail-closed paths. */
  broken = new Set<string>();
  seq = 0;
  writes = 0;
  from(table: string) {
    return new Query(this, table);
  }
}

class Query implements PromiseLike<unknown> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private filters: Array<(row: Row) => boolean> = [];
  private payload: Row | Row[] = {};
  private returning = false;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private limitN: number | null = null;
  private rangeFrom = 0;
  constructor(
    private db: FakeDb,
    private table: string
  ) {}
  select() {
    if (this.op !== 'select') this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  upsert(rows: Row | Row[]) {
    this.op = 'upsert';
    this.payload = rows;
    return this;
  }
  update(values: Row) {
    this.op = 'update';
    this.payload = values;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  not(column: string, _op: 'is', _value: null) {
    this.filters.push((row) => row[column] != null);
    return this;
  }
  lte(column: string, value: string) {
    this.filters.push((row) => typeof row[column] === 'string' && (row[column] as string) <= value);
    return this;
  }
  private sort: { column: string; ascending: boolean } | null = null;
  order(column: string, options: { ascending?: boolean } = {}) {
    this.sort = { column, ascending: options.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.limitN = to - from + 1;
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }
  private rows(): Row[] {
    return (this.db.tables[this.table] ||= []);
  }
  private violates(row: Row): boolean {
    return (UNIQUE[this.table] || []).some((cols) =>
      this.rows().some((other) => cols.every((c) => other[c] === row[c]))
    );
  }
  private run(): { data: unknown; error: { message: string; code?: string } | null } {
    if (this.db.broken.has(this.table)) return { data: null, error: { message: 'relation does not exist' } };
    const table = this.rows();
    if (this.op === 'insert' || this.op === 'upsert') {
      this.db.writes += 1;
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const out: Row[] = [];
      for (const raw of list) {
        const row: Row = { id: `${this.table}-${++this.db.seq}`, created_at: new Date(Date.now() + this.db.seq).toISOString(), ...raw };
        if (this.violates(row)) return { data: null, error: { message: 'duplicate key value', code: '23505' } };
        table.push(row);
        out.push(row);
      }
      return { data: this.returning ? out.map((r) => ({ ...r })) : null, error: null };
    }
    const matched = table.filter((row) => this.filters.every((f) => f(row)));
    if (this.op === 'update') {
      this.db.writes += 1;
      for (const row of matched) Object.assign(row, this.payload);
      return { data: this.returning ? matched.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.op === 'delete') {
      this.db.writes += 1;
      this.db.tables[this.table] = table.filter((row) => !matched.includes(row));
      return { data: this.returning ? matched.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.sort) {
      const { column, ascending } = this.sort;
      matched.sort((x, y) => {
        const left = String(x[column] ?? '');
        const right = String(y[column] ?? '');
        return (left < right ? -1 : left > right ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    const found = matched.slice(this.rangeFrom, this.limitN === null ? undefined : this.rangeFrom + this.limitN);
    return { data: found.map((r) => ({ ...r })), error: null };
  }
  then<R1 = unknown, R2 = never>(
    resolve?: ((value: unknown) => R1 | PromiseLike<R1>) | null,
    reject?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    const result = this.run();
    let shaped: { data: unknown; error: unknown } = result;
    if (!result.error && this.mode !== 'many') {
      const list = (Array.isArray(result.data) ? result.data : result.data ? [result.data] : []) as Row[];
      shaped =
        this.mode === 'single' && list.length !== 1
          ? { data: null, error: { message: 'no single row' } }
          : { data: list[0] ?? null, error: null };
    }
    return Promise.resolve(shaped).then(resolve, reject);
  }
}

let db: FakeDb;
let client: SupabaseClient;
const DAY = 24 * 60 * 60 * 1000;
const later = (days: number) => new Date(Date.now() + days * DAY);

function credit(id: string, over: Row = {}) {
  db.tables.release_credit_submissions.push({
    id,
    release_id: 'r1',
    person_id: 'p1',
    legal_name: 'Ada Obi',
    stage_name: null,
    roles: ['producer', 'songwriter'],
    email: 'Ada@Example.com',
    confirmed_accurate: true,
    person_hidden: false,
    created_at: '2026-09-01T00:00:00Z',
    ...over,
  });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_FEATURE_CLAIM_AUTO_EMAIL', 'true');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_METADATA', 'true');
  sent.length = 0;
  captured.length = 0;
  nextResult = { ok: true };
  sentToday = 0;
  db = new FakeDb();
  client = db as unknown as SupabaseClient;
  db.tables.artists.push({ id: 'a1', name: 'Tems (artist row)', workspace_id: 'ws1' });
  db.tables.workspaces.push({ id: 'ws1', owner_id: 'owner' });
  db.tables.releases.push({
    id: 'r1',
    title: 'Free Mind',
    artist_name: 'Tems',
    artist_id: 'a1',
    owner_user_id: 'owner',
    release_date: '2026-05-01',
    status: 'draft',
    metadata: {},
  });
  db.tables.person_profiles.push({ id: 'p1', status: 'unclaimed', user_id: null, removed_at: null, removal_requested_at: null });
  credit('s1');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runClaimAutoEmailSweep', () => {
  it('does nothing at all while the flag is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_CLAIM_AUTO_EMAIL', 'false');
    const report = await runClaimAutoEmailSweep(client);
    expect(report).toMatchObject({ ran: false, reason: 'off' });
    expect(sent).toEqual([]);
    expect(db.writes).toBe(0);
  });

  it('does nothing while the credits surface is off, even with the flag on', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_METADATA', 'false');
    expect(await runClaimAutoEmailSweep(client)).toMatchObject({ ran: false, reason: 'off' });
    expect(sent).toEqual([]);
  });

  it('emails the credited person once, through the claim link path, and records it', async () => {
    const report = await runClaimAutoEmailSweep(client);
    expect(report.invitesSent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      templateId: 'claim_auto_invite',
      to: 'ada@example.com',
      props: { recipientName: 'Ada Obi', artistName: 'Tems', releaseTitle: 'Free Mind', roles: ['producer', 'songwriter'] },
    });
    expect(String(sent[0].props.claimUrl)).toMatch(/\/claim\/[A-Za-z0-9_-]{32}$/);

    const invite = db.tables.person_claim_invites[0];
    expect(invite).toMatchObject({ person_id: 'p1', workspace_id: 'ws1', created_by: null, channel: 'email', release_id: 'r1' });
    expect(invite.sent_at).toBeTruthy();
    expect(sent[0].idempotencyKey).toBe(`claim-invite-${invite.id}`);

    expect(db.tables.person_claim_emails).toHaveLength(1);
    expect(db.tables.person_claim_emails[0]).toMatchObject({ person_id: 'p1', kind: 'invite', status: 'sent', invite_id: invite.id });
    expect(captured).toEqual([{ distinctId: 'owner', name: 'claim_email_sent', properties: { release_id: 'r1', role_count: 2 } }]);
  });

  it('never twice: a second run the same day sends nothing', async () => {
    await runClaimAutoEmailSweep(client);
    await runClaimAutoEmailSweep(client);
    await runClaimAutoEmailSweep(client, later(1));
    expect(sent).toHaveLength(1);
  });

  it('two runs at the same moment still send one email: the reservation row is the lock', async () => {
    const [a, b] = await Promise.all([runClaimAutoEmailSweep(client), runClaimAutoEmailSweep(client)]);
    expect(sent).toHaveLength(1);
    expect(a.invitesSent + b.invitesSent).toBe(1);
    expect((a.skipped['invite:lost_reservation'] ?? 0) + (b.skipped['invite:lost_reservation'] ?? 0)).toBe(1);
  });

  it('one email for a person credited on several rollouts', async () => {
    db.tables.releases.push({ ...db.tables.releases[0], id: 'r2', title: 'Second' });
    credit('s2', { release_id: 'r2', created_at: '2026-09-10T00:00:00Z' });
    await runClaimAutoEmailSweep(client);
    expect(sent).toHaveLength(1);
    // The newest credit is the one named.
    expect(sent[0].props.releaseTitle).toBe('Second');
  });

  it('not when the owner already sent or shared a link', async () => {
    db.tables.person_claim_invites.push({
      id: 'owner-link',
      person_id: 'p1',
      workspace_id: 'ws1',
      created_by: 'owner',
      created_at: new Date().toISOString(),
      expires_at: later(30).toISOString(),
      used_at: null,
      revoked_at: null,
      failed_attempts: 0,
      channel: 'link',
    });
    const report = await runClaimAutoEmailSweep(client);
    expect(sent).toEqual([]);
    expect(report.skipped['invite:owner_sent']).toBe(1);
  });

  it('not before the rollout has come out', async () => {
    db.tables.releases[0].release_date = later(30).toISOString().slice(0, 10);
    db.tables.tasks.push({ release_id: 'r1', status: 'todo' });
    await runClaimAutoEmailSweep(client);
    expect(sent).toEqual([]);
  });

  it('not for a test rollout, a removal request or a claimed page', async () => {
    db.tables.releases[0].metadata = { test_release: true };
    await runClaimAutoEmailSweep(client);
    db.tables.releases[0].metadata = {};
    db.tables.person_profiles[0].removal_requested_at = new Date().toISOString();
    await runClaimAutoEmailSweep(client);
    db.tables.person_profiles[0].removal_requested_at = null;
    db.tables.person_profiles[0].status = 'claimed';
    db.tables.person_profiles[0].user_id = 'u1';
    await runClaimAutoEmailSweep(client);
    expect(sent).toEqual([]);
  });

  it('sends nothing when the once-only table cannot be read (migration not applied)', async () => {
    db.broken.add('person_claim_emails');
    const report = await runClaimAutoEmailSweep(client);
    expect(report).toMatchObject({ ran: false, reason: 'unreadable' });
    expect(sent).toEqual([]);
    expect(db.tables.person_claim_invites).toEqual([]);
  });

  it('sends nothing when today cannot be counted, or the day is used up', async () => {
    sentToday = null;
    await runClaimAutoEmailSweep(client);
    sentToday = 90;
    const report = await runClaimAutoEmailSweep(client);
    expect(sent).toEqual([]);
    expect(report.deferred).toBe(1);
    expect(db.tables.person_claim_emails).toEqual([]);
  });

  it('a refusal over the daily limit gives the reservation back, and another day sends it once', async () => {
    nextResult = { ok: false, error: 'Resend responded 429: too many' };
    const first = await runClaimAutoEmailSweep(client);
    expect(first.retryLater).toBe(1);
    expect(db.tables.person_claim_emails).toEqual([]);
    nextResult = { ok: true };
    await runClaimAutoEmailSweep(client, later(1));
    await runClaimAutoEmailSweep(client, later(1));
    expect(sent).toHaveLength(1);
  });

  it('an unsubscribed address is recorded and never tried again', async () => {
    nextResult = { ok: false, skipped: true, reason: 'suppressed' };
    await runClaimAutoEmailSweep(client);
    expect(db.tables.person_claim_emails[0]).toMatchObject({ status: 'suppressed' });
    // The link that never went out is turned off, so the owner panel is honest.
    expect(db.tables.person_claim_invites[0].revoked_at).toBeTruthy();
    nextResult = { ok: true };
    await runClaimAutoEmailSweep(client, later(1));
    await runClaimAutoEmailSweep(client, later(8));
    expect(sent).toEqual([]);
  });

  it('a server error is final too: it may have gone out, and never twice wins', async () => {
    nextResult = { ok: false, error: 'Resend responded 500' };
    await runClaimAutoEmailSweep(client);
    nextResult = { ok: true };
    await runClaimAutoEmailSweep(client, later(1));
    expect(sent).toEqual([]);
    expect(db.tables.person_claim_emails[0]).toMatchObject({ status: 'failed' });
  });

  it('sends one reminder after seven days with a fresh link, and never another', async () => {
    await runClaimAutoEmailSweep(client);
    const firstInvite = db.tables.person_claim_invites[0];

    await runClaimAutoEmailSweep(client, later(6));
    expect(sent).toHaveLength(1);

    const report = await runClaimAutoEmailSweep(client, later(8));
    expect(report.remindersSent).toBe(1);
    expect(sent).toHaveLength(2);
    expect(sent[1].templateId).toBe('claim_reminder');
    expect(sent[1].props.claimUrl).not.toBe(sent[0].props.claimUrl);
    // One live link at a time: the first one is off now.
    expect(firstInvite.revoked_at).toBeTruthy();
    expect(captured.map((event) => event.name)).toEqual(['claim_email_sent', 'claim_reminder_sent']);

    await runClaimAutoEmailSweep(client, later(9));
    await runClaimAutoEmailSweep(client, later(30));
    expect(sent).toHaveLength(2);
  });

  it('no reminder once they claimed it', async () => {
    await runClaimAutoEmailSweep(client);
    db.tables.person_profiles[0].status = 'claimed';
    db.tables.person_profiles[0].user_id = 'u1';
    await runClaimAutoEmailSweep(client, later(8));
    expect(sent).toHaveLength(1);
  });

  it('no reminder once the owner sent their own link', async () => {
    await runClaimAutoEmailSweep(client);
    db.tables.person_claim_invites.push({
      id: 'owner-link',
      person_id: 'p1',
      workspace_id: 'ws1',
      created_by: 'owner',
      created_at: later(2).toISOString(),
      expires_at: later(32).toISOString(),
      used_at: null,
      revoked_at: null,
      failed_attempts: 0,
      channel: 'email',
      sent_at: later(2).toISOString(),
    });
    await runClaimAutoEmailSweep(client, later(8));
    expect(sent).toHaveLength(1);
  });

  it("the owner's panel shows that it went out and when, then the reminder, so they do not send a second one", async () => {
    let [row] = await listCreditClaims(client, 'r1', 'ws1');
    expect(row.autoEmail).toBeNull();

    await runClaimAutoEmailSweep(client);
    [row] = await listCreditClaims(client, 'r1', 'ws1');
    expect(row.invite).toMatchObject({ automatic: true, state: 'open', channel: 'email' });
    expect(row.autoEmail?.invitedAt).toBeTruthy();
    expect(row.autoEmail?.remindedAt).toBeNull();

    await runClaimAutoEmailSweep(client, later(8));
    [row] = await listCreditClaims(client, 'r1', 'ws1');
    expect(row.invite?.automatic).toBe(true);
    expect(row.autoEmail?.remindedAt).toBeTruthy();
  });

  it("the owner's own Email still works after the automatic one, and then it reads as theirs", async () => {
    db.tables.profiles = [{ id: 'owner', name: 'Oyin' }];
    await runClaimAutoEmailSweep(client);
    const outcome = await inviteCreditedPerson(client, {
      releaseId: 'r1',
      submissionId: 's1',
      user: { id: 'owner' },
      channel: 'email',
    });
    expect(outcome).toMatchObject({ ok: true, emailed: true });
    expect(sent.map((entry) => entry.templateId)).toEqual(['claim_auto_invite', 'claim_invite']);
    const [row] = await listCreditClaims(client, 'r1', 'ws1');
    expect(row.invite?.automatic).toBe(false);
    // And the reminder now stays out of it.
    await runClaimAutoEmailSweep(client, later(8));
    expect(sent).toHaveLength(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Drives the real drainEmailOutbox against an in-memory stand-in for the two
// tables it touches, with only the send itself mocked. The decisions have their
// own tests in outbox.test.ts; these check the glue: claiming, settling, and
// never sending a row twice.

const sendEmail = vi.fn();
let configured = true;

vi.mock('./index', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  isEmailConfigured: () => configured,
}));

type Row = Record<string, unknown>;

class FakeDb {
  tables: Record<string, Row[]> = { email_outbox: [], email_log: [] };
  failCount = false;
  from(table: string) {
    return new FakeQuery(this, table);
  }
  async rpc() {
    return { data: [], error: null };
  }
}

class FakeQuery implements PromiseLike<unknown> {
  private op: 'select' | 'update' | 'upsert' = 'select';
  private filters: Array<(row: Row) => boolean> = [];
  private orders: Array<{ column: string; ascending: boolean; nullsFirst: boolean }> = [];
  private limitN: number | null = null;
  private values: Row = {};
  private rows: Row[] = [];
  private returning = false;
  private countHead = false;

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.op === 'select') this.countHead = Boolean(options?.head);
    else this.returning = true;
    return this;
  }
  update(values: Row) {
    this.op = 'update';
    this.values = values;
    return this;
  }
  upsert(rows: Row[]) {
    this.op = 'upsert';
    this.rows = rows;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  lte(column: string, value: string) {
    this.filters.push((row) => String(row[column]) <= value);
    return this;
  }
  lt(column: string, value: string) {
    this.filters.push((row) => row[column] !== null && String(row[column]) < value);
    return this;
  }
  gte(column: string, value: string) {
    this.filters.push((row) => String(row[column]) >= value);
    return this;
  }
  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending !== false, nullsFirst: Boolean(options.nullsFirst) });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private matching(): Row[] {
    return (this.db.tables[this.table] ||= []).filter((row) => this.filters.every((filter) => filter(row)));
  }

  private run() {
    if (this.op === 'upsert') {
      const table = (this.db.tables[this.table] ||= []);
      const inserted: Row[] = [];
      for (const row of this.rows) {
        if (table.some((existing) => existing.dedupe_key === row.dedupe_key)) continue;
        const stored = { id: `row-${table.length + 1}`, status: 'queued', attempts: 0, send_after: new Date(0).toISOString(), ...row };
        table.push(stored);
        inserted.push({ id: stored.id });
      }
      return { data: inserted, error: null };
    }
    if (this.op === 'update') {
      const matched = this.matching();
      for (const row of matched) Object.assign(row, this.values);
      return { data: this.returning ? matched.map((row) => ({ ...row })) : null, error: null };
    }
    if (this.countHead) {
      if (this.db.failCount) return { count: null, data: null, error: { message: 'boom' } };
      return { count: this.matching().length, data: null, error: null };
    }
    let rows = this.matching().map((row) => ({ ...row }));
    for (const spec of [...this.orders].reverse()) {
      rows = rows.sort((a, b) => {
        const av = a[spec.column];
        const bv = b[spec.column];
        if (av === bv) return 0;
        if (av === null || av === undefined) return spec.nullsFirst ? -1 : 1;
        if (bv === null || bv === undefined) return spec.nullsFirst ? 1 : -1;
        return (String(av) < String(bv) ? -1 : 1) * (spec.ascending ? 1 : -1);
      });
    }
    return { data: this.limitN === null ? rows : rows.slice(0, this.limitN), error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

const NOW = new Date('2026-10-02T08:00:00Z');

function queue(db: FakeDb, rows: Array<Partial<Row> & { id: string; recipient: string }>) {
  for (const row of rows) {
    db.tables.email_outbox.push({
      recipient_user_id: null,
      template: 'onboarding_step',
      props: { step: 'day2', recipientName: 'Ada' },
      trigger: 'onboarding_sequence',
      batch_id: null,
      send_after: '2026-10-02T00:00:00.000Z',
      status: 'queued',
      attempts: 0,
      created_by: null,
      claimed_at: null,
      dedupe_key: `k-${row.id}`,
      ...row,
    });
  }
}

async function drain(db: FakeDb, options: Record<string, unknown> = {}) {
  const { drainEmailOutbox } = await import('./outbox-server');
  return drainEmailOutbox(db as never, { now: NOW, ...options });
}

const statusOf = (db: FakeDb, id: string) => db.tables.email_outbox.find((row) => row.id === id)?.status;

beforeEach(() => {
  vi.resetModules();
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ ok: true });
  configured = true;
  vi.stubEnv('EMAIL_ONBOARDING_SEQUENCE', 'on');
  vi.stubEnv('EMAIL_DAILY_LIMIT', '100');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('drainEmailOutbox', () => {
  it('sends what is due, marks it sent, and sends a person one sequence email per run', async () => {
    const db = new FakeDb();
    queue(db, [
      { id: 'a2', recipient: 'ada@x.test' },
      { id: 'a3', recipient: 'ada@x.test', props: { step: 'day3', recipientName: 'Ada' } },
      { id: 'b2', recipient: 'bo@x.test' },
    ]);

    const result = await drain(db);

    expect(result.sent).toBe(2);
    expect(statusOf(db, 'a2')).toBe('sent');
    expect(statusOf(db, 'a3')).toBe('queued');
    expect(statusOf(db, 'b2')).toBe('sent');
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[0][1]).toMatchObject({
      templateId: 'onboarding_step',
      to: 'ada@x.test',
      idempotencyKey: 'outbox-a2',
    });
  });

  it('leaves mail that is not due yet alone', async () => {
    const db = new FakeDb();
    queue(db, [{ id: 'later', recipient: 'ada@x.test', send_after: '2026-10-03T00:00:00.000Z' }]);
    await drain(db);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(statusOf(db, 'later')).toBe('queued');
  });

  it('never sends a row twice when two senders run at the same moment', async () => {
    const db = new FakeDb();
    queue(db, [
      { id: 'x1', recipient: 'a@x.test', batch_id: 'b1', template: 'announcement', props: { subject: 'S', body: 'B' } },
      { id: 'x2', recipient: 'b@x.test', batch_id: 'b1', template: 'announcement', props: { subject: 'S', body: 'B' } },
    ]);
    const [first, second] = await Promise.all([drain(db), drain(db)]);
    expect(first.sent + second.sent).toBe(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('stops at a 429 and puts everything not yet sent back without spending an attempt', async () => {
    const db = new FakeDb();
    queue(
      db,
      Array.from({ length: 6 }, (_, index) => ({
        id: `r${index}`,
        recipient: `p${index}@x.test`,
        batch_id: 'b1',
        template: 'announcement',
        props: { subject: 'S', body: 'B' },
      }))
    );
    sendEmail.mockResolvedValue({ ok: false, error: 'Resend responded 429: daily_quota_exceeded' });

    const result = await drain(db);

    expect(result.stoppedReason).toBe('rate_limited');
    // The first group of three was tried; the rest were never sent.
    expect(sendEmail).toHaveBeenCalledTimes(3);
    for (const row of db.tables.email_outbox) {
      expect(row.status).toBe('queued');
      expect(row.attempts).toBe(0);
    }
  });

  it('retries a server error later, counting the attempt', async () => {
    const db = new FakeDb();
    queue(db, [{ id: 'r', recipient: 'ada@x.test' }]);
    sendEmail.mockResolvedValue({ ok: false, error: 'Resend responded 503' });

    await drain(db);

    const row = db.tables.email_outbox[0];
    expect(row.status).toBe('queued');
    expect(row.attempts).toBe(1);
    expect(String(row.send_after) > NOW.toISOString()).toBe(true);
  });

  it('stops the rest of the sequence for someone who unsubscribed', async () => {
    const db = new FakeDb();
    queue(db, [
      { id: 'd2', recipient: 'ada@x.test' },
      { id: 'd3', recipient: 'ada@x.test', send_after: '2026-10-03T00:00:00.000Z', props: { step: 'day3' } },
    ]);
    sendEmail.mockResolvedValue({ ok: false, skipped: true, reason: 'suppressed' });

    const result = await drain(db);

    expect(result.skipped).toBe(1);
    expect(statusOf(db, 'd2')).toBe('skipped');
    expect(statusOf(db, 'd3')).toBe('cancelled');
  });

  it('does nothing when email is not set up', async () => {
    const db = new FakeDb();
    configured = false;
    queue(db, [{ id: 'r', recipient: 'ada@x.test' }]);
    const result = await drain(db);
    expect(result.stoppedReason).toBe('not_configured');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('stops rather than guess when it cannot read how many went out today', async () => {
    const db = new FakeDb();
    db.failCount = true;
    queue(db, [{ id: 'r', recipient: 'ada@x.test' }]);
    const result = await drain(db);
    expect(result.stoppedReason).toBe('unreadable');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('holds the sequence while it is switched off, but still sends a broadcast', async () => {
    vi.stubEnv('EMAIL_ONBOARDING_SEQUENCE', '');
    const db = new FakeDb();
    queue(db, [
      { id: 'seq', recipient: 'ada@x.test' },
      { id: 'bulk', recipient: 'bo@x.test', batch_id: 'b1', template: 'announcement', props: { subject: 'S', body: 'B' } },
    ]);
    await drain(db);
    expect(statusOf(db, 'seq')).toBe('queued');
    expect(statusOf(db, 'bulk')).toBe('sent');
  });

  it('keeps inside the daily limit, counting what already went out today', async () => {
    const db = new FakeDb();
    // 70 already sent today; bulk keeps 25 back, so 5 may go.
    for (let index = 0; index < 70; index += 1) {
      db.tables.email_log.push({ id: `log${index}`, status: 'delivered', created_at: '2026-10-02T01:00:00.000Z' });
    }
    queue(
      db,
      Array.from({ length: 9 }, (_, index) => ({
        id: `r${index}`,
        recipient: `p${index}@x.test`,
        batch_id: 'b1',
        template: 'announcement',
        props: { subject: 'S', body: 'B' },
      }))
    );

    const result = await drain(db);

    expect(result.sent).toBe(5);
    expect(result.stoppedReason).toBe('limit');
  });

  it('fails a row whose props are broken rather than sending something half-made', async () => {
    const db = new FakeDb();
    queue(db, [{ id: 'bad', recipient: 'ada@x.test', props: { step: 'day99' } }]);
    await drain(db);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(statusOf(db, 'bad')).toBe('failed');
  });
});

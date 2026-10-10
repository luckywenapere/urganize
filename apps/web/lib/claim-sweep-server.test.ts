import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runCreditProfileSweep, runCreditProfileSweepIfEnabled } from './claim-sweep-server';

// Runs the REAL sweep, and the real relationship seeding under it, against an
// in-memory stand-in for the tables. Unique rules match the migrations.

type Row = Record<string, unknown>;

const UNIQUE: Record<string, string[][]> = {
  person_identifiers: [['kind', 'value']],
  team_relationships: [['workspace_id', 'person_id']],
};

class FakeDb {
  tables: Record<string, Row[]> = {
    release_credit_submissions: [],
    releases: [],
    tasks: [],
    artists: [],
    workspaces: [],
    profiles: [],
    person_profiles: [],
    person_identifiers: [],
    team_relationships: [],
    app_settings: [],
  };
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
  or(expression: string) {
    // Only the shape the sweep uses: "email.not.is.null,phone.not.is.null".
    const columns = expression.split(',').map((part) => part.split('.')[0]);
    this.filters.push((row) => columns.some((column) => row[column] != null));
    return this;
  }
  order() {
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
    const table = this.rows();
    if (this.op === 'insert' || this.op === 'upsert') {
      this.db.writes += 1;
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const out: Row[] = [];
      for (const raw of list) {
        const row: Row = { id: `${this.table}-${++this.db.seq}`, ...raw };
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

function release(id: string, over: Row = {}) {
  db.tables.releases.push({
    id,
    owner_user_id: 'owner',
    artist_id: 'a1',
    release_date: '2026-05-01',
    status: 'draft',
    metadata: {},
    ...over,
  });
}
function credit(id: string, over: Row = {}) {
  db.tables.release_credit_submissions.push({
    id,
    release_id: 'r1',
    legal_name: 'Tobi Adeyemi',
    stage_name: null,
    roles: ['producer'],
    email: 'tobi@example.com',
    phone: null,
    confirmed_accurate: true,
    person_hidden: false,
    person_id: null,
    ...over,
  });
}

beforeEach(() => {
  db = new FakeDb();
  client = db as unknown as SupabaseClient;
  db.tables.artists.push({ id: 'a1', workspace_id: 'ws1' });
  db.tables.workspaces.push({ id: 'ws1', owner_id: 'owner' });
  release('r1');
});

describe('runCreditProfileSweep', () => {
  it('a dry run reports what it would do and writes nothing', async () => {
    credit('c1');
    const report = await runCreditProfileSweep(client, { dryRun: true });
    expect(report).toMatchObject({ dryRun: true, scanned: 1, wouldCreate: 1, created: 0 });
    expect(db.writes).toBe(0);
    expect(db.tables.person_profiles).toHaveLength(0);
  });

  it('makes an unclaimed, private profile with a handle, links the credit and the team contact', async () => {
    credit('c1');
    const report = await runCreditProfileSweep(client, { dryRun: false });
    expect(report).toMatchObject({ created: 1, failed: 0 });
    const profile = db.tables.person_profiles[0];
    expect(profile).toMatchObject({ status: 'unclaimed', visibility: 'private', display_name: 'Tobi Adeyemi' });
    expect(profile.slug).toMatch(/^tobi-adeyemi-[a-z0-9]{5}$/);
    expect(db.tables.release_credit_submissions[0].person_id).toBe(profile.id);
    expect(db.tables.person_identifiers[0]).toMatchObject({ kind: 'email', value: 'tobi@example.com' });
    expect(db.tables.team_relationships[0]).toMatchObject({ workspace_id: 'ws1', source: 'credit_submission', role: 'Producer' });
  });

  it('prefers the stage name', async () => {
    credit('c1', { stage_name: 'TobiBeats' });
    await runCreditProfileSweep(client, { dryRun: false });
    expect(db.tables.person_profiles[0].display_name).toBe('TobiBeats');
  });

  it('makes one profile for two credits from the same person, and none twice', async () => {
    release('r2');
    credit('c1');
    credit('c2', { release_id: 'r2' });
    await runCreditProfileSweep(client, { dryRun: false });
    expect(db.tables.person_profiles).toHaveLength(1);
    expect(db.tables.release_credit_submissions.every((c) => c.person_id === db.tables.person_profiles[0].id)).toBe(true);
    const again = await runCreditProfileSweep(client, { dryRun: false });
    expect(again.scanned).toBe(0);
    expect(db.tables.person_profiles).toHaveLength(1);
  });

  it('leaves alone a rollout that has not come out, is archived, or is a test', async () => {
    release('r2', { release_date: '2099-01-01' });
    release('r3', { status: 'archived' });
    release('r4', { metadata: { test_release: true } });
    credit('c1', { release_id: 'r2' });
    credit('c2', { release_id: 'r3', email: 'b@x.com' });
    credit('c3', { release_id: 'r4', email: 'c@x.com' });
    const report = await runCreditProfileSweep(client, { dryRun: false });
    expect(report.created).toBe(0);
    expect(db.tables.person_profiles).toHaveLength(0);
  });

  it('a rollout with every activity done counts as out, with no date', async () => {
    release('r2', { release_date: null });
    db.tables.tasks.push({ release_id: 'r2', status: 'done' }, { release_id: 'r2', status: 'done' });
    credit('c1', { release_id: 'r2' });
    expect((await runCreditProfileSweep(client, { dryRun: false })).created).toBe(1);
  });

  it('leaves alone a credit nobody attested to, a hidden one, and one with no contact', async () => {
    credit('c1', { confirmed_accurate: false });
    credit('c2', { person_hidden: true, email: 'b@x.com' });
    credit('c3', { email: null, phone: null });
    expect((await runCreditProfileSweep(client, { dryRun: false })).created).toBe(0);
  });

  it('does not make a page for somebody who already has an account', async () => {
    db.tables.profiles.push({ email: 'tobi@example.com' });
    credit('c1');
    const report = await runCreditProfileSweep(client, { dryRun: false });
    expect(report.skipped.has_account).toBe(1);
    expect(db.tables.person_profiles).toHaveLength(0);
  });

  it('links to a profile that already exists instead of making a second one', async () => {
    db.tables.person_profiles.push({ id: 'p-known', status: 'claimed', user_id: 'u1', display_name: 'Tobi' });
    db.tables.person_identifiers.push({ person_id: 'p-known', kind: 'email', value: 'tobi@example.com' });
    credit('c1');
    const report = await runCreditProfileSweep(client, { dryRun: false });
    expect(report).toMatchObject({ created: 0, linked: 1 });
    expect(db.tables.release_credit_submissions[0].person_id).toBe('p-known');
    expect(db.tables.person_profiles).toHaveLength(1);
  });

  it('caps how many profiles one run makes and defers the rest', async () => {
    for (let i = 0; i < 5; i += 1) credit(`c${i}`, { email: `p${i}@x.com`, legal_name: `Person ${i}` });
    const report = await runCreditProfileSweep(client, { dryRun: false, maxProfiles: 2 });
    expect(report.created).toBe(2);
    expect(report.deferred).toBe(3);
    expect(db.tables.person_profiles).toHaveLength(2);
  });
});

describe('runCreditProfileSweepIfEnabled', () => {
  it('does nothing until the admin switches it on', async () => {
    credit('c1');
    expect(await runCreditProfileSweepIfEnabled(client)).toEqual({ skipped: true });
    expect(db.tables.person_profiles).toHaveLength(0);
  });
  it('runs once it is on', async () => {
    db.tables.app_settings.push({ key: 'credit_profile_sweep', value_json: { enabled: true } });
    credit('c1');
    const report = await runCreditProfileSweepIfEnabled(client);
    expect(report).toMatchObject({ created: 1 });
  });
});

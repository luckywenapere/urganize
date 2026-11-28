import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  claimProfile,
  hashClaimToken,
  listSeeded,
  mintClaimLink,
  openClaimLink,
  recordClaimOpened,
  seedManagers,
} from './seeding-server';
import { checkSeedBatch, parseClaimBody, type ClaimBody } from './seeding';

// Drives the REAL seeding-server code against an in-memory stand-in for the
// four tables it touches. The stand-in enforces the same unique rules and the
// same two profile constraints as the migrations (an unclaimed profile has no
// user and is private; a claimed one has a user), because those are the rules
// the code has to live inside, and a fake that accepted anything would prove
// nothing.

type Row = Record<string, unknown>;

const UNIQUE: Record<string, string[][]> = {
  person_identifiers: [['kind', 'value']],
  person_claim_invites: [['token_hash']],
  seeded_profiles: [['person_id']],
  person_profiles: [['slug']],
};

class FakeDb {
  tables: Record<string, Row[]> = {
    person_profiles: [],
    person_identifiers: [],
    person_claim_invites: [],
    seeded_profiles: [],
  };
  seq = 0;
  failInsertInto: string | null = null;
  failUpdateOf: string | null = null;
  from(table: string) {
    return new Query(this, table);
  }
}

class Query implements PromiseLike<unknown> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private filters: Array<(row: Row) => boolean> = [];
  private payload: Row | Row[] = {};
  private returning = false;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private limitN: number | null = null;

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
  is(column: string, value: null) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.limitN = n;
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

  private violatesUnique(row: Row): boolean {
    return (UNIQUE[this.table] || []).some((cols) =>
      this.rows().some((other) => other !== row && cols.every((c) => row[c] != null && other[c] === row[c]))
    );
  }

  private violatesProfileRules(row: Row): boolean {
    if (this.table !== 'person_profiles') return false;
    const claimed = row.status === 'claimed';
    if (claimed !== (row.user_id != null)) return true;
    return row.status === 'unclaimed' && row.visibility !== 'private';
  }

  private run(): { data: unknown; error: { message: string; code?: string } | null } {
    const table = this.rows();
    if (this.op === 'insert') {
      if (this.db.failInsertInto === this.table) return { data: null, error: { message: 'boom' } };
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const out: Row[] = [];
      for (const raw of list) {
        const row: Row = { id: `${this.table}-${++this.db.seq}`, ...raw };
        if (this.violatesProfileRules(row)) return { data: null, error: { message: 'check violation', code: '23514' } };
        table.push(row);
        if (this.violatesUnique(row)) {
          table.pop();
          return { data: null, error: { message: 'duplicate key value', code: '23505' } };
        }
        out.push(row);
      }
      return { data: this.returning ? out.map((r) => ({ ...r })) : null, error: null };
    }
    const matched = table.filter((row) => this.filters.every((f) => f(row)));
    if (this.op === 'update') {
      if (this.db.failUpdateOf === this.table) return { data: null, error: { message: 'boom' } };
      for (const row of matched) {
        const before = { ...row };
        Object.assign(row, this.payload);
        if (this.violatesProfileRules(row) || this.violatesUnique(row)) {
          for (const key of Object.keys(row)) delete row[key];
          Object.assign(row, before);
          return { data: null, error: { message: 'constraint', code: '23505' } };
        }
      }
      return { data: this.returning ? matched.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.op === 'delete') {
      this.db.tables[this.table] = table.filter((row) => !matched.includes(row));
      return { data: null, error: null };
    }
    return { data: matched.slice(0, this.limitN ?? undefined).map((r) => ({ ...r })), error: null };
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

const NOW = new Date('2026-10-11T12:00:00Z');
const ORIGIN = 'https://app.urganize.app';
const ADMIN = 'admin-1';

let db: FakeDb;
let client: SupabaseClient;

beforeEach(() => {
  db = new FakeDb();
  client = db as unknown as SupabaseClient;
});

const rowsOf = (input: Array<Record<string, unknown>>) => {
  const checked = checkSeedBatch(input);
  if (!checked.ok) throw new Error(checked.error);
  return checked.rows;
};

const seed = (input: Array<Record<string, unknown>>) =>
  seedManagers(client, { actorUserId: ADMIN, rows: rowsOf(input), origin: ORIGIN, now: NOW });

const tokenFromUrl = (url: string) => url.split('/welcome/')[1];

const body = (over: Record<string, unknown> = {}): ClaimBody => {
  const parsed = parseClaimBody({ displayName: 'Ada Obi', roles: ['manager'], ...over });
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed;
};

describe('seedManagers: a new person', () => {
  it('makes a PRIVATE, UNCLAIMED profile and a link, and lists nobody', async () => {
    const [outcome] = await seed([{ name: 'Ada Obi', email: 'ADA@x.com', phone: '0803 123 4567', notes: 'private note' }]);
    expect(outcome.status).toBe('created');

    expect(db.tables.person_profiles).toHaveLength(1);
    expect(db.tables.person_profiles[0]).toMatchObject({
      display_name: 'Ada Obi',
      status: 'unclaimed',
      visibility: 'private',
    });
    expect(db.tables.person_profiles[0].user_id).toBeUndefined();
    expect(db.tables.person_identifiers.map((r) => `${r.kind}:${r.value}`).sort()).toEqual([
      'email:ada@x.com',
      'phone:+2348031234567',
    ]);
    expect(db.tables.seeded_profiles[0]).toMatchObject({
      contact_name: 'Ada Obi',
      notes: 'private note',
      invited_at: NOW.toISOString(),
    });
  });

  it('never writes anything but private on creation', async () => {
    await seed([{ name: 'A', email: 'a@x.com' }, { name: 'B', phone: '0803 000 1111' }]);
    expect(db.tables.person_profiles.every((p) => p.visibility === 'private' && p.status === 'unclaimed')).toBe(true);
  });

  it('copies only the bio starter onto the profile, never the private notes', async () => {
    await seed([{ name: 'Ada', email: 'a@x.com', notes: 'secret: owes me a favour', bioStarter: 'Manages artists in Lagos.' }]);
    expect(db.tables.person_profiles[0].bio).toBe('Manages artists in Lagos.');
    expect(JSON.stringify(db.tables.person_profiles)).not.toContain('secret');
  });

  it('stores only a hash of the link, and the link works', async () => {
    const [outcome] = await seed([{ name: 'Ada', email: 'a@x.com' }]);
    if (outcome.status !== 'created') throw new Error('expected created');
    const token = tokenFromUrl(outcome.url);
    expect(db.tables.person_claim_invites[0].token_hash).toBe(hashClaimToken(token));
    expect(JSON.stringify(db.tables.person_claim_invites)).not.toContain(token);
    expect(db.tables.person_claim_invites[0].workspace_id).toBeNull();
    expect((await openClaimLink(client, token, NOW)).state).toBe('ok');
  });

  it('does not make a second profile for somebody Urganize already knows', async () => {
    await seed([{ name: 'Ada', email: 'ada@x.com' }]);
    const [again] = await seed([{ name: 'Ada Obi', email: 'ADA@x.com' }]);
    expect(again.status).toBe('already_on_urganize');
    expect(db.tables.person_profiles).toHaveLength(1);
    // And one the other way round: a phone the first row already used.
    const [byPhone] = await seed([{ name: 'Someone', phone: '+234 803 111 2222', email: 'new@x.com' }]);
    expect(byPhone.status).toBe('created');
    const [dupPhone] = await seed([{ name: 'Someone else', phone: '08031112222' }]);
    expect(dupPhone.status).toBe('already_on_urganize');
  });

  it('catches the same person twice in one paste', async () => {
    const outcomes = await seed([
      { name: 'Ada', email: 'a@x.com' },
      { name: 'Ada again', email: 'A@X.com' },
    ]);
    expect(outcomes.map((o) => o.status)).toEqual(['created', 'already_on_urganize']);
  });

  it('leaves nothing half-made when a step fails, and carries on with the rest', async () => {
    db.failInsertInto = 'seeded_profiles';
    const outcomes = await seed([{ name: 'Ada', email: 'a@x.com' }]);
    expect(outcomes[0].status).toBe('failed');
    expect(db.tables.person_profiles).toHaveLength(0);

    db.failInsertInto = 'person_claim_invites';
    const second = await seed([{ name: 'Bisi', email: 'b@x.com' }]);
    expect(second[0].status).toBe('failed');
    expect(db.tables.person_profiles).toHaveLength(0);
  });
});

describe('mintClaimLink', () => {
  it('ends the old link when it makes a new one, so two never work at once', async () => {
    const [outcome] = await seed([{ name: 'Ada', email: 'a@x.com' }]);
    if (outcome.status !== 'created') throw new Error('expected created');
    const oldToken = tokenFromUrl(outcome.url);

    const result = await mintClaimLink(client, { personId: outcome.personId, actorUserId: ADMIN, now: NOW });
    if (!result.ok) throw new Error('expected ok');

    expect((await openClaimLink(client, oldToken, NOW)).state).toBe('revoked');
    expect((await openClaimLink(client, result.token, NOW)).state).toBe('ok');
  });
});

describe('openClaimLink and recordClaimOpened', () => {
  it('answers missing for a guessed or malformed token, the same as a deleted one', async () => {
    expect((await openClaimLink(client, 'x'.repeat(30), NOW)).state).toBe('missing');
    expect((await openClaimLink(client, '../etc', NOW)).state).toBe('missing');
  });

  it('records NOTHING when the page is only looked at (a link preview must not count)', async () => {
    const [outcome] = await seed([{ name: 'Ada', email: 'a@x.com' }]);
    if (outcome.status !== 'created') throw new Error('expected created');
    await openClaimLink(client, tokenFromUrl(outcome.url), NOW);
    expect(db.tables.seeded_profiles[0].opened_at).toBeUndefined();
  });

  it('records the open once, from the browser, and not again', async () => {
    const [outcome] = await seed([{ name: 'Ada', email: 'a@x.com' }]);
    if (outcome.status !== 'created') throw new Error('expected created');
    const token = tokenFromUrl(outcome.url);
    await recordClaimOpened(client, token, NOW);
    expect(db.tables.seeded_profiles[0].opened_at).toBe(NOW.toISOString());
    await recordClaimOpened(client, token, new Date(NOW.getTime() + 60_000));
    expect(db.tables.seeded_profiles[0].opened_at).toBe(NOW.toISOString());
  });

  it('records nothing for a link that cannot be used', async () => {
    const [outcome] = await seed([{ name: 'Ada', email: 'a@x.com' }]);
    if (outcome.status !== 'created') throw new Error('expected created');
    const token = tokenFromUrl(outcome.url);
    const later = new Date(NOW.getTime() + 40 * 24 * 60 * 60 * 1000);
    await recordClaimOpened(client, token, later);
    expect(db.tables.seeded_profiles[0].opened_at).toBeUndefined();
    expect((await openClaimLink(client, token, later)).state).toBe('expired');
  });
});

describe('claimProfile', () => {
  const setup = async () => {
    const [outcome] = await seed([{ name: 'Ada Obi', email: 'a@x.com', bioStarter: 'Starter bio.' }]);
    if (outcome.status !== 'created') throw new Error('expected created');
    return { token: tokenFromUrl(outcome.url), personId: outcome.personId };
  };

  it('saving without publishing makes it theirs and keeps it PRIVATE', async () => {
    const { token, personId } = await setup();
    const result = await claimProfile(client, { token, userId: 'user-1', body: body(), now: NOW });
    expect(result).toMatchObject({ ok: true, published: false });
    const profile = db.tables.person_profiles.find((p) => p.id === personId)!;
    expect(profile).toMatchObject({ user_id: 'user-1', status: 'claimed', visibility: 'private' });
    expect(db.tables.seeded_profiles[0].published_at).toBeUndefined();
  });

  it('lists them only when they publish, with the audience they chose', async () => {
    const { token, personId } = await setup();
    const result = await claimProfile(client, {
      token,
      userId: 'user-1',
      body: body({ publish: true, publishTo: 'directory' }),
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, published: true });
    const profile = db.tables.person_profiles.find((p) => p.id === personId)!;
    expect(profile).toMatchObject({ visibility: 'directory', status: 'claimed' });
    expect(profile.slug).toBe('ada-obi');
    expect(db.tables.seeded_profiles[0].published_at).toBe(NOW.toISOString());
  });

  it('refuses to publish without a role, and leaves the link usable', async () => {
    const { token } = await setup();
    const result = await claimProfile(client, {
      token,
      userId: 'user-1',
      body: body({ roles: [], publish: true, publishTo: 'public' }),
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(db.tables.person_claim_invites[0].used_at).toBeUndefined();
    expect(db.tables.person_profiles[0].status).toBe('unclaimed');
  });

  it('is single use: the second claim loses', async () => {
    const { token } = await setup();
    await claimProfile(client, { token, userId: 'user-1', body: body(), now: NOW });
    const second = await claimProfile(client, { token, userId: 'user-2', body: body(), now: NOW });
    expect(second).toMatchObject({ ok: false, status: 410 });
    expect(db.tables.person_profiles[0].user_id).toBe('user-1');
  });

  it('does not take a link another request just used (the update is the lock)', async () => {
    const { token } = await setup();
    // Another request wins the race between our read and our update.
    const original = db.from.bind(db);
    let raced = false;
    db.from = ((table: string) => {
      const q = original(table);
      if (table === 'person_claim_invites' && !raced) {
        const update = q.update.bind(q);
        q.update = ((values: Row) => {
          if (values.used_at) {
            raced = true;
            db.tables.person_claim_invites[0].used_at = NOW.toISOString();
          }
          return update(values);
        }) as typeof q.update;
      }
      return q;
    }) as typeof db.from;
    const result = await claimProfile(client, { token, userId: 'user-1', body: body(), now: NOW });
    expect(result).toMatchObject({ ok: false, status: 410 });
    expect(db.tables.person_profiles[0].user_id).toBeUndefined();
  });

  it('refuses somebody who already has a profile, instead of guessing which is real', async () => {
    const { token } = await setup();
    db.tables.person_profiles.push({ id: 'theirs', user_id: 'user-1', status: 'claimed', visibility: 'private' });
    const result = await claimProfile(client, { token, userId: 'user-1', body: body(), now: NOW });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(db.tables.person_claim_invites[0].used_at).toBeUndefined();
  });

  it('refuses an expired or replaced link with a sentence naming the next step', async () => {
    const { token, personId } = await setup();
    const later = new Date(NOW.getTime() + 40 * 24 * 60 * 60 * 1000);
    const expired = await claimProfile(client, { token, userId: 'user-1', body: body(), now: later });
    expect(expired).toMatchObject({ ok: false, status: 410 });
    expect((expired as { error: string }).error).toMatch(/Oyin/);

    await mintClaimLink(client, { personId, actorUserId: ADMIN, now: NOW });
    const replaced = await claimProfile(client, { token, userId: 'user-1', body: body(), now: NOW });
    expect(replaced).toMatchObject({ ok: false, status: 410 });
  });

  it('hands the link back if saving the profile fails, so they can try again', async () => {
    const { token } = await setup();
    db.failUpdateOf = 'person_profiles';
    const result = await claimProfile(client, { token, userId: 'user-1', body: body(), now: NOW });
    expect(result).toMatchObject({ ok: false, status: 500 });
    db.failUpdateOf = null;
    expect(db.tables.person_claim_invites[0].used_at).toBeNull();
    expect((await claimProfile(client, { token, userId: 'user-1', body: body(), now: NOW })).ok).toBe(true);
  });

  it('still publishes when the handle we suggested is taken, without a handle', async () => {
    const { token, personId } = await setup();
    db.tables.person_profiles.push({ id: 'other', user_id: 'user-9', status: 'claimed', visibility: 'public', slug: 'ada-obi' });
    const result = await claimProfile(client, {
      token,
      userId: 'user-1',
      body: body({ publish: true, publishTo: 'directory' }),
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, published: true, slug: null });
    expect(db.tables.person_profiles.find((p) => p.id === personId)).toMatchObject({ visibility: 'directory' });
  });
});

describe('listSeeded', () => {
  it('reports each person at the furthest state they reached', async () => {
    const outcomes = await seed([
      { name: 'A', email: 'a@x.com' },
      { name: 'B', email: 'b@x.com' },
      { name: 'C', email: 'c@x.com' },
    ]);
    const tokens = outcomes.map((o) => (o.status === 'created' ? tokenFromUrl(o.url) : ''));
    await recordClaimOpened(client, tokens[1], NOW);
    await claimProfile(client, {
      token: tokens[2],
      userId: 'user-c',
      body: body({ publish: true, publishTo: 'public' }),
      now: NOW,
    });

    const listed = await listSeeded(client);
    if (!listed.ok) throw new Error('expected ok');
    const byName = Object.fromEntries(listed.rows.map((r) => [r.name, r]));
    expect(byName.A).toMatchObject({ state: 'invited', claimed: false });
    expect(byName.B).toMatchObject({ state: 'opened', claimed: false });
    expect(byName.C).toMatchObject({ state: 'published', claimed: true });
  });
});

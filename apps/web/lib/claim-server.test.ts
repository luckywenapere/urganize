import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createClaimInvite,
  loadClaimPreview,
  redeemClaim,
  requestRemoval,
  resolveRemoval,
  setCreditHidden,
} from './claim-server';
import { hashClaimToken } from './claim';

// Drives the REAL claim-server code against an in-memory stand-in for the
// tables it touches. The stand-in enforces the same unique rules as the
// migration, because those are what the code has to cope with.

type Row = Record<string, unknown>;

class FakeDb {
  tables: Record<string, Row[]> = {
    person_profiles: [],
    person_identifiers: [],
    person_claim_invites: [],
    person_removal_requests: [],
    release_credit_submissions: [],
    releases: [],
    team_relationships: [],
    tasks: [],
    dj_pack_recipients: [],
  };
  seq = 0;
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
  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  gte() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
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
  private run(): { data: unknown; error: { message: string; code?: string } | null } {
    const table = this.rows();
    if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const out: Row[] = [];
      for (const raw of list) {
        const defaults: Row = this.table === 'person_removal_requests' ? { status: 'open' } : {};
        const row: Row = { id: `${this.table}-${++this.db.seq}`, ...defaults, ...raw };
        // The partial unique index: one OPEN removal request per person.
        if (
          this.table === 'person_removal_requests' &&
          table.some((other) => other.person_id === row.person_id && other.status === 'open')
        ) {
          return { data: null, error: { message: 'duplicate key value', code: '23505' } };
        }
        table.push(row);
        out.push(row);
      }
      return { data: this.returning ? out.map((r) => ({ ...r })) : null, error: null };
    }
    const matched = table.filter((row) => this.filters.every((f) => f(row)));
    if (this.op === 'update') {
      for (const row of matched) Object.assign(row, this.payload);
      return { data: this.returning ? matched.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.op === 'delete') {
      this.db.tables[this.table] = table.filter((row) => !matched.includes(row));
      return { data: this.returning ? matched.map((r) => ({ ...r })) : null, error: null };
    }
    return { data: matched.map((r) => ({ ...r })), error: null };
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

const FUTURE = '2099-01-01T00:00:00Z';

function seedPerson(over: Row = {}): string {
  const id = (over.id as string) ?? `p-${db.seq++}`;
  db.tables.person_profiles.push({
    id,
    user_id: null,
    status: 'unclaimed',
    display_name: 'Tobi Adeyemi',
    slug: 'tobi-adeyemi-k3m9x',
    removal_requested_at: null,
    removed_at: null,
    ...over,
  });
  db.tables.person_identifiers.push({ person_id: id, kind: 'email', value: 'tobi@example.com', verified: false });
  return id;
}

function seedCredit(personId: string, over: Row = {}) {
  db.tables.release_credit_submissions.push({
    id: `c-${db.seq++}`,
    release_id: 'r1',
    person_id: personId,
    roles: ['producer'],
    confirmed_accurate: true,
    person_hidden: false,
    ...over,
  });
  if (!db.tables.releases.some((r) => r.id === 'r1')) {
    db.tables.releases.push({ id: 'r1', title: 'Midnight EP', release_date: '2026-05-01' });
  }
}

async function invite(personId: string) {
  const made = await createClaimInvite(client, {
    personId,
    workspaceId: 'ws1',
    createdBy: 'owner',
    releaseId: 'r1',
    channel: 'link',
  });
  if (!made) throw new Error('no invite');
  return made;
}

const redeem = (token: string, over: Partial<Parameters<typeof redeemClaim>[1]> = {}) =>
  redeemClaim(client, {
    token,
    userId: 'u1',
    accountEmail: null,
    accountEmailConfirmed: false,
    typedContact: 'tobi@example.com',
    ...over,
  });

beforeEach(() => {
  db = new FakeDb();
  client = db as unknown as SupabaseClient;
});

describe('createClaimInvite', () => {
  it('stores only the hash of the token', async () => {
    const personId = seedPerson();
    const { token } = await invite(personId);
    const row = db.tables.person_claim_invites[0];
    expect(row.token_hash).toBe(hashClaimToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });
  it('turns off the earlier open link for the same person and team', async () => {
    const personId = seedPerson();
    await invite(personId);
    await invite(personId);
    const [first, second] = db.tables.person_claim_invites;
    expect(first.revoked_at).toBeTruthy();
    expect(second.revoked_at ?? null).toBeNull();
  });
});

describe('loadClaimPreview', () => {
  it('shows the name, a masked hint and the credits, never the contact itself', async () => {
    const personId = seedPerson();
    seedCredit(personId);
    const { token } = await invite(personId);
    const preview = await loadClaimPreview(client, token);
    expect(preview).toMatchObject({ ok: true, displayName: 'Tobi Adeyemi', hint: 't***@example.com' });
    expect(JSON.stringify(preview)).not.toContain('tobi@example.com');
    expect(preview.ok && preview.credits[0].releaseTitle).toBe('Midnight EP');
  });
  it('does not show a credit the person hid', async () => {
    const personId = seedPerson();
    seedCredit(personId, { person_hidden: true });
    const { token } = await invite(personId);
    const preview = await loadClaimPreview(client, token);
    expect(preview.ok && preview.credits).toEqual([]);
  });
  it('says the same thing for a made-up link and a hidden profile', async () => {
    const personId = seedPerson({ removal_requested_at: '2026-10-01T00:00:00Z' });
    const { token } = await invite(personId);
    expect(await loadClaimPreview(client, token)).toEqual({ ok: false, reason: 'unavailable' });
    expect(await loadClaimPreview(client, 'x'.repeat(32))).toEqual({ ok: false, reason: 'unavailable' });
    expect(await loadClaimPreview(client, 'nope')).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('reports a used, turned-off or ran-out link by its reason', async () => {
    const personId = seedPerson();
    const { token } = await invite(personId);
    db.tables.person_claim_invites[0].expires_at = '2020-01-01T00:00:00Z';
    expect(await loadClaimPreview(client, token)).toEqual({ ok: false, reason: 'expired' });
  });
});

describe('redeemClaim', () => {
  it('claims the profile when the typed email is on the credit', async () => {
    const personId = seedPerson();
    const { token } = await invite(personId);
    const result = await redeem(token);
    expect(result).toMatchObject({ ok: true, personId, merged: false, slug: 'tobi-adeyemi-k3m9x' });
    const profile = db.tables.person_profiles[0];
    expect(profile).toMatchObject({ user_id: 'u1', status: 'claimed' });
    expect(db.tables.person_claim_invites[0].used_by).toBe('u1');
    expect(db.tables.person_identifiers[0].verified).toBe(true);
  });
  it('accepts a confirmed account email without typing anything', async () => {
    const personId = seedPerson();
    const { token } = await invite(personId);
    const result = await redeem(token, { typedContact: '', accountEmail: 'tobi@example.com', accountEmailConfirmed: true });
    expect(result.ok).toBe(true);
    expect(db.tables.person_profiles.find((p) => p.id === personId)?.status).toBe('claimed');
  });
  it('refuses an unconfirmed account email and counts the try', async () => {
    const personId = seedPerson();
    const { token } = await invite(personId);
    const result = await redeem(token, { typedContact: '', accountEmail: 'tobi@example.com', accountEmailConfirmed: false });
    expect(result).toMatchObject({ ok: false, reason: 'no_match', attemptsLeft: 4 });
    expect(db.tables.person_profiles[0].status).toBe('unclaimed');
    expect(db.tables.person_claim_invites[0].failed_attempts).toBe(1);
  });
  it('locks the link after five wrong tries, even for the right answer', async () => {
    const personId = seedPerson();
    const { token } = await invite(personId);
    for (let i = 0; i < 5; i += 1) await redeem(token, { typedContact: 'wrong@example.com' });
    expect(await redeem(token)).toEqual({ ok: false, reason: 'locked' });
    expect(db.tables.person_profiles.find((p) => p.id === personId)?.status).toBe('unclaimed');
  });
  it('lets only one person win a link', async () => {
    const personId = seedPerson();
    const { token } = await invite(personId);
    expect((await redeem(token, { userId: 'u1' })).ok).toBe(true);
    expect(await redeem(token, { userId: 'u2' })).toMatchObject({ ok: false, reason: 'used' });
    expect(db.tables.person_profiles.find((p) => p.id === personId)?.user_id).toBe('u1');
  });
  it('refuses a profile somebody asked to take down, or already removed', async () => {
    for (const over of [{ removal_requested_at: '2026-10-01T00:00:00Z' }, { removed_at: '2026-10-01T00:00:00Z' }]) {
      db = new FakeDb();
      client = db as unknown as SupabaseClient;
      const personId = seedPerson(over);
      const { token } = await invite(personId);
      expect(await redeem(token)).toEqual({ ok: false, reason: 'unavailable' });
    }
  });
  it('merges into the profile a person already has, instead of making two', async () => {
    const unclaimed = seedPerson({ id: 'unclaimed-1' });
    seedCredit(unclaimed);
    db.tables.person_profiles.push({ id: 'own-1', user_id: 'u1', status: 'claimed', slug: 'tobi' });
    db.tables.team_relationships.push({ id: 'tr1', person_id: unclaimed, workspace_id: 'ws1' });
    const { token } = await invite(unclaimed);
    const result = await redeem(token);
    expect(result).toMatchObject({ ok: true, personId: 'own-1', merged: true });
    expect(db.tables.release_credit_submissions[0].person_id).toBe('own-1');
    expect(db.tables.team_relationships[0].person_id).toBe('own-1');
    expect(db.tables.person_identifiers[0].person_id).toBe('own-1');
    expect(db.tables.person_profiles.some((p) => p.id === 'unclaimed-1')).toBe(false);
  });
  it('never reads a name', async () => {
    const personId = seedPerson();
    const { token } = await invite(personId);
    expect(await redeem(token, { typedContact: 'Tobi Adeyemi' })).toMatchObject({ ok: false, reason: 'no_match' });
  });
});

describe('requestRemoval', () => {
  it('hides the page at once and queues one request due in three days', async () => {
    const personId = seedPerson();
    await requestRemoval(client, { slug: 'tobi-adeyemi-k3m9x', contact: 'tobi@example.com', note: null });
    expect(db.tables.person_profiles.find((p) => p.id === personId)?.removal_requested_at).toBeTruthy();
    expect(db.tables.person_removal_requests).toHaveLength(1);
    const request = db.tables.person_removal_requests[0];
    const days = (Date.parse(String(request.due_at)) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThan(3.1);
  });
  it('does not queue twice for the same person', async () => {
    seedPerson();
    await requestRemoval(client, { slug: 'tobi-adeyemi-k3m9x', contact: 'a@x.com', note: null });
    await requestRemoval(client, { slug: 'tobi-adeyemi-k3m9x', contact: 'b@x.com', note: null });
    expect(db.tables.person_removal_requests).toHaveLength(1);
  });
  it('does nothing for a slug nobody has, or a profile somebody already claimed', async () => {
    seedPerson({ status: 'claimed', user_id: 'u9' });
    await requestRemoval(client, { slug: 'tobi-adeyemi-k3m9x', contact: 'a@x.com', note: null });
    await requestRemoval(client, { slug: 'no-such-slug', contact: 'a@x.com', note: null });
    expect(db.tables.person_removal_requests).toHaveLength(0);
    expect(db.tables.person_profiles[0].removal_requested_at ?? null).toBeNull();
  });
});

describe('resolveRemoval', () => {
  async function queued() {
    const personId = seedPerson();
    const { token } = await invite(personId);
    await requestRemoval(client, { slug: 'tobi-adeyemi-k3m9x', contact: 'tobi@example.com', note: null });
    return { personId, token, requestId: String(db.tables.person_removal_requests[0].id) };
  }
  it('removing for good sets removed_at and turns off every open claim link', async () => {
    const { personId, requestId } = await queued();
    expect(await resolveRemoval(client, { requestId, action: 'remove', adminId: 'admin' })).toBe(true);
    const profile = db.tables.person_profiles.find((p) => p.id === personId);
    expect(profile?.removed_at).toBeTruthy();
    expect(db.tables.person_claim_invites[0].revoked_at).toBeTruthy();
    expect(db.tables.person_removal_requests[0].status).toBe('removed');
  });
  it('dismissing shows the page again', async () => {
    const { personId, requestId } = await queued();
    expect(await resolveRemoval(client, { requestId, action: 'dismiss', adminId: 'admin' })).toBe(true);
    expect(db.tables.person_profiles.find((p) => p.id === personId)?.removal_requested_at).toBeNull();
    expect(db.tables.person_profiles.find((p) => p.id === personId)?.removed_at ?? null).toBeNull();
  });
  it('answers a request only once', async () => {
    const { requestId } = await queued();
    await resolveRemoval(client, { requestId, action: 'remove', adminId: 'admin' });
    expect(await resolveRemoval(client, { requestId, action: 'dismiss', adminId: 'admin' })).toBe(false);
  });
});

describe('setCreditHidden', () => {
  it('lets a person hide only a credit on their own profile', async () => {
    const mine = seedPerson({ id: 'mine', status: 'claimed', user_id: 'u1' });
    const theirs = seedPerson({ id: 'theirs', status: 'claimed', user_id: 'u2' });
    seedCredit(mine, { id: 'cm' });
    seedCredit(theirs, { id: 'ct' });
    expect(await setCreditHidden(client, { userId: 'u1', submissionId: 'cm', hidden: true })).toBe(true);
    expect(await setCreditHidden(client, { userId: 'u1', submissionId: 'ct', hidden: true })).toBe(false);
    expect(db.tables.release_credit_submissions.find((c) => c.id === 'ct')?.person_hidden).toBe(false);
  });
});

void FUTURE;

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Drives the REAL invite code, and the real welcome-link claim it hands off
// to, against an in-memory stand-in for the tables they touch. The stand-in
// enforces the two person_profiles constraints (an unclaimed profile has no
// user and is private) and the token_hash unique rule, because those are what
// the code has to live inside.

const sent: Array<Record<string, unknown>> = [];
let emailConfigured = true;
let emailOk = true;
vi.mock('./email', () => ({
  isEmailConfigured: () => emailConfigured,
  sendEmail: vi.fn(async (_admin: unknown, params: Record<string, unknown>) => {
    sent.push(params);
    return emailOk ? { ok: true } : { ok: false, error: 'boom' };
  }),
}));

import { createDirectoryInvite, listDirectoryInvites } from './directory-invites-server';
import { claimProfile, openClaimLink, recordClaimOpened } from './seeding-server';
import { parseClaimBody, type ClaimBody } from './seeding';
import type { DirectoryInviteInput } from './directory-invites';

type Row = Record<string, unknown>;

class FakeDb {
  tables: Record<string, Row[]> = {
    person_profiles: [],
    person_identifiers: [],
    person_claim_invites: [],
    seeded_profiles: [],
    directory_invites: [],
    profiles: [{ id: 'inviter-1', name: 'Kemi Manager' }],
  };
  seq = 0;
  missing = new Set<string>();
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
  private countHead = false;

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select(_cols?: string, options?: { count?: string; head?: boolean }) {
    if (this.op !== 'select') this.returning = true;
    if (options?.head) this.countHead = true;
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
  gte(column: string, value: string) {
    this.filters.push((row) => String(row[column] ?? '') >= value);
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

  private run(): { data: unknown; error: { message: string; code?: string } | null; count?: number } {
    if (this.db.missing.has(this.table)) {
      return { data: null, error: { message: `relation "public.${this.table}" does not exist`, code: '42P01' } };
    }
    const table = this.rows();
    if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const out: Row[] = [];
      for (const raw of list) {
        const row: Row = { id: `${this.table}-${++this.db.seq}`, created_at: new Date().toISOString(), ...raw };
        if (this.table === 'person_profiles') {
          if ((row.status === 'claimed') !== (row.user_id != null)) return { data: null, error: { message: 'check', code: '23514' } };
          if (row.status === 'unclaimed' && row.visibility !== 'private') return { data: null, error: { message: 'check', code: '23514' } };
        }
        if (this.table === 'person_claim_invites' && table.some((other) => other.token_hash === row.token_hash)) {
          return { data: null, error: { message: 'duplicate', code: '23505' } };
        }
        table.push(row);
        out.push(row);
      }
      const data = this.returning ? out.map((r) => ({ ...r })) : null;
      return { data: this.mode === 'many' ? data : data?.[0] ?? null, error: null };
    }
    const matched = table.filter((row) => this.filters.every((f) => f(row)));
    if (this.op === 'update') {
      for (const row of matched) Object.assign(row, this.payload);
      return { data: this.returning ? matched.map((r) => ({ ...r })) : null, error: null };
    }
    if (this.op === 'delete') {
      this.db.tables[this.table] = table.filter((row) => !matched.includes(row));
      return { data: null, error: null };
    }
    if (this.countHead) return { data: null, error: null, count: matched.length };
    const limited = this.limitN === null ? matched : matched.slice(0, this.limitN);
    if (this.mode === 'many') return { data: limited.map((r) => ({ ...r })), error: null };
    return { data: limited[0] ? { ...limited[0] } : null, error: null };
  }

  then<R1 = unknown, R2 = never>(
    resolve?: ((value: unknown) => R1 | PromiseLike<R1>) | null,
    reject?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
}

let db: FakeDb;
const admin = () => db as unknown as SupabaseClient;
const inviter = { id: 'inviter-1', name: 'Kemi Manager' };
const input = (over: Partial<DirectoryInviteInput> = {}): DirectoryInviteInput => ({
  name: 'Tobi Ade',
  role: 'mix_engineer',
  email: null,
  send: false,
  ...over,
});
const tokenOf = (url: string) => url.split('/welcome/')[1];
const body = (raw: Record<string, unknown>): ClaimBody => {
  const parsed = parseClaimBody(raw);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed;
};

beforeEach(() => {
  db = new FakeDb();
  sent.length = 0;
  emailConfigured = true;
  emailOk = true;
});

describe('createDirectoryInvite', () => {
  it('makes a private, unclaimed profile with the role, the inviter record and a welcome link', async () => {
    const result = await createDirectoryInvite(admin(), { inviter, workspaceId: 'ws-1', data: input() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toMatch(/^https:\/\/team\.urganize\.app\/welcome\/[A-Za-z0-9_-]{20,}$/);
    expect(result.emailed).toBe(false);
    expect(result.invite).toMatchObject({ name: 'Tobi Ade', role: 'mix_engineer', channel: 'link', status: 'invited' });

    const [profile] = db.tables.person_profiles;
    expect(profile).toMatchObject({ display_name: 'Tobi Ade', status: 'unclaimed', visibility: 'private', roles: ['mix_engineer'] });
    const [link] = db.tables.person_claim_invites;
    expect(link).toMatchObject({ person_id: profile.id, workspace_id: 'ws-1', created_by: 'inviter-1' });
    expect(link.token_hash).not.toBe(tokenOf(result.url));
    expect(db.tables.directory_invites[0]).toMatchObject({ inviter_user_id: 'inviter-1', person_id: profile.id, email: null });
    expect(sent).toHaveLength(0);
  });

  it('emails the link only when asked, from the inviter, and records that it went', async () => {
    const result = await createDirectoryInvite(admin(), {
      inviter,
      workspaceId: 'ws-1',
      data: input({ email: 'tobi@example.com', send: true }),
    });
    expect(result.ok && result.emailed).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      templateId: 'directory_invite',
      to: 'tobi@example.com',
      fromLabel: 'Kemi Manager via Urganize',
      props: { recipientName: 'Tobi Ade', inviterName: 'Kemi Manager', roleWithArticle: 'a mix engineer' },
    });
    expect((sent[0].props as Row).inviteUrl).toBe(result.ok ? result.url : '');
    expect(db.tables.directory_invites[0].email_sent_at).toBeTruthy();
    expect(db.tables.person_identifiers).toEqual([expect.objectContaining({ kind: 'email', value: 'tobi@example.com' })]);
  });

  it('keeps the link when the email fails, and says so', async () => {
    emailOk = false;
    const result = await createDirectoryInvite(admin(), { inviter, workspaceId: null, data: input({ email: 'tobi@example.com', send: true }) });
    expect(result.ok && result.emailProblem).toBe('send_failed');
    expect(db.tables.directory_invites[0].email_sent_at ?? null).toBeNull();
  });

  it('refuses the 21st invite in a day', async () => {
    const recent = new Date().toISOString();
    for (let i = 0; i < 20; i += 1) {
      db.tables.directory_invites.push({ id: `old-${i}`, inviter_user_id: 'inviter-1', created_at: recent });
    }
    const result = await createDirectoryInvite(admin(), { inviter, workspaceId: null, data: input() });
    expect(result).toMatchObject({ ok: false, status: 429, reason: 'limit' });
    expect(db.tables.person_profiles).toHaveLength(0);
  });

  it('counts only the last 24 hours, and only this inviter', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    for (let i = 0; i < 20; i += 1) {
      db.tables.directory_invites.push({ id: `old-${i}`, inviter_user_id: 'inviter-1', created_at: old });
      db.tables.directory_invites.push({ id: `other-${i}`, inviter_user_id: 'someone-else', created_at: new Date().toISOString() });
    }
    const result = await createDirectoryInvite(admin(), { inviter, workspaceId: null, data: input() });
    expect(result.ok).toBe(true);
  });

  it('answers not_ready and makes nothing before the migration is applied', async () => {
    db.missing.add('directory_invites');
    const result = await createDirectoryInvite(admin(), { inviter, workspaceId: null, data: input() });
    expect(result).toMatchObject({ ok: false, status: 503, reason: 'not_ready' });
    expect(db.tables.person_profiles).toHaveLength(0);
    expect(await listDirectoryInvites(admin(), 'inviter-1')).toEqual({ ready: false });
  });

  it('never makes a second profile for somebody already on Urganize', async () => {
    db.tables.person_profiles.push({ id: 'p-claimed', status: 'claimed', user_id: 'u-9', visibility: 'directory' });
    db.tables.person_identifiers.push({ person_id: 'p-claimed', kind: 'email', value: 'tobi@example.com' });
    const result = await createDirectoryInvite(admin(), { inviter, workspaceId: null, data: input({ email: 'tobi@example.com', send: true }) });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(db.tables.person_profiles).toHaveLength(1);
    expect(sent).toHaveLength(0);
  });

  it('reuses an unclaimed page and leaves the earlier link working', async () => {
    db.tables.person_profiles.push({ id: 'p-open', status: 'unclaimed', user_id: null, visibility: 'private', display_name: 'Tobi', roles: ['producer'] });
    db.tables.person_identifiers.push({ person_id: 'p-open', kind: 'email', value: 'tobi@example.com' });
    db.tables.person_claim_invites.push({ id: 'earlier', person_id: 'p-open', token_hash: 'h', used_at: null, revoked_at: null });
    const result = await createDirectoryInvite(admin(), { inviter, workspaceId: null, data: input({ email: 'tobi@example.com' }) });
    expect(result.ok).toBe(true);
    expect(db.tables.person_profiles).toHaveLength(1);
    expect(db.tables.person_claim_invites.find((row) => row.id === 'earlier')?.revoked_at ?? null).toBeNull();
    expect(db.tables.directory_invites[0].person_id).toBe('p-open');
  });

  it('refuses somebody who asked to be taken off', async () => {
    db.tables.person_profiles.push({ id: 'p-gone', status: 'unclaimed', user_id: null, visibility: 'private', removed_at: '2026-10-01' });
    db.tables.person_identifiers.push({ person_id: 'p-gone', kind: 'email', value: 'tobi@example.com' });
    const result = await createDirectoryInvite(admin(), { inviter, workspaceId: null, data: input({ email: 'tobi@example.com' }) });
    expect(result).toMatchObject({ ok: false, status: 409 });
  });
});

describe('the invitee lands, joins and publishes', () => {
  it('shows who invited them, records the open, and the inviter sees joined then listed', async () => {
    const created = await createDirectoryInvite(admin(), { inviter, workspaceId: 'ws-1', data: input() });
    if (!created.ok) throw new Error('not created');
    const token = tokenOf(created.url);

    const view = await openClaimLink(admin(), token);
    expect(view).toMatchObject({ state: 'ok', invitedBy: 'Kemi Manager', profile: { displayName: 'Tobi Ade', roles: ['mix_engineer'] } });
    // Looking records nothing; the browser's report does.
    expect(db.tables.directory_invites[0].opened_at ?? null).toBeNull();
    await recordClaimOpened(admin(), token);
    const openedAt = db.tables.directory_invites[0].opened_at;
    expect(openedAt).toBeTruthy();

    let list = await listDirectoryInvites(admin(), 'inviter-1');
    expect(list.ready && list.invites[0].status).toBe('opened');

    const claimed = await claimProfile(admin(), {
      token,
      userId: 'new-user',
      body: body({ displayName: 'Tobi Ade', roles: ['mix_engineer'], publish: true, publishTo: 'directory' }),
    });
    expect(claimed.ok).toBe(true);
    expect(db.tables.person_profiles[0]).toMatchObject({ status: 'claimed', user_id: 'new-user', visibility: 'directory' });
    expect(db.tables.directory_invites[0]).toMatchObject({ joined_user_id: 'new-user', opened_at: openedAt });
    expect(db.tables.directory_invites[0].published_at).toBeTruthy();

    list = await listDirectoryInvites(admin(), 'inviter-1');
    expect(list.ready && list.invites[0].status).toBe('listed');
    expect(await listDirectoryInvites(admin(), 'someone-else')).toMatchObject({ ready: true, invites: [] });
  });

  it('a private save is joined, not listed', async () => {
    const created = await createDirectoryInvite(admin(), { inviter, workspaceId: null, data: input() });
    if (!created.ok) throw new Error('not created');
    await claimProfile(admin(), { token: tokenOf(created.url), userId: 'u2', body: body({ publish: false }) });
    const list = await listDirectoryInvites(admin(), 'inviter-1');
    expect(list.ready && list.invites[0].status).toBe('joined');
    expect(db.tables.person_profiles[0].visibility).toBe('private');
  });

  it('a founder seeding link still says Wena', async () => {
    db.tables.person_profiles.push({ id: 'p-seed', status: 'unclaimed', user_id: null, visibility: 'private', display_name: 'Ada', roles: ['manager'] });
    const { mintClaimLink } = await import('./seeding-server');
    const link = await mintClaimLink(admin(), { personId: 'p-seed', actorUserId: 'founder' });
    if (!link.ok) throw new Error('no link');
    const view = await openClaimLink(admin(), link.token);
    expect(view).toMatchObject({ state: 'ok', invitedBy: null });
  });
});

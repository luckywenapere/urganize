import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dismissDuplicateFlag,
  getRelationship,
  listDuplicateFlags,
  listRelationships,
  removeRelationship,
  seedRelationship,
  updateRelationship,
} from './relationships-server';
import { parseRelationshipCreate, type RelationshipCreate } from './relationships';

// Drives the REAL relationships-server code against an in-memory stand-in for
// the four tables it touches. The stand-in enforces the same unique rules as
// the migration (one holder per identifier, one relationship per team per
// person, one flag per pair), because those rules are exactly what the code has
// to cope with, and a fake that accepted duplicates would prove nothing.

type Row = Record<string, unknown>;

const UNIQUE: Record<string, string[][]> = {
  person_identifiers: [['kind', 'value']],
  team_relationships: [['workspace_id', 'person_id']],
  person_duplicate_flags: [['workspace_id', 'person_a', 'person_b']],
};

/** Column defaults the migration declares, which a real insert would apply. */
const DEFAULTS: Record<string, Row> = {
  person_duplicate_flags: { status: 'open' },
};

class FakeDb {
  tables: Record<string, Row[]> = {
    person_profiles: [],
    person_identifiers: [],
    team_relationships: [],
    person_duplicate_flags: [],
  };
  seq = 0;
  /** Runs just before an insert into the named table, to stage a race. */
  beforeInsert: Record<string, () => void> = {};
  failInsertInto: string | null = null;

  from(table: string) {
    return new Query(this, table);
  }
}

class Query implements PromiseLike<unknown> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private filters: Array<(row: Row) => boolean> = [];
  private payload: Row | Row[] = {};
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
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
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert';
    this.payload = rows;
    this.opts = opts;
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
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  or(expression: string) {
    const parts = expression.split(',').map((part) => part.split('.eq.'));
    this.filters.push((row) => parts.some(([column, value]) => row[column] === value));
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
  private violates(row: Row, ignoreId?: unknown): boolean {
    return (UNIQUE[this.table] || []).some((cols) =>
      this.rows().some((other) => other.id !== ignoreId && cols.every((c) => other[c] === row[c]))
    );
  }

  private run(): { data: unknown; error: { message: string; code?: string } | null } {
    const table = this.rows();
    if (this.op === 'insert' || this.op === 'upsert') {
      this.db.beforeInsert[this.table]?.();
      if (this.db.failInsertInto === this.table) return { data: null, error: { message: 'boom' } };
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const out: Row[] = [];
      for (const raw of list) {
        const row: Row = { id: `${this.table}-${++this.db.seq}`, ...(DEFAULTS[this.table] || {}), ...raw };
        if (this.violates(row)) {
          if (this.op === 'upsert' && this.opts.ignoreDuplicates) continue;
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
    const found = matched.slice(0, this.limitN ?? undefined).map((r) => ({ ...r }));
    return { data: found, error: null };
  }

  then<R1 = unknown, R2 = never>(
    resolve?: ((value: unknown) => R1 | PromiseLike<R1>) | null,
    reject?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    const result = this.run();
    let shaped: { data: unknown; error: unknown } = result;
    if (!result.error && this.mode !== 'many') {
      const list = (Array.isArray(result.data) ? result.data : result.data ? [result.data] : []) as Row[];
      if (this.mode === 'single' && list.length !== 1) {
        shaped = { data: null, error: { message: 'no single row' } };
      } else {
        shaped = { data: list[0] ?? null, error: null };
      }
    }
    return Promise.resolve(shaped).then(resolve, reject);
  }
}

const WS_A = 'ws-a';
const WS_B = 'ws-b';
const USER = 'user-1';

const data = (over: Record<string, unknown> = {}): RelationshipCreate => {
  const parsed = parseRelationshipCreate({ label: 'Tunde Okafor', role: 'producer', ...over });
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.value;
};

let db: FakeDb;
let client: SupabaseClient;

beforeEach(() => {
  db = new FakeDb();
  client = db as unknown as SupabaseClient;
});

const seed = (workspaceId: string, d: RelationshipCreate) =>
  seedRelationship(client, { workspaceId, actorUserId: USER, data: d, source: 'manual' });

const ok = <T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
};

describe('seedRelationship: a new person', () => {
  it('makes one UNCLAIMED, PRIVATE profile, its identifiers and the team’s relationship', async () => {
    const result = ok(await seed(WS_A, data({ email: 'T@x.com', phone: '0803 123 4567' })));
    expect(result).toMatchObject({ created: true, matchedVia: null, flagged: 0 });

    expect(db.tables.person_profiles).toHaveLength(1);
    expect(db.tables.person_profiles[0]).toMatchObject({
      status: 'unclaimed',
      visibility: 'private',
      created_by_workspace_id: WS_A,
    });
    expect(db.tables.person_identifiers.map((r) => `${r.kind}:${r.value}`).sort()).toEqual([
      'email:t@x.com',
      'phone:+2348031234567',
    ]);
    expect(db.tables.team_relationships).toHaveLength(1);
    expect(db.tables.team_relationships[0]).toMatchObject({ workspace_id: WS_A, label: 'Tunde Okafor' });
  });

  it('works with a name alone', async () => {
    ok(await seed(WS_A, data()));
    expect(db.tables.person_profiles).toHaveLength(1);
    expect(db.tables.person_identifiers).toHaveLength(0);
  });
});

describe('seedRelationship: one profile for one person', () => {
  it('a second team adding the same email lands on the SAME profile with its own relationship', async () => {
    const first = ok(await seed(WS_A, data({ email: 't@x.com', label: 'Tunde Okafor' })));
    const second = ok(await seed(WS_B, data({ email: 'T@X.com', label: 'Mr O', role: 'director' })));

    expect(second.personId).toBe(first.personId);
    expect(second).toMatchObject({ created: true, matchedVia: 'email' });
    expect(db.tables.person_profiles).toHaveLength(1);
    expect(db.tables.team_relationships).toHaveLength(2);
  });

  it('each team keeps its own label, contact details and notes', async () => {
    const first = ok(await seed(WS_A, data({ email: 't@x.com', phone: '0803 123 4567', notes: 'private to A' })));
    ok(await seed(WS_B, data({ email: 't@x.com', label: 'Mr O', notes: 'private to B' })));

    const forB = ok(await getRelationship(client, WS_B, first.personId)).relationship;
    expect(forB.label).toBe('Mr O');
    expect(forB.notes).toBe('private to B');
    // The phone number team A typed must not appear for team B.
    expect(forB.phone).toBeNull();
  });

  it('matches on phone when only the phone is shared', async () => {
    const first = ok(await seed(WS_A, data({ phone: '0803 123 4567' })));
    const second = ok(await seed(WS_B, data({ phone: '+234 803 123 4567', label: 'Someone' })));
    expect(second).toMatchObject({ personId: first.personId, matchedVia: 'phone' });
  });

  it('gives a matched person an identifier it did not have, without moving the old one', async () => {
    const first = ok(await seed(WS_A, data({ email: 't@x.com' })));
    ok(await seed(WS_B, data({ email: 't@x.com', phone: '0803 123 4567' })));
    const rows = db.tables.person_identifiers.filter((r) => r.person_id === first.personId);
    expect(rows.map((r) => r.kind).sort()).toEqual(['email', 'phone']);
  });
});

describe('seedRelationship: adding somebody the team already has', () => {
  it('changes nothing but a contact detail the team was missing', async () => {
    const first = ok(await seed(WS_A, data({ email: 't@x.com', notes: 'keep me', tags: ['video'] })));
    const again = ok(await seed(WS_A, data({ email: 't@x.com', phone: '0803 123 4567', notes: 'overwrite?' })));

    expect(again).toMatchObject({ personId: first.personId, created: false });
    expect(db.tables.team_relationships).toHaveLength(1);
    expect(db.tables.team_relationships[0]).toMatchObject({
      notes: 'keep me',
      tags: ['video'],
      phone: '+2348031234567',
    });
  });
});

describe('seedRelationship: names never merge people', () => {
  it('reuses the team’s own contact with the same name AND role', async () => {
    const first = ok(await seed(WS_A, data()));
    const second = ok(await seed(WS_A, data()));
    expect(second).toMatchObject({ personId: first.personId, created: false, matchedVia: 'name_and_role' });
    expect(db.tables.person_profiles).toHaveLength(1);
  });

  it('a same-name person in another role is a NEW person, flagged for a human to confirm', async () => {
    const first = ok(await seed(WS_A, data({ role: 'producer' })));
    const second = ok(await seed(WS_A, data({ role: 'videographer' })));

    expect(second.personId).not.toBe(first.personId);
    expect(second.flagged).toBe(1);
    expect(db.tables.person_profiles).toHaveLength(2);
    expect(db.tables.person_duplicate_flags).toHaveLength(1);
    expect(db.tables.person_duplicate_flags[0]).toMatchObject({ workspace_id: WS_A, status: 'open', reason: 'same_name' });
  });

  it('never compares a name against ANOTHER team’s contacts', async () => {
    ok(await seed(WS_A, data()));
    const other = ok(await seed(WS_B, data()));
    expect(other).toMatchObject({ created: true, matchedVia: null, flagged: 0 });
    expect(db.tables.person_profiles).toHaveLength(2);
    expect(db.tables.person_duplicate_flags).toHaveLength(0);
  });

  it('stores a flagged pair once, in a fixed order, even if it is raised twice', async () => {
    ok(await seed(WS_A, data({ role: 'producer' })));
    ok(await seed(WS_A, data({ role: 'videographer' })));
    // A third add of the first person's name and role matches them; no new flag pair.
    ok(await seed(WS_A, data({ role: 'producer' })));
    const [flag] = db.tables.person_duplicate_flags;
    expect(String(flag.person_a) < String(flag.person_b)).toBe(true);
  });
});

describe('seedRelationship: shared identifiers across profiles', () => {
  it('does not flag a profile the team has no relationship with', async () => {
    // Two profiles already share nothing in this team's book: seed B's person
    // directly, then give team A an email that matches B's and a phone that
    // matches a THIRD person A knows.
    const known = ok(await seed(WS_A, data({ phone: '0803 123 4567', label: 'Known', role: 'dj' })));
    const stranger = ok(await seed(WS_B, data({ email: 's@x.com', label: 'Stranger', role: 'dj' })));
    expect(stranger.personId).not.toBe(known.personId);

    const result = ok(await seed(WS_A, data({ email: 's@x.com', phone: '0803 123 4567', label: 'Both', role: 'dj' })));
    // The email wins and lands on the stranger's profile; the phone points at a
    // person A does know, so THAT pair is flagged, but the stranger is never
    // named in a flag A can see.
    expect(result.personId).toBe(stranger.personId);
    const flags = db.tables.person_duplicate_flags;
    for (const flag of flags) {
      expect([flag.person_a, flag.person_b]).toContain(known.personId);
    }
  });
});

describe('seedRelationship: failures leave nothing behind', () => {
  it('removes the profile it just made if the relationship cannot be saved', async () => {
    db.failInsertInto = 'team_relationships';
    const result = await seed(WS_A, data({ email: 't@x.com' }));
    expect(result.ok).toBe(false);
    expect(db.tables.person_profiles).toHaveLength(0);
  });

  it('uses the other writer’s profile when two teams add the same email at once', async () => {
    // Between this call's lookup and its identifier insert, another team's
    // profile claims the address.
    db.beforeInsert.person_identifiers = () => {
      db.beforeInsert.person_identifiers = () => {};
      db.tables.person_profiles.push({ id: 'racer', status: 'unclaimed', visibility: 'private', display_name: 'Racer' });
      db.tables.person_identifiers.push({ id: 'racer-id', person_id: 'racer', kind: 'email', value: 't@x.com' });
    };
    const result = ok(await seed(WS_A, data({ email: 't@x.com' })));
    expect(result.personId).toBe('racer');
    // Exactly one profile for that address: the one it made was dropped.
    expect(db.tables.person_profiles.map((p) => p.id)).toEqual(['racer']);
  });
});

describe('what a team can read', () => {
  it('shows an unclaimed person only as the team’s own label', async () => {
    const seeded = ok(await seed(WS_A, data({ email: 't@x.com' })));
    const view = ok(await getRelationship(client, WS_A, seeded.personId)).relationship;
    expect(view).toMatchObject({ claimed: false, profile: null, label: 'Tunde Okafor' });
  });

  it('shows the public profile only for somebody who claimed it AND chose to be listed', async () => {
    const seeded = ok(await seed(WS_A, data({ email: 't@x.com' })));
    const profile = db.tables.person_profiles.find((p) => p.id === seeded.personId) as Row;
    Object.assign(profile, { status: 'claimed', user_id: 'u9', display_name: 'Tunde O.', visibility: 'private', city: 'Lagos' });
    expect(ok(await getRelationship(client, WS_A, seeded.personId)).relationship.profile).toBeNull();

    profile.visibility = 'public';
    profile.slug = 'tunde';
    const listed = ok(await getRelationship(client, WS_A, seeded.personId)).relationship;
    expect(listed.claimed).toBe(true);
    expect(listed.profile).toMatchObject({ displayName: 'Tunde O.', city: 'Lagos', slug: 'tunde' });
  });

  it('lists only the team’s own contacts', async () => {
    ok(await seed(WS_A, data({ label: 'Mine' })));
    ok(await seed(WS_B, data({ label: 'Theirs' })));
    const list = ok(await listRelationships(client, WS_A)).relationships;
    expect(list.map((r) => r.label)).toEqual(['Mine']);
  });

  it('answers 404 for another team’s contact, the same as one that does not exist', async () => {
    const theirs = ok(await seed(WS_B, data()));
    const result = await getRelationship(client, WS_A, theirs.personId);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });
});

describe('updateRelationship and removeRelationship', () => {
  it('edits only what was sent, and only for the team’s own contact', async () => {
    const seeded = ok(await seed(WS_A, data({ notes: 'keep', tags: ['a'] })));
    const updated = ok(await updateRelationship(client, WS_A, seeded.personId, { role: 'director' }));
    expect(updated.relationship).toMatchObject({ role: 'director', notes: 'keep', tags: ['a'] });

    const other = await updateRelationship(client, WS_B, seeded.personId, { role: 'x' });
    expect(other).toMatchObject({ ok: false, status: 404 });
    expect(db.tables.team_relationships[0].role).toBe('director');
  });

  it('never changes the shared profile when a team edits its layer', async () => {
    const seeded = ok(await seed(WS_A, data()));
    const before = JSON.stringify(db.tables.person_profiles);
    ok(await updateRelationship(client, WS_A, seeded.personId, { label: 'New name', notes: 'x' }));
    expect(JSON.stringify(db.tables.person_profiles)).toBe(before);
  });

  it('removing a contact leaves the person and clears the team’s flags about them', async () => {
    const a = ok(await seed(WS_A, data({ role: 'producer' })));
    ok(await seed(WS_A, data({ role: 'videographer' })));
    expect(db.tables.person_duplicate_flags).toHaveLength(1);

    ok(await removeRelationship(client, WS_A, a.personId));
    expect(db.tables.person_profiles).toHaveLength(2);
    expect(db.tables.team_relationships).toHaveLength(1);
    expect(db.tables.person_duplicate_flags).toHaveLength(0);
  });

  it('cannot remove another team’s contact', async () => {
    const theirs = ok(await seed(WS_B, data()));
    expect(await removeRelationship(client, WS_A, theirs.personId)).toMatchObject({ ok: false, status: 404 });
    expect(db.tables.team_relationships).toHaveLength(1);
  });
});

describe('duplicate suggestions', () => {
  it('labels each end with what THIS team calls them', async () => {
    ok(await seed(WS_A, data({ label: 'Tunde Okafor', role: 'producer' })));
    ok(await seed(WS_A, data({ label: 'Tunde Okafor', role: 'videographer' })));
    const { flags } = ok(await listDuplicateFlags(client, WS_A));
    expect(flags).toHaveLength(1);
    expect([flags[0].a.label, flags[0].b.label]).toEqual(['Tunde Okafor', 'Tunde Okafor']);
  });

  it('dismissing stops a pair being suggested, and only for that team', async () => {
    ok(await seed(WS_A, data({ role: 'producer' })));
    ok(await seed(WS_A, data({ role: 'videographer' })));
    const id = String(db.tables.person_duplicate_flags[0].id);

    expect(await dismissDuplicateFlag(client, WS_B, id, USER)).toMatchObject({ ok: false, status: 404 });
    ok(await dismissDuplicateFlag(client, WS_A, id, USER));
    expect(ok(await listDuplicateFlags(client, WS_A)).flags).toHaveLength(0);
  });
});

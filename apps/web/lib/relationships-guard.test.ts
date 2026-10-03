import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The property that matters most about Relationships: a team can only ever read
// and write its OWN contacts. The routes get there by resolving the team from
// the signed-in user in ONE place (resolveRelationshipsContext) and passing that
// workspace id into the server layer, never taking one from the request.
//
// A comment cannot hold that, so these read the real sources.

const ROUTES = join(__dirname, '..', 'app', 'api', 'relationships');
const SERVER = join(__dirname, 'relationships-server.ts');
const MIGRATION = join(
  __dirname,
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
  '20261003100000_relationships.sql'
);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === 'route.ts' ? [path] : [];
  });
}

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('relationships routes', () => {
  const files = routeFiles(ROUTES);

  it('finds the routes', () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const label = file.slice(ROUTES.length + 1);

    it(`${label} resolves the team through the shared gate`, () => {
      expect(source).toContain('resolveRelationshipsContext(');
    });

    it(`${label} never reads a workspace id from the request`, () => {
      // The team comes from the signed-in user. A workspaceId in a body, query
      // string or path would let a caller name somebody else's.
      expect(source).not.toMatch(/body\.workspaceId|searchParams\.get\(['"]workspace/i);
    });

    it(`${label} marks every write as a write and every read as a read`, () => {
      const handlers = [...source.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b[\s\S]*?(?=export async function|$)/g)];
      expect(handlers.length).toBeGreaterThan(0);
      for (const [text, method] of handlers) {
        const expected = method === 'GET' ? 'write: false' : 'write: true';
        expect(text, `${method} in ${label}`).toContain(expected);
      }
    });
  }

  it('answers the feature flag before auth, in the one shared gate', () => {
    const shared = stripComments(readFileSync(join(ROUTES, '_shared.ts'), 'utf8'));
    expect(shared.indexOf('isRelationshipsEnabled()')).toBeGreaterThan(-1);
    expect(shared.indexOf('if (!isRelationshipsEnabled())')).toBeLessThan(shared.indexOf('requireAuthenticatedAdmin('));
  });
});

describe('relationships-server', () => {
  const source = stripComments(readFileSync(SERVER, 'utf8'));

  it('scopes every read of the private layer to a workspace', () => {
    // Each query on team_relationships must filter on workspace_id. Counting
    // `.from(RELATIONSHIPS)` against `workspace_id` filters catches a new query
    // that forgets.
    const queries = source.split('.from(RELATIONSHIPS)').slice(1);
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) {
      const statement = query.slice(0, query.indexOf(';'));
      expect(statement, statement).toMatch(/workspace_id/);
    }
  });

  it('never reads contact details from the shared identifiers table for display', () => {
    // person_identifiers is shared across teams; what a team sees comes from its
    // own relationship row. Reading email or phone from it would show one team
    // the number another typed.
    const display = source.slice(source.indexOf('function toView'), source.indexOf('async function loadProfiles'));
    expect(display).not.toContain('PERSON_IDENTIFIERS');
  });

  it('never writes the shared profile when a team edits its layer', () => {
    const update = source.slice(source.indexOf('export async function updateRelationship'), source.indexOf('export async function removeRelationship'));
    expect(update).not.toContain('PERSON_PROFILES');
  });
});

describe('relationships migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('gives no table a write policy', () => {
    const policies = sql.match(/create policy[\s\S]*?on public\.\w+ for (\w+)/g) || [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) expect(policy.endsWith(' select')).toBe(true);
  });

  it('keeps row level security on for every new table', () => {
    for (const table of ['person_identifiers', 'team_relationships', 'person_duplicate_flags', 'person_claim_invites']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('keeps an unclaimed profile private', () => {
    expect(sql).toContain("check (status = 'claimed' or visibility = 'private')");
  });
});

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Structural guards for Directory referral invites (2026-10-11, GitHub #834).
// They read the real sources, so a later edit that breaks one of the rules
// that carry the trust fails here instead of in production.

const ROOT = join(__dirname, '..');
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const read = (path: string) => strip(readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n'));

function walk(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, found);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) found.push(full);
  }
  return found;
}

describe('the invite route', () => {
  const route = read('app/api/directory/invites/route.ts');
  it('checks the directory flag before anything else in every handler', () => {
    const handlers = route.split(/export async function /).slice(1);
    expect(handlers).toHaveLength(2);
    for (const handler of handlers) {
      const flagAt = handler.indexOf('isDirectoryFeatureEnabled()');
      expect(flagAt).toBeGreaterThan(-1);
      for (const call of ['requireActiveAuthenticatedUser(', 'request.json()', 'createAdminClient(']) {
        const at = handler.indexOf(call);
        if (at !== -1) expect(flagAt).toBeLessThan(at);
      }
    }
  });
  it('reads the inviter from the session, never from the body', () => {
    expect(route).toContain('inviter: { id: auth.user.id');
    expect(route).not.toMatch(/inviterUserId|body\.inviter/);
  });
});

describe('the invite record', () => {
  it('directory_invites is written only by the two invite servers', () => {
    const allowed = new Set(['lib/directory-invites-server.ts', 'lib/directory-invites-claim-server.ts']);
    const writers = walk(ROOT)
      .map((file) => relative(ROOT, file).split(sep).join('/'))
      .filter((file) => {
        const source = read(file);
        return (
          /from\(['"]directory_invites['"]\)\s*\.(insert|update|upsert|delete)\(/.test(source) ||
          /DIRECTORY_INVITES_TABLE\)\s*\.(insert|update|upsert|delete)\(/.test(source)
        );
      });
    for (const writer of writers) expect(allowed, writer).toContain(writer);
  }, 60_000);

  it('the profile an invite makes is unclaimed and private', () => {
    const server = read('lib/directory-invites-server.ts');
    const insert = server.slice(server.indexOf('.from(PERSON_PROFILES)\n        .insert('), server.indexOf(".select('id')"));
    expect(insert).toContain("status: 'unclaimed'");
    expect(insert).toContain("visibility: 'private'");
    expect(server).not.toMatch(/visibility:\s*'(directory|public)'/);
  });

  it('a link is made only through the welcome-link path, so only its hash is stored', () => {
    const server = read('lib/directory-invites-server.ts');
    expect(server).toContain('mintClaimLink(');
    expect(server).not.toMatch(/person_claim_invites/);
  });

  it('the email goes only when asked', () => {
    const server = read('lib/directory-invites-server.ts');
    const at = server.indexOf("templateId: 'directory_invite'");
    expect(at).toBeGreaterThan(-1);
    expect(server.lastIndexOf('if (data.send && data.email)', at)).toBeGreaterThan(-1);
  });
});

describe('the migration', () => {
  const sql = readFileSync(join(ROOT, '..', '..', 'supabase', 'migrations', '20261011210000_directory_invites.sql'), 'utf8').replace(/\r\n/g, '\n');
  it('turns row level security on and writes no policy', () => {
    expect(sql).toMatch(/alter table public\.directory_invites enable row level security/);
    expect(sql).not.toMatch(/create policy/i);
  });
  it('is additive', () => {
    const code = sql.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/\bdrop\s+(table|column|constraint)\b/i);
    expect(code).not.toMatch(/\bdelete\s+from\b/i);
    expect(code).not.toMatch(/alter table public\.(person_profiles|person_claim_invites)/);
  });
});

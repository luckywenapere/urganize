import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Structural guards for founder-led seeding (2026-10-10). They read the real
// sources, so a NEW route or a later edit that breaks one of these rules fails
// here instead of in production.
//
// The rules are the ones that carry the trust: nobody is listed without their
// own yes, the operator routes are admin only, and a seeding link can never be
// read back or counted by a crawler.

const ROOT = join(__dirname, '..');
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const read = (path: string) =>
  strip(readFileSync(join(ROOT, path), 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10)));

function walk(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, found);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

describe('the operator routes are admin only', () => {
  const routes = ['app/api/admin/seeding/route.ts', 'app/api/admin/seeding/[personId]/link/route.ts'];

  it.each(routes)('%s checks the admin before it reads or writes anything', (path) => {
    const source = read(path);
    const handlers = source.split(/export async function /).slice(1);
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) {
      const adminAt = handler.indexOf('verifyAdmin(request)');
      expect(adminAt).toBeGreaterThan(-1);
      for (const call of ['.from(', 'seedManagers(', 'listSeeded(', 'mintClaimLink(', 'request.json()']) {
        const at = handler.indexOf(call);
        if (at !== -1) expect(adminAt).toBeLessThan(at);
      }
    }
  });
});

describe('publishing is the manager’s own, signed-in act', () => {
  const welcome = read('app/api/welcome/[token]/route.ts');

  it('only the claim request can set a visibility, and it needs a signed-in account', () => {
    const post = welcome.slice(welcome.indexOf('export async function POST'));
    expect(post).toContain('getAuthenticatedUser(request)');
    // Open to a person finishing sign up: never the paywalled gate.
    expect(welcome).not.toMatch(/requireActive/);
    expect(post.indexOf('getAuthenticatedUser')).toBeLessThan(post.indexOf('claimProfile('));
  });

  it('the open page route never writes', () => {
    const get = welcome.slice(welcome.indexOf('export async function GET'), welcome.indexOf('export async function POST'));
    expect(get).toContain('openClaimLink(');
    expect(get).not.toMatch(/recordClaimOpened|\.update\(|\.insert\(/);
  });

  it('the only code in the seeding feature that writes a visibility is the claim patch', () => {
    const server = read('lib/seeding-server.ts');
    const writes = server.match(/visibility\s*[:=]\s*[^,;)\n]+/g) || [];
    // 'private' when a profile is created; the claim patch passes the chosen one.
    expect(writes.some((w) => /'private'/.test(w))).toBe(true);
    const publicWrites = writes.filter((w) => /'(directory|public)'/.test(w));
    expect(publicWrites).toEqual([]);
    expect(server).toMatch(/function profilePatch[\s\S]*visibility,/);
  });

  it('creation inserts the profile as unclaimed and private', () => {
    const server = read('lib/seeding-server.ts');
    const insert = server.slice(server.indexOf(".from(PERSON_PROFILES)\n      .insert("), server.indexOf('.select(\'id\')'));
    expect(insert).toContain("status: 'unclaimed'");
    expect(insert).toContain("visibility: 'private'");
  });
});

describe('a link is shown once and never stored', () => {
  it('only the hash goes into the table', () => {
    const server = read('lib/seeding-server.ts');
    expect(server).toMatch(/token_hash: hashClaimToken\(token\)/);
    expect(server).not.toMatch(/token:\s*token[,\n]/);
    expect(server).toMatch(/createHash\('sha256'\)/);
  });

  it('the server page does not record an open on render', () => {
    const page = read('app/welcome/[token]/page.tsx');
    expect(page).toContain('openClaimLink(');
    expect(page).not.toContain('recordClaimOpened');
  });

  it('the page is noindex', () => {
    const page = readFileSync(join(ROOT, 'app/welcome/[token]/page.tsx'), 'utf8');
    expect(page).toMatch(/index:\s*false/);
  });
});

describe('the operator tables are touched only by the seeding code', () => {
  const allowed = new Set([
    'lib/seeding-server.ts',
    'app/api/admin/seeding/[personId]/link/route.ts',
    // The account export reads every table a user owns.
    'app/api/account/export/route.ts',
    'lib/account-export.ts',
  ]);

  it('seeded_profiles has no other reader or writer', () => {
    const offenders = walk(ROOT)
      .map((file) => relative(ROOT, file).split(sep).join('/'))
      .filter((file) => !allowed.has(file) && read(file).includes('seeded_profiles'));
    expect(offenders).toEqual([]);
  }, 60_000);
});

describe('the migration', () => {
  const sql = readFileSync(
    join(ROOT, '..', '..', 'supabase', 'migrations', '20261010170000_seeding.sql'),
    'utf8'
  );

  it('turns row level security on and writes no policy, so only service-role routes reach it', () => {
    expect(sql).toMatch(/alter table public\.seeded_profiles enable row level security/);
    expect(sql).not.toMatch(/create policy/i);
  });

  it('is additive: nothing dropped or deleted', () => {
    const code = sql.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/\bdrop\s+(table|column|constraint)\b/i);
    expect(code).not.toMatch(/\bdelete\s+from\b/i);
  });
});

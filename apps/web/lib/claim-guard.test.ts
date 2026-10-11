import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Structural guards for the claim flow (Lane A). They read the real source so
// a NEW file or route that breaks a rule fails here, not in production.

const ROOT = join(__dirname, '..');

function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}
const read = (path: string) => strip(readFileSync(join(ROOT, path), 'utf8'));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

describe('the claim routes stay open to people with no plan', () => {
  it('claiming and the first-minute profile steps never use the paywall wrapper', () => {
    for (const file of ['app/api/claim/[token]/route.ts', 'app/api/claim-profile/route.ts']) {
      const source = read(file);
      expect(source, file).toContain('getAuthenticatedUser');
      expect(source, file).not.toContain('requireActiveAuthenticatedUser');
      expect(source, file).not.toContain('requireAuthenticatedAdmin');
    }
  });
  it('the public preview and the removal form need no session at all', () => {
    const removal = read('app/api/person-removal/route.ts');
    expect(removal).not.toContain('getAuthenticatedUser');
    expect(removal).not.toContain('requireActive');
    const claim = read('app/api/claim/[token]/route.ts');
    const get = claim.slice(claim.indexOf('export async function GET'), claim.indexOf('export async function POST'));
    expect(get).not.toContain('getAuthenticatedUser');
  });
  it('the removal form answers the same for every slug', () => {
    const removal = read('app/api/person-removal/route.ts');
    // One success return after the work, and the work returns nothing.
    expect(removal.match(/ok: true/g)?.length).toBe(1);
    expect(read('lib/claim-server.ts')).toMatch(/export async function requestRemoval\([\s\S]*?\): Promise<void>/);
  });
});

describe('what a stranger can read about an unclaimed person', () => {
  it('selects only the name, the handle and the state from the profile', () => {
    const source = read('lib/person-unclaimed-server.ts');
    const selects = [...source.matchAll(/\.select\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(selects).toEqual(['id, display_name, slug, status, removal_requested_at, removed_at']);
  });
  it('shows nothing for a profile that is not unclaimed, or that asked to go', () => {
    const source = read('lib/person-unclaimed-server.ts');
    expect(source).toContain("row.status !== 'unclaimed'");
    expect(source).toContain('row.removal_requested_at');
    expect(source).toContain('row.removed_at');
  });
  it('never returns a contact, a bio or a link in the payload', () => {
    const source = read('lib/person-unclaimed-server.ts');
    const type = source.slice(source.indexOf('export type PublicUnclaimed'), source.indexOf('function adminClient'));
    for (const word of ['email', 'phone', 'bio', 'links', 'city', 'availability', 'userId']) {
      expect(type, word).not.toContain(word);
    }
  });
  it('credits only count when the collaborator attested and has not hidden them', () => {
    const source = read('lib/claim-server.ts');
    expect(source).toContain(".eq('confirmed_accurate', true)");
    expect(source).toContain(".eq('person_hidden', false)");
  });
});

describe('nothing emails a stranger on its own', () => {
  it('the daily sweep and the claim server never import the email sender', () => {
    for (const file of ['lib/claim-sweep-server.ts', 'lib/claim-server.ts', 'lib/claim-sweep.ts']) {
      expect(read(file), file).not.toMatch(/sendEmail|from '\.\/email'|from '\.\/email\//);
    }
  });
  it('only the owner invite path sends the email', () => {
    const senders = walk(join(ROOT, 'lib'))
      .concat(walk(join(ROOT, 'app')))
      .filter((file) => /templateId:\s*'claim_invite'/.test(strip(readFileSync(file, 'utf8'))))
      .map((file) => file.slice(ROOT.length + 1).replace(/\\/g, '/'));
    expect(senders).toEqual(['lib/claim-owner-server.ts']);
  });
});

describe('the daily profile creation', () => {
  it('rides the existing cron and writes only while it is switched on', () => {
    const cron = read('app/api/cron/due-date-notifications/route.ts');
    expect(cron).toContain('runCreditProfileSweepIfEnabled');
    const server = read('lib/claim-sweep-server.ts');
    expect(server).toMatch(/runCreditProfileSweepIfEnabled[\s\S]*isCreditSweepEnabled/);
  });
  it('a dry run writes nothing', () => {
    const server = read('lib/claim-sweep-server.ts');
    const afterPlan = server.slice(server.indexOf('if (options.dryRun) return report;'));
    // Every write sits below the dry-run return.
    const before = server.slice(0, server.indexOf('if (options.dryRun) return report;'));
    const run = before.slice(before.indexOf('export async function runCreditProfileSweep('));
    expect(run).not.toMatch(/\.(insert|update|upsert|delete)\(|seedRelationship\(/);
    expect(afterPlan).toContain('seedRelationship(');
  });
  it('the admin route defaults to a dry run', () => {
    expect(read('app/api/admin/claims/route.ts')).toContain("const dryRun = body.mode !== 'run';");
  });
  it('skips archived and test rollouts and everything that has not come out', () => {
    const server = read('lib/claim-sweep-server.ts');
    expect(server).toContain("=== 'archived'");
    expect(server).toContain('readTestRelease(');
    expect(server).toContain('isRecapEligible(');
  });
});

describe('who may write the claim tables', () => {
  const allowed: Record<string, string[]> = {
    person_claim_invites: ['lib/claim-server.ts'],
    person_removal_requests: ['lib/claim-server.ts'],
  };
  it('only the claim server writes invites and removal requests', () => {
    const files = walk(join(ROOT, 'lib')).concat(walk(join(ROOT, 'app')), walk(join(ROOT, 'components')));
    for (const [table, owners] of Object.entries(allowed)) {
      const writers = files
        .filter((file) => {
          const source = strip(readFileSync(file, 'utf8'));
          return new RegExp(`from\\(['"]${table}['"]\\)\\s*\\.(insert|update|upsert|delete)\\(`).test(source) ||
            new RegExp(`(INVITES|REMOVALS)\\)\\s*\\.(insert|update|upsert|delete)\\(`).test(source) && file.includes('claim-server');
        })
        .map((file) => file.slice(ROOT.length + 1).replace(/\\/g, '/'));
      for (const writer of writers) expect(owners, `${table} written by ${writer}`).toContain(writer);
    }
  });
});

describe('the claim page', () => {
  it('is not indexed and renders on every request', () => {
    const page = read('app/claim/[token]/page.tsx');
    expect(page).toContain("robots: { index: false, follow: false }");
    expect(page).toContain("dynamic = 'force-dynamic'");
  });
  it('a signed-out visitor is not bounced: the shell treats /claim/ as a standalone page', () => {
    expect(readFileSync(join(ROOT, 'components/app/AppShell.tsx'), 'utf8')).toContain("pathname?.startsWith('/claim/')");
  });
});

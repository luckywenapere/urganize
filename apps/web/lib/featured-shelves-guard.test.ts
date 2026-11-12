import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIRECTORY_ROLES } from './directory-roles';
import { FEATURED_PER_ROLE } from './featured-shelves';

/**
 * Structural guards for the directory shelves. They read the real sources, so a
 * change that quietly breaks a rule fails here rather than in front of a user.
 */

const WEB = join(__dirname, '..');
const MIGRATION = join(WEB, '..', '..', 'supabase', 'migrations', '20261010140000_featured_shelves.sql');

const read = (...parts: string[]) => readFileSync(join(WEB, ...parts), 'utf8');

/** Comments are prose about the rules and must not satisfy or trip them. */
function stripTsComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const stripSqlComments = (sql: string) => sql.replace(/--.*$/gm, '');

const LOGIC_FILES = [
  'lib/featured-shelves.ts',
  'lib/featured-shelves-server.ts',
  'app/api/directory/shelves/route.ts',
  'app/api/admin/featured/route.ts',
];

describe('featured shelves: nothing can be sold', () => {
  // The spec is explicit: Featured is never a paid slot. These are the words a
  // money path would have to use, in the code and the schema, not the UI copy.
  const MONEY = /\b(price|prices|payment|payments|paystack|checkout|subscription|entitlement|kobo|naira|invoice|credits?|billing)\b/i;

  it('reads no price, plan or payment in the logic or the routes', () => {
    for (const file of LOGIC_FILES) {
      expect(stripTsComments(read(file)), file).not.toMatch(MONEY);
    }
  });

  it('has no price or payment column in the schema', () => {
    expect(stripSqlComments(readFileSync(MIGRATION, 'utf8'))).not.toMatch(MONEY);
  });
});

describe('featured shelves: schema', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  const roleList = (name: string): string[] => {
    const start = sql.indexOf(name);
    const open = sql.indexOf('(', sql.indexOf('check', start));
    let depth = 0;
    let end = open;
    for (let i = open; i < sql.length; i += 1) {
      if (sql[i] === '(') depth += 1;
      if (sql[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    return (sql.slice(open, end).match(/'([a-z_]+)'/g) || []).map((raw) => raw.slice(1, -1));
  };

  it('lists the same roles in SQL as in TypeScript, on both tables', () => {
    for (const constraint of ['featured_profiles_role_check', 'on_the_rise_picks_role_check']) {
      expect([...roleList(constraint)].sort()).toEqual([...DIRECTORY_ROLES].sort());
    }
  });

  it('gives each table a select policy and no other policy, so every write is the service role', () => {
    const policies = stripSqlComments(sql).match(/create policy[\s\S]*?for (\w+)/g) || [];
    const kinds = policies.map((line) => line.slice(line.lastIndexOf(' ') + 1));
    expect(kinds).toEqual(['select', 'select']);
    expect(sql).toContain('alter table public.featured_profiles enable row level security');
    expect(sql).toContain('alter table public.on_the_rise_picks enable row level security');
  });

  it('refuses an unpublished profile in the database, not only in the route', () => {
    const guard = stripSqlComments(sql);
    expect(guard).toMatch(/before insert on public\.featured_profiles/);
    expect(guard).toMatch(/p\.status = 'claimed'/);
    expect(guard).toMatch(/p\.visibility <> 'private'/);
  });

  it('caps a role per quarter in the database at the same number as the code', () => {
    const match = stripSqlComments(sql).match(/\) >= (\d+) then/);
    expect(Number(match?.[1])).toBe(FEATURED_PER_ROLE);
  });

  it('allows one pick per person per role per quarter', () => {
    expect(sql).toMatch(/unique index[\s\S]*?featured_profiles_pick_key[\s\S]*?\(profile_id, role, starts_at\)/);
  });
});

describe('featured shelves: routes', () => {
  it('the shelves route checks the directory flag before it checks who is asking', () => {
    const source = stripTsComments(read('app/api/directory/shelves/route.ts'));
    const body = source.slice(source.indexOf('export async function GET'));
    expect(body.indexOf('isDirectoryFeatureEnabled')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('isDirectoryFeatureEnabled')).toBeLessThan(body.indexOf('requireActiveAuthenticatedUser'));
  });

  it('every admin method asks verifyAdmin before it reads or writes anything', () => {
    const source = stripTsComments(read('app/api/admin/featured/route.ts'));
    for (const method of ['GET', 'POST', 'DELETE']) {
      const start = source.indexOf(`export async function ${method}`);
      expect(start, method).toBeGreaterThanOrEqual(0);
      const next = source.indexOf('export async function', start + 10);
      const body = source.slice(start, next === -1 ? undefined : next);
      expect(body.indexOf('verifyAdmin(request)'), method).toBeGreaterThanOrEqual(0);
      expect(body.indexOf('verifyAdmin(request)'), method).toBeLessThan(body.search(/loadAdminFeatured|addFeatured|removeFeatured|request\.json/));
    }
  });

  it('the daily cron runs the monthly sweep', () => {
    const source = stripTsComments(read('app/api/cron/due-date-notifications/route.ts'));
    expect(source).toContain('runOnTheRiseSweep(adminClient)');
    expect(source).toMatch(/onTheRiseSweep,/);
  });

  it('the sweep only recomputes when the month changed, and never marks a month it skipped', () => {
    const source = stripTsComments(read('lib/featured-shelves-server.ts'));
    expect(source).toContain('shouldRecomputeRise');
    const gate = source.indexOf('hasEnoughHistory(earliestAt, now)');
    const mark = source.indexOf("key: RISE_MONTH_SETTING");
    expect(gate).toBeGreaterThan(0);
    expect(mark).toBeGreaterThan(gate);
  });
});

describe('featured shelves: the page', () => {
  it('shows the shelves only in the default view, never over search results', () => {
    const source = stripTsComments(read('app/dashboard/directory/DirectoryPageClient.tsx'));
    const shelf = source.indexOf('<DirectoryShelves');
    expect(shelf).toBeGreaterThan(0);
    expect(source.slice(source.lastIndexOf('isDefaultView ?', shelf), shelf)).toContain('isDefaultView ?');
    expect(source).toMatch(/const isDefaultView =[\s\S]*?filters\.query[\s\S]*?filters\.role[\s\S]*?filters\.city[\s\S]*?filters\.availability/);
  });

  it('never ranks the search results by the shelves', () => {
    const source = stripTsComments(read('app/dashboard/directory/DirectoryPageClient.tsx'));
    // activeFilters is the same filters plus the desktop Open to work switch (#1221).
    expect(source).toContain('applyDirectoryFilters(people, activeFilters)');
    expect(source).not.toMatch(/shelves\.(featured|onTheRise)[\s\S]{0,40}results/);
  });

  it('draws the Rising shelf only when it has somebody on it', () => {
    const source = stripTsComments(read('components/directory/DirectoryShelves.tsx'));
    expect(source).toContain('if (people.length === 0) return null');
  });

  it('puts featured people before rising ones, each once (URG-304: one Rising shelf)', () => {
    const source = stripTsComments(read('components/directory/DirectoryShelves.tsx'));
    expect(source).toContain('risingShelf(featured, onTheRise)');
    expect(stripTsComments(read('lib/directory-chips.ts'))).toContain('[...featured, ...onTheRise]');
  });
});

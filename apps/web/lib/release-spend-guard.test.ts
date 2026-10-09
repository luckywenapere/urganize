import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Release spend is money, and a comment cannot stop the next change quietly
// loosening who sees it, so this reads the real source.
//
//   1. WHO MAY SEE A COST IS ONE RULE, in SQL (can_view_release_spend). No
//      TypeScript file carries a second copy of it, and every spend route asks it.
//   2. ONE WRITER per table. release_spend is written by one module, which only
//      ever updates or deletes a MANUAL line, so a line Urganize added cannot be
//      changed from anywhere.
//   3. The question is asked once: the row is inserted (ignoring duplicates)
//      before anything is sent, and the credits sweep refuses a partial read.
//   4. The tables are select-only to a signed-in person.
//   5. No spend route can answer 402, which the browser turns into a redirect to
//      the paywall.

const APP_ROOT = join(__dirname, '..');
const REPO_ROOT = join(APP_ROOT, '..', '..');
const rel = (file: string): string => relative(APP_ROOT, file).split(sep).join('/');

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

function code(source: string): string {
  return source.replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
}

const files = [...collect(join(APP_ROOT, 'lib')), ...collect(join(APP_ROOT, 'app')), ...collect(join(APP_ROOT, 'components'))];
const sources = new Map(files.map((file) => [rel(file), code(readFileSync(file, 'utf8'))]));
const read = (file: string): string => {
  const source = sources.get(file);
  if (source === undefined) throw new Error(`${file} was not found by the scanner.`);
  return source;
};

const SPEND_SERVER = 'lib/release-spend-server.ts';
const SWEEPS = 'lib/release-spend-sweeps-server.ts';
const EXPORT_ROUTE = 'app/api/account/export/route.ts';

describe('the scanner itself', () => {
  it('walks the real tree', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(sources.has(SPEND_SERVER)).toBe(true);
    expect(sources.has(SWEEPS)).toBe(true);
  });

  it('strips comments, so prose naming a table cannot trip a rule', () => {
    expect(code("// 'release_spend'\nconst x = 1;")).not.toContain('release_spend');
    expect(code("const x = 'release_spend';")).toContain('release_spend');
  });
});

describe('who may see a cost is one rule, and it lives in SQL', () => {
  const spendFiles = [...sources.entries()].filter(
    ([file]) =>
      file.startsWith('app/api/releases/[releaseId]/spend/') || file.startsWith('app/api/spend/') || file === SPEND_SERVER
  );

  it('finds the spend routes and the server module', () => {
    expect(spendFiles.length).toBeGreaterThanOrEqual(6);
  });

  it('keeps a second copy of the rule out of TypeScript: no role or membership checks in the spend files', () => {
    for (const [file, source] of spendFiles) {
      expect(source, file).not.toMatch(/workspace_members/);
      expect(source, file).not.toMatch(/['"](admin|owner)['"]\s*[,)\]]/);
    }
  });

  it('asks the database function by name, with the signed-in person and nobody else', () => {
    const source = read(SPEND_SERVER);
    expect(source).toContain("'can_view_release_spend'");
    expect(source).toContain("'release_spend_by_category'");
  });

  it('has every route behind the visibility check (or the summary, which asks for the signed-in person only)', () => {
    const routes = [...sources.entries()].filter(
      ([file]) => /^app\/api\/releases\/\[releaseId\]\/spend\/.*route\.ts$/.test(file)
    );
    expect(routes.length).toBe(3);
    for (const [file, source] of routes) {
      expect(source, file).toMatch(/canViewReleaseSpend\(|loadSpendPayload\(/);
    }
    expect(read('app/api/spend/summary/route.ts')).toContain('loadSpendSummary(');
  });

  it('never answers 402 from a spend route, which the browser would turn into a redirect to the paywall', () => {
    for (const [file, source] of spendFiles) {
      if (file === SPEND_SERVER) continue;
      expect(source, file).not.toMatch(/status:\s*402/);
      expect(source, file).not.toMatch(/\b402\b/);
    }
  });

  it('fails closed: a visibility answer that cannot be read stops the route', () => {
    const source = read(SPEND_SERVER);
    expect(source).toMatch(/canView === null\) return null/);
  });
});

describe('one writer per table', () => {
  const mentioning = (needle: string): string[] =>
    [...sources.entries()]
      .filter(([, source]) => source.includes(needle))
      .map(([file]) => file)
      .sort();

  it('lets only the spend server (and the export, which reads) name release_spend', () => {
    expect(mentioning("'release_spend'")).toEqual([EXPORT_ROUTE, SPEND_SERVER].sort());
  });

  it('lets the spend server and the payback sweep name release_payback, and the export read it', () => {
    expect(mentioning("'release_payback'")).toEqual([EXPORT_ROUTE, SPEND_SERVER, SWEEPS].sort());
  });

  it('keeps the export to reading', () => {
    const source = read(EXPORT_ROUTE);
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
  });

  it('only ever updates or deletes a manual line, so a line Urganize added cannot be changed', () => {
    const source = read(SPEND_SERVER);
    const statements = source
      .split('.from(SPEND_TABLE)')
      .slice(1)
      .map((rest) => rest.slice(0, rest.indexOf(';')))
      .filter((statement) => /\.(update|delete)\s*\(/.test(statement));
    expect(statements.length).toBeGreaterThanOrEqual(2);
    for (const statement of statements) {
      expect(statement).toContain(".eq('source', 'manual')");
    }
  });

  it('never deletes or updates a payback row from the sweep', () => {
    expect(read(SWEEPS)).not.toMatch(/\.(update|delete)\s*\(/);
  });
});

describe('the payback question is asked once', () => {
  const source = read(SWEEPS);

  it('inserts ignoring duplicates, so only a row that was really inserted is asked', () => {
    expect(source).toMatch(/ignoreDuplicates:\s*true/);
    expect(source).toMatch(/onConflict:\s*'release_id'/);
  });

  it('records the question before anything is sent', () => {
    const recorded = source.indexOf('.upsert(');
    const sent = source.indexOf('await notifyPaybackQuestion(');
    expect(recorded).toBeGreaterThan(-1);
    expect(sent).toBeGreaterThan(recorded);
  });

  it('only asks a rollout whose window is open, in Lagos days', () => {
    expect(source).toContain("paybackWindow(release.release_date, now) === 'open'");
  });
});

describe('the credits sweep does not overwrite a right total with a partial one', () => {
  const source = read(SWEEPS);

  it('writes nothing after a failed or capped read', () => {
    const truncated = source.indexOf('usage.source.truncated');
    const unreadable = source.indexOf("usage.source.status !== 'ok'");
    const write = source.indexOf('upsertUrganizeSpendLines(admin');
    expect(truncated).toBeGreaterThan(-1);
    expect(unreadable).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(truncated);
    expect(write).toBeGreaterThan(unreadable);
  });

  it('leaves a throwaway rollout\'s credits out', () => {
    expect(source).toContain('readTestRelease(');
  });
});

describe('both sweeps ride the morning cron', () => {
  it('is called from the 07:00 UTC route, after the other passengers and never first', () => {
    const cron = read('app/api/cron/due-date-notifications/route.ts');
    expect(cron).toContain('runSpendCreditsSweep(');
    expect(cron).toContain('runPaybackQuestionSweep(');
    expect(cron.indexOf('runSpendCreditsSweep(')).toBeLessThan(cron.indexOf('runPaybackQuestionSweep('));
    expect(cron.indexOf('runEditorialPitchReminderSweep(')).toBeLessThan(cron.indexOf('runSpendCreditsSweep('));
  });
});

describe('the migration', () => {
  const migration = readFileSync(join(REPO_ROOT, 'supabase', 'migrations', '20261009120000_release_spend.sql'), 'utf8');
  const sql = migration.replace(/--.*$/gm, '');

  it('turns row level security on for both tables', () => {
    expect(sql).toMatch(/alter table public\.release_spend enable row level security/);
    expect(sql).toMatch(/alter table public\.release_payback enable row level security/);
  });

  it('gives a signed-in person select and nothing else: no insert, update, delete or all policy', () => {
    const policies = [...sql.matchAll(/create policy[\s\S]*?on public\.(release_spend|release_payback)\s+for\s+(\w+)/gi)];
    expect(policies.length).toBe(2);
    for (const policy of policies) expect(policy[2].toLowerCase(), policy[1]).toBe('select');
  });

  it('defines the visibility rule once, as a security definer function that pins its search path', () => {
    expect(sql.match(/create or replace function public\.can_view_release_spend/g)?.length).toBe(1);
    expect(sql).toMatch(/can_view_release_spend[\s\S]*?security definer[\s\S]*?set search_path = public, pg_temp/);
  });

  it('uses that one function in both policies and in the Home card\'s function', () => {
    expect(sql.match(/public\.can_view_release_spend\(/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps amounts as integer kobo and refuses a line that is not above zero', () => {
    expect(sql).toMatch(/amount_kobo bigint not null/);
    expect(sql).toMatch(/check \(amount_kobo > 0/);
  });

  it('has a plain unique index on the dedupe key, which an upsert can name', () => {
    expect(sql).toMatch(/create unique index if not exists release_spend_dedupe_key_unique_idx\s+on public\.release_spend \(dedupe_key\);/);
  });

  it('allows an automatic line only with a key, so it cannot be written twice', () => {
    expect(sql).toMatch(/check \(source = 'manual' or dedupe_key is not null\)/);
  });
});

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// The rules that make a credits ledger trustworthy are about what the code can
// NOT do, and a comment cannot stop the next person doing it. This reads the
// real source, so a new file that breaks a rule fails too. Modelled on
// lib/chappi/conversation-history-guard.test.ts.
//
//   1. The ledger is append-only: nothing updates, upserts or deletes a row.
//      Corrections are new rows, which is what makes the balance auditable.
//   2. The money maths is pure: pricing, allowance, prices, copy and config
//      import nothing from the server side, so they can be tested without
//      mocks and cannot reach a database by accident.
//   3. There is one source of prices. pricing.ts is the only reader of the
//      table, so a charge cannot be worked out two different ways.
//   4. Only the chat route charges, and only after the confirmation branch has
//      returned: approving a card must never cost a user credits.
//   5. The table has row level security and no policies, and a unique key that
//      makes a charge happen at most once.

const APP_ROOT = join(__dirname, '..', '..');
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

/** Source without comments, so prose that names a forbidden thing cannot trip a rule and a mention cannot satisfy one. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = [...collect(join(APP_ROOT, 'lib')), ...collect(join(APP_ROOT, 'app')), ...collect(join(APP_ROOT, 'components'))];
const sources = new Map(files.map((file) => [rel(file), code(readFileSync(file, 'utf8'))]));

describe('the scanner itself', () => {
  it('walks the real tree, and strips comments but not code', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(sources.has('lib/credits/credits-server.ts')).toBe(true);
    expect(code("a(); // x.update(\n/* .delete( */ b();")).not.toMatch(/update|delete/);
    expect(code("const u = 'https://x.test/y'; z();")).toContain('https://x.test/y');
  });
});

describe('the ledger is append-only', () => {
  const writers = ['lib/credits/credits-server.ts', 'app/api/admin/credits/route.ts'];

  it('never updates, upserts or deletes a ledger row', () => {
    for (const file of writers) {
      const source = sources.get(file) ?? '';
      expect(source, file).not.toMatch(/\.(update|upsert|delete)\s*\(/);
    }
  });

  it('only ever inserts into it, and only inside credits-server.ts and a read in the admin route', () => {
    const offenders = [...sources]
      .filter(([, source]) => /from\(\s*['"`]credit_ledger['"`]\s*\)/.test(source) || /\bTABLE\b.*credit_ledger/.test(source))
      .map(([file]) => file)
      .filter((file) => !writers.includes(file));
    expect(offenders).toEqual([]);
  });

  it('really does insert (so the rule above is checking something)', () => {
    expect(sources.get('lib/credits/credits-server.ts')).toMatch(/\.insert\s*\(/);
  });
});

describe('the money maths is pure', () => {
  const pure = ['pricing', 'allowance', 'model-prices', 'copy', 'config', 'embedded', 'packs', 'purchase'];

  it('imports only its own siblings', () => {
    for (const name of pure) {
      const imports = [...(sources.get(`lib/credits/${name}.ts`) ?? '').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of imports) expect(spec, `${name} imports ${spec}`).toMatch(/^\.\//);
    }
  });

  it('reads no environment except the one flag, in config.ts', () => {
    for (const name of pure.filter((n) => n !== 'config')) {
      expect(sources.get(`lib/credits/${name}.ts`), name).not.toMatch(/process\.env/);
    }
  });
});

describe('there is one source of prices', () => {
  it('lets only pricing.ts read the price table', () => {
    const readers = [...sources]
      .filter(([, source]) => /from\s+['"](\.\/model-prices|@\/lib\/credits\/model-prices)['"]/.test(source))
      .map(([file]) => file);
    expect(readers).toEqual(['lib/credits/pricing.ts']);
  });
});

describe('only the chat route charges, and only after the confirmation branch', () => {
  const route = sources.get('app/api/urgans/route.ts') ?? '';

  it('is the only place outside the credits module that settles a turn', () => {
    const callers = [...sources]
      .filter(([file, source]) => !file.startsWith('lib/credits/') && /\bsettleTurn\s*\(/.test(source))
      .map(([file]) => file);
    expect(callers).toEqual(['app/api/urgans/route.ts']);
  });

  it('reads and charges credits only after the approve path has returned', () => {
    const approve = route.indexOf('closeConfirmedAction(');
    expect(approve).toBeGreaterThan(0);
    expect(route.indexOf('getCreditSnapshot(')).toBeGreaterThan(approve);
    expect(route.indexOf('settleTurn(')).toBeGreaterThan(approve);
  });

  it('charges after the turn ran, not before, so a failure is never charged', () => {
    expect(route.indexOf('settleTurn(')).toBeGreaterThan(route.indexOf('runChappiAgent('));
  });

  it('reads the flag through isCreditsEnabled, not from the environment by hand', () => {
    expect(route).toMatch(/isCreditsEnabled\(\)/);
    expect(route).not.toMatch(/NEXT_PUBLIC_FEATURE_URGANS_CREDITS/);
  });

  it('keeps the old ceiling for the flag-off path', () => {
    expect(route).toMatch(/!creditsOn\s*&&/);
    expect(route).toMatch(/checkUrgansAllowance\(/);
  });
});

describe('every door onto an embedded action is metered, and only after it succeeded', () => {
  const doors = ['lib/urgans-actions/server.ts', 'app/api/releases/[releaseId]/plan/route.ts'];

  it('is the only place outside the credits module that holds or settles a run', () => {
    const callers = [...sources]
      .filter(([file, source]) => !file.startsWith('lib/credits/') && /\b(beginEmbeddedRun|settleEmbeddedRun)\s*\(/.test(source))
      .map(([file]) => file)
      .sort();
    expect(callers).toEqual([...doors].sort());
  });

  it('holds before the run and settles after it, in both doors', () => {
    const run: Record<string, string> = {
      'lib/urgans-actions/server.ts': 'action.execute(',
      'app/api/releases/[releaseId]/plan/route.ts': 'createReleasePlan(',
    };
    for (const door of doors) {
      const source = sources.get(door) ?? '';
      const ran = source.indexOf(run[door]);
      expect(ran, door).toBeGreaterThan(0);
      expect(source.indexOf('beginEmbeddedRun('), door).toBeGreaterThan(0);
      expect(source.indexOf('beginEmbeddedRun('), door).toBeLessThan(ran);
      expect(source.indexOf('settleEmbeddedRun('), door).toBeGreaterThan(ran);
    }
  });

  it('refuses with 429 and never 402, which the browser turns into a redirect to the paywall', () => {
    for (const door of doors) {
      const source = sources.get(door) ?? '';
      const refusal = source.slice(source.indexOf('gate.metered && !gate.ok'));
      expect(refusal.slice(0, 300), door).toMatch(/429/);
      expect(refusal.slice(0, 300), door).not.toMatch(/402/);
    }
  });

  it('keeps the monthly action meter out of it, as for any embedded action', () => {
    expect(sources.get('lib/credits/embedded-server.ts')).not.toMatch(/urgans_action'/);
  });
});

describe('nothing sells credits yet', () => {
  it('keeps the naira rates inside the credits module, so no checkout can quietly use them', () => {
    const users = [...sources]
      .filter(([file, source]) => !file.startsWith('lib/credits/') && /NAIRA_PER_CREDIT|topupNairaPerCredit/.test(source))
      .map(([file]) => file);
    expect(users).toEqual([]);
  });

  it('keeps the buy wording behind the purchase switch', () => {
    expect(sources.get('lib/credits/copy.ts')).toMatch(/isCreditsPurchasable\(\)/);
    expect(sources.get('lib/credits/copy.ts')).not.toMatch(/=\s*true/);
  });

  it('writes a purchase row in exactly one place, keyed on the reference', () => {
    const server = sources.get('lib/credits/credits-server.ts') ?? '';
    expect(server.match(/kind:\s*'topup'/g) ?? []).toHaveLength(1);
    expect(server).toMatch(/dedupe_key:\s*purchaseDedupeKey\(/);
  });

  it('lets only the purchase settler call creditPurchase', () => {
    const callers = [...sources]
      .filter(([file, source]) => file !== 'lib/credits/credits-server.ts' && /\bcreditPurchase\s*\(/.test(source))
      .map(([file]) => file);
    expect(callers).toEqual(['lib/credits/purchase-server.ts']);
  });

  it('credits only after Paystack has confirmed, never on a webhook body alone', () => {
    const settle = sources.get('lib/credits/purchase-server.ts') ?? '';
    expect(settle).toMatch(/verifyPaystackTransaction\(/);
    expect(settle.indexOf('verifyPaystackTransaction(')).toBeLessThan(settle.indexOf('creditPurchase('));
    expect(settle.indexOf('checkPurchase(')).toBeLessThan(settle.indexOf('creditPurchase('));
  });
});

describe('credits are tagged and never expire', () => {
  it('writes only the three sources, and never a window on a spend', () => {
    const server = sources.get('lib/credits/credits-server.ts') ?? '';
    const pools = [...server.matchAll(/pool:\s*'([a-z]+)'/g)].map((m) => m[1]);
    expect(new Set(pools)).toEqual(new Set(['allowance', 'trial', 'topup']));
    const spend = server.slice(server.indexOf("kind: 'spend'") - 400, server.indexOf("kind: 'spend'") + 400);
    expect(spend).not.toMatch(/window_start/);
  });

  it('removes credits in one place, only from the trial source, and only through the guarded helper', () => {
    const server = sources.get('lib/credits/credits-server.ts') ?? '';
    expect([...server.matchAll(/kind:\s*'expire'/g)]).toHaveLength(1);
    const expire = server.slice(server.indexOf("kind: 'expire'") - 200, server.indexOf("kind: 'expire'") + 100);
    expect(expire).toMatch(/pool:\s*'trial'/);
    // The only caller sits behind the purchase check.
    expect(server).toMatch(/!purchased\s*&&[^;]*expireTrialCredits\(/);
  });
});

describe('the table', () => {
  const dir = join(APP_ROOT, '..', '..', 'supabase', 'migrations');
  const strip = (name: string): string => readFileSync(join(dir, name), 'utf8').replace(/--.*$/gm, '');
  const base = strip('20261001120000_credit_ledger.sql');
  const sources_ = strip('20261001130000_credit_ledger_sources.sql');

  it('has row level security and no policy for anyone', () => {
    expect(base).toMatch(/alter table public\.credit_ledger enable row level security/i);
    expect(`${base}\n${sources_}`).not.toMatch(/create policy/i);
  });

  it('refuses a charge delivered twice, by a unique key', () => {
    expect(base).toMatch(/create unique index[^;]*credit_ledger_dedupe_key[^;]*\(dedupe_key\)[^;]*where dedupe_key is not null/i);
  });

  it('keeps the balance function to the service role', () => {
    expect(sources_).toMatch(/revoke all on function public\.credit_balances[^;]*from public/i);
    expect(sources_).toMatch(/grant execute on function public\.credit_balances[^;]*to service_role/i);
  });

  it('never allows a zero movement', () => {
    expect(base).toMatch(/credits <> 0/);
  });

  it('knows the three sources and the two new kinds', () => {
    expect(sources_).toMatch(/pool in \('trial', 'allowance', 'topup'\)/);
    expect(sources_).toMatch(/kind in \('trial', 'allowance', 'topup', 'spend', 'adjust', 'refund', 'expire'\)/);
  });

  it('lets a window sit on an allowance row alone, and no longer ties the balance to one', () => {
    expect(sources_).toMatch(/drop constraint if exists credit_ledger_window_matches_pool/i);
    expect(sources_).toMatch(/check \(pool = 'allowance' or window_start is null\)/);
  });

  it('sums every source across all time, with no window argument', () => {
    expect(sources_).toMatch(/function public\.credit_balances\(p_workspace uuid\)/i);
    expect(sources_).toMatch(/drop function if exists public\.credit_balances\(uuid, date\)/i);
    const body = sources_.slice(sources_.indexOf('create or replace function'), sources_.indexOf('revoke all'));
    expect(body).not.toMatch(/window_start/);
  });
});

describe('the balance replaces the daily embedded-action guard', () => {
  const runner = sources.get('lib/urgans-actions/server.ts') ?? '';

  it('only applies the daily cap when credits are off', () => {
    // The cap is the credit-less world's brake; with credits on, a team that has
    // paid for more must not be refused by a blanket count.
    expect(runner).toMatch(/!isCreditsEnabled\(\)[\s\S]{0,80}checkEmbeddedActionsGuard\(/);
  });

  it('still has the guard to apply when credits are off', () => {
    expect(runner).toMatch(/checkEmbeddedActionsGuard\(/);
  });
});

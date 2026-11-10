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
  // Line comments FIRST: a `/*` inside one (a path like `admin/*` in a comment) would otherwise open a
  // "block comment" that swallows real code up to the next `*/`, which hid a call site from this guard.
  return source.replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
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
  // Reads the provider cost on spend rows for the usage dashboard (/admin/metrics,
  // 2026-10-07) when the AI usage log is not there. Reading only, held below.
  // The founder cockpit's UrgAns panel (/admin, 2026-10-09) reads spends and
  // refunds for credits spent per week. Reading only, held below.
  // The billing margin view (/admin/billing, 2026-10-22) reads this month's
  // spends and refunds per team to cost their credits. Reading only.
  const readers = ['lib/usage-metrics-server.ts', 'lib/admin-urgans-usage-server.ts', 'lib/billing-margin-server.ts'];

  it('lets the readers only read', () => {
    for (const file of readers) {
      const source = sources.get(file) ?? '';
      expect(source, file).toMatch(/from\(\s*['"`]credit_ledger['"`]\s*\)/);
      expect(source, file).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
    }
  });

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
      .filter((file) => !writers.includes(file) && !readers.includes(file));
    expect(offenders).toEqual([]);
  });

  it('really does insert (so the rule above is checking something)', () => {
    expect(sources.get('lib/credits/credits-server.ts')).toMatch(/\.insert\s*\(/);
  });
});

describe('the money maths is pure', () => {
  const pure = ['pricing', 'allowance', 'model-prices', 'copy', 'config', 'embedded', 'packs', 'purchase', 'urgans-admission'];

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

  it('charges voice minutes from one place, the voice server module (2026-10-11)', () => {
    const callers = [...sources]
      .filter(([file, source]) => !file.startsWith('lib/credits/') && /\bsettleVoiceMinutes\s*\(/.test(source))
      .map(([file]) => file);
    expect(callers).toEqual(['lib/urgans-voice-realtime-server.ts']);
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
  // The plan route's build moved into lib/release-plan-build-server.ts (2026-10-17),
  // shared with the onboarding auto build.
  // Planner v2's preview (2026-10-26) is the third: same hold and settle.
  const doors = ['lib/urgans-actions/server.ts', 'lib/release-plan-build-server.ts', 'lib/planner-v2/server.ts'];

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
      'lib/release-plan-build-server.ts': 'createReleasePlan(admin',
      'lib/planner-v2/server.ts': 'await writePlanV2(',
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

  it('lets only the two purchase settlers call creditPurchase (Paystack, and Bachs for dollar packs since #1120)', () => {
    const callers = [...sources]
      .filter(([file, source]) => file !== 'lib/credits/credits-server.ts' && /\bcreditPurchase\s*\(/.test(source))
      .map(([file]) => file);
    expect(callers.sort()).toEqual(['lib/bachs-server.ts', 'lib/credits/purchase-server.ts']);
  });

  it('credits a Bachs pack only after Bachs has confirmed the dollar amount and the row is claimed', () => {
    const bachs = sources.get('lib/bachs-server.ts') ?? '';
    expect(bachs.indexOf('remoteCheckoutIsPaid(')).toBeGreaterThan(-1);
    expect(bachs.indexOf('remoteCheckoutIsPaid(')).toBeLessThan(bachs.indexOf('creditPurchase('));
    expect(bachs.indexOf(".eq('status', 'open')")).toBeLessThan(bachs.indexOf('creditPurchase('));
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

  it('removes credits in two places only, each behind a purchase check', () => {
    const server = sources.get('lib/credits/credits-server.ts') ?? '';
    // The leftover trial (2026-10-01) and the removed Free plan's grants
    // (2026-11-09). Anything else that takes credits away is a new rule.
    const at = [...server.matchAll(/kind:\s*'expire'/g)].map((m) => m.index ?? 0);
    expect(at).toHaveLength(2);
    const near = at.map((i) => server.slice(i - 200, i + 200));
    expect(near.filter((text) => /pool:\s*'trial'/.test(text))).toHaveLength(1);
    expect(near.filter((text) => /pool:\s*'allowance'[\s\S]*free_plan/.test(text))).toHaveLength(1);
    // The trial removal's only caller sits behind the purchase check.
    expect(server).toMatch(/!purchased\s*&&[^;]*expireTrialCredits\(/);
    // The Free removal checks for a purchase itself.
    const free = server.slice(server.indexOf('export async function expireFreePlanAllowance'));
    expect(free.slice(0, free.indexOf("kind: 'expire'"))).toMatch(/if \(await hasEverPurchased\(client, input\)\) return 0;/);
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

describe('a credits-only team can use AI, and only AI', () => {
  const urgansRoutes = [...sources.keys()].filter((file) => /^app\/api\/urgans\/.*route\.ts$/.test(file));
  const access = sources.get('app/api/_shared/urgans-access.ts') ?? '';
  const gate = sources.get('app/api/_shared/auth.ts') ?? '';
  const chat = sources.get('app/api/urgans/route.ts') ?? '';

  it('finds the AI routes it is about to check', () => {
    expect(urgansRoutes.length).toBeGreaterThanOrEqual(8);
  });

  it('puts every AI route behind the AI gate, and none behind the plain paywalled ones', () => {
    // The voice routes (2026-10-11) open the same gate through their shared
    // openVoiceGate, which checks the voice flag first.
    const voiceGate = sources.get('app/api/urgans/voice/_shared.ts') ?? '';
    expect(voiceGate).toMatch(/requireUrgansAccess\(request\)/);
    for (const file of urgansRoutes) {
      const source = sources.get(file) ?? '';
      expect(source, file).toMatch(file.startsWith('app/api/urgans/voice/') ? /openVoiceGate\(request\)/ : /requireUrgansAccess/);
      expect(source, file).not.toMatch(/requireAuthenticatedAdmin|requireActiveAuthenticatedUser|requireActiveAccount/);
    }
  });

  it('keeps the admission to AI: no other route imports the AI gate', () => {
    const users = [...sources]
      .filter(([file, source]) => /requireUrgansAccess/.test(source) && !file.startsWith('app/api/urgans/') && file !== 'app/api/_shared/urgans-access.ts')
      .map(([file]) => file);
    expect(users).toEqual([]);
  });

  it('looks only at the paywall refusals, before it reads anything else', () => {
    expect(access).toMatch(/READ_ONLY_REFUSAL_CODE/);
    expect(access.indexOf('isPaywallRefusal(')).toBeGreaterThan(-1);
    expect(access.indexOf('isPaywallRefusal(')).toBeLessThan(access.indexOf('getAuthenticatedUser('));
    expect(access.indexOf('getAuthenticatedUser(')).toBeLessThan(access.indexOf('getTeamAccessForUser('));
  });

  it('is switched off with credits, and keeps the curator block', () => {
    expect(access).toMatch(/isCreditsEnabled\(\)/);
    expect(access).toMatch(/blockCuratorAccount\(/);
  });

  it('mints a pass in the chat route only, and only for a funded credits-only team', () => {
    const minters = [...sources]
      .filter(([file, source]) => file !== 'lib/urgans-pass-server.ts' && /\bmintPassForUser\s*\(/.test(source))
      .map(([file]) => file);
    expect(minters).toEqual(['app/api/urgans/route.ts']);
    expect(chat).toMatch(/auth\.creditsOnly\?\.funded\s*\?\s*\{\s*urgansPass:\s*mintPassForUser\(/);
  });

  it('honours a pass in one place: the paywalled gate, after the curator block, around the paywall check alone', () => {
    const readers = [...sources]
      .filter(([file, source]) => file !== 'lib/urgans-pass-server.ts' && /\brequestHasUrgansPass\s*\(/.test(source))
      .map(([file]) => file);
    expect(readers).toEqual(['app/api/_shared/auth.ts']);

    const fn = gate.slice(gate.indexOf('export async function requireActiveAuthenticatedUser('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body.indexOf('blockCuratorAccount(')).toBeGreaterThan(-1);
    expect(body.indexOf('blockCuratorAccount(')).toBeLessThan(body.indexOf('requestHasUrgansPass('));
    expect(body).toMatch(/if\s*\(!requestHasUrgansPass\([^)]*\)\)\s*\{\s*const block = await requireActiveAccount\(/);
  });

  it('puts the pass on outgoing calls in one place, and only when the turn has one', () => {
    const senders = [...sources]
      .filter(([file, source]) => !/urgans-pass(-header)?\.ts$/.test(file) && /URGANS_PASS_HEADER/.test(source))
      .map(([file]) => file)
      .sort();
    expect(senders).toEqual(['lib/chappi/tool-families/shared.ts', 'lib/urgans-pass-server.ts']);
    expect(sources.get('lib/chappi/tool-families/shared.ts')).toMatch(/ctx\.urgansPass\s*\?/);
  });

  it('keeps the signing code and the admission rules free of the database and the request', () => {
    const admission = sources.get('lib/credits/urgans-admission.ts') ?? '';
    for (const spec of [...admission.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])) {
      expect(spec).toMatch(/^\.\//);
    }
    expect(sources.get('lib/urgans-pass.ts')).not.toMatch(/process\.env|supabase|NextRequest/);
  });
});

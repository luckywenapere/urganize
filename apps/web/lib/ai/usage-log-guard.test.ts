import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AI_USAGE_FEATURES } from './usage-log';

// The AI usage log is only worth having if nothing quietly stops feeding it. A
// comment cannot stop the next person adding a model call that is never recorded,
// so this reads the real source, in the style of lib/credits/credits-server's
// guard.
//
//   1. One writer: only usage-log-server.ts touches the table, so every row goes
//      through the code that never throws and ignores duplicates.
//   2. Every route or action that calls the routed AI functions reports failed
//      attempts (onFailure), because a failed call may still have been billed.
//   3. Every feature the log knows has a place that records it.
//   4. The chat's ledger charge and its usage rows share one request id.
//   5. The table has row level security, no policies and a unique key.

const APP_ROOT = join(__dirname, '..', '..');
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

/** Source without comments, so prose that names a thing cannot trip a rule and a mention cannot satisfy one. */
function code(source: string): string {
  return source.replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
}

const files = [...collect(join(APP_ROOT, 'lib')), ...collect(join(APP_ROOT, 'app')), ...collect(join(APP_ROOT, 'components'))];
const sources = new Map(files.map((file) => [rel(file), code(readFileSync(file, 'utf8'))]));

describe('the scanner itself', () => {
  it('walks the real tree', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(sources.has('lib/ai/usage-log-server.ts')).toBe(true);
  });
});

describe('one writer', () => {
  it('lets only usage-log-server.ts write the ai_usage_events table, and the usage dashboard and the release spend sweep read it', () => {
    const touching = [...sources.entries()].filter(([, source]) => source.includes('ai_usage_events')).map(([file]) => file);
    expect(touching.sort()).toEqual([
      'lib/ai/usage-log-server.ts',
      'lib/release-spend-sweeps-server.ts',
      'lib/usage-metrics-server.ts',
    ]);
  });

  it('keeps the usage dashboard (/admin/metrics) to reading', () => {
    const source = sources.get('lib/usage-metrics-server.ts') ?? '';
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
  });

  it('keeps the release spend sweep to reading the usage log', () => {
    const source = sources.get('lib/release-spend-sweeps-server.ts') ?? '';
    expect(source).toContain('ai_usage_events');
    // Its upserts write release_payback (here) and release_spend (through the
    // spend server), never the usage table, and it has no insert, update or
    // delete of its own.
    expect(source).not.toMatch(/\.(insert|update|delete)\s*\(/);
    expect(source).not.toMatch(/from\(USAGE_TABLE\)[\s\S]{0,200}\.(upsert|insert|update|delete)\s*\(/);
  });

  it('never updates or deletes a usage row, so a corrected figure is a new row', () => {
    const source = sources.get('lib/ai/usage-log-server.ts') ?? '';
    expect(source).not.toMatch(/\.(update|delete)\s*\(/);
  });

  it('never throws out of the writer', () => {
    const source = sources.get('lib/ai/usage-log-server.ts') ?? '';
    expect(source).not.toMatch(/\bthrow\b/);
  });
});

describe('failed attempts are reported', () => {
  const callers = [...sources.entries()].filter(
    ([file, source]) =>
      file !== 'lib/ai/routed.ts' && /\bgenerateRouted(StructuredOutput|PlainText)\s*[<(]/.test(source)
  );

  it('finds the routed AI callers', () => {
    expect(callers.length).toBeGreaterThanOrEqual(5);
  });

  it('has every caller pass onFailure', () => {
    for (const [file, source] of callers) {
      expect(source, `${file} calls the routed AI without reporting failed attempts`).toMatch(/\bonFailure\b/);
    }
  });
});

describe('every feature is recorded somewhere', () => {
  for (const feature of AI_USAGE_FEATURES) {
    it(`has a place that records "${feature}"`, () => {
      const pattern = new RegExp(String.raw`(feature\s*:\s*|:\s*)'${feature}'`);
      const places = [...sources.entries()]
        .filter(([file]) => file !== 'lib/ai/usage-log.ts')
        .filter(([, source]) => pattern.test(source))
        .map(([file]) => file);
      expect(places.length, `no source records the "${feature}" feature`).toBeGreaterThan(0);
    });
  }
});

describe('the chat charge and its usage rows share one request id', () => {
  const route = sources.get('app/api/urgans/route.ts') ?? '';

  it('writes the usage rows for a successful turn and for a failed one', () => {
    expect(route).toContain('recordRequestUsage');
    expect(route.match(/recordRequestUsage\(/g)?.length).toBe(2);
    expect(route).toContain('usageFromError');
  });

  it('charges the turn under the same id it logged it under, not a fresh one', () => {
    expect(route).not.toMatch(/requestId:\s*randomUUID\(\)/);
    expect(route).toMatch(/const requestId = randomUUID\(\)/);
    expect(route).toMatch(/settleTurn\([\s\S]*?\brequestId,/);
  });

  it('records a failed turn as not charged', () => {
    expect(route).toMatch(/creditsCharged:\s*0/);
  });
});

describe('the table', () => {
  const migration = readFileSync(join(REPO_ROOT, 'supabase', 'migrations', '20261003120000_ai_usage_events.sql'), 'utf8');

  it('has row level security and no policies: every read and write is a service-role route', () => {
    expect(migration).toMatch(/alter table public\.ai_usage_events enable row level security/);
    expect(migration).not.toMatch(/create policy/i);
  });

  it('is unique on (request id, call index), so recording a request twice records it once', () => {
    expect(migration).toMatch(/unique \(request_id, call_index\)/);
  });

  it('keeps a failed call free of tokens and cost, so unknown never reads as zero', () => {
    expect(migration).toMatch(/status = 'failed' and tokens_in is null and tokens_out is null and cost_rodi is null/);
  });

  it('has no foreign key on release_id, so the cost of a deleted release is kept', () => {
    const line = migration.split('\n').find((l) => /^\s*release_id\s/.test(l)) ?? '';
    expect(line).not.toMatch(/references/i);
  });

  it('reads through views that apply the caller\'s row level security', () => {
    expect(migration.match(/with \(security_invoker = true\)/g)?.length).toBe(2);
  });
});

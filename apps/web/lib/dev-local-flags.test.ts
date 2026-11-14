import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { isCreditsEnabled } from './credits/config';

/**
 * The local test environment (`pnpm dev:local`, scripts/dev-local.mjs) switches
 * on every flag the code reads as `=== 'true'` by scanning apps/web. The credits
 * flag is read through a helper that trims and lowercases first, so the scan
 * never saw it, the credits system stayed off locally, and anything paid for in
 * credits could not be tested without a hand edit (#1271, found while testing
 * the AI's playlist pitching, #1267).
 *
 * dev-local.mjs cannot be imported here (it starts a server), so this reads its
 * source for the named list and checks the app really reads that flag.
 */

const script = readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'dev-local.mjs'), 'utf8');

/** The names inside `const <name> = new Set([ ... ]);`. */
function listed(name: string): string[] {
  const block = script.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  return block ? [...block[1].matchAll(/'(NEXT_PUBLIC_FEATURE_[A-Z0-9_]+)'/g)].map((match) => match[1]) : [];
}

describe('dev-local feature flags', () => {
  it('switches the credits flag on, since the scan cannot see it', () => {
    expect(listed('FLAGS_ON')).toContain('NEXT_PUBLIC_FEATURE_URGANS_CREDITS');
  });

  it('does not list a flag as both on and off', () => {
    const off = new Set(listed('FLAGS_OFF'));
    expect(listed('FLAGS_ON').filter((flag) => off.has(flag))).toEqual([]);
  });

  it('applies the list after the scan, so the scan cannot undo it', () => {
    expect(script.indexOf('FLAGS_ON')).toBeGreaterThan(-1);
    const scanLoop = script.indexOf('scanFlags(join(WEB, dir)');
    const apply = script.search(/for \(const flag of FLAGS_ON\)/);
    expect(scanLoop).toBeGreaterThan(-1);
    expect(apply).toBeGreaterThan(scanLoop);
  });

  it('is the flag the app really reads for credits', () => {
    expect(isCreditsEnabled({ NEXT_PUBLIC_FEATURE_URGANS_CREDITS: 'true' })).toBe(true);
    expect(isCreditsEnabled({ NEXT_PUBLIC_FEATURE_URGANS_CREDITS: undefined })).toBe(false);
  });
});

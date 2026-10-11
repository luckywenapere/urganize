import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { describe, expect, it } from 'vitest';
import { DISTRIBUTION_PARTNER } from './distribution';
import { FAN_PAYMENTS_PARTNER } from './fan-payments';

const WEB = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '.next') return [];
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sources = ['app', 'components', 'lib', 'stores']
  .flatMap((dir) => walk(join(WEB, dir)))
  .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path));

const rel = (path: string) => relative(WEB, path).split(sep).join('/');

describe('the fan payments partner', () => {
  it('is Fanlly, with our referral link to their creator sign-up', () => {
    expect(FAN_PAYMENTS_PARTNER.name).toBe('Fanlly');
    expect(FAN_PAYMENTS_PARTNER.signupUrl).toBe('https://creator.fanlly.co/?ref=7E6MUWD');
    expect(FAN_PAYMENTS_PARTNER.creatorSharePercent).toBe(75);
  });

  it('is never the distributor', () => {
    expect(FAN_PAYMENTS_PARTNER.name).not.toBe(DISTRIBUTION_PARTNER.name);
    expect(DISTRIBUTION_PARTNER.signupUrl).not.toMatch(/fanlly/i);
  });
});

describe('one referral link, in one place', () => {
  // A second copy of the link is how a stale or wrong referral code ships, so
  // the code and the host may appear in lib/fan-payments.ts and nowhere else.
  it('names the referral code and the sign-up host only in lib/fan-payments.ts', () => {
    const offenders = sources
      .filter((path) => rel(path) !== 'lib/fan-payments.ts')
      .filter((path) => /7E6MUWD|creator\.fanlly\.co/i.test(readFileSync(path, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('is what the fan payments card opens, from the constant', () => {
    const card = readFileSync(join(WEB, 'components/releases/FanPaymentsCard.tsx'), 'utf8');
    expect(card).toContain('FAN_PAYMENTS_PARTNER.signupUrl');
    expect(card).toContain('openExternalUrl');
  });

  it('shows on the Distribute step', () => {
    const section = readFileSync(join(WEB, 'components/releases/DistributionSection.tsx'), 'utf8');
    expect(section).toMatch(/<FanPaymentsCard\b/);
  });
});

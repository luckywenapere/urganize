import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRANT_GENRES, GRANT_NEEDS, GRANT_STAGES } from './query-builder';
import { PROGRAMME_KINDS, PROGRAMME_STATUSES, matchProgramme } from './programmes';
import { SEED_PROGRAMMES } from './programmes-seed';
import { programmesSeedSql } from './programmes-seed-sql';

const MIGRATION = resolve(__dirname, '../../../../supabase/migrations/20261011110000_grant_programmes_seed.sql');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^([A-Z]{2}|AFRICA|SSA|EU|ANY)$/;

describe('the curated programme seed', () => {
  it('has unique, well-formed slugs', () => {
    const slugs = SEED_PROGRAMMES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('meets every check constraint in the migration', () => {
    for (const p of SEED_PROGRAMMES) {
      expect(PROGRAMME_KINDS).toContain(p.kind);
      expect(PROGRAMME_STATUSES).toContain(p.status);
      expect(p.url.startsWith('https://')).toBe(true);
      expect(p.sourceUrl.startsWith('https://')).toBe(true);
      expect(p.funder.trim().length).toBeGreaterThan(0);
      expect(p.funder.length).toBeLessThanOrEqual(120);
      expect(p.programme.length).toBeLessThanOrEqual(160);
      expect(p.summary.length).toBeLessThanOrEqual(400);
      expect(p.eligibility.length).toBeLessThanOrEqual(1000);
      expect(p.applicantTypes.length).toBeGreaterThan(0);
      for (const code of p.countries) expect(code).toMatch(CODE);
      for (const need of p.needs) expect(GRANT_NEEDS).toContain(need);
      for (const genre of p.genres) expect(GRANT_GENRES).toContain(genre);
      for (const stage of p.stages) expect(GRANT_STAGES).toContain(stage);
      for (const d of [p.opensOn, p.deadlineOn, p.lastClosedOn, p.checkedOn]) if (d !== null) expect(d).toMatch(DATE);
      if (p.amountMin !== null || p.amountMax !== null) expect(p.currency).toMatch(/^[A-Z]{3}$/);
      if (p.amountMin !== null && p.amountMax !== null) expect(p.amountMin).toBeLessThanOrEqual(p.amountMax);
    }
  });

  it('only gives a deadline to an open round, and never a past one as of the check date', () => {
    for (const p of SEED_PROGRAMMES) {
      if (p.deadlineOn === null) continue;
      expect(p.status).toBe('open');
      expect(p.deadlineOn >= p.checkedOn).toBe(true);
    }
  });

  it('suggests real grants to a Nigerian artist on the check date, and no loan', () => {
    const team = { countries: ['nigeria' as const], genres: [], stages: ['emerging' as const], needs: [], applicantTypes: ['individual' as const] };
    const matched = SEED_PROGRAMMES.map((p) => matchProgramme(p, team, '2026-10-11')).filter((m) => m !== null);
    const slugs = matched.map((m) => m.programme.slug);
    expect(slugs).toEqual(expect.arrayContaining(['anf-kekere', 'acces-emerging-artist-spotlight', 'goethe-aep-mobility-grants']));
    expect(matched.every((m) => m.programme.kind !== 'loan' && m.programme.kind !== 'investment')).toBe(true);
  });

  it('matches the generated migration exactly', () => {
    const sql = programmesSeedSql(SEED_PROGRAMMES);
    if (process.env.GRANT_SEED_WRITE === '1') writeFileSync(MIGRATION, sql);
    expect(readFileSync(MIGRATION, 'utf8')).toBe(sql);
  });
});

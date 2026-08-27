import { describe, expect, it } from 'vitest';
import {
  CREDIT_CSV_HEADER,
  buildCreditSubmissionsCsv,
  creditsCsvFileName,
  csvRoles,
  csvSplit,
} from './credit-submissions-csv';
import type { ReleaseCreditSubmission } from '@/types/credits';

const submission = (
  overrides: Partial<ReleaseCreditSubmission> = {}
): ReleaseCreditSubmission => ({
  id: 'sub-1',
  releaseId: 'rel-1',
  legalName: 'Adaeze Okonkwo',
  stageName: 'Ada',
  roles: ['songwriter'],
  contribution: 'Wrote the hook',
  email: 'ada@example.com',
  phone: '',
  country: 'Nigeria',
  songwriterSplit: 50,
  proAffiliation: 'COSON',
  ipiNumber: '00123456789',
  publisherName: 'SELF',
  publisherIpi: '',
  masterSplit: null,
  instagramHandle: 'ada',
  xHandle: '',
  bio: '',
  confirmedAccurate: true,
  createdAt: '2026-08-27T10:00:00.000Z',
  updatedAt: '2026-08-27T10:00:00.000Z',
  ...overrides,
});

describe('csvSplit', () => {
  it('emits a RAW NUMBER so the column can be summed', () => {
    // The entire reason to export splits is to total them and see whether they
    // reach 100. Excel and Sheets cannot sum a cell containing a percent sign,
    // so "50%" would make the export useless for its one job.
    expect(csvSplit(50)).toBe('50');
    expect(csvSplit(33.3)).toBe('33.3');
    expect(csvSplit(33.33)).toBe('33.3');
  });

  it('leaves an unanswered split EMPTY, never zero', () => {
    // A zero share is a real answer someone can give; conflating the two would
    // quietly change a total.
    expect(csvSplit(null)).toBe('');
    expect(csvSplit(0)).toBe('0');
  });
});

describe('csvRoles', () => {
  it('uses the human labels, semicolon separated', () => {
    // Semicolons rather than commas: this is the column people split back apart
    // by hand, and a comma list inside a comma file is a foot-gun there.
    expect(csvRoles({ roles: ['songwriter', 'producer'] })).toBe('Songwriter; Producer');
  });

  it('is blank for no roles rather than saying anything', () => {
    expect(csvRoles({ roles: [] })).toBe('');
  });
});

describe('buildCreditSubmissionsCsv', () => {
  it('opens with the header row', () => {
    const csv = buildCreditSubmissionsCsv([submission()]);
    expect(csv.split('\r\n')[0]).toContain('"Legal name"');
    expect(csv.split('\r\n')[0]).toContain('"Writing share %"');
  });

  it('emits one row per submission plus the header', () => {
    const csv = buildCreditSubmissionsCsv([submission(), submission({ id: 'sub-2' })]);
    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('keeps every column even when the value is blank', () => {
    // Unlike the notification email, which drops blanks: a missing column
    // breaks a formula, an empty cell does not.
    const csv = buildCreditSubmissionsCsv([submission()]);
    const headerCells = csv.split('\r\n')[0].split(',');
    const bodyCells = csv.split('\r\n')[1].split(',');
    expect(bodyCells).toHaveLength(headerCells.length);
    expect(headerCells).toHaveLength(CREDIT_CSV_HEADER.length);
  });

  it('survives a comma, a quote and a newline in free text', () => {
    const csv = buildCreditSubmissionsCsv([
      submission({ bio: 'Wrote "Hey, you"\nand more', legalName: 'Okonkwo, Adaeze' }),
    ]);
    // Every field is quoted and inner quotes are doubled, so the row stays one
    // logical record.
    expect(csv).toContain('"Okonkwo, Adaeze"');
    expect(csv).toContain('""Hey, you""');
  });

  it('renders the accuracy checkbox as yes or no, not true or false', () => {
    expect(buildCreditSubmissionsCsv([submission({ confirmedAccurate: true })])).toContain('"yes"');
    expect(buildCreditSubmissionsCsv([submission({ confirmedAccurate: false })])).toContain('"no"');
  });

  it('passes timestamps through untouched, the house convention', () => {
    const csv = buildCreditSubmissionsCsv([submission()]);
    expect(csv).toContain('"2026-08-27T10:00:00.000Z"');
  });

  it('produces a header-only file for no submissions', () => {
    const csv = buildCreditSubmissionsCsv([]);
    expect(csv.split('\r\n')).toHaveLength(1);
    expect(csv).toContain('"Legal name"');
  });

  it('places both splits in the columns the header promises', () => {
    const csv = buildCreditSubmissionsCsv([submission({ songwriterSplit: 60, masterSplit: 25 })]);
    const header = csv.split('\r\n')[0].split(',');
    const body = csv.split('\r\n')[1].split(',');
    expect(body[header.indexOf('"Writing share %"')]).toBe('"60"');
    expect(body[header.indexOf('"Recording share %"')]).toBe('"25"');
  });
});

describe('creditsCsvFileName', () => {
  it('names the release so two exports do not collide', () => {
    expect(creditsCsvFileName('Midnight EP', '2026-08-27T10:00:00.000Z')).toBe(
      'midnight-ep-credits-2026-08-27.csv'
    );
  });

  it('strips punctuation and collapses runs', () => {
    expect(creditsCsvFileName('Hey!! You & Me', '2026-08-27')).toBe(
      'hey-you-me-credits-2026-08-27.csv'
    );
  });

  it('falls back for an untitled release', () => {
    expect(creditsCsvFileName('', '2026-08-27')).toBe('release-credits-2026-08-27.csv');
    expect(creditsCsvFileName('!!!', '2026-08-27')).toBe('release-credits-2026-08-27.csv');
  });

  it('caps a very long title', () => {
    const name = creditsCsvFileName('a'.repeat(120), '2026-08-27');
    expect(name).toBe(`${'a'.repeat(40)}-credits-2026-08-27.csv`);
  });
});

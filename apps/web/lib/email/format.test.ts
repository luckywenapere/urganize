import { describe, it, expect } from 'vitest';
import {
  firstNameFrom,
  formatDueDateForEmail,
  priorityLabelForEmail,
  noteExcerptForEmail,
} from './format';

// Pure text helpers shared by the templates and by tasks-server. Moved verbatim
// from the old lib/email-templates.ts (2026-09 react-email split); this coverage
// moved with them.

describe('firstNameFrom', () => {
  it('takes the first word when it reads like a name', () => {
    expect(firstNameFrom('Adenaiye Miracle')).toBe('Adenaiye');
    expect(firstNameFrom('Oyin')).toBe('Oyin');
  });

  it('degrades to nothing for an email handle or a blank', () => {
    // ensureProfileRecord falls back to the email handle ("lucky.wenapere"), and
    // greeting someone by their handle reads worse than no name at all.
    for (const value of ['lucky.wenapere', 'a@b.com', '', '   ']) {
      expect(firstNameFrom(value)).toBe('');
    }
  });
});

describe('formatDueDateForEmail', () => {
  it('formats a date-only value without shifting a day (UTC)', () => {
    expect(formatDueDateForEmail('2026-09-04')).toBe('Fri, Sep 4');
  });

  it('formats a full timestamp', () => {
    expect(formatDueDateForEmail('2026-09-04T15:30:00Z')).toBe('Fri, Sep 4');
  });

  it('returns empty for absent or unparseable values', () => {
    expect(formatDueDateForEmail(null)).toBe('');
    expect(formatDueDateForEmail('')).toBe('');
    expect(formatDueDateForEmail('not-a-date')).toBe('');
  });
});

describe('priorityLabelForEmail', () => {
  it('names only the two loud tiers', () => {
    expect(priorityLabelForEmail('urgent')).toBe('Urgent');
    expect(priorityLabelForEmail('high')).toBe('High priority');
    expect(priorityLabelForEmail('medium')).toBe('');
    expect(priorityLabelForEmail('low')).toBe('');
    expect(priorityLabelForEmail(null)).toBe('');
  });
});

describe('noteExcerptForEmail', () => {
  it('takes the first non-empty line', () => {
    expect(noteExcerptForEmail('\n\n  First real line.\nSecond line.')).toBe('First real line.');
  });

  it('caps long lines with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const excerpt = noteExcerptForEmail(long);
    expect(excerpt.length).toBeLessThanOrEqual(160);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('returns empty for blank descriptions', () => {
    expect(noteExcerptForEmail('')).toBe('');
    expect(noteExcerptForEmail('   \n  ')).toBe('');
    expect(noteExcerptForEmail(null)).toBe('');
  });
});

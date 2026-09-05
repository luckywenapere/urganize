import { describe, expect, it } from 'vitest';

import {
  MAX_QUESTIONS_PER_PASS,
  applyAnswerToContent,
  buildInterviewQuestions,
  countInterviewGaps,
  getStepKicker,
} from './press-kit-interview';
import type { PressKitSection } from '@/types/press-kits';

const section = (
  key: PressKitSection['section'],
  content: Record<string, unknown> = {}
): PressKitSection => ({
  id: `section-${key}`,
  section: key,
  content,
  publishedContent: null,
  status: 'empty',
  source: 'autofill',
  position: 0,
  hidden: false,
  updatedBy: null,
  updatedAt: '2026-09-05T10:00:00.000Z',
});

/** A kit straight after autofill on a team with one release and one teammate. */
const afterAutofill = (): PressKitSection[] => [
  section('header', { genreTags: 'Afrobeats' }),
  section('bios'),
  section('latest_release', { releaseId: 'r1', title: 'Ojuelegba' }),
  section('contact', { contacts: [{ name: 'Ada', role: '', email: 'ada@example.com' }] }),
  section('links'),
];

describe('buildInterviewQuestions', () => {
  it('asks only about the gaps', () => {
    const ids = buildInterviewQuestions(afterAutofill()).map((question) => question.id);
    expect(ids).toContain('descriptor');
    expect(ids).toContain('bio-short');
    expect(ids).toContain('hook');
    expect(ids).toContain('contact-roles');
  });

  it('does not ask for something that is already answered', () => {
    const sections = afterAutofill().map((entry) =>
      entry.section === 'header'
        ? section('header', { genreTags: 'Afrobeats', descriptor: 'Afrobeats singer', homeCity: 'Lagos' })
        : entry
    );
    const ids = buildInterviewQuestions(sections).map((question) => question.id);
    expect(ids).not.toContain('descriptor');
    expect(ids).not.toContain('home');
  });

  it('treats whitespace as an unanswered question', () => {
    const sections = afterAutofill().map((entry) =>
      entry.section === 'bios' ? section('bios', { short: '   ' }) : entry
    );
    expect(buildInterviewQuestions(sections).map((q) => q.id)).toContain('bio-short');
  });

  it('skips the release hook when there is no release to hook', () => {
    const sections = afterAutofill().map((entry) =>
      entry.section === 'latest_release' ? section('latest_release') : entry
    );
    expect(buildInterviewQuestions(sections).map((q) => q.id)).not.toContain('hook');
  });

  it('skips the contact roles when autofill found nobody', () => {
    const sections = afterAutofill().map((entry) =>
      entry.section === 'contact' ? section('contact') : entry
    );
    expect(buildInterviewQuestions(sections).map((q) => q.id)).not.toContain('contact-roles');
  });

  it('skips the contact roles once every role is filled in', () => {
    const sections = afterAutofill().map((entry) =>
      entry.section === 'contact'
        ? section('contact', { contacts: [{ name: 'Ada', role: 'Manager', email: 'ada@example.com' }] })
        : entry
    );
    expect(buildInterviewQuestions(sections).map((q) => q.id)).not.toContain('contact-roles');
  });

  it('still asks when one of several contacts has no role', () => {
    const sections = afterAutofill().map((entry) =>
      entry.section === 'contact'
        ? section('contact', {
            contacts: [
              { name: 'Ada', role: 'Manager', email: 'ada@example.com' },
              { name: 'Tolu', role: '', email: 'tolu@example.com' },
            ],
          })
        : entry
    );
    expect(buildInterviewQuestions(sections).map((q) => q.id)).toContain('contact-roles');
  });

  it('asks nothing at all once the kit is answered', () => {
    const sections = [
      section('header', { descriptor: 'x', homeCity: 'Lagos', genreTags: 'Afrobeats' }),
      section('bios', { short: 'a', medium: 'b', long: 'c' }),
      section('latest_release', { releaseId: 'r1', hook: 'x' }),
      section('contact', { contacts: [{ name: 'Ada', role: 'Manager', email: 'a@b.c' }] }),
      section('links', { links: [{ label: 'Spotify', url: 'https://x' }] }),
    ];
    expect(buildInterviewQuestions(sections)).toEqual([]);
    expect(countInterviewGaps(sections)).toBe(0);
  });

  it('never asks more than one pass holds', () => {
    expect(MAX_QUESTIONS_PER_PASS).toBe(8);
    expect(buildInterviewQuestions(afterAutofill()).length).toBeLessThanOrEqual(
      MAX_QUESTIONS_PER_PASS
    );
  });

  it('leads with the one line, which is what a journalist reads first', () => {
    expect(buildInterviewQuestions(afterAutofill())[0].id).toBe('descriptor');
  });

  it('captions every question with what it is for, and says optional out loud', () => {
    for (const question of buildInterviewQuestions(afterAutofill())) {
      expect(question.title.length).toBeGreaterThan(0);
      expect(question.caption.length).toBeGreaterThan(0);
      expect(question.caption).not.toContain('—');
      expect(question.title.toLowerCase()).not.toContain('workspace');
    }
  });
});

describe('applyAnswerToContent', () => {
  it('MERGES into the section rather than replacing it', () => {
    const merged = applyAnswerToContent({ short: 'a', medium: 'b' }, { long: 'c' });
    expect(merged).toEqual({ short: 'a', medium: 'b', long: 'c' });
  });

  it('overwrites only the field that was answered', () => {
    const merged = applyAnswerToContent({ short: 'a', medium: 'b' }, { short: 'new' });
    expect(merged).toEqual({ short: 'new', medium: 'b' });
  });

  it('answers two fields at once without disturbing the rest', () => {
    const merged = applyAnswerToContent(
      { genreTags: 'Afrobeats' },
      { homeCity: 'Lagos', homeCountry: 'Nigeria' }
    );
    expect(merged).toEqual({ genreTags: 'Afrobeats', homeCity: 'Lagos', homeCountry: 'Nigeria' });
  });

  it('does not mutate what it was given', () => {
    const original = { short: 'a' };
    applyAnswerToContent(original, { medium: 'b' });
    expect(original).toEqual({ short: 'a' });
  });
});

describe('getStepKicker', () => {
  it('counts from one, against the questions actually being asked', () => {
    expect(getStepKicker(0, 5)).toBe('Question 1 of 5');
    expect(getStepKicker(4, 5)).toBe('Question 5 of 5');
  });
});

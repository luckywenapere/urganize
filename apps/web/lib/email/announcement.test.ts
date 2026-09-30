import { describe, expect, it } from 'vitest';
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_SUBJECT_MAX,
  announcementPreview,
  announcementSubject,
  parseAnnouncementDraft,
} from './announcement';

describe('parseAnnouncementDraft', () => {
  it('accepts a subject and a message, greeting and sign-off on by default', () => {
    expect(parseAnnouncementDraft({ subject: '  News  ', body: 'Hello there' })).toEqual({
      ok: true,
      draft: { subject: 'News', body: 'Hello there', includeGreeting: true, signOff: true },
    });
  });

  it('keeps the greeting and sign-off off when asked', () => {
    const parsed = parseAnnouncementDraft({ subject: 'S', body: 'B', includeGreeting: false, signOff: false });
    expect(parsed).toMatchObject({ ok: true, draft: { includeGreeting: false, signOff: false } });
  });

  it('refuses a missing subject or message', () => {
    expect(parseAnnouncementDraft({ subject: ' ', body: 'B' }).ok).toBe(false);
    expect(parseAnnouncementDraft({ subject: 'S', body: '\n\n' }).ok).toBe(false);
    expect(parseAnnouncementDraft(null).ok).toBe(false);
  });

  it('refuses a subject or message that is too long', () => {
    expect(parseAnnouncementDraft({ subject: 'x'.repeat(ANNOUNCEMENT_SUBJECT_MAX + 1), body: 'B' }).ok).toBe(false);
    expect(parseAnnouncementDraft({ subject: 'S', body: 'x'.repeat(ANNOUNCEMENT_BODY_MAX + 1) }).ok).toBe(false);
  });
});

describe('announcementSubject', () => {
  it('puts the subject on one line', () => {
    expect(announcementSubject('Big\n  news ')).toBe('Big news');
  });
});

describe('announcementPreview', () => {
  it('is the start of the message on one line, cut with an ellipsis', () => {
    expect(announcementPreview('Hello\n\nthere')).toBe('Hello there');
    const long = announcementPreview('word '.repeat(60));
    expect(long.length).toBeLessThanOrEqual(110);
    expect(long.endsWith('…')).toBe(true);
  });
});

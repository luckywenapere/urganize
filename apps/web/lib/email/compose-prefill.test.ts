import { describe, expect, it } from 'vitest';
import { COMPOSE_PATH, composeDraftHref, isSingleEmail, parseComposePrefill } from './compose-prefill';
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_SUBJECT_MAX } from './announcement';

const params = (query: string) => new URLSearchParams(query);

describe('parseComposePrefill', () => {
  it('reads one recipient, a subject and a body', () => {
    expect(parseComposePrefill(params('to=Ada@Example.com&subject=Checking%20in&body=Line%20one%0ALine%20two'))).toEqual({
      to: 'ada@example.com',
      subject: 'Checking in',
      body: 'Line one\nLine two',
    });
  });

  it('is null when the link carries no draft', () => {
    expect(parseComposePrefill(params(''))).toBeNull();
    expect(parseComposePrefill(params('other=1'))).toBeNull();
    expect(parseComposePrefill(null)).toBeNull();
  });

  it('drops a recipient that is not exactly one plain address, and keeps the text', () => {
    for (const to of [
      'a@b.com,c@d.com',
      'a@b.com;c@d.com',
      'a@b.com c@d.com',
      'Ada <a@b.com>',
      'a@b.com?cc=x@y.com',
      'a@b.com&bcc=x@y.com',
      'a@b.com%0Abcc:x@y.com',
      'not-an-email',
      '',
    ]) {
      const parsed = parseComposePrefill(params(`to=${encodeURIComponent(to)}&subject=Hi`));
      expect(parsed?.to ?? null).toBeNull();
      expect(parsed?.subject).toBe('Hi');
    }
  });

  it('cuts subject and body to the composer limits and strips control characters', () => {
    const parsed = parseComposePrefill(
      params(
        new URLSearchParams({
          to: 'a@b.com',
          subject: `Hi\u0000\u0007 there\n${'x'.repeat(400)}`,
          body: `Hello\r\nworld\u0000\u001b${'y'.repeat(ANNOUNCEMENT_BODY_MAX + 50)}`,
        }).toString()
      )
    );
    expect(parsed?.subject.startsWith('Hi there x')).toBe(true);
    expect(parsed?.subject.length).toBe(ANNOUNCEMENT_SUBJECT_MAX);
    expect(parsed?.body.startsWith('Hello\nworldyyy')).toBe(true);
    expect(parsed?.body.length).toBe(ANNOUNCEMENT_BODY_MAX);
  });

  it('keeps markup as plain text (the form never renders it as HTML)', () => {
    const parsed = parseComposePrefill(params(`to=a@b.com&body=${encodeURIComponent('<script>alert(1)</script>')}`));
    expect(parsed?.body).toBe('<script>alert(1)</script>');
  });
});

describe('composeDraftHref', () => {
  it('builds a link the composer reads back to the same draft', () => {
    const href = composeDraftHref({ to: 'ada@example.com', subject: 'Checking in on Sound & Co', body: 'How is it going?\nAll well?' });
    expect(href?.startsWith(`${COMPOSE_PATH}?`)).toBe(true);
    const query = new URL(href!, 'https://app.urganize.app').searchParams;
    expect(parseComposePrefill(query)).toEqual({
      to: 'ada@example.com',
      subject: 'Checking in on Sound & Co',
      body: 'How is it going?\nAll well?',
    });
  });

  it('gives no link without one usable recipient, so the form never opens aimed at everyone', () => {
    expect(composeDraftHref({ to: null, subject: 'Hi', body: 'Hello' })).toBeNull();
    expect(composeDraftHref({ to: 'a@b.com,c@d.com', subject: 'Hi', body: 'Hello' })).toBeNull();
  });
});

describe('isSingleEmail', () => {
  it('accepts a plain address and nothing else', () => {
    expect(isSingleEmail('ada@example.com')).toBe(true);
    expect(isSingleEmail(' ada@example.com ')).toBe(true);
    expect(isSingleEmail('ada@example')).toBe(false);
    expect(isSingleEmail('a@b.com,c@d.com')).toBe(false);
    expect(isSingleEmail(null)).toBe(false);
  });
});

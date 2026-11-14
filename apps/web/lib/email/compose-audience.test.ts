import { describe, expect, it } from 'vitest';
import { audienceKey, audienceRequest, countedFor, type AudienceChoice } from './compose-audience';

function choice(over: Partial<AudienceChoice> = {}): AudienceChoice {
  return { kind: 'everyone', group: 'trial', days: '7', personEmail: '', ...over };
}

describe('audienceRequest', () => {
  it('names one person by their email', () => {
    expect(audienceRequest(choice({ kind: 'person', personEmail: 'a@b.co' }))).toEqual({ kind: 'person', email: 'a@b.co' });
  });

  it('carries the days only for the recent group', () => {
    expect(audienceRequest(choice({ kind: 'group', group: 'recent', days: '14' }))).toEqual({
      kind: 'group',
      group: 'recent',
      days: '14',
    });
    expect(audienceRequest(choice({ kind: 'group', group: 'trial', days: '14' }))).toEqual({
      kind: 'group',
      group: 'trial',
      days: undefined,
    });
  });

  it('is just the kind for everyone and the waitlist', () => {
    expect(audienceRequest(choice({ kind: 'everyone', personEmail: 'a@b.co' }))).toEqual({ kind: 'everyone' });
    expect(audienceRequest(choice({ kind: 'waitlist', group: 'paying' }))).toEqual({ kind: 'waitlist' });
  });
});

describe('audienceKey', () => {
  it('tells apart choices that reach different people', () => {
    const keys = [
      audienceKey(choice({ kind: 'everyone' })),
      audienceKey(choice({ kind: 'waitlist' })),
      audienceKey(choice({ kind: 'person', personEmail: 'a@b.co' })),
      audienceKey(choice({ kind: 'person', personEmail: 'c@d.co' })),
      audienceKey(choice({ kind: 'group', group: 'trial' })),
      audienceKey(choice({ kind: 'group', group: 'paying' })),
      audienceKey(choice({ kind: 'group', group: 'recent', days: '7' })),
      audienceKey(choice({ kind: 'group', group: 'recent', days: '30' })),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ignores fields that do not matter for the chosen kind', () => {
    expect(audienceKey(choice({ kind: 'everyone', personEmail: 'x@y.co', group: 'paying', days: '90' }))).toBe(
      audienceKey(choice({ kind: 'everyone' }))
    );
    expect(audienceKey(choice({ kind: 'group', group: 'trial', days: '90' }))).toBe(
      audienceKey(choice({ kind: 'group', group: 'trial', days: '1' }))
    );
  });

  it('reads an address the same whatever its case or spaces', () => {
    expect(audienceKey(choice({ kind: 'person', personEmail: ' Someone@Example.com ' }))).toBe(
      audienceKey(choice({ kind: 'person', personEmail: 'someone@example.com' }))
    );
  });
});

describe('countedFor', () => {
  const counted = { key: audienceKey(choice({ kind: 'everyone' })), info: { count: 124 }, error: null };

  it('gives the count back for the audience it was made for', () => {
    expect(countedFor(counted, choice({ kind: 'everyone' }))).toBe(counted);
  });

  // The 14 Nov incident (#1274): "One person" was chosen and a recount of
  // the starting audience (everyone) landed over it, so the button read
  // "Send to 124 people" while one person was chosen.
  it('gives nothing back when the count is for a different audience than the one chosen now', () => {
    expect(countedFor(counted, choice({ kind: 'person', personEmail: 'someone@example.com' }))).toBeNull();
  });

  it('gives nothing back before anything has been counted', () => {
    expect(countedFor(null, choice())).toBeNull();
  });
});

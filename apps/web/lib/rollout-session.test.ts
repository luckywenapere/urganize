import { describe, expect, it } from 'vitest';
import { isChatId } from './chappi/conversation-history';
import { rolloutSessionIdFor } from './rollout-session';

const USER = '11111111-2222-4333-8444-555555555555';
const REL_A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const REL_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeef';

describe('rolloutSessionIdFor', () => {
  it('is the same every time for one person and rollout', () => {
    expect(rolloutSessionIdFor(USER, REL_A)).toBe(rolloutSessionIdFor(USER, REL_A));
  });

  it('is a uuid the chat routes accept', () => {
    expect(isChatId(rolloutSessionIdFor(USER, REL_A))).toBe(true);
    expect(rolloutSessionIdFor(USER, REL_A)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('differs by rollout, by person, and from Home chat (the person id)', () => {
    expect(rolloutSessionIdFor(USER, REL_A)).not.toBe(rolloutSessionIdFor(USER, REL_B));
    expect(rolloutSessionIdFor(USER, REL_A)).not.toBe(rolloutSessionIdFor('another-user', REL_A));
    expect(rolloutSessionIdFor(USER, REL_A)).not.toBe(USER);
  });

  it('has no id without a person or a rollout', () => {
    expect(rolloutSessionIdFor(null, REL_A)).toBeNull();
    expect(rolloutSessionIdFor(USER, undefined)).toBeNull();
    expect(rolloutSessionIdFor('', REL_A)).toBeNull();
  });

  it('gives many rollouts many different ids', () => {
    const ids = new Set(Array.from({ length: 2000 }, (_, i) => rolloutSessionIdFor(USER, `release-${i}`)));
    expect(ids.size).toBe(2000);
  });
});

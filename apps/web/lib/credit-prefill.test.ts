import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CREDIT_PREFILL_FIELDS,
  CREDIT_PREFILL_KEY,
  CREDIT_PREFILL_MAX_AGE_MS,
  CREDIT_PREFILL_VERSION,
  applyCreditPrefill,
  describeCreditPrefill,
  forgetCreditPrefill,
  hasCreditPrefill,
  isCreditPrefill,
  loadCreditPrefill,
  pickCreditPrefill,
  saveCreditPrefill,
} from './credit-prefill';
import type { CreditSubmissionInput } from '@/types/credits';

const filled = (overrides: Partial<CreditSubmissionInput> = {}): CreditSubmissionInput => ({
  legalName: 'Adaeze Okonkwo',
  stageName: 'Ada',
  roles: ['songwriter', 'producer'],
  contribution: 'Wrote the hook on this one',
  email: 'ada@example.com',
  phone: '+2348012345678',
  country: 'Nigeria',
  songwriterSplit: 50,
  proAffiliation: 'COSON',
  ipiNumber: '00123456789',
  publisherName: 'SELF',
  publisherIpi: '00987654321',
  masterSplit: 25,
  instagramHandle: 'ada',
  xHandle: 'ada',
  bio: 'Producer from Lagos',
  confirmedAccurate: true,
  ...overrides,
});

const empty: CreditSubmissionInput = {
  legalName: '',
  stageName: '',
  roles: [],
  contribution: '',
  email: '',
  phone: '',
  country: '',
  songwriterSplit: null,
  proAffiliation: '',
  ipiNumber: '',
  publisherName: '',
  publisherIpi: '',
  masterSplit: null,
  instagramHandle: '',
  xHandle: '',
  bio: '',
  confirmedAccurate: false,
};

describe('CREDIT_PREFILL_FIELDS', () => {
  it('NEVER remembers a split — the hard line in this feature', () => {
    // A 50% share on one song says nothing about the next, and a silently
    // pre-filled ownership share could file a claim nobody typed.
    expect(CREDIT_PREFILL_FIELDS).not.toContain('songwriterSplit');
    expect(CREDIT_PREFILL_FIELDS).not.toContain('masterSplit');
  });

  it('never remembers roles, which change per song and drive the split rules', () => {
    expect(CREDIT_PREFILL_FIELDS).not.toContain('roles');
  });

  it('never remembers the accuracy tick or what they did on the song', () => {
    expect(CREDIT_PREFILL_FIELDS).not.toContain('confirmedAccurate');
    expect(CREDIT_PREFILL_FIELDS).not.toContain('contribution');
  });

  it('does remember the details worth not retyping', () => {
    for (const field of ['legalName', 'email', 'ipiNumber', 'publisherName', 'proAffiliation']) {
      expect(CREDIT_PREFILL_FIELDS).toContain(field);
    }
  });
});

describe('pickCreditPrefill', () => {
  it('keeps only the durable person-level fields', () => {
    const picked = pickCreditPrefill(filled());
    expect(picked.legalName).toBe('Adaeze Okonkwo');
    expect(picked.ipiNumber).toBe('00123456789');
    expect(Object.keys(picked).sort()).toEqual([...CREDIT_PREFILL_FIELDS].sort());
    // Belt and braces on the same rule the constant test covers.
    expect(picked).not.toHaveProperty('songwriterSplit');
    expect(picked).not.toHaveProperty('roles');
  });

  it('drops blanks so a cleared field never overwrites a good stored value', () => {
    const picked = pickCreditPrefill(filled({ phone: '', country: '   ' }));
    expect(picked).not.toHaveProperty('phone');
    expect(picked).not.toHaveProperty('country');
  });

  it('trims', () => {
    expect(pickCreditPrefill(filled({ legalName: '  Ada  ' })).legalName).toBe('Ada');
  });
});

describe('applyCreditPrefill', () => {
  it('fills a blank form', () => {
    const next = applyCreditPrefill(empty, { legalName: 'Ada', ipiNumber: '123' });
    expect(next.legalName).toBe('Ada');
    expect(next.ipiNumber).toBe('123');
  });

  it('never clobbers something already typed', () => {
    const next = applyCreditPrefill({ ...empty, legalName: 'Someone else' }, { legalName: 'Ada' });
    expect(next.legalName).toBe('Someone else');
  });

  it('leaves roles, splits and the accuracy tick exactly as they were', () => {
    const next = applyCreditPrefill(empty, {
      legalName: 'Ada',
      // A stored blob from a future version, or a hand-edited one, must not be
      // able to reach these.
      ...({ songwriterSplit: '50', roles: ['producer'], confirmedAccurate: 'true' } as object),
    });
    expect(next.songwriterSplit).toBeNull();
    expect(next.masterSplit).toBeNull();
    expect(next.roles).toEqual([]);
    expect(next.confirmedAccurate).toBe(false);
  });

  it('is a no-op for an empty store', () => {
    expect(applyCreditPrefill(empty, {})).toEqual(empty);
  });
});

describe('isCreditPrefill', () => {
  it('accepts a well-formed blob and an empty one', () => {
    expect(isCreditPrefill({ legalName: 'Ada' })).toBe(true);
    expect(isCreditPrefill({})).toBe(true);
  });

  it('rejects non-objects', () => {
    for (const bad of [null, undefined, 'ada', 42, []]) {
      expect(isCreditPrefill(bad)).toBe(false);
    }
  });

  it('rejects a known field holding a non-string', () => {
    expect(isCreditPrefill({ legalName: 42 })).toBe(false);
    expect(isCreditPrefill({ email: null })).toBe(false);
  });

  it('tolerates an unknown key, since a later version may add one', () => {
    expect(isCreditPrefill({ legalName: 'Ada', somethingNew: 99 })).toBe(true);
  });
});

describe('hasCreditPrefill / describeCreditPrefill', () => {
  it('is false for null and for an all-blank store', () => {
    expect(hasCreditPrefill(null)).toBe(false);
    expect(hasCreditPrefill({})).toBe(false);
  });

  it('names the person, falling back through stage name to email', () => {
    expect(describeCreditPrefill({ legalName: 'Ada O', stageName: 'Ada' })).toBe('Ada O');
    expect(describeCreditPrefill({ stageName: 'Ada' })).toBe('Ada');
    expect(describeCreditPrefill({ email: 'ada@example.com' })).toBe('ada@example.com');
    expect(describeCreditPrefill({})).toBe('your details');
  });
});

/**
 * A Map-backed localStorage. vitest runs in the `node` environment by config
 * ("pure-logic unit tests only") and jsdom is not a dependency, so adding one
 * for a single file would widen the tooling for less than this stub costs.
 * lib/persisted-state.ts only ever touches getItem/setItem/removeItem behind a
 * `typeof window !== 'undefined'` guard, so this is the whole surface it needs.
 */
function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  return localStorage;
}

describe('storage round trip', () => {
  let storage = installLocalStorage();

  beforeEach(() => {
    storage = installLocalStorage();
  });

  afterAll(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('saves and reloads the durable fields', () => {
    saveCreditPrefill(filled());
    const loaded = loadCreditPrefill();
    expect(loaded?.legalName).toBe('Adaeze Okonkwo');
    expect(loaded?.ipiNumber).toBe('00123456789');
    expect(loaded).not.toHaveProperty('songwriterSplit');
  });

  it('writes nothing at all for an empty form', () => {
    saveCreditPrefill(empty);
    expect(storage.getItem(CREDIT_PREFILL_KEY)).toBeNull();
  });

  it('forgets on request', () => {
    saveCreditPrefill(filled());
    forgetCreditPrefill();
    expect(loadCreditPrefill()).toBeNull();
  });

  it('uses one key for every release, so details carry across them', () => {
    // Scoping per token would defeat the entire point.
    expect(CREDIT_PREFILL_KEY).not.toContain('token');
    expect(CREDIT_PREFILL_KEY).toBe('urganize.credits.prefill');
  });

  it('ignores a blob from another version', () => {
    storage.setItem(
      CREDIT_PREFILL_KEY,
      JSON.stringify({ version: CREDIT_PREFILL_VERSION + 1, savedAt: Date.now(), value: { legalName: 'Ada' } })
    );
    expect(loadCreditPrefill()).toBeNull();
  });

  it('ignores a blob past its age cap', () => {
    storage.setItem(
      CREDIT_PREFILL_KEY,
      JSON.stringify({
        version: CREDIT_PREFILL_VERSION,
        savedAt: Date.now() - (CREDIT_PREFILL_MAX_AGE_MS + 1000),
        value: { legalName: 'Ada' },
      })
    );
    expect(loadCreditPrefill()).toBeNull();
  });

  it('ignores garbage rather than throwing', () => {
    storage.setItem(CREDIT_PREFILL_KEY, 'not json');
    expect(loadCreditPrefill()).toBeNull();
  });

  it('survives a storage write that throws', () => {
    // Safari private mode throws on any write; a full quota throws too. The
    // credits are already sent by then, so this must never surface.
    const spy = vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveCreditPrefill(filled())).not.toThrow();
    spy.mockRestore();
  });

  it('caps the age at six months', () => {
    expect(CREDIT_PREFILL_MAX_AGE_MS).toBe(180 * 24 * 60 * 60 * 1000);
  });
});

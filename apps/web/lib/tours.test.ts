import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CATALOG_TOUR_STEPS,
  ROLLOUT_TOUR_STEPS,
  decideCatalogTourAutoStart,
  markTourSeen,
  pickVisibleAnchor,
  readTourSeen,
  resolveCatalogTourCta,
  tourSeenKey,
  tourStepProgress,
} from './tours';

/** A Map-backed localStorage, the lib/credit-prefill.test.ts approach — vitest
 *  runs node-only here with no jsdom, so there is no real one to lean on. */
function stubStorage(overrides: Partial<Storage> = {}) {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
    ...overrides,
  } as Storage;
  vi.stubGlobal('window', { localStorage: storage });
  return map;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const READY = {
  flag: true,
  seen: false,
  authResolved: true,
  isCurator: false,
  onCatalog: true,
  releasesLoaded: true,
  bodyLocked: false,
  chappiMessageCount: 0,
};

describe('tour step data', () => {
  const all = [...CATALOG_TOUR_STEPS, ...ROLLOUT_TOUR_STEPS];

  it('gives every step an id, an anchor and copy', () => {
    for (const step of all) {
      expect(step.id).toMatch(/\S/);
      expect(step.anchor).toMatch(/\S/);
      expect(step.title).toMatch(/\S/);
      expect(step.body).toMatch(/\S/);
    }
  });

  it('keeps step ids unique within a tour', () => {
    for (const steps of [CATALOG_TOUR_STEPS, ROLLOUT_TOUR_STEPS]) {
      expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    }
  });

  it('says rollout, never release, in copy a person reads', () => {
    for (const step of all) {
      expect(`${step.title} ${step.body} ${step.ctaLabel ?? ''}`).not.toMatch(/\brelease/i);
    }
  });
});

describe('decideCatalogTourAutoStart', () => {
  it('starts when everything is ready', () => {
    expect(decideCatalogTourAutoStart(READY)).toBe(true);
  });

  it.each([
    ['the flag is off', { flag: false }],
    ['it has been seen', { seen: true }],
    ['auth has not resolved', { authResolved: false }],
    ['the account is a curator', { isCurator: true }],
    ['the user is not on the catalog', { onCatalog: false }],
    ['releases have not loaded', { releasesLoaded: false }],
    ['another modal holds the scroll lock', { bodyLocked: true }],
    ['a conversation with UrgAns is underway', { chappiMessageCount: 3 }],
  ])('does not start when %s', (_why, override) => {
    expect(decideCatalogTourAutoStart({ ...READY, ...override })).toBe(false);
  });
});

describe('resolveCatalogTourCta', () => {
  const base = {
    plannerEnabled: true,
    scopedReleaseId: 'rel-1',
    scopedTaskCount: 0,
    releaseCount: 1,
    canCreate: true,
  };

  it('offers planning when a scoped rollout has no activities yet', () => {
    expect(resolveCatalogTourCta(base).action).toBe('open-intake');
  });

  it('offers creating when there is nothing to plan', () => {
    expect(
      resolveCatalogTourCta({ ...base, scopedReleaseId: null, releaseCount: 0 }).action
    ).toBe('open-create');
  });

  it('just points at a card for someone who can do neither', () => {
    const cta = resolveCatalogTourCta({
      ...base,
      plannerEnabled: false,
      scopedReleaseId: null,
      releaseCount: 4,
      canCreate: false,
    });
    expect(cta.action).toBe('done');
    expect(cta.anchor).toBe('release-card');
  });

  it('prefers planning over creating when both are possible', () => {
    // A teammate with one unplanned rollout AND the ability to create: the
    // rollout in front of them wins. Reversing this precedence sends someone
    // who already has work to do off to make more.
    expect(resolveCatalogTourCta({ ...base, releaseCount: 0 }).action).toBe('open-intake');
  });

  it('never says release', () => {
    for (const input of [base, { ...base, scopedReleaseId: null, releaseCount: 0 }]) {
      const cta = resolveCatalogTourCta(input);
      expect(`${cta.title} ${cta.body} ${cta.ctaLabel}`).not.toMatch(/\brelease/i);
    }
  });
});

describe('pickVisibleAnchor', () => {
  const visible = { rect: { width: 40, height: 20 }, hasOffsetParent: true };

  it('takes the first visible candidate', () => {
    expect(pickVisibleAnchor([visible, visible])).toBe(0);
  });

  it('skips a zero-sized candidate', () => {
    expect(
      pickVisibleAnchor([{ rect: { width: 0, height: 0 }, hasOffsetParent: true }, visible])
    ).toBe(1);
  });

  it('skips a display:none candidate, which has no offsetParent', () => {
    expect(pickVisibleAnchor([{ ...visible, hasOffsetParent: false }, visible])).toBe(1);
  });

  it('answers null when nothing is on screen', () => {
    expect(pickVisibleAnchor([{ rect: { width: 0, height: 0 }, hasOffsetParent: false }])).toBe(
      null
    );
  });

  it('answers null for no candidates at all', () => {
    expect(pickVisibleAnchor([])).toBe(null);
  });
});

describe('seen state', () => {
  it('keys per user and per tour, so one does not silence the other', () => {
    expect(tourSeenKey('u1', 'catalog')).not.toBe(tourSeenKey('u1', 'rollout'));
    expect(tourSeenKey('u1', 'catalog')).not.toBe(tourSeenKey('u2', 'catalog'));
  });

  it('round-trips', () => {
    stubStorage();
    expect(readTourSeen('u1', 'catalog')).toBe(false);
    markTourSeen('u1', 'catalog');
    expect(readTourSeen('u1', 'catalog')).toBe(true);
    expect(readTourSeen('u1', 'rollout')).toBe(false);
  });

  it('reads false rather than throwing when storage is unusable', () => {
    stubStorage({
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readTourSeen('u1', 'catalog')).toBe(false);
  });

  it('swallows a failing write, because a lost mark costs one repeat', () => {
    stubStorage({
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(() => markTourSeen('u1', 'catalog')).not.toThrow();
  });

  it('never marks anything for a signed-out user', () => {
    const map = stubStorage();
    markTourSeen('', 'catalog');
    expect(map.size).toBe(0);
    expect(readTourSeen('', 'catalog')).toBe(false);
  });
});

describe('tourStepProgress', () => {
  it('says "Step N of M", counting from one', () => {
    expect(tourStepProgress(0, 3)).toEqual({ label: 'Step 1 of 3', percent: 33 });
    expect(tourStepProgress(1, 3)).toEqual({ label: 'Step 2 of 3', percent: 67 });
    expect(tourStepProgress(2, 3)).toEqual({ label: 'Step 3 of 3', percent: 100 });
  });

  it('never runs past the last step or before the first', () => {
    expect(tourStepProgress(5, 3)).toEqual({ label: 'Step 3 of 3', percent: 100 });
    expect(tourStepProgress(-1, 3)).toEqual({ label: 'Step 1 of 3', percent: 33 });
  });

  it('treats an empty tour as one step rather than dividing by zero', () => {
    expect(tourStepProgress(0, 0)).toEqual({ label: 'Step 1 of 1', percent: 100 });
  });
});

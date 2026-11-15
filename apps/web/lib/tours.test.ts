import { afterEach, describe, expect, it, vi } from 'vitest';

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  ROLLOUT_TOUR_STEPS,
  markTourSeen,
  pickVisibleAnchor,
  readTourSeen,
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

describe('tour step data', () => {
  const all = [...ROLLOUT_TOUR_STEPS];

  it('gives every step an id, an anchor and copy', () => {
    for (const step of all) {
      expect(step.id).toMatch(/\S/);
      expect(step.anchor).toMatch(/\S/);
      expect(step.title).toMatch(/\S/);
      expect(step.body).toMatch(/\S/);
    }
  });

  it('keeps step ids unique within a tour', () => {
    for (const steps of [ROLLOUT_TOUR_STEPS]) {
      expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    }
  });

  it('says rollout, never release, in copy a person reads', () => {
    for (const step of all) {
      expect(`${step.title} ${step.body} ${step.ctaLabel ?? ''}`).not.toMatch(/\brelease/i);
    }
  });
});

describe('the rollout tour', () => {
  it('sends "Go to Team" to Team rather than just closing', () => {
    const last = ROLLOUT_TOUR_STEPS[ROLLOUT_TOUR_STEPS.length - 1];
    expect(last.ctaLabel).toBe('Go to Team');
    expect(last.action).toBe('open-team');
  });

  it('points the team step at the Team tab on a phone, where the side menu is hidden', () => {
    const last = ROLLOUT_TOUR_STEPS[ROLLOUT_TOUR_STEPS.length - 1];
    expect(last.anchor).toBe('nav-settings');
    expect(last.fallbackAnchor).toBe('nav-team');
    // The classic bar gives its Team tab that anchor; the swipe nav's Team row
    // is in the account page, so its avatar carries it.
    const bottom = readFileSync(path.join(process.cwd(), 'components/shell/BottomBar.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(bottom).toContain("tab.key === 'team' ? 'nav-team'");
    const avatar = readFileSync(path.join(process.cwd(), 'components/shell/swipe/AvatarMenu.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(avatar).toContain('data-tour="nav-team"');
  });

  it('shows each step as its own loop (#971)', () => {
    expect(ROLLOUT_TOUR_STEPS.map((s) => s.loop)).toEqual(['activities', 'menu', 'team']);
  });
});

describe('tour loops load the way the Stageshow note says (#971)', () => {
  const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8').replace(/\r\n/g, '\n');
  const wrapper = read('components/tours/TourStepLoop.tsx');

  it('loads the kit lazily, client only', () => {
    expect(wrapper).toMatch(/dynamic\(\(\) => import\('\.\/loops\/TourLoops'\), \{\s*ssr: false,/);
    // Only the loops file may import the kit; anything else would pull it into the first load.
    for (const file of ['components/tours/TourOverlay.tsx', 'components/tours/TourOfferCard.tsx', 'components/tours/TourStepLoop.tsx']) {
      expect(read(file)).not.toContain('@urganize/stageshow');
    }
  });

  it('never mounts the loop under reduced motion', () => {
    // The media query moved into a shared hook (2026-11-01, #971 follow-up), which
    // starts false so the poster paints first and the kit never loads under
    // reduced motion. Hold both halves: the wrapper uses it, and it still asks.
    expect(wrapper).toContain('const motion = usePrefersMotion();');
    expect(wrapper).toContain('{motion ? (');
    const hook = read('lib/use-prefers-motion.ts');
    expect(hook).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(hook).toContain('useState(false)');
  });

  it('has a light and a dark poster for every loop', () => {
    const dir = path.join(process.cwd(), 'public/images/tours');
    const files = ['menu-phone-light', 'menu-phone-dark'];
    for (const step of ROLLOUT_TOUR_STEPS) files.push(`${step.loop}-light`, `${step.loop}-dark`);
    for (const name of files) expect(statSync(path.join(dir, `${name}.webp`)).size).toBeGreaterThan(0);
  });
});

describe('the welcome tour stays removed (2026-10-11, founder call)', () => {
  // Structural: nothing under the app starts a tour by itself or reads the old
  // welcome tour's seen-flag. A new account lands in the first-rollout flow.
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(full);
    }
    return out;
  }
  const root = path.resolve(__dirname, '..');
  const files = ['app', 'components', 'lib', 'stores'].flatMap((dir) => walk(path.join(root, dir)));

  it('has no auto-start hook and no catalog tour left in the source', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      expect(source, file).not.toMatch(/useCatalogTourAutoStart|CATALOG_TOUR_STEPS|requestReplay\(|readTourSeen\([^)]*'catalog'/);
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
    expect(tourSeenKey('u1', 'rollout')).not.toBe(tourSeenKey('u2', 'rollout'));
  });

  it('round-trips', () => {
    stubStorage();
    expect(readTourSeen('u1', 'rollout')).toBe(false);
    markTourSeen('u1', 'rollout');
    expect(readTourSeen('u1', 'rollout')).toBe(true);
    expect(readTourSeen('u2', 'rollout')).toBe(false);
  });

  it('reads false rather than throwing when storage is unusable', () => {
    stubStorage({
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readTourSeen('u1', 'rollout')).toBe(false);
  });

  it('swallows a failing write, because a lost mark costs one repeat', () => {
    stubStorage({
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(() => markTourSeen('u1', 'rollout')).not.toThrow();
  });

  it('never marks anything for a signed-out user', () => {
    const map = stubStorage();
    markTourSeen('', 'rollout');
    expect(map.size).toBe(0);
    expect(readTourSeen('', 'rollout')).toBe(false);
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

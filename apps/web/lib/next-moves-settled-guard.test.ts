import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { selectNextMovesSettled, selectHomeMovesSettled } from '@/stores/useNextMovesStore';

// The store's selectors are pure; keep the browser client out of the test.
vi.mock('@/lib/supabase/client', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

/**
 * No next-move surface paints a card before its server dismissals land
 * (URG-367, 2026-10-18; Home was URG-364). The rollout page drew moves from
 * this device's local copy, so a move dismissed on another device showed with
 * its X and "Open it", then vanished. vitest has no layout engine, so the
 * wiring is read from the files; the selector is checked for real.
 */

const WEB = join(__dirname, '..');
const read = (...parts: string[]) => readFileSync(join(WEB, ...parts), 'utf8');
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

const hook = code(read('components', 'next-moves', 'useNextMoves.ts'));
const rolloutMoves = code(read('components', 'next-moves', 'RolloutNextMoves.tsx'));
const homeMoves = code(read('components', 'home', 'useHomeNextMoves.ts'));
const firstSteps = code(read('components', 'workspace', 'RolloutFirstSteps.tsx'));

describe('selectNextMovesSettled', () => {
  const state = (userId: string | null, settled: Record<string, true>) => ({ userId, settled });

  it('is false until that surface’s own request settles, for that person', () => {
    expect(selectNextMovesSettled('u1', 'r1')(state('u1', {}))).toBe(false);
    expect(selectNextMovesSettled('u1', 'r1')(state('u1', { _home: true }))).toBe(false);
    expect(selectNextMovesSettled('u1', 'r1')(state('u2', { r1: true }))).toBe(false);
    expect(selectNextMovesSettled(null, 'r1')(state(null, { r1: true }))).toBe(false);
    expect(selectNextMovesSettled('u1', 'r1')(state('u1', { r1: true }))).toBe(true);
  });

  it('Home uses the same gate on its own key', () => {
    expect(selectHomeMovesSettled('u1')(state('u1', { r1: true }))).toBe(false);
    expect(selectHomeMovesSettled('u1')(state('u1', { _home: true }))).toBe(true);
    expect(selectNextMovesSettled('u1', null)(state('u1', { _home: true }))).toBe(true);
  });
});

describe('every next-move surface waits for its dismissals', () => {
  it('useNextMoves returns no moves until settled', () => {
    expect(hook).toMatch(/useNextMovesStore\(selectNextMovesSettled\(userId, releaseId \?\? null\)\)/);
    expect(hook).toMatch(/if \(!userId \|\| !settled\) return \[\];/);
  });

  it('the rollout page and Home both go through useNextMoves', () => {
    expect(rolloutMoves).toMatch(/useNextMoves\(\{ surface: 'rollout'/);
    expect(rolloutMoves).toMatch(/if \(moves\.length === 0\) return null;/);
    expect(homeMoves).toMatch(/useNextMoves\(\{ surface: 'home'/);
  });

  it('nothing else picks moves around the gate', () => {
    for (const file of [rolloutMoves, homeMoves]) expect(file).not.toContain('pickNextMoves(');
  });

  it('First steps draws nothing while pending, and pending always ends', () => {
    expect(firstSteps).toMatch(/if \(state\.status === 'pending'\) return null;/);
    expect(firstSteps).toMatch(/setTimeout\(\(\) => setFactsSettled\(true\), FIRST_STEPS_SETTLE_MS\)/);
    expect(firstSteps).toMatch(/FIRST_STEPS_SETTLE_MS = \d+/);
  });
});

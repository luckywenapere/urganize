import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  decideFirstReleaseFocus,
  isLockedHref,
  planChoiceForMode,
} from './first-release-focus';

const ORIGIN = 'https://app.urganize.com';

const READY = {
  firstReleaseRequired: true,
  isCurator: false,
  tourBlocking: false,
};

describe('decideFirstReleaseFocus', () => {
  it('is on straight away for a zero-rollout team (no welcome tour to wait for since 2026-10-11)', () => {
    expect(decideFirstReleaseFocus(READY)).toBe(true);
  });

  it.each([
    ['a rollout exists (or the load is unproven)', { firstReleaseRequired: false }],
    ['a curator', { isCurator: true }],
    ['a tour is running', { tourBlocking: true }],
  ])('is off for %s', (_name, patch) => {
    expect(decideFirstReleaseFocus({ ...READY, ...patch })).toBe(false);
  });
});

describe('isLockedHref', () => {
  it.each(['/dashboard', '/dashboard/urgans', '/dashboard/artists/abc', '/dashboard?release=1'])(
    'locks %s',
    (href) => expect(isLockedHref(href, ORIGIN)).toBe(true)
  );

  it.each([
    '/dashboard/home',
    '/dashboard/home?x=1',
    '/settings',
    '/auth/login',
    '/locked',
    '/payment/callback',
    'https://example.com/dashboard',
    'mailto:help@urganize.com',
    '#top',
    '',
  ])('leaves %s open', (href) => expect(isLockedHref(href, ORIGIN)).toBe(false));

  it('leaves a missing href open', () => {
    expect(isLockedHref(null, ORIGIN)).toBe(false);
    expect(isLockedHref(undefined, ORIGIN)).toBe(false);
  });

  it('does not treat a lookalike prefix as the open area', () => {
    expect(isLockedHref('/dashboard/homestead', ORIGIN)).toBe(true);
  });
});

describe('planChoiceForMode', () => {
  it('maps UrgAns to the template plan and self-planning to blank', () => {
    expect(planChoiceForMode('urgans')).toBe('template');
    expect(planChoiceForMode('self')).toBe('blank');
  });
});

// Components are not rendered in this repo's tests, so the wiring is held in
// the source, the way the other guard tests do.
describe('first-rollout focus wiring', () => {
  const root = process.cwd();
  const read = (file: string) => readFileSync(join(root, file), 'utf8');

  it('passes the chosen plan through the shell store into the create modal', () => {
    expect(read('stores/useShellStore.ts')).toContain('openCreate: (plan) => set({ createOpen: true, createPlan: plan ?? null })');
    expect(read('components/app/AppShell.tsx')).toContain('initialPlan={createPlan}');
    expect(read('components/releases/CreateReleaseModal.tsx')).toContain("plan: initialPlan ?? 'template'");
  });

  it('is mounted and supersedes the timed prompt', () => {
    expect(read('components/app/AppShell.tsx')).toContain('isAuthenticated && !isAuthLoading && showWorkspaceChrome ? (\n        <FirstReleaseFocus');
    expect(read('components/releases/useFirstReleasePrompt.ts')).toContain('if (FOCUS_SUPERSEDES_PROMPT) return;');
  });

  it('catches locked links in the capture phase', () => {
    expect(read('components/releases/FirstReleaseFocus.tsx')).toContain("document.addEventListener('click', onClick, true)");
  });
});

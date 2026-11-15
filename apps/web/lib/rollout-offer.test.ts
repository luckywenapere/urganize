import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ROLLOUT_OFFER_COPY,
  decideHomeRolloutCard,
  homeOfferDismissedKey,
  planChoiceForMode,
  readHomeOfferDismissed,
  writeHomeOfferDismissed,
} from './rollout-offer';

const READY = { enabled: true, noRollouts: true, isCurator: false, dismissed: false };

describe('decideHomeRolloutCard', () => {
  it('shows for a team with no rollouts that has not said Not now', () => {
    expect(decideHomeRolloutCard(READY)).toBe(true);
  });

  it.each([
    [{ enabled: false }],
    [{ noRollouts: false }],
    [{ isCurator: true }],
    [{ dismissed: true }],
  ])('stays away when %o', (patch) => {
    expect(decideHomeRolloutCard({ ...READY, ...patch })).toBe(false);
  });
});

describe('Not now is remembered per user', () => {
  it('writes and reads one key per user', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    };
    expect(readHomeOfferDismissed('u1', storage)).toBe(false);
    writeHomeOfferDismissed('u1', storage);
    expect(readHomeOfferDismissed('u1', storage)).toBe(true);
    expect(readHomeOfferDismissed('u2', storage)).toBe(false);
    expect(map.has(homeOfferDismissedKey('u1'))).toBe(true);
    expect(readHomeOfferDismissed('u1', null)).toBe(false);
  });
});

describe('planChoiceForMode', () => {
  it('maps AI to the template plan and self-planning to blank', () => {
    expect(planChoiceForMode('urgans')).toBe('template');
    expect(planChoiceForMode('self')).toBe('blank');
  });
});

it('uses the approved words', () => {
  expect(ROLLOUT_OFFER_COPY.homeTitle).toBe('Got a release coming?');
  expect(ROLLOUT_OFFER_COPY.homeBody).toBe('Plan it here when you are ready.');
  expect(ROLLOUT_OFFER_COPY.planCta).toBe('Plan a rollout');
  expect(ROLLOUT_OFFER_COPY.notNow).toBe('Not now');
});

// Components are not rendered in this repo's tests, so the wiring is held in
// the source, the way the other guard tests do.
describe('no lock, offers only (wiring)', () => {
  const root = process.cwd();
  const read = (file: string) => readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n');

  it('the first-rollout lock is gone', () => {
    expect(existsSync(join(root, 'components/releases/FirstReleaseFocus.tsx'))).toBe(false);
    expect(read('app/globals.css')).not.toContain('data-release-focus');
    expect(read('components/app/AppShell.tsx')).not.toContain('FirstReleaseFocus');
  });

  it('AppShell mounts the one plan choice and passes the origin to its create modal', () => {
    const shell = read('components/app/AppShell.tsx');
    expect(shell).toContain('<PlanChoiceHost />');
    expect(shell).toContain('origin={createOrigin}');
    expect(read('components/releases/PlanChoiceDialog.tsx')).toContain(
      "openCreate(planChoiceForMode(mode), { origin: 'hint', artistId })"
    );
    expect(read('components/releases/CreateReleaseModal.tsx')).toContain("source: 'dashboard',\n          origin,");
  });

  it('Home carries the card, and pages that need a rollout carry their own offer', () => {
    expect(read('app/dashboard/home/HomePageClient.tsx')).toContain('<RolloutOfferCard />');
    expect(read('app/dashboard/distribute/DistributePageClient.tsx')).toContain('<NeedsRolloutEmpty');
    expect(read('app/dashboard/pitching/PitchingPageClient.tsx')).toContain('<NeedsRolloutEmpty');
  });

  it('the release route stores the origin', () => {
    expect(read('app/api/releases/route.ts')).toContain('origin: rolloutOrigin,');
  });
});

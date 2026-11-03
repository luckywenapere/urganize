import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INTAKE_STEPS } from '@/components/planner/intake-steps';

// Structural checks for the first-user flow fixes (2026-10-11). This repo has
// no component tests, so the wiring that the pure modules depend on is held by
// reading the real sources, the pattern lib/chappi/tool-registry.test.ts set.

const APP_ROOT = join(__dirname, '..');
const code = (path: string) =>
  readFileSync(join(APP_ROOT, path), 'utf8')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '');

describe('the planner intake', () => {
  const modal = code('components/planner/PlannerIntakeModal.tsx');

  it('walks the visible-step list for Continue, Back and the counter', () => {
    expect(modal).toContain('visibleIntakeSteps(');
    expect(modal).toContain('nextIntakeStep(visibleSteps, step)');
    expect(modal).toContain('previousIntakeStep(visibleSteps, current)');
    expect(modal).toContain('getStepKicker(step, visibleSteps)');
    // The old arithmetic is gone: no step + 1, no TOTAL_STEPS - 1.
    expect(modal).not.toMatch(/TOTAL_STEPS\s*-\s*1/);
    expect(modal).not.toMatch(/\(step \+ 1\) as StepIndex/);
  });

  it('asks "What should the plan cover?" last', () => {
    expect(INTAKE_STEPS[6].title).toBe('What should the plan cover?');
    const steps = code('components/planner/intake-steps.tsx');
    expect(steps).toContain('coveredScopes(draft.exclusions)');
    expect(steps).toContain('toggleCoveredScope(draft.exclusions, scope)');
    expect(steps).not.toContain('Anything to leave out?');
  });

  it('is opened with the rollout’s own facts from the workspace', () => {
    const workspace = code('components/workspace/WorkspaceView.tsx');
    expect(workspace).toMatch(/openIntake\(\{ source: 'empty_state', releaseId: scopedReleaseId, prefill \}\)/);
    expect(workspace).toContain('scopedRolloutIntakePrefill(scopedReleaseSlim)');
    expect(workspace).toContain("source: 'onboarding'");
    expect(workspace).toContain('takeOnboardingPlannerHandoff(scopedReleaseId)');
  });
});

describe('onboarding', () => {
  const page = code('app/onboarding/OnboardingPageClient.tsx');

  it('asks for the artist on New project and sends it with the rollout (#854)', () => {
    const screen = code('components/onboarding/NewProjectScreen.tsx');
    expect(screen).toContain('<span className={labelClass}>Artist</span>');
    expect(page).toContain('artistName: submission.artistName');
  });

  it('lands on the new rollout and hands the planner over, instead of Home', () => {
    expect(page).toContain('goHome(onboardingLandingPath(releaseId, HOME_PATH))');
    expect(page).toContain('markOnboardingPlannerHandoff(');
    expect(page).toContain('startFirstSession(');
  });

  it('no longer leaves the share sheet a pending marker for the first session', () => {
    expect(page).not.toContain('markPendingFirstShare');
  });

  it('says what it is doing, and guards a tab close while the account is made', () => {
    expect(page).toContain("'Creating your account…'");
    expect(page).toContain("label: 'Building your plan…'");
    expect(page).toContain("addEventListener('beforeunload'");
  });
});

describe('the first session stays quiet', () => {
  it('holds back the deferred share, and never offers the rollout tour (card removed Oct 17, 2026)', () => {
    const workspace = code('components/workspace/WorkspaceView.tsx');
    expect(workspace).not.toContain('TourOfferCard');
    expect(workspace).not.toContain('setRolloutTourOfferFor');
    const sheet = code('components/share/ShareSheet.tsx');
    expect(sheet).toContain('isInFirstSession()');
    expect(sheet).toContain('useDeferredFirstShareOffer();');
    expect(sheet).toContain('decideDeferredShareOffer(');
  });

  it('is forgotten on sign-out', () => {
    expect(code('lib/auth-store.ts')).toContain('clearFirstSession();');
  });
});

// 2026-10-13: a prospect called the share sheet "too early" in a live
// walkthrough. Onboarding already saved its offer for the next visit; every
// other create path now does the same, and nothing opens the sheet straight
// after a create.
describe('the first-rollout share offer waits for the next visit', () => {
  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(join(APP_ROOT, dir))) {
      const path = join(dir, entry);
      if (statSync(join(APP_ROOT, path)).isDirectory()) out.push(...sourceFiles(path));
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
    }
    return out;
  }

  it('is opened by the sheet host alone, never by a create flow', () => {
    const opening = [...sourceFiles('components'), ...sourceFiles('app')]
      .filter((path) => /source:\s*'first_release'/.test(code(path)))
      .map((path) => path.replace(/\\/g, '/'));
    expect(opening).toEqual(['components/share/ShareSheet.tsx']);
  });

  it('is saved, not shown, by the create-flow wrapper and by AI', () => {
    const wrapper = code('components/share/withFirstShareOffer.ts');
    expect(wrapper).toContain('deferFirstShare(userId, releaseId)');
    expect(wrapper).not.toContain('useShareStore');
    const chat = code('components/chappi/ChappiConversation.tsx');
    expect(chat).toContain('deferFirstShareOffer(action.offerFirstShareFor, true)');
    expect(chat).toContain('deferFirstShareOffer(releaseId, true)');
  });

  it('is made on Home in a later visit, from either record', () => {
    const sheet = code('components/share/ShareSheet.tsx');
    expect(sheet).toContain('decideDeferredShareOffer(');
    expect(sheet).toContain('decideDeferredFirstShare(');
    expect(sheet).toContain('clearDeferredFirstShare();');
  });

  it('is forgotten on sign-out', () => {
    expect(code('lib/auth-store.ts')).toContain('clearDeferredFirstShare();');
  });
});

describe('the release create route', () => {
  const route = code('app/api/releases/route.ts');

  it('runs its independent reads and writes together', () => {
    expect(route).toMatch(/Promise\.all\(\[\s*ensureReleaseOpsSchema\(adminClient\)/);
    expect(route).toMatch(/const \[metadataResult, eventResult\] = await Promise\.all/);
    expect(code('app/api/releases/_shared.ts')).toContain('Promise.all(checks.map((check) => check.run()))');
  });

  it('records activation and reminders after the reply', () => {
    expect(route).toContain("afterResponse('release activation check'");
    expect(route).toContain("afterResponse('release reminders'");
    expect(route).not.toMatch(/await captureActivationIfReached/);
    expect(route).not.toMatch(/await enqueueReleaseReminders/);
  });
});

import { readFileSync } from 'node:fs';
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

  it('asks for the artist on the rollout step and sends it with the release', () => {
    expect(page).toMatch(/<span className=\{labelBase\}>Artist name<\/span>/);
    expect(page).toContain('maxLength={MAX_ONBOARDING_ARTIST_NAME_LENGTH}');
    expect(page).toMatch(/artistName: draft\.artistName\.trim\(\)\.slice\(0, MAX_ONBOARDING_ARTIST_NAME_LENGTH\)/);
    expect(page).toMatch(/draft\.artistName\.trim\(\)\.length > 0/);
  });

  it('lands on the new rollout and hands the planner over, instead of Home', () => {
    expect(page).toContain('homePath: onboardingLandingPath(created?.id, HOME_PATH)');
    expect(page).toContain('markOnboardingPlannerHandoff(');
    expect(page).toContain('startFirstSession(');
  });

  it('no longer leaves the share sheet a pending marker for the first session', () => {
    expect(page).not.toContain('markPendingFirstShare');
  });

  it('shows staged progress, guards a double submit and a tab close', () => {
    expect(page).toContain("onboardingProgressMessage('account'");
    expect(page).toContain("onboardingProgressMessage('rollout'");
    expect(page).toContain('ONBOARDING_PROGRESS_NOTE');
    expect(page).toContain('handoffRunningRef.current');
    expect(page).toContain("addEventListener('beforeunload'");
  });

  it('says Continuing on Skip and Sending on Send', () => {
    expect(page).toContain('{inviteLabels.skip}');
    expect(page).toContain('{inviteLabels.send}');
    expect(page).not.toContain("isFinishing ? 'Sending…'");
  });
});

describe('the first session stays quiet', () => {
  it('holds back the install card, the catalog tour, the rollout tour offer and the pending share', () => {
    expect(code('components/app/InstallAppPrompt.tsx')).toContain('isInFirstSession()');
    expect(code('components/tours/useCatalogTourAutoStart.ts')).toContain('isInFirstSession()');
    expect(code('components/workspace/WorkspaceView.tsx')).toMatch(
      /TOURS_ENABLED && !isInFirstSession\(\)\) setRolloutTourOfferFor/
    );
    const sheet = code('components/share/ShareSheet.tsx');
    expect(sheet).toContain('isInFirstSession()');
    expect(sheet).toContain('useDeferredFirstShareOffer();');
    expect(sheet).toContain('decideDeferredShareOffer(');
  });

  it('is forgotten on sign-out', () => {
    expect(code('lib/auth-store.ts')).toContain('clearFirstSession();');
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

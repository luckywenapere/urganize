import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Structural guards for the Spotify editorial pitch (2026-10-09). The rules
// themselves are pure and tested in editorial-pitch.test.ts; what cannot be
// reached from a unit test is the WIRING between them and the routes, and the
// wiring is where this kind of feature quietly stops working: a route that
// forgets the blocker, a cron that forgets the sweep, an ordinary sweep that
// starts calling the pitch overdue again.
//
// Each check reads real source with comments stripped, so prose that mentions a
// name cannot satisfy it (the account-export and release-access guards' rule).

const APP_ROOT = join(__dirname, '..');

function source(relative: string): string {
  const raw = readFileSync(join(APP_ROOT, relative), 'utf8');
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the Spotify pitch is enforced where it can be bypassed', () => {
  it('the task PATCH refuses done on the pitch while the order is open', () => {
    const route = source('app/api/tasks/[id]/route.ts');
    expect(route).toContain('isEditorialPitchTask(');
    expect(route).toContain('loadPitchBlocker(');
    // 409, not 402: the browser turns a 402 into a redirect to the paywall.
    expect(route).toMatch(/blocker[\s\S]{0,120}status: 409/);
    // And only for the status the blocker is about.
    expect(route).toMatch(/updates\.status === 'done'/);
  });

  it('the checkbox path says the pitch waits on the order, not on a step', () => {
    const rule = source('lib/release-execution.ts');
    expect(rule).toContain('PITCH_BLOCKED_COPY');
    expect(rule).toContain('isDistributionOrderTask(');
  });

  it('the ordinary due and overdue sweep leaves the pitch to its own reminders', () => {
    const tasks = source('lib/tasks-server.ts');
    const sweep = tasks.slice(tasks.indexOf('createDueDateNotificationsForAllUsers'));
    expect(sweep).toContain('isEditorialPitchTask(');
  });

  it('the morning cron runs the pitch reminder sweep', () => {
    const cron = source('app/api/cron/due-date-notifications/route.ts');
    expect(cron).toContain('runEditorialPitchReminderSweep(');
  });
});

describe('the pitch routes', () => {
  const ROUTES = [
    'app/api/tasks/[id]/editorial-pitch/route.ts',
    'app/api/tasks/[id]/editorial-pitch/skip/route.ts',
  ];

  for (const route of ROUTES) {
    it(`${route} authenticates, then checks team access to the task`, () => {
      const code = source(route);
      expect(code).toContain('requireAuthenticatedAdmin(');
      expect(code).toContain('ensureTaskAccess(');
      expect(code.indexOf('requireAuthenticatedAdmin(')).toBeLessThan(code.indexOf('ensureTaskAccess('));
    });

    it(`${route} only ever acts on the pitch task`, () => {
      expect(source(route)).toContain('isEditorialPitchTask(');
    });
  }

  it('a guest cannot save or skip', () => {
    for (const route of ROUTES) {
      const code = source(route);
      if (/export async function (PUT|POST)/.test(code)) {
        expect(code).toContain('isReadOnlyWorkspaceMember(');
      }
    }
  });

  it('the backfill is a POST behind the team-aware release gate', () => {
    const code = source('app/api/releases/[releaseId]/editorial-pitch/route.ts');
    expect(code).toContain('export async function POST');
    expect(code).not.toContain('export async function GET');
    expect(code).toContain('ensureReleaseTeamWriteAccess(');
    expect(code.indexOf('requireActiveAuthenticatedUser(')).toBeLessThan(
      code.indexOf('ensureReleaseTeamWriteAccess(')
    );
  });
});

describe('Draft my pitch goes through the one metered door', () => {
  it('is registered as a one-shot action, not called from a route of its own', () => {
    const registry = source('lib/urgans-actions/registry.ts');
    expect(registry).toContain('releaseDraftSpotifyPitchAction');
    // No route imports the action file directly: runUrgansAction is the only
    // caller, which is what carries the plan gate and the credit hold.
    for (const route of [
      'app/api/tasks/[id]/editorial-pitch/route.ts',
      'app/api/tasks/[id]/editorial-pitch/skip/route.ts',
    ]) {
      expect(source(route)).not.toContain('release-draft-spotify-pitch');
    }
  });
});

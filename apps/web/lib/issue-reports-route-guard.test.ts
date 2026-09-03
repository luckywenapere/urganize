import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A structural guard, modelled on lib/account-export.test.ts's paywall guard
// (itself modelled on lib/schema-fallback-guard.test.ts).
//
// The property it defends: a walled, read-only or payment-lapsed team must
// still be able to report a bug. That rests on ONE import — the moment this
// route reaches for requireActiveAuthenticatedUser it inherits
// requireActiveAccount, which answers 402, which lib/access-redirect.ts turns
// into a browser redirect to /locked. Somebody mid-report would be thrown out
// of the app by the act of reporting that the app threw them out.
//
// A comment cannot defend that. This can.

const routePath = join(process.cwd(), 'app/api/issue-reports/route.ts');
const raw = readFileSync(routePath, 'utf8');

// Comments stripped before matching, and not as a convenience: the route's own
// header NAMES the wrappers it deliberately avoids, so a raw grep would fail on
// the very prose explaining the rule. The guard has to read code.
const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the report route is never put behind the paywall', () => {
  it('uses the open-route auth helper', () => {
    expect(source).toContain('getAuthenticatedUser');
  });

  it('does not use any paywall-gated auth wrapper', () => {
    expect(source).not.toMatch(/requireActiveAuthenticatedUser/);
    expect(source).not.toMatch(/requireAuthenticatedAdmin/);
    expect(source).not.toMatch(/requireActiveAccount/);
  });

  it('does not consult team access or the hard paywall flag', () => {
    expect(source).not.toMatch(/getTeamAccessForUser/);
    expect(source).not.toMatch(/isHardPaywallEnabled/);
  });
});

describe('the report route never trusts client-sent identity', () => {
  // Name, email, team, plan and role are resolved server-side from the
  // authenticated user id. If the route ever reads one of these off the request
  // body, anyone can write a fake plan tier onto the Linear board.
  it('resolves identity through the server-side resolver', () => {
    expect(source).toContain('resolveReporterContext');
  });

  it('does not read an identity field off the payload', () => {
    for (const field of [
      'reporterName',
      'reporterEmail',
      'workspaceName',
      'plan',
      'role',
      'releaseTitle',
    ]) {
      expect(source, field).not.toMatch(new RegExp(`payload\\.${field}\\b`));
      expect(source, field).not.toMatch(new RegExp(`body\\.${field}\\b`));
    }
  });
});

describe('the report route flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadShared(enabled: boolean) {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FEATURE_REPORT_ISSUE', enabled ? 'true' : 'false');
    return import('@/app/api/issue-reports/_shared');
  }

  it('is on only for the exact string "true"', async () => {
    expect((await loadShared(true)).isIssueReportingEnabled()).toBe(true);
    expect((await loadShared(false)).isIssueReportingEnabled()).toBe(false);

    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FEATURE_REPORT_ISSUE', 'TRUE');
    const { isIssueReportingEnabled } = await import('@/app/api/issue-reports/_shared');
    expect(isIssueReportingEnabled()).toBe(false);
  });

  it('is off when the flag is unset', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FEATURE_REPORT_ISSUE', '');
    const { isIssueReportingEnabled } = await import('@/app/api/issue-reports/_shared');
    expect(isIssueReportingEnabled()).toBe(false);
  });

  it('is checked before anything else in the handler', () => {
    // Flag-404 must precede auth, so an unauthenticated probe cannot tell a
    // switched-off feature from a route that does not exist.
    const flagIndex = source.indexOf('isIssueReportingEnabled');
    const authIndex = source.indexOf('getAuthenticatedUser(');
    expect(flagIndex).toBeGreaterThan(-1);
    expect(authIndex).toBeGreaterThan(-1);
    expect(flagIndex).toBeLessThan(authIndex);
  });
});

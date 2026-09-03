import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { URGANS_ACTIONS } from './registry';

// Machine enforcement of the two guarantees the embedded-actions feature
// depends on and a comment alone cannot hold in place:
//
//  1. Every registered action carries a real prompt_version, so an
//     urgans_actions row always says which behaviour produced it.
//  2. THE METERING SPLIT. billing-events.ts's own header explains why
//     'urgans_embedded_action' must never collapse into 'urgans_action': that
//     string feeds the 40/150 monthly CHAT ceiling (lib/urgans-usage.ts), and
//     an embedded action is gated on plan tier instead — it must never touch
//     that count. This test is what stops a future edit (a convenience
//     wrapper, a copy-pasted billing call) from quietly re-merging the two.
//
// Modelled on lib/release-access-guard.test.ts: comments are stripped before
// matching, because prose (this very file, and billing-events.ts's own
// header) legitimately discusses the banned literal.

const APP_ROOT = join(__dirname, '..', '..');
const LIB_ROOT = join(APP_ROOT, 'lib/urgans-actions');
const ROUTES_ROOT = join(APP_ROOT, 'app/api/urgans/actions');

// Access + the entitlement check are centralized in server.ts
// (resolveActionScope / getEntitlement), not repeated in the route files —
// the "thin route, real logic in lib" convention this codebase already uses
// for release-planning-actions-server.ts. So the required-usage check below
// targets server.ts, the actual gate, rather than app/api/urgans/actions/route.ts.
const SERVER_FILE = join(LIB_ROOT, 'server.ts');

const BANNED_METERING_STRING = /'urgans_action'/;
const BANNED_HELPER_NAME = /recordUrgansAction/;

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// The account-export / release-access guards' exact rule: strip comments
// before matching, since prose legitimately names the banned literal.
const stripComments = (raw: string): string =>
  raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('every registered UrgAns action carries a prompt version', () => {
  it('the registry is not empty (guards the walker)', () => {
    expect(Object.keys(URGANS_ACTIONS).length).toBeGreaterThan(0);
  });

  for (const [id, action] of Object.entries(URGANS_ACTIONS)) {
    it(`${id} has a non-empty promptVersion`, () => {
      expect(typeof action.promptVersion).toBe('string');
      expect(action.promptVersion.trim().length).toBeGreaterThan(0);
    });

    it(`${id}'s id matches its registry key`, () => {
      expect(action.id).toBe(id);
    });
  }
});

describe('the embedded-actions surface is actually gated', () => {
  it('server.ts calls getEntitlement and the team-write access check', () => {
    const source = stripComments(readFileSync(SERVER_FILE, 'utf8'));
    expect(source).toMatch(/getEntitlement\(/);
    expect(source).toMatch(/ensureReleaseTeamWriteAccess/);
  });
});

describe('the metering split cannot regress silently', () => {
  const files = [
    ...collectTsFiles(LIB_ROOT).filter((file) => !file.endsWith('.test.ts')),
    ...collectTsFiles(ROUTES_ROOT),
  ];

  it('collects a plausible file set (guards the walker)', () => {
    // types, claim, guard, guard-server, server, registry, the one action —
    // an empty or tiny sweep means the directory moved and this guard went blind.
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(files.some((file) => file.endsWith('server.ts'))).toBe(true);
  });

  it('the comment stripper actually strips (guards the guard)', () => {
    expect(stripComments("// type: 'urgans_action'\nconst x = 1;")).not.toMatch(
      BANNED_METERING_STRING
    );
    expect(stripComments('/* recordUrgansAction */ const x = 1;')).not.toMatch(BANNED_HELPER_NAME);
    expect(stripComments("type: 'urgans_action'")).toMatch(BANNED_METERING_STRING);
  });

  for (const file of files) {
    const relative = file.slice(APP_ROOT.length + 1);
    const source = stripComments(readFileSync(file, 'utf8'));

    it(`${relative} never writes the literal 'urgans_action' billing event type`, () => {
      expect(
        source,
        `${relative} contains the literal 'urgans_action' — an embedded action ` +
          `must log 'urgans_embedded_action' instead, or it silently counts ` +
          `against the 40/150 monthly CHAT ceiling`
      ).not.toMatch(BANNED_METERING_STRING);
    });

    it(`${relative} does not call a recordUrgansAction convenience wrapper`, () => {
      expect(
        source,
        `${relative} calls recordUrgansAction — no such helper is sanctioned; ` +
          `log through lib/billing-events-server.ts's logBillingEvent directly ` +
          `with the correct event type`
      ).not.toMatch(BANNED_HELPER_NAME);
    });
  }
});

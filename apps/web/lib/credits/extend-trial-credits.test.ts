import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #1286: extending a trial that already ended gives back the trial credits that
// were taken when it ended. The credit rules are tested in credits-server.test.ts;
// this holds the wiring in the admin route, which nothing else runs: the
// extension must call the restore, after the new end date has landed and only
// for the extend action.

const route = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'admin', 'teams', 'route.ts'), 'utf8');

/** The route without comment lines, so prose cannot satisfy or trip a check. */
const code = route
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

describe('the admin Extend trial action', () => {
  it('gives the trial credits back through the credits module, not by writing the ledger itself', () => {
    expect(code).toMatch(/import\s*\{[^}]*\brestoreTrialCredits\b[^}]*\}\s*from\s*'@\/lib\/credits\/credits-server'/);
    expect(code).not.toMatch(/credit_ledger/);
  });

  it('does it after the new end date has been saved, so a failed save gives nothing back', () => {
    const saved = code.indexOf(".from('workspaces').update(patch)");
    const restore = code.indexOf('restoreTrialCredits(');
    expect(saved).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(saved);
  });

  it('does it only when the action is Extend trial', () => {
    const restore = code.indexOf('restoreTrialCredits(');
    const guard = code.lastIndexOf("action.type === 'extend_trial'", restore);
    expect(guard).toBeGreaterThan(-1);
    // The nearest condition above the call is the extend check, not the notice's.
    expect(code.slice(guard, restore)).not.toMatch(/action\.type === 'comp'/);
  });

  it('says in the action log how many credits it gave back', () => {
    expect(code).toMatch(/eventMetadata\.trialCreditsRestored\s*=/);
  });
});

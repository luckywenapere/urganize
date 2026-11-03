import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_USAGE_FEATURES } from './ai/usage-log';
import { URGANS_CHOSEN_FEATURES } from './admin-urgans-usage';

// The founder's rule for the cockpit's UrgAns share (iteration 6, 2026-10-10):
// status updates and task outcome replies count as using UrgAns ONLY if they
// cost AI tokens or credits. They charge no credits, but each is a model call
// written to the AI usage log with its provider cost, so they count. This test
// reads the two routes, so if either stops writing to the usage log (and so
// stops costing anything we can see) the rule is looked at again.

const root = path.resolve(__dirname, '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('which AI features count on the cockpit', () => {
  it('counts every feature the AI usage log records', () => {
    expect([...URGANS_CHOSEN_FEATURES].sort()).toEqual([...AI_USAGE_FEATURES].sort());
    expect(URGANS_CHOSEN_FEATURES.has('status')).toBe(true);
    expect(URGANS_CHOSEN_FEATURES.has('outcome')).toBe(true);
  });

  it.each([
    ['status', 'app/api/releases/[releaseId]/generate-status/route.ts'],
    ['outcome', 'app/api/tasks/[id]/outcome/route.ts'],
  ])('the %s route records its model call in the usage log', (feature, file) => {
    const source = read(file);
    expect(source).toContain('recordRequestUsage(');
    expect(source).toContain(`feature: '${feature}'`);
    // No credits are charged; the cost shows up only in the usage log.
    expect(source).toContain('creditsCharged: 0');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// F-14: small correctness items from the 2026-10-21 QA pass.
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('small fixes', () => {
  it('Escape closes the person edit form like Cancel', () => {
    const page = read('app', 'dashboard', 'relationships', '[personId]', 'RelationshipPageClient.tsx');
    expect(page).toMatch(/event\.key === 'Escape'[\s\S]{0,120}setDraft\(null\)/);
  });
  it('the admin test rollouts count is singular for one', () => {
    const view = read('components', 'admin', 'MetricsView.tsx');
    expect(view).toContain("rollouts.tests === 1 ? 'rollout' : 'rollouts'");
  });
});

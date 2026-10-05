import { describe, expect, it } from 'vitest';
import * as welcome from './welcome';

describe('first-run Home copy', () => {
  const lines = Object.values(welcome);
  it('is plain: no em dash, no exclamation mark, never workspace', () => {
    for (const line of lines) {
      expect(line).not.toMatch(/[—–!]/);
      expect(line.toLowerCase()).not.toContain('workspace');
    }
  });
  it('says rollout, not release, for the thing being started', () => {
    expect(welcome.WELCOME_PRIMARY.toLowerCase()).toContain('rollout');
  });
});

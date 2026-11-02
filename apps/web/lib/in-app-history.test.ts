import { describe, expect, it, vi } from 'vitest';

describe('in-app history', () => {
  it('has no predecessor until a non-Settings page is seen', async () => {
    vi.resetModules();
    const history = await import('./in-app-history');
    expect(history.hasInAppPredecessor()).toBe(false);
    history.noteInAppPath('/dashboard/account', '/dashboard/account');
    expect(history.hasInAppPredecessor()).toBe(false);
    history.noteInAppPath('/dashboard', '/dashboard/account');
    expect(history.hasInAppPredecessor()).toBe(true);
  });
});

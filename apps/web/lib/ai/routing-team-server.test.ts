import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTeamAccessForUser = vi.fn();

vi.mock('@/lib/team-billing-server', () => ({
  getTeamAccessForUser: (...args: unknown[]) => getTeamAccessForUser(...args),
}));

import { loadTeamForRouting } from './routing-team-server';

const user = { id: 'user-1', email: 'manager@example.com' };
const RODIUM = 'https://api.rodiumai.io';

beforeEach(() => {
  getTeamAccessForUser.mockReset();
  getTeamAccessForUser.mockResolvedValue({ state: 'paid', tier: 'manager', primaryWorkspaceId: 'ws-1' });
});

describe('loadTeamForRouting', () => {
  it('reads nothing while the router is off, so a request with the router off costs no extra query', async () => {
    expect(await loadTeamForRouting('planner', user, {})).toBeUndefined();
    expect(getTeamAccessForUser).not.toHaveBeenCalled();
  });

  it('reads nothing on a gateway that does not carry the ladder, even with the switch on', async () => {
    const env = { AI_ROUTER: 'on', AI_API_BASE: 'https://openrouter.ai/api/v1' };
    expect(await loadTeamForRouting('planner', user, env)).toBeUndefined();
    expect(getTeamAccessForUser).not.toHaveBeenCalled();
  });

  it('returns the two facts the plan ceiling needs, and nothing else', async () => {
    const env = { AI_ROUTER: 'on', AI_API_BASE: RODIUM };
    expect(await loadTeamForRouting('planner', user, env)).toEqual({ state: 'paid', tier: 'manager' });
    expect(getTeamAccessForUser).toHaveBeenCalledWith('user-1', 'manager@example.com');
  });

  it('reads it in shadow as well, so the recorded ceiling is the real one', async () => {
    const env = { AI_ROUTER: 'shadow', AI_API_BASE: RODIUM };
    expect(await loadTeamForRouting('planner', user, env)).toEqual({ state: 'paid', tier: 'manager' });
  });

  it('passes no email when the caller has none', async () => {
    const env = { AI_ROUTER: 'on', AI_API_BASE: RODIUM };
    await loadTeamForRouting('planner', { id: 'owner-1', email: null }, env);
    expect(getTeamAccessForUser).toHaveBeenCalledWith('owner-1', null);
  });

  it('answers nothing, rather than failing the request, when the lookup fails', async () => {
    getTeamAccessForUser.mockRejectedValue(new Error('database down'));
    const env = { AI_ROUTER: 'on', AI_API_BASE: RODIUM };
    // No team means the request is held at Manager level, which is safe.
    expect(await loadTeamForRouting('planner', user, env)).toBeUndefined();
  });
});

import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The urgans_do tool route, driven end to end through its real code with only
// the IO edges mocked (the confirmation-flow.test.ts pattern). What it holds:
// a voice request reaches the typed UrgAns handler and nothing else, with the
// caller's own credentials; a "yes" can only ever run the ONE action the server
// stored for this call; and a call that cannot pay its next minute acts no more.

const runUrgansTurn = vi.fn();
const billOwedMinutes = vi.fn();
const updateVoiceSession = vi.fn();
const requireActiveSession = vi.fn();

vi.mock('@/app/api/urgans/route', () => ({ POST: (request: NextRequest) => runUrgansTurn(request) }));
vi.mock('../_shared', () => ({
  openVoiceGate: vi.fn(async () => ({
    auth: { adminClient: {}, user: { id: 'user-1', email: 'a@b.c' }, creditsOnly: null },
    team: { ownerUserId: 'owner-1', primaryWorkspaceId: 'ws-1' },
    workspaceId: 'ws-1',
  })),
  readCredits: vi.fn(async () => ({ total: 40 })),
  requireActiveSession: (...args: unknown[]) => requireActiveSession(...args),
}));
vi.mock('@/lib/urgans-voice-realtime-server', () => ({
  billOwedMinutes: (...args: unknown[]) => billOwedMinutes(...args),
  updateVoiceSession: (...args: unknown[]) => updateVoiceSession(...args),
}));

import { POST } from './route';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const pendingDelete = {
  toolName: 'delete_release',
  args: { releaseId: 'rel-real' },
  title: 'Delete "Midnight EP"?',
  detail: 'Its 42 activities go too.',
};

function session(over: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    workspace_id: 'ws-1',
    owner_user_id: 'owner-1',
    user_id: 'user-1',
    transport: 'cascade',
    model: 'm',
    status: 'active',
    started_at: new Date().toISOString(),
    minutes_billed: 1,
    credits_charged: 2,
    actions_count: 0,
    pending_action: null,
    ...over,
  };
}

function call(body: Record<string, unknown>) {
  return POST(
    new NextRequest('https://app.urganize.app/api/urgans/voice/tool', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer user-token' },
      body: JSON.stringify(body),
    })
  );
}

const agentReply = (over: Record<string, unknown> = {}) =>
  NextResponse.json({ mode: 'agent', reply: 'Done. I moved it.', clientActions: [{ type: 'refresh' }], pendingConfirmation: null, ...over });

const innerBody = async (index = 0) => JSON.parse(await (runUrgansTurn.mock.calls[index][0] as NextRequest).text());

beforeEach(() => {
  vi.clearAllMocks();
  billOwedMinutes.mockResolvedValue({ decision: { kind: 'nothing', minutesBilled: 1 }, balance: 38, minutesBilled: 1 });
  updateVoiceSession.mockResolvedValue(true);
});

describe('the urgans_do tool route', () => {
  it('refuses a call that is not the caller\'s own active call, and runs nothing', async () => {
    requireActiveSession.mockResolvedValue({ error: NextResponse.json({ error: 'That call is not running.' }, { status: 404 }) });
    const response = await call({ sessionId: SESSION_ID, request: 'delete everything' });
    expect(response.status).toBe(404);
    expect(runUrgansTurn).not.toHaveBeenCalled();
    expect(billOwedMinutes).not.toHaveBeenCalled();
  });

  it('hands a request to the typed AI handler, with the caller\'s own credentials and nothing else', async () => {
    requireActiveSession.mockResolvedValue({ session: session() });
    runUrgansTurn.mockResolvedValue(agentReply());
    const response = await call({
      sessionId: SESSION_ID,
      request: 'move the release to December 12',
      transcript: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'Hi. What do you need?' }],
    });
    expect(response.status).toBe(200);
    const inner = runUrgansTurn.mock.calls[0][0] as NextRequest;
    expect(inner.headers.get('authorization')).toBe('Bearer user-token');
    expect(inner.headers.get('x-urgans-surface')).toBe('voice');
    const body = await innerBody();
    expect(body.confirmedAction).toBeUndefined();
    expect(body.messages.at(-1)).toMatchObject({ role: 'user', content: 'move the release to December 12' });
    expect((await response.json()).spoken).toBe('Done. I moved it.');
  });

  it('stores a proposed action on the call and asks for it aloud', async () => {
    requireActiveSession.mockResolvedValue({ session: session() });
    runUrgansTurn.mockResolvedValue(agentReply({ reply: '', clientActions: [], pendingConfirmation: pendingDelete }));
    const response = await call({ sessionId: SESSION_ID, request: 'delete midnight ep' });
    const json = await response.json();
    expect(json.pendingConfirmation).toEqual({ title: pendingDelete.title, detail: pendingDelete.detail });
    expect(json.spoken).toBe('Delete "Midnight EP". Its 42 activities go too. Should I go ahead?');
    expect(updateVoiceSession).toHaveBeenCalledWith({}, SESSION_ID, expect.objectContaining({ pending_action: pendingDelete }));
  });

  it('runs ONLY the stored action on a yes, whatever the request body claims', async () => {
    requireActiveSession.mockResolvedValue({ session: session({ pending_action: pendingDelete }) });
    runUrgansTurn.mockResolvedValue(agentReply({ reply: 'Deleted.' }));
    await call({
      sessionId: SESSION_ID,
      request: 'yes',
      confirmed: true,
      // A tampered body: none of this may reach the handler.
      confirmedAction: { toolName: 'remove_teammate', args: { userId: 'victim' } },
      toolName: 'remove_teammate',
    });
    const body = await innerBody();
    expect(body.confirmedAction).toEqual({ toolName: 'delete_release', args: { releaseId: 'rel-real' } });
    // Cleared before it runs, so a second yes cannot run it again.
    const clearAt = updateVoiceSession.mock.invocationCallOrder[0];
    expect(updateVoiceSession.mock.calls[0][2]).toEqual({ pending_action: null });
    expect(clearAt).toBeLessThan(runUrgansTurn.mock.invocationCallOrder[0]);
  });

  it('answers a yes with nothing waiting by running nothing', async () => {
    requireActiveSession.mockResolvedValue({ session: session({ pending_action: null }) });
    const response = await call({ sessionId: SESSION_ID, request: 'yes', confirmed: true });
    expect(response.status).toBe(409);
    expect(runUrgansTurn).not.toHaveBeenCalled();
  });

  it('cancels on a no, clearing the stored action without running anything', async () => {
    requireActiveSession.mockResolvedValue({ session: session({ pending_action: pendingDelete }) });
    const response = await call({ sessionId: SESSION_ID, request: 'no', cancel: true });
    expect(response.status).toBe(200);
    expect(runUrgansTurn).not.toHaveBeenCalled();
    expect(updateVoiceSession).toHaveBeenCalledWith({}, SESSION_ID, { pending_action: null });
  });

  it('acts no more once the call cannot pay its next minute, and ends it', async () => {
    requireActiveSession.mockResolvedValue({ session: session() });
    billOwedMinutes.mockResolvedValue({
      decision: { kind: 'refuse', reason: 'out_of_credits', minutes: 0, minutesBilled: 1, credits: 0 },
      balance: 0,
      minutesBilled: 1,
    });
    const response = await call({ sessionId: SESSION_ID, request: 'make a plan' });
    expect(response.status).toBe(402);
    expect((await response.json()).ended).toBe(true);
    expect(runUrgansTurn).not.toHaveBeenCalled();
    expect(updateVoiceSession).toHaveBeenCalledWith({}, SESSION_ID, expect.objectContaining({ status: 'ended', end_reason: 'out_of_credits' }));
  });
});

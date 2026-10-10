import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const sendEmail = vi.fn();
const isEmailConfigured = vi.fn();

vi.mock('./email', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  isEmailConfigured: () => isEmailConfigured(),
}));

import { notifyWorkRequest, notifyWorkRequestAnswer } from './work-requests-server';
import type { StartResult } from './work-request-start';

const started: StartResult = {
  status: 'started',
  kind: 'manager_rollout',
  releaseId: 'r1',
  releaseTitle: 'Midnight EP',
  personAdded: true,
  taskTitle: null,
};

function adminWith(users: Record<string, { email?: string; name?: string } | null>, profile?: Record<string, unknown>) {
  return {
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({
          data: { user: users[id] ? { id, email: users[id]!.email, user_metadata: { name: users[id]!.name } } : null },
          error: null,
        })),
      },
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: profile ?? null }) }),
      }),
    })),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  isEmailConfigured.mockReturnValue(true);
  sendEmail.mockResolvedValue({ status: 'sent' });
});

describe('notifyWorkRequest', () => {
  it('sends what the sender wrote about what is coming, and nothing about the rollout', async () => {
    const admin = adminWith({ rec: { email: 'rec@example.com', name: 'Dami Cole' } });
    await notifyWorkRequest(admin, {
      recipientUserId: 'rec',
      senderName: 'Dorian',
      role: 'manager',
      note: 'Hi.',
      nextRelease: 'Midnight EP',
      links: ['https://example.com/demo'],
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const sent = sendEmail.mock.calls[0][1];
    expect(sent.props).toMatchObject({
      nextRelease: 'Midnight EP',
      links: ['https://example.com/demo'],
      roleLabel: 'Manager',
    });
    expect(sent.fromLabel).toBe('Dorian via Urganize');
    // No rollout id, title or team id rides in the props.
    expect(JSON.stringify(sent)).not.toMatch(/release_?id|workspace/i);
  });

  it('sends a plain ask exactly as it always was', async () => {
    const admin = adminWith({ rec: { email: 'rec@example.com' } });
    await notifyWorkRequest(admin, { recipientUserId: 'rec', senderName: 'Dorian', role: 'pr', note: 'Hi.' });
    const props = sendEmail.mock.calls[0][1].props;
    expect(props.nextRelease).toBeUndefined();
    expect(props.links).toBeUndefined();
  });

  it('does nothing when email is not set up, and never throws', async () => {
    isEmailConfigured.mockReturnValue(false);
    const admin = adminWith({ rec: { email: 'rec@example.com' } });
    await expect(
      notifyWorkRequest(admin, { recipientUserId: 'rec', senderName: 'x', role: 'pr', note: 'y' })
    ).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();

    isEmailConfigured.mockReturnValue(true);
    sendEmail.mockRejectedValue(new Error('boom'));
    await expect(
      notifyWorkRequest(admin, { recipientUserId: 'rec', senderName: 'x', role: 'pr', note: 'y' })
    ).resolves.toBeUndefined();
  });

  it('does nothing for a person with no email on record', async () => {
    await notifyWorkRequest(adminWith({ rec: null }), {
      recipientUserId: 'rec',
      senderName: 'x',
      role: 'pr',
      note: 'y',
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('notifyWorkRequestAnswer', () => {
  const users = {
    sender: { email: 'sender@example.com', name: 'Dorian' },
    answerer: { email: 'dami@example.com', name: 'Dami Cole' },
  };
  const base = { senderUserId: 'sender', recipientUserId: 'answerer', role: 'manager', reply: null };

  it('tells the asker what started, and how to reach the person, after a yes', async () => {
    await notifyWorkRequestAnswer(adminWith(users), { ...base, status: 'interested', start: started });
    const sent = sendEmail.mock.calls[0][1];
    expect(sent.to).toBe('sender@example.com');
    expect(sent.props.contactEmail).toBe('dami@example.com');
    expect(sent.props.startNote).toBe('Dami Cole started “Midnight EP” and you are on it.');
    expect(sent.replyTo).toBe('dami@example.com');
  });

  // The consent line: a pass reveals nothing, whatever it was handed.
  it('says nothing about starting and reveals no address on a pass', async () => {
    await notifyWorkRequestAnswer(adminWith(users), { ...base, status: 'passed', start: started });
    const sent = sendEmail.mock.calls[0][1];
    expect(sent.props.startNote).toBeUndefined();
    expect(sent.props.contactEmail).toBeUndefined();
    expect(sent.replyTo).toBeUndefined();
    expect(sent.props.interested).toBe(false);
  });

  it('carries no start line when nothing started', async () => {
    await notifyWorkRequestAnswer(adminWith(users), { ...base, status: 'interested' });
    expect(sendEmail.mock.calls[0][1].props.startNote).toBeUndefined();
    await notifyWorkRequestAnswer(adminWith(users), { ...base, status: 'interested', start: null });
    expect(sendEmail.mock.calls[1][1].props.startNote).toBeUndefined();
  });

  it('says nothing about a start that did not happen', async () => {
    await notifyWorkRequestAnswer(adminWith(users), {
      ...base,
      status: 'interested',
      start: { status: 'not_started', kind: 'manager_rollout', reason: 'failed', detail: null },
    });
    expect(sendEmail.mock.calls[0][1].props.startNote).toBeUndefined();
  });

  it('links a profile only when it is public', async () => {
    await notifyWorkRequestAnswer(adminWith(users, { slug: 'dami', visibility: 'public' }), {
      ...base,
      status: 'interested',
    });
    expect(String(sendEmail.mock.calls[0][1].props.profileUrl)).toContain('/p/dami');
    await notifyWorkRequestAnswer(adminWith(users, { slug: 'dami', visibility: 'directory' }), {
      ...base,
      status: 'interested',
    });
    expect(sendEmail.mock.calls[1][1].props.profileUrl).toBeUndefined();
  });

  it('never throws, and does nothing without a way to reach the asker', async () => {
    await expect(
      notifyWorkRequestAnswer(adminWith({ ...users, sender: null }), { ...base, status: 'interested' })
    ).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    sendEmail.mockRejectedValue(new Error('boom'));
    await expect(
      notifyWorkRequestAnswer(adminWith(users), { ...base, status: 'interested' })
    ).resolves.toBeUndefined();
  });
});

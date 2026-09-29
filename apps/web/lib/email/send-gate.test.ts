import { beforeEach, describe, expect, it, vi } from 'vitest';

// Drives the real sendEmail with only its IO edges mocked: the transport, the
// log and the suppression lookup.
const sendViaResend = vi.fn();
const isSuppressed = vi.fn();
const insertTerminal = vi.fn();

vi.mock('./transport', () => ({ sendViaResend: (...a: unknown[]) => sendViaResend(...a) }));
vi.mock('./suppression-server', () => ({ isSuppressed: (...a: unknown[]) => isSuppressed(...a) }));
vi.mock('./log-server', () => ({
  insertPendingEmailLog: vi.fn(async () => 'log-1'),
  insertTerminalEmailLog: (...a: unknown[]) => insertTerminal(...a),
  markEmailLogSent: vi.fn(),
  markEmailLogFailed: vi.fn(),
}));

const admin = {} as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('EMAIL_FROM', 'Urganize <hello@urganize.app>');
  sendViaResend.mockResolvedValue({ ok: true, id: 'r1' });
  isSuppressed.mockResolvedValue(false);
});

async function sendWelcome() {
  const { sendEmail } = await import('./index');
  return sendEmail(admin, {
    templateId: 'welcome',
    to: 'ada@example.com',
    props: { recipientName: 'Ada' },
    trigger: 'onboarding_completed',
  });
}

describe('sendEmail unsubscribe and suppression', () => {
  it('adds one-click headers and a footer link to an optional email', async () => {
    await sendWelcome();
    const input = sendViaResend.mock.calls[0][1];
    expect(input.headers['List-Unsubscribe']).toMatch(
      /^<https:\/\/app\.urganize\.app\/api\/email\/unsubscribe\?t=/
    );
    expect(input.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(input.html).toContain('/unsubscribe?t=');
  });

  it('does not send optional mail to a suppressed address, and logs it', async () => {
    isSuppressed.mockResolvedValue(true);
    const result = await sendWelcome();
    expect(result).toEqual({ ok: false, skipped: true });
    expect(sendViaResend).not.toHaveBeenCalled();
    expect(insertTerminal.mock.calls[0][2]).toBe('unsubscribed');
  });

  it('never consults suppression for transactional mail, and adds no unsubscribe', async () => {
    isSuppressed.mockResolvedValue(true);
    const { sendEmail } = await import('./index');
    const result = await sendEmail(admin, {
      templateId: 'notify_admin',
      to: 'ada@example.com',
      props: { requesterLabel: 'Bo', teamName: 'T', activateUrl: 'https://app.urganize.app/locked' },
      trigger: 'test',
    });
    expect(isSuppressed).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(sendViaResend.mock.calls[0][1].headers).toEqual({});
  });
});

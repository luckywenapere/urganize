import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SENDER_ALLOWLIST, isAllowedSender } from './config';
import { composeFromHeader } from './headers';
import {
  DEFAULT_TEMPLATE_SENDER,
  EMAIL_TEMPLATES,
  getEmailTemplateMeta,
  resolveTemplateSender,
} from './registry';
import type { EmailTemplateId } from './templates/props';

// The founder-approved sender mapping (2026-10-16). Changing a sender is a
// deliberate act: update this table with it.
const NOTIFY = { from: 'Urganize <notifications@urganize.app>', replyTo: 'support@urganize.app' };
const VERIFY = { from: 'Urganize <verify@urganize.app>', replyTo: 'support@urganize.app' };
const BILLING = { from: 'Urganize Billing <billing@urganize.app>', replyTo: 'support@urganize.app' };
const FOUNDER = { from: 'Oyin at Urganize <wenapere@urganize.app>', replyTo: 'wenapere@urganize.app' };
const HELLO = { from: 'Urganize <hello@urganize.app>', replyTo: 'hello@urganize.app' };
const ALERTS = { from: 'Urganize Alerts <alerts@urganize.app>', replyTo: null };

const EXPECTED: Record<EmailTemplateId, { from: string; replyTo: string | null }> = {
  workspace_invite: NOTIFY,
  task_assigned: NOTIFY,
  chat_mention: NOTIFY,
  chime_in: NOTIFY,
  credit_submission: NOTIFY,
  claim_invite: NOTIFY,
  claim_auto_invite: NOTIFY,
  claim_reminder: NOTIFY,
  work_request: NOTIFY,
  work_request_answer: NOTIFY,
  directory_invite: NOTIFY,
  curator_application_approved: NOTIFY,
  notify_admin: NOTIFY,
  pitch_notice: NOTIFY,
  front_desk_digest: { from: 'Urganize AI <notifications@urganize.app>', replyTo: 'support@urganize.app' },
  release_payback_question: NOTIFY,
  release_out_now: NOTIFY,
  claim_code: VERIFY,
  pay_link: BILLING,
  team_admin_notice: BILLING,
  referral_reward: BILLING,
  waitlist_joined: NOTIFY,
  welcome: FOUNDER,
  onboarding_step: FOUNDER,
  self_serve_nudge: FOUNDER,
  renewal_reminder: BILLING,
  help_request: { from: 'Urganize Help <notifications@urganize.app>', replyTo: null },
  announcement: HELLO,
  founder_billing_alert: ALERTS,
  founder_ops_alert: ALERTS,
};

const CONFIG = { from: 'Urganize <lucky@urganize.app>', replyTo: 'lucky@urganize.app' };

describe('per-template senders', () => {
  it('maps every template to its approved From and Reply-To', () => {
    const ids = Object.keys(EMAIL_TEMPLATES) as EmailTemplateId[];
    expect(ids.sort()).toEqual((Object.keys(EXPECTED) as EmailTemplateId[]).sort());
    for (const id of ids) {
      const sender = resolveTemplateSender(getEmailTemplateMeta(id), CONFIG);
      expect({ id, from: sender.from, replyTo: sender.replyTo }).toEqual({ id, ...EXPECTED[id] });
      expect(sender.usedFallback).toBe(false);
    }
  });

  it('only names allowlisted addresses, all on the root domain', () => {
    for (const meta of Object.values(EMAIL_TEMPLATES)) {
      expect(meta.fromAddress && isAllowedSender(meta.fromAddress)).toBe(true);
      if (meta.replyTo) expect(isAllowedSender(meta.replyTo)).toBe(true);
    }
    for (const address of SENDER_ALLOWLIST) expect(address.endsWith('@urganize.app')).toBe(true);
  });

  it('sends a template with no sender of its own from notifications@, replies to support@', () => {
    const sender = resolveTemplateSender({}, CONFIG);
    expect(sender.from).toBe(`Urganize <${DEFAULT_TEMPLATE_SENDER.fromAddress}>`);
    expect(sender.replyTo).toBe('support@urganize.app');
  });

  it('falls back to EMAIL_FROM and EMAIL_REPLY_TO when the address is not allowlisted', () => {
    const sender = resolveTemplateSender({ fromAddress: 'x@evil.com' as never, fromName: 'X' }, CONFIG);
    expect(sender).toEqual({
      from: CONFIG.from,
      address: 'lucky@urganize.app',
      replyTo: CONFIG.replyTo,
      usedFallback: true,
    });
  });

  it('keeps the per-send display-name override on the template address', () => {
    const sender = resolveTemplateSender(getEmailTemplateMeta('task_assigned'), CONFIG);
    expect(composeFromHeader(sender.from, 'Oyin via Urganize')).toBe('Oyin via Urganize <notifications@urganize.app>');
  });
});

// The wiring through sendEmail to the transport, with IO edges mocked.
const sendViaResend = vi.fn();
vi.mock('./transport', () => ({ sendViaResend: (...a: unknown[]) => sendViaResend(...a) }));
vi.mock('./suppression-server', () => ({ isSuppressed: vi.fn(async () => false) }));
const insertPending = vi.fn(async (..._a: unknown[]) => 'log-1');
const insertTerminal = vi.fn();
vi.mock('./log-server', () => ({
  insertPendingEmailLog: (...a: unknown[]) => insertPending(...a),
  insertTerminalEmailLog: (...a: unknown[]) => insertTerminal(...a),
  markEmailLogSent: vi.fn(),
  markEmailLogFailed: vi.fn(),
}));

describe('sendEmail uses the template sender', { timeout: 30_000 }, () => {
  beforeEach(() => {
    sendViaResend.mockReset();
    insertPending.mockClear();
    insertTerminal.mockReset();
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', 'Urganize <lucky@urganize.app>');
    vi.stubEnv('EMAIL_REPLY_TO', 'lucky@urganize.app');
    sendViaResend.mockResolvedValue({ ok: true, id: 'r1' });
  });
  afterEach(() => vi.unstubAllEnvs());

  const notifyAdmin = {
    templateId: 'notify_admin' as const,
    to: 'ada@example.com',
    props: { requesterLabel: 'Bo', teamName: 'T', activateUrl: 'https://app.urganize.app/locked' },
    trigger: 'test',
  };

  it('passes the template From and Reply-To to the transport and the log', async () => {
    const { sendEmail } = await import('./index');
    await sendEmail({} as never, notifyAdmin);
    const input = sendViaResend.mock.calls[0][1];
    expect(input.from).toBe('Urganize <notifications@urganize.app>');
    expect(input.replyTo).toBe('support@urganize.app');
    const log = insertPending.mock.calls[0][1] as { fromAddress: string; replyTo: string | null };
    expect(log.fromAddress).toBe('notifications@urganize.app');
    expect(log.replyTo).toBe('support@urganize.app');
  });

  it('keeps a per-send display name and a per-send Reply-To', async () => {
    const { sendEmail } = await import('./index');
    await sendEmail({} as never, { ...notifyAdmin, fromLabel: 'Oyin via Urganize', replyTo: 'bo@example.com' });
    const input = sendViaResend.mock.calls[0][1];
    expect(input.from).toBe('Oyin via Urganize <notifications@urganize.app>');
    expect(input.replyTo).toBe('bo@example.com');
  });

  it('omits Reply-To on founder alerts', async () => {
    const { sendEmail } = await import('./index');
    await sendEmail({} as never, {
      templateId: 'founder_ops_alert',
      to: 'lucky@urganize.app',
      props: { subject: 'Refund failed', headline: 'A refund failed.', facts: [['Pitch', 'p1']] },
      trigger: 'test',
    });
    const input = sendViaResend.mock.calls[0][1];
    expect(input.from).toBe('Urganize Alerts <alerts@urganize.app>');
    expect(input.replyTo).toBeNull();
  });

  it('is still switched off by an unset EMAIL_FROM', async () => {
    vi.stubEnv('EMAIL_FROM', '');
    const { sendEmail } = await import('./index');
    const result = await sendEmail({} as never, notifyAdmin);
    expect(result).toEqual({ ok: false, skipped: true, reason: 'not_configured' });
    expect(sendViaResend).not.toHaveBeenCalled();
  });
});

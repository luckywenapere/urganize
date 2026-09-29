import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  isPermanentBounce,
  recipientOf,
  shouldAdvanceStatus,
  statusForEvent,
  verifyResendWebhook,
} from './webhook';

const KEY = Buffer.from('super-secret-bytes');
const SECRET = `whsec_${KEY.toString('base64')}`;
const NOW = 1_800_000_000;
const BODY = '{"type":"email.delivered"}';

function signed(id = 'msg_1', ts = String(NOW), body = BODY) {
  const sig = createHmac('sha256', KEY).update(`${id}.${ts}.${body}`).digest('base64');
  return { id, timestamp: ts, signature: `v1,${sig}` };
}

describe('verifyResendWebhook', () => {
  it('accepts a correctly signed, fresh request', () => {
    expect(verifyResendWebhook(SECRET, BODY, signed(), NOW)).toBe(true);
  });

  it('accepts when one of several signatures matches (secret rotation)', () => {
    const h = signed();
    expect(verifyResendWebhook(SECRET, BODY, { ...h, signature: `v1,AAAA ${h.signature}` }, NOW)).toBe(true);
  });

  it('rejects a body that changed after signing', () => {
    expect(verifyResendWebhook(SECRET, BODY + ' ', signed(), NOW)).toBe(false);
  });

  it('rejects the wrong secret and missing headers', () => {
    expect(verifyResendWebhook('whsec_' + Buffer.from('nope').toString('base64'), BODY, signed(), NOW)).toBe(false);
    expect(verifyResendWebhook(SECRET, BODY, { id: null, timestamp: null, signature: null }, NOW)).toBe(false);
  });

  it('rejects a replay outside the five minute window, either direction', () => {
    expect(verifyResendWebhook(SECRET, BODY, signed('m', String(NOW - 301)), NOW)).toBe(false);
    expect(verifyResendWebhook(SECRET, BODY, signed('m', String(NOW + 301)), NOW)).toBe(false);
    expect(verifyResendWebhook(SECRET, BODY, signed('m', String(NOW - 299)), NOW)).toBe(true);
  });

  it('rejects a non-v1 signature and a non-numeric timestamp', () => {
    const h = signed();
    expect(verifyResendWebhook(SECRET, BODY, { ...h, signature: h.signature.replace('v1,', 'v2,') }, NOW)).toBe(false);
    expect(verifyResendWebhook(SECRET, BODY, { ...h, timestamp: 'soon' }, NOW)).toBe(false);
  });
});

describe('events', () => {
  it('maps the delivery events and ignores the rest', () => {
    expect(statusForEvent('email.delivered')).toBe('delivered');
    expect(statusForEvent('email.delivery_delayed')).toBe('delayed');
    expect(statusForEvent('email.bounced')).toBe('bounced');
    expect(statusForEvent('email.complained')).toBe('complained');
    expect(statusForEvent('email.opened')).toBeNull();
    expect(statusForEvent('domain.updated')).toBeNull();
  });

  it('only ever moves a status forward', () => {
    expect(shouldAdvanceStatus('sent', 'delivered')).toBe(true);
    expect(shouldAdvanceStatus('delivered', 'bounced')).toBe(true);
    expect(shouldAdvanceStatus('bounced', 'delivered')).toBe(false);
    expect(shouldAdvanceStatus('delivered', 'delayed')).toBe(false);
    expect(shouldAdvanceStatus('delivered', 'delivered')).toBe(false);
    expect(shouldAdvanceStatus('skipped', 'delivered')).toBe(false);
  });

  it('treats an unspecified bounce as permanent and a transient one as not', () => {
    expect(isPermanentBounce({ type: 'email.bounced' })).toBe(true);
    expect(isPermanentBounce({ type: 'email.bounced', data: { bounce: { type: 'Permanent' } } })).toBe(true);
    expect(isPermanentBounce({ type: 'email.bounced', data: { bounce: { type: 'Transient' } } })).toBe(false);
  });

  it('reads and lowercases the first recipient', () => {
    expect(recipientOf({ type: 'x', data: { to: [' A@B.co '] } })).toBe('a@b.co');
    expect(recipientOf({ type: 'x', data: { to: 'a@b.co' } })).toBe('a@b.co');
    expect(recipientOf({ type: 'x', data: {} })).toBeNull();
  });
});

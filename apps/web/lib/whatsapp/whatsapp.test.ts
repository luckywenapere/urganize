import { describe, expect, it } from 'vitest';
import { normalizePhone, maskPhone, stripWhatsappPrefix } from './phone';
import { chaseKindFor, isQuietHour, lagosDay, type ChaseSettings } from './chase-rules';
import { parseReply, parseReplyDate } from './reply-intent';
import { decryptSecret, encryptSecret } from './secret';
import { isSafeBaseUrl, resolveBaseUrl } from './byo-ai';
import { twilioSignatureFor, verifyTwilioSignature } from './transport';

// Monday 26 Oct 2026, 10:00 Lagos.
const NOW = new Date('2026-10-26T09:00:00Z');

const SETTINGS: ChaseSettings = {
  chaseDayBefore: true,
  chaseDueDay: true,
  chaseOverdue: true,
  overdueEveryDays: 2,
};

describe('normalizePhone', () => {
  it('reads a Nigerian local number as +234', () => {
    expect(normalizePhone('0803 123 4567')).toBe('+2348031234567');
    expect(normalizePhone('8031234567')).toBe('+2348031234567');
  });
  it('keeps an international number', () => {
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123');
    expect(normalizePhone('0044 7700 900123')).toBe('+447700900123');
  });
  it('refuses junk', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('+123')).toBeNull();
  });
  it('strips the whatsapp prefix and masks', () => {
    expect(stripWhatsappPrefix('whatsapp:+2348031234567')).toBe('+2348031234567');
    expect(maskPhone('+2348031234567')).toBe('+234 803 ••• 4567');
  });
});

describe('chaseKindFor', () => {
  const due = (iso: string) => ({ dueDate: iso, now: NOW, settings: SETTINGS, lastOverdueChaseDay: null });

  it('chases the day before, on the day, and when late', () => {
    expect(chaseKindFor(due('2026-10-27T12:00:00Z'))).toBe('day_before');
    expect(chaseKindFor(due('2026-10-26T12:00:00Z'))).toBe('due_day');
    expect(chaseKindFor(due('2026-10-24T12:00:00Z'))).toBe('overdue');
  });
  it('stays quiet when due later or has no date', () => {
    expect(chaseKindFor(due('2026-10-29T12:00:00Z'))).toBeNull();
    expect(chaseKindFor({ ...due('x'), dueDate: null })).toBeNull();
  });
  it('respects the switches', () => {
    expect(chaseKindFor({ ...due('2026-10-27T12:00:00Z'), settings: { ...SETTINGS, chaseDayBefore: false } })).toBeNull();
    expect(chaseKindFor({ ...due('2026-10-24T12:00:00Z'), settings: { ...SETTINGS, chaseOverdue: false } })).toBeNull();
  });
  it('spaces overdue chases by the setting', () => {
    const base = due('2026-10-20T12:00:00Z');
    expect(chaseKindFor({ ...base, lastOverdueChaseDay: '2026-10-25' })).toBeNull();
    expect(chaseKindFor({ ...base, lastOverdueChaseDay: '2026-10-24' })).toBe('overdue');
  });
  it('gives up after two weeks late', () => {
    expect(chaseKindFor(due('2026-10-01T12:00:00Z'))).toBeNull();
  });
  it('uses the Lagos day, not the UTC day', () => {
    // 23:30 UTC on the 26th is 00:30 Lagos on the 27th.
    expect(lagosDay(new Date('2026-10-26T23:30:00Z'))).toBe('2026-10-27');
  });
});

describe('isQuietHour', () => {
  it('is quiet from 21:00 to 08:00 Lagos', () => {
    expect(isQuietHour(new Date('2026-10-26T20:00:00Z'))).toBe(true); // 21:00
    expect(isQuietHour(new Date('2026-10-26T06:30:00Z'))).toBe(true); // 07:30
    expect(isQuietHour(new Date('2026-10-26T07:00:00Z'))).toBe(false); // 08:00
    expect(isQuietHour(NOW)).toBe(false);
  });
});

describe('parseReplyDate', () => {
  it('understands the usual ways to say a day', () => {
    expect(parseReplyDate('tomorrow', NOW)).toBe('2026-10-27');
    expect(parseReplyDate('Monday', NOW)).toBe('2026-11-02'); // today is Monday, so the next one
    expect(parseReplyDate('friday pls', NOW)).toBe('2026-10-30');
    expect(parseReplyDate('2 Nov', NOW)).toBe('2026-11-02');
    expect(parseReplyDate('nov 2nd', NOW)).toBe('2026-11-02');
    expect(parseReplyDate('2/11', NOW)).toBe('2026-11-02');
    expect(parseReplyDate('2026-11-05', NOW)).toBe('2026-11-05');
  });
  it('rolls a passed date to next year and rejects nonsense', () => {
    expect(parseReplyDate('3 jan', NOW)).toBe('2027-01-03');
    expect(parseReplyDate('31 feb', NOW)).toBeNull();
    expect(parseReplyDate('soon', NOW)).toBeNull();
  });
});

describe('parseReply', () => {
  it('reads the quick replies', () => {
    expect(parseReply('STOP', NOW)).toEqual({ type: 'stop' });
    expect(parseReply('yes', NOW)).toEqual({ type: 'yes' });
    expect(parseReply('Done', NOW)).toEqual({ type: 'done' });
    expect(parseReply('Need more time', NOW)).toEqual({ type: 'need_time', date: null });
    expect(parseReply('Not mine', NOW)).toEqual({ type: 'not_mine' });
  });
  it('takes a date in the same breath as needing time', () => {
    expect(parseReply('need more time, till friday', NOW)).toEqual({ type: 'need_time', date: '2026-10-30' });
  });
  it('treats a bare day as a new date only after being asked', () => {
    expect(parseReply('Monday', NOW)).toEqual({ type: 'text' });
    expect(parseReply('Monday', NOW, true)).toEqual({ type: 'date', date: '2026-11-02' });
  });
  it('passes everything else on as text', () => {
    expect(parseReply('which cover art?', NOW)).toEqual({ type: 'text' });
    expect(parseReply('', NOW)).toEqual({ type: 'text' });
  });
});

describe('secret', () => {
  const SECRET = 'a-long-enough-test-secret';
  it('round-trips and never stores the plain key', () => {
    const stored = encryptSecret('sk-test-123', SECRET);
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain('sk-test-123');
    expect(decryptSecret(stored, SECRET)).toBe('sk-test-123');
  });
  it('fails closed on a wrong secret or damaged value', () => {
    const stored = encryptSecret('sk-test-123', SECRET);
    expect(decryptSecret(stored, 'another-long-enough-secret')).toBeNull();
    expect(decryptSecret(stored.slice(0, -3), SECRET)).toBeNull();
    expect(decryptSecret('nonsense', SECRET)).toBeNull();
  });
  it('refuses to encrypt without a usable secret', () => {
    expect(() => encryptSecret('x', 'short')).toThrow();
  });
});

describe('byo base urls', () => {
  it('accepts public https and refuses the rest', () => {
    expect(isSafeBaseUrl('https://api.example.com/v1')).toBe(true);
    expect(isSafeBaseUrl('http://api.example.com/v1')).toBe(false);
    expect(isSafeBaseUrl('https://localhost/v1')).toBe(false);
    expect(isSafeBaseUrl('https://127.0.0.1/v1')).toBe(false);
    expect(isSafeBaseUrl('https://10.0.0.5/v1')).toBe(false);
    expect(isSafeBaseUrl('https://user:pw@api.example.com')).toBe(false);
    expect(isSafeBaseUrl('not a url')).toBe(false);
  });
  it('resolves named providers and checks custom ones', () => {
    expect(resolveBaseUrl('openai', null)).toBe('https://api.openai.com/v1');
    expect(resolveBaseUrl('custom', 'https://api.example.com/v1/')).toBe('https://api.example.com/v1');
    expect(resolveBaseUrl('custom', 'http://evil.test')).toBeNull();
  });
});

describe('twilio signature', () => {
  const url = 'https://app.urganize.app/api/webhooks/whatsapp';
  const params = { From: 'whatsapp:+2348031234567', Body: 'done', MessageSid: 'SM1' };
  it('accepts its own signature and rejects tampering', () => {
    const sig = twilioSignatureFor(url, params, 'token');
    expect(verifyTwilioSignature(url, params, sig, 'token')).toBe(true);
    expect(verifyTwilioSignature(url, { ...params, Body: 'free money' }, sig, 'token')).toBe(false);
    expect(verifyTwilioSignature(url, params, sig, 'other')).toBe(false);
    expect(verifyTwilioSignature(url, params, null, 'token')).toBe(false);
  });
});

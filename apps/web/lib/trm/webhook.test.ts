import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { headerBag, parseTimestamp, readTrmEvent, verifyTrmWebhook } from './webhook';

const SECRET = 'trm_whsec_test_123';
const NOW = 1_792_400_000;
const body = JSON.stringify({ id: 'dlv_1', type: 'release.status_changed', data: { release: { id: 'rel-uuid', external_release_id: '0b6f2c1e-1111-4222-8333-944455556666', status: 'validating' } } });
const sign = (ts: string, raw = body, enc: 'hex' | 'base64' = 'hex') => createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest(enc);

describe('verifyTrmWebhook', () => {
  it('accepts a hex signature with a timestamp header', () => {
    const h = headerBag([['X-TRM-Webhook-Signature', sign(String(NOW))], ['X-TRM-Webhook-Timestamp', String(NOW)]]);
    expect(verifyTrmWebhook(SECRET, body, h, NOW)).toEqual({ ok: true, timestamp: NOW });
  });
  it('accepts base64, a sha256= prefix, and a t=,v1= list', () => {
    const ts = String(NOW);
    expect(verifyTrmWebhook(SECRET, body, headerBag([['x-trm-webhook-signature', sign(ts, body, 'base64')], ['x-trm-timestamp', ts]]), NOW).ok).toBe(true);
    expect(verifyTrmWebhook(SECRET, body, headerBag([['x-trm-webhook-signature', `sha256=${sign(ts)}`], ['x-trm-webhook-timestamp', ts]]), NOW).ok).toBe(true);
    expect(verifyTrmWebhook(SECRET, body, headerBag([['x-trm-webhook-signature', `t=${ts},v1=${sign(ts)}`]]), NOW).ok).toBe(true);
  });
  it('accepts a millisecond or ISO timestamp, signed as sent', () => {
    const ms = String(NOW * 1000);
    expect(verifyTrmWebhook(SECRET, body, headerBag([['x-trm-webhook-signature', sign(ms)], ['x-trm-webhook-timestamp', ms]]), NOW).ok).toBe(true);
    const iso = new Date(NOW * 1000).toISOString();
    expect(verifyTrmWebhook(SECRET, body, headerBag([['x-trm-webhook-signature', sign(iso)], ['x-trm-webhook-timestamp', iso]]), NOW).ok).toBe(true);
  });
  it('refuses a bad signature, a changed body, a stale or future timestamp, and no secret', () => {
    const ts = String(NOW);
    const good = [['x-trm-webhook-signature', sign(ts)], ['x-trm-webhook-timestamp', ts]] as [string, string][];
    expect(verifyTrmWebhook(SECRET, body + ' ', headerBag(good), NOW)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyTrmWebhook('other', body, headerBag(good), NOW)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyTrmWebhook(SECRET, body, headerBag(good), NOW + 301)).toEqual({ ok: false, reason: 'stale' });
    expect(verifyTrmWebhook(SECRET, body, headerBag(good), NOW - 301)).toEqual({ ok: false, reason: 'stale' });
    expect(verifyTrmWebhook('', body, headerBag(good), NOW)).toEqual({ ok: false, reason: 'no_secret' });
    expect(verifyTrmWebhook(SECRET, body, headerBag([['x-trm-webhook-timestamp', ts]]), NOW)).toEqual({ ok: false, reason: 'no_signature' });
    expect(verifyTrmWebhook(SECRET, body, headerBag([['x-trm-webhook-signature', sign(ts)]]), NOW)).toEqual({ ok: false, reason: 'no_timestamp' });
  });
});

describe('parseTimestamp', () => {
  it('reads seconds, ms and ISO', () => {
    expect(parseTimestamp('1792400000')).toBe(1792400000);
    expect(parseTimestamp('1792400000123')).toBe(1792400000);
    expect(parseTimestamp('2026-10-19T00:00:00Z')).toBe(Date.parse('2026-10-19T00:00:00Z') / 1000);
    expect(parseTimestamp('nope')).toBeNull();
  });
});

describe('readTrmEvent', () => {
  it('reads ids, status and the delivery id', () => {
    const e = readTrmEvent(JSON.parse(body), {});
    expect(e).toMatchObject({ deliveryId: 'dlv_1', event: 'release.status_changed', releaseId: 'rel-uuid', status: 'validating' });
    expect(e.externalReleaseId).toBe('0b6f2c1e-1111-4222-8333-944455556666');
  });
  it('prefers a delivery header and takes the status from the event name', () => {
    const e = readTrmEvent({ event: 'release.published', release_id: 'r2', upc: '123456789012' }, { 'x-trm-delivery-id': 'hdr-1' });
    expect(e).toMatchObject({ deliveryId: 'hdr-1', status: 'published', releaseId: 'r2', upc: '123456789012' });
  });
  it('reads rejection reasons in several shapes', () => {
    const e = readTrmEvent(
      { type: 'release.rejected', data: { release: { id: 'r3', status: 'rejected' }, reasons: [{ code: 'artwork_text', message: 'Artwork contains a URL.' }, 'Producer credit must match.'] } },
      {}
    );
    expect(e.status).toBe('rejected');
    expect(e.reasons).toEqual([
      { code: 'artwork_text', text: 'Artwork contains a URL.' },
      { code: null, text: 'Producer credit must match.' },
    ]);
  });
  it('never throws on junk', () => {
    expect(readTrmEvent(null, {})).toMatchObject({ deliveryId: null, status: null });
    expect(readTrmEvent({ status: 'test' }, {}).status).toBeNull();
  });
});

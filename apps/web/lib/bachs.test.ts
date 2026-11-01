import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  bachsAmountToKobo,
  bachsBaseUrl,
  isBachsConfigured,
  koboToBachsAmount,
  paidCheckoutFromEvent,
  parseBachsEvent,
  remoteCheckoutIsPaid,
  verifyBachsSignature,
} from './bachs';

const SECRET = 'test_signing_secret';
const NOW = 1_800_000_000;
const sign = (timestamp: number, body: string) =>
  createHmac('sha256', SECRET).update(`${timestamp}.${body}`, 'utf8').digest('hex');

describe('bachs keys and money', () => {
  it('talks to the sandbox unless the key is live', () => {
    expect(bachsBaseUrl('sk_sandbox_abc')).toBe('https://sandbox-api.bachs.io');
    expect(bachsBaseUrl('sk_live_abc')).toBe('https://api.bachs.io');
  });

  it('is on only with a key', () => {
    expect(isBachsConfigured({})).toBe(false);
    expect(isBachsConfigured({ BACHS_SECRET_KEY: '  ' })).toBe(false);
    expect(isBachsConfigured({ BACHS_SECRET_KEY: 'sk_sandbox_x' })).toBe(true);
  });

  it('writes kobo as a decimal string and reads it back', () => {
    expect(koboToBachsAmount(2_600_00)).toBe('2600.00');
    expect(koboToBachsAmount(26_000_000)).toBe('260000.00');
    expect(bachsAmountToKobo('2600.00')).toBe(2_600_00);
    expect(bachsAmountToKobo(26000)).toBe(2_600_000);
    expect(bachsAmountToKobo('abc')).toBeNaN();
  });
});

describe('verifyBachsSignature', () => {
  const body = '{"id":"evt_1","type":"checkout.completed","data":{}}';

  it('accepts the bare signature with its timestamp header', () => {
    expect(
      verifyBachsSignature({
        rawBody: body,
        secret: SECRET,
        timestampHeader: String(NOW),
        signatureHeader: sign(NOW, body),
        signatureV2Header: null,
        nowSeconds: NOW,
      })
    ).toBe(true);
  });

  it('accepts V2 when any v1 matches', () => {
    expect(
      verifyBachsSignature({
        rawBody: body,
        secret: SECRET,
        timestampHeader: null,
        signatureHeader: null,
        signatureV2Header: `t=${NOW},v1=deadbeef,v1=${sign(NOW, body)}`,
        nowSeconds: NOW,
      })
    ).toBe(true);
  });

  it('accepts a whsec_ secret signed with or without its prefix', () => {
    const body2 = '{}';
    const raw = 'abc123';
    const signWith = (key: string) => createHmac('sha256', key).update(`${NOW}.${body2}`, 'utf8').digest('hex');
    const base = { rawBody: body2, secret: `whsec_${raw}`, timestampHeader: String(NOW), signatureV2Header: null, nowSeconds: NOW };
    expect(verifyBachsSignature({ ...base, signatureHeader: signWith(`whsec_${raw}`) })).toBe(true);
    expect(verifyBachsSignature({ ...base, signatureHeader: signWith(raw) })).toBe(true);
    expect(verifyBachsSignature({ ...base, signatureHeader: signWith('other') })).toBe(false);
  });

  it('refuses a changed body, a wrong secret, an old timestamp and no signature', () => {
    const good = { secret: SECRET, timestampHeader: String(NOW), signatureV2Header: null, nowSeconds: NOW };
    expect(verifyBachsSignature({ ...good, rawBody: `${body} `, signatureHeader: sign(NOW, body) })).toBe(false);
    expect(verifyBachsSignature({ ...good, rawBody: body, secret: 'other', signatureHeader: sign(NOW, body) })).toBe(false);
    expect(
      verifyBachsSignature({ ...good, rawBody: body, signatureHeader: sign(NOW, body), nowSeconds: NOW + 301 })
    ).toBe(false);
    expect(verifyBachsSignature({ ...good, rawBody: body, signatureHeader: null })).toBe(false);
    expect(verifyBachsSignature({ ...good, rawBody: body, secret: '', signatureHeader: sign(NOW, body) })).toBe(false);
  });
});

describe('paidCheckoutFromEvent', () => {
  const event = (type: string, data: Record<string, unknown>) =>
    parseBachsEvent(JSON.stringify({ id: 'evt_1', type, data }))!;

  it('reads a paid checkout', () => {
    expect(
      paidCheckoutFromEvent(
        event('checkout.completed', {
          reference: 'urganize_bx_1',
          checkout_id: 'chk_1',
          payment_status: 'paid',
          amount: '26000.00',
          currency: 'ngn',
        })
      )
    ).toEqual({ reference: 'urganize_bx_1', checkoutId: 'chk_1', amount: '26000.00', currency: 'NGN', method: null });
  });

  it('reads a succeeded collection with how it was paid', () => {
    expect(
      paidCheckoutFromEvent(
        event('collection.succeeded', {
          reference: 'urganize_bx_1',
          checkout_id: 'chk_1',
          status: 'SUCCEEDED',
          amount: '26000.00',
          currency: 'NGN',
          payment_method_details: { type: 'MOMO_GHS' },
        })
      )?.method
    ).toBe('MOMO_GHS');
  });

  it('ignores unpaid, other events and events without our reference', () => {
    expect(paidCheckoutFromEvent(event('checkout.completed', { reference: 'r', payment_status: 'no_payment_required' }))).toBeNull();
    expect(paidCheckoutFromEvent(event('checkout.expired', { reference: 'r' }))).toBeNull();
    expect(paidCheckoutFromEvent(event('collection.succeeded', { status: 'SUCCEEDED' }))).toBeNull();
    expect(parseBachsEvent('not json')).toBeNull();
  });
});

describe('remoteCheckoutIsPaid', () => {
  const row = { amount_kobo: 2_600_000, reference: 'urganize_bx_1' };
  const paid = { status: 'completed', payment_status: 'succeeded', amount: '26000.00', currency: 'NGN', reference: 'urganize_bx_1' };

  it('trusts a completed checkout for exactly our Naira amount', () => {
    expect(remoteCheckoutIsPaid(paid, row)).toBe(true);
    expect(remoteCheckoutIsPaid({ ...paid, payment_status: 'paid' }, row)).toBe(true);
  });

  it('refuses anything else', () => {
    expect(remoteCheckoutIsPaid({ ...paid, status: 'open' }, row)).toBe(false);
    expect(remoteCheckoutIsPaid({ ...paid, payment_status: 'processing' }, row)).toBe(false);
    expect(remoteCheckoutIsPaid({ ...paid, amount: '2600.00' }, row)).toBe(false);
    expect(remoteCheckoutIsPaid({ ...paid, currency: 'USD' }, row)).toBe(false);
    expect(remoteCheckoutIsPaid({ ...paid, reference: 'someone_else' }, row)).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMetaPayload,
  cleanTemplateParam,
  metaSignatureFor,
  metaTemplateName,
  parseMetaWebhook,
  toMetaRecipient,
  verifyMetaSignature,
} from './meta';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('meta payloads', () => {
  it('sends to digits with no plus', () => {
    expect(toMetaRecipient('+234 803 123 4567')).toBe('2348031234567');
  });

  it('builds a template with its variables in order', () => {
    const payload = buildMetaPayload('+2348031234567', {
      template: { name: 'urganize_task_chase', lang: 'en', variables: ['Ada', 'Cover art for Sunrise', 'today, Mon 9 Nov'] },
    });
    expect(payload).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '2348031234567',
      type: 'template',
      template: {
        name: 'urganize_task_chase',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Ada' },
              { type: 'text', text: 'Cover art for Sunrise' },
              { type: 'text', text: 'today, Mon 9 Nov' },
            ],
          },
        ],
      },
    });
  });

  it('builds free text for a reply inside the window', () => {
    expect(buildMetaPayload('+2348031234567', { text: 'Nice one. Marked done.' })).toMatchObject({
      type: 'text',
      text: { body: 'Nice one. Marked done.', preview_url: false },
    });
  });

  it('cleans what Meta refuses in a template variable', () => {
    expect(cleanTemplateParam('Mix\nand   master\tv2')).toBe('Mix and master v2');
    expect(cleanTemplateParam('   ')).toBe('-');
    expect(cleanTemplateParam('x'.repeat(400))).toHaveLength(300);
  });

  it('uses the default template names unless env renames one', async () => {
    expect(metaTemplateName('chase')).toBe('urganize_task_chase');
    vi.stubEnv('WHATSAPP_META_TEMPLATE_CHASE', 'chase_v2');
    expect(metaTemplateName('chase')).toBe('chase_v2');
    expect(metaTemplateName('opt_in')).toBe('urganize_opt_in');
  });
});

describe('meta signature', () => {
  it('accepts only the body Meta signed with our secret', () => {
    const body = '{"entry":[]}';
    const sig = metaSignatureFor(body, 'secret');
    expect(sig.startsWith('sha256=')).toBe(true);
    expect(verifyMetaSignature(body, sig, 'secret')).toBe(true);
    expect(verifyMetaSignature('{"entry":[1]}', sig, 'secret')).toBe(false);
    expect(verifyMetaSignature(body, sig, 'other')).toBe(false);
    expect(verifyMetaSignature(body, null, 'secret')).toBe(false);
  });
});

describe('parseMetaWebhook', () => {
  const wrap = (value: unknown) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value }] }] });

  it('reads typed text, a template button and an interactive button', () => {
    const { inbound } = parseMetaWebhook(
      wrap({
        messages: [
          { id: 'w1', from: '2348031234567', type: 'text', text: { body: ' Done ' } },
          { id: 'w2', from: '2348031234567', type: 'button', button: { text: 'Need more time', payload: 'x' } },
          { id: 'w3', from: '2348031234567', type: 'interactive', interactive: { button_reply: { title: 'Not mine' } } },
          { id: 'w4', from: '2348031234567', type: 'audio' },
        ],
      })
    );
    expect(inbound).toEqual([
      { id: 'w1', from: '+2348031234567', body: 'Done' },
      { id: 'w2', from: '+2348031234567', body: 'Need more time' },
      { id: 'w3', from: '+2348031234567', body: 'Not mine' },
      { id: 'w4', from: '+2348031234567', body: '' },
    ]);
  });

  it('reads delivery updates and keeps the failure reason', () => {
    const { statuses } = parseMetaWebhook(
      wrap({
        statuses: [
          { id: 'a', status: 'read' },
          { id: 'b', status: 'failed', errors: [{ code: 131047, title: 'Re-engagement message' }] },
          { id: 'c', status: 'deleted' },
        ],
      })
    );
    expect(statuses).toEqual([
      { id: 'a', status: 'read', error: null },
      { id: 'b', status: 'failed', error: 'Re-engagement message (131047)' },
    ]);
  });

  it('ignores junk', () => {
    expect(parseMetaWebhook(null)).toEqual({ inbound: [], statuses: [] });
    expect(parseMetaWebhook({ entry: [{ changes: [{}] }] })).toEqual({ inbound: [], statuses: [] });
  });
});

describe('provider choice', () => {
  const load = async () => (await import('./transport')).whatsappProvider;

  it('is Meta when Meta is set up, even with Twilio there too', async () => {
    vi.stubEnv('WHATSAPP_META_TOKEN', 't');
    vi.stubEnv('WHATSAPP_META_PHONE_NUMBER_ID', '123');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'x');
    vi.stubEnv('WHATSAPP_FROM', 'whatsapp:+1');
    vi.stubEnv('WHATSAPP_PROVIDER', '');
    expect((await load())()).toBe('meta');
  });

  it('falls back to Twilio when forced or when Meta is not set up', async () => {
    vi.stubEnv('WHATSAPP_META_TOKEN', 't');
    vi.stubEnv('WHATSAPP_META_PHONE_NUMBER_ID', '123');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'x');
    vi.stubEnv('WHATSAPP_FROM', 'whatsapp:+1');
    vi.stubEnv('WHATSAPP_PROVIDER', 'twilio');
    expect((await load())()).toBe('twilio');
    vi.stubEnv('WHATSAPP_PROVIDER', '');
    vi.stubEnv('WHATSAPP_META_TOKEN', '');
    expect((await load())()).toBe('twilio');
  });

  it('is null with neither', async () => {
    for (const k of ['WHATSAPP_META_TOKEN', 'WHATSAPP_META_PHONE_NUMBER_ID', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'WHATSAPP_FROM', 'WHATSAPP_PROVIDER']) {
      vi.stubEnv(k, '');
    }
    expect((await load())()).toBeNull();
  });
});

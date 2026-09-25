import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendViaResend } from './transport';

// The one module that posts to Resend. `from` and `replyTo` arrive already
// composed and validated by the orchestrator, so this tests the HTTP layer:
// the request shape, and that no provider outage or timeout ever throws.

const input = {
  from: 'Urganize <team@send.urganize.app>',
  to: 'a@b.com',
  subject: 's',
  html: '<p>h</p>',
  text: 't',
  replyTo: null as string | null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendViaResend', () => {
  it('posts to Resend with the auth header and the message body', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"id":"msg_1"}', { status: 200 }));

    const result = await sendViaResend('re_key', {
      ...input,
      replyTo: 'contact@urganize.app',
    });
    expect(result).toEqual({ ok: true, id: 'msg_1' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_key');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.from).toBe('Urganize <team@send.urganize.app>');
    expect(body.to).toEqual(['a@b.com']);
    expect(body.reply_to).toBe('contact@urganize.app');
    expect(body.html).toBe('<p>h</p>');
    expect(body.text).toBe('t');
  });

  it('omits reply_to when none is set', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await sendViaResend('re_key', input);
    expect(result).toEqual({ ok: true, id: null });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect('reply_to' in body).toBe(false);
  });

  it('forwards extra headers and an idempotency key when given', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await sendViaResend('re_key', {
      ...input,
      headers: { 'List-Unsubscribe': '<https://x/y>' },
      idempotencyKey: 'once-abc',
    });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('once-abc');
    const body = JSON.parse(init.body as string);
    expect(body.headers).toEqual({ 'List-Unsubscribe': '<https://x/y>' });
  });

  it('returns a failure rather than throwing on a provider error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"message":"domain is not verified"}', { status: 403 })
    );

    const result = await sendViaResend('re_key', input);
    // Distinguishing a real failure from a skip matters: the invite route words
    // its response differently for each.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('403');
      expect(result.error).toContain('domain is not verified');
    }
  });

  it('returns a failure rather than throwing when the network is down', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await sendViaResend('re_key', input)).toEqual({ ok: false, error: 'ECONNREFUSED' });
  });

  it('reports a timeout distinctly on an aborted request', async () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(aborted);
    const result = await sendViaResend('re_key', input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/timed out/i);
  });

  it('caps an oversized error body so an HTML proxy page cannot flood the logs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x'.repeat(5000), { status: 502 }));
    const result = await sendViaResend('re_key', input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeLessThan(360);
  });
});

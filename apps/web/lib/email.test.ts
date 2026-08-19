import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Env is read per call rather than cached at module scope, but each case
// re-imports anyway so a future change to that caching cannot silently make
// these tests pass against stale config.
async function loadEmail() {
  vi.resetModules();
  return import('./email');
}

const message = { to: 'a@b.com', subject: 's', html: '<p>h</p>', text: 't' };

describe('email transport', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('EMAIL_FROM', '');
    vi.stubEnv('EMAIL_REPLY_TO', '');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('needs both the key and the sender to count as configured', async () => {
    const none = await loadEmail();
    expect(none.isEmailConfigured()).toBe(false);

    vi.stubEnv('RESEND_API_KEY', 're_key');
    const keyOnly = await loadEmail();
    expect(keyOnly.isEmailConfigured()).toBe(false);

    vi.stubEnv('EMAIL_FROM', 'Urganize <team@send.urganize.app>');
    const both = await loadEmail();
    expect(both.isEmailConfigured()).toBe(true);
  });

  it('skips without touching the network when unconfigured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { sendEmail } = await loadEmail();
    expect(await sendEmail(message)).toEqual({ ok: false, skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to Resend with the configured sender and reply-to', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_key');
    vi.stubEnv('EMAIL_FROM', 'Urganize <team@send.urganize.app>');
    vi.stubEnv('EMAIL_REPLY_TO', 'contact@urganize.app');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"id":"1"}', { status: 200 }));

    const { sendEmail } = await loadEmail();
    expect(await sendEmail(message)).toEqual({ ok: true });

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
    vi.stubEnv('RESEND_API_KEY', 're_key');
    vi.stubEnv('EMAIL_FROM', 'team@send.urganize.app');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const { sendEmail } = await loadEmail();
    await sendEmail(message);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect('reply_to' in body).toBe(false);
  });

  it('returns a failure rather than throwing on a provider error', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_key');
    vi.stubEnv('EMAIL_FROM', 'team@send.urganize.app');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"message":"domain is not verified"}', { status: 403 })
    );

    const { sendEmail } = await loadEmail();
    const result = await sendEmail(message);
    // Distinguishing a real failure from skipped matters: the invite route
    // words its response differently for each.
    expect(result.ok).toBe(false);
    expect(result.skipped).toBeUndefined();
    expect(result.error).toContain('403');
    expect(result.error).toContain('domain is not verified');
  });

  it('returns a failure rather than throwing when the network is down', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_key');
    vi.stubEnv('EMAIL_FROM', 'team@send.urganize.app');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const { sendEmail } = await loadEmail();
    expect(await sendEmail(message)).toEqual({ ok: false, error: 'ECONNREFUSED' });
  });

  it('caps an oversized error body so an HTML proxy page cannot flood the logs', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_key');
    vi.stubEnv('EMAIL_FROM', 'team@send.urganize.app');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x'.repeat(5000), { status: 502 }));

    const { sendEmail } = await loadEmail();
    const result = await sendEmail(message);
    expect(result.error!.length).toBeLessThan(360);
  });
});

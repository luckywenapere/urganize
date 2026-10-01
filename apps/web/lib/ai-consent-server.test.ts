import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { aiConsentRefusal, hasUserAiConsent } from './ai-consent-server';

function clientReturning(result: { data: unknown; error: unknown } | (() => never)): SupabaseClient {
  const run = async () => (typeof result === 'function' ? result() : result);
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: run,
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('with the feature off', () => {
  it('never reads anything and always allows', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_AI_CONSENT', '');
    const client = {
      from: () => {
        throw new Error('must not be read');
      },
    } as unknown as SupabaseClient;
    expect(await hasUserAiConsent(client, 'u1')).toBe(true);
    expect(await aiConsentRefusal(client, 'u1')).toBeNull();
  });
});

describe('with the feature on', () => {
  it('allows someone who agreed', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_AI_CONSENT', 'true');
    const client = clientReturning({ data: { ai_consent_at: '2026-10-01T09:30:00Z' }, error: null });
    expect(await aiConsentRefusal(client, 'u1')).toBeNull();
  });

  it('refuses with a 403 and the code the browser looks for', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_AI_CONSENT', 'true');
    const client = clientReturning({ data: { ai_consent_at: null }, error: null });
    const refusal = await aiConsentRefusal(client, 'u1');
    expect(refusal?.status).toBe(403);
    expect(await refusal?.json()).toEqual({
      error: 'Turn on AI to use this.',
      code: 'ai_consent_required',
    });
  });

  it('treats a withdrawn permission (null) like one never given', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_AI_CONSENT', 'true');
    const client = clientReturning({ data: { ai_consent_at: '' }, error: null });
    expect(await hasUserAiConsent(client, 'u1')).toBe(false);
  });

  it('fails open when the column cannot be read (migration not applied yet)', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_AI_CONSENT', 'true');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = clientReturning({
      data: null,
      error: { code: '42703', message: 'column profiles.ai_consent_at does not exist' },
    });
    expect(await hasUserAiConsent(client, 'u1')).toBe(true);
  });

  it('fails open when the read throws', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_AI_CONSENT', 'true');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = clientReturning(() => {
      throw new Error('network down');
    });
    expect(await hasUserAiConsent(client, 'u1')).toBe(true);
  });

  it('allows when there is no profile row, leaving that to the other gates', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_AI_CONSENT', 'true');
    const client = clientReturning({ data: null, error: null });
    expect(await hasUserAiConsent(client, 'u1')).toBe(true);
  });
});

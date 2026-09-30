import { describe, expect, it } from 'vitest';
import { describeCallbackError } from './auth-callback-error';

describe('describeCallbackError', () => {
  it('has a sentence for every code the callback page can send', () => {
    for (const code of ['callback_timeout', 'callback_no_session', 'callback_failed']) {
      const message = describeCallbackError(code);
      expect(message).toBeTruthy();
      expect(message).toMatch(/Try again/);
    }
  });

  it('says nothing for a missing or unknown code', () => {
    expect(describeCallbackError(null)).toBeNull();
    expect(describeCallbackError('')).toBeNull();
    expect(describeCallbackError('something_else')).toBeNull();
    expect(describeCallbackError('toString')).toBeNull();
  });

  it('covers every code the callback page actually sends', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(__dirname, '..', 'app', 'auth', 'callback', 'page.tsx'), 'utf8');
    const sent = [...source.matchAll(/\/auth\?error=(\w+)/g)].map((m) => m[1]);
    expect(sent.length).toBeGreaterThan(0);
    for (const code of sent) expect(describeCallbackError(code)).not.toBeNull();
  });
});

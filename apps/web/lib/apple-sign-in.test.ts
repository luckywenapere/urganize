import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatAppleName, generateRawNonce, sha256Hex } from './apple-sign-in';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the nonce', () => {
  it('is 64 hex characters and different every time', () => {
    const first = generateRawNonce();
    const second = generateRawNonce();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
  });

  it('hashes to the SHA-256 Apple stamps into the token', async () => {
    // The standard test vector for "abc".
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});

describe('formatAppleName', () => {
  it('joins the two halves', () => {
    expect(formatAppleName({ givenName: 'Ada', familyName: 'Okafor' })).toBe('Ada Okafor');
  });

  it('copes with either half missing, since people can leave them blank', () => {
    expect(formatAppleName({ givenName: 'Ada', familyName: null })).toBe('Ada');
    expect(formatAppleName({ givenName: null, familyName: 'Okafor' })).toBe('Okafor');
  });

  it('returns null rather than an empty name when Apple sent nothing', () => {
    expect(formatAppleName({ givenName: null, familyName: null })).toBeNull();
    expect(formatAppleName({ givenName: '  ', familyName: '' })).toBeNull();
    expect(formatAppleName({})).toBeNull();
  });
});

describe('canSignInWithApple', () => {
  async function withShell(platform: 'ios' | 'android' | null, capabilities: string[]) {
    vi.resetModules();
    const channel = { postMessage: () => {} };
    vi.stubGlobal('window', {
      ReactNativeWebView: channel,
      ...(platform
        ? { __URGANIZE_NATIVE__: { platform, shellVersion: '1.0.0', protocol: 1, capabilities } }
        : {}),
    });
    return (await import('./apple-sign-in')).canSignInWithApple();
  }

  it('is true only in the iPhone app that advertises it', async () => {
    expect(await withShell('ios', ['appleSignIn'])).toBe(true);
  });

  it('is false on Android, in a browser and in an old iPhone build', async () => {
    expect(await withShell('android', ['appleSignIn'])).toBe(false);
    expect(await withShell(null, [])).toBe(false);
    expect(await withShell('ios', ['oauth'])).toBe(false);
  });
});

describe('every screen that offers Google also offers Apple', () => {
  const ROOT = join(__dirname, '..');
  const SCREENS_WITH_GOOGLE = [
    'app/auth/AuthPageClient.tsx',
    'app/curator/join/[code]/CuratorJoinPageClient.tsx',
    'app/invite/accept/page.tsx',
    'app/onboarding/OnboardingPageClient.tsx',
  ];

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === 'node_modules' || name === '.next' || name === 'api') continue;
        walk(full, out);
      } else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) {
        out.push(full);
      }
    }
    return out;
  }

  it('has an Apple button on each of the four known screens', () => {
    for (const rel of SCREENS_WITH_GOOGLE) {
      expect(readFileSync(join(ROOT, rel), 'utf8'), rel).toContain('<AppleSignInButton');
    }
  });

  it('no other screen has a Continue with Google button without Apple beside it', () => {
    const offenders: string[] = [];
    for (const file of [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))]) {
      const rel = relative(ROOT, file).split(sep).join('/');
      if (SCREENS_WITH_GOOGLE.includes(rel)) continue;
      const code = readFileSync(file, 'utf8');
      if (/Continue with Google/.test(code) && !code.includes('AppleSignInButton')) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

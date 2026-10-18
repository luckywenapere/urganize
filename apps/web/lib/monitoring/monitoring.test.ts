import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import {
  SENTRY_DSN_FALLBACK,
  SENTRY_IGNORE_ERRORS,
  isLocalHost,
  resolveSentryDsn,
  sentryBeforeSend,
} from './sentry-options';

// URG-372. Sentry must never ride the shared first-load bundle, and its
// filters must keep local and aborted noise out.

const APP_ROOT = join(__dirname, '..', '..');
const code = (path: string) => readFileSync(join(APP_ROOT, path), 'utf8');

function staticImports(path: string): string[] {
  const out: string[] = [];
  const re = /^\s*import\s+(?!type\b)[^'"]*?['"]([^'"]+)['"]/gm;
  const source = code(path);
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) out.push(match[1]);
  return out;
}

describe('Sentry stays off the shared first-load chain', () => {
  it('the reporter imports nothing at runtime and loads the SDK with import()', () => {
    expect(staticImports('lib/monitoring/report.ts')).toEqual([]);
    expect(code('lib/monitoring/report.ts')).toContain("import('./client-init')");
  });

  it('no shared-chain file imports @sentry/nextjs or the client init statically', () => {
    for (const path of [
      'instrumentation-client.ts',
      'app/error.tsx',
      'app/global-error.tsx',
      'lib/report-boundary-error.ts',
      'lib/monitoring/sentry-options.ts',
    ]) {
      const imports = staticImports(path);
      expect(imports).not.toContain('@sentry/nextjs');
      expect(imports.some((spec) => spec.endsWith('client-init'))).toBe(false);
    }
  });

  it('no Session Replay or profiling anywhere', () => {
    for (const path of ['lib/monitoring/client-init.ts', 'sentry.server.config.ts', 'sentry.edge.config.ts']) {
      expect(code(path)).not.toMatch(/replayIntegration|profilesSampleRate|tracesSampleRate:\s*[1-9]/);
    }
  });
});

describe('sentry options', () => {
  it('falls back to the public DSN and can be switched off', () => {
    expect(resolveSentryDsn(undefined)).toBe(SENTRY_DSN_FALLBACK);
    expect(resolveSentryDsn('  ')).toBe(SENTRY_DSN_FALLBACK);
    expect(resolveSentryDsn('https://x@example.ingest.sentry.io/1')).toBe('https://x@example.ingest.sentry.io/1');
    expect(resolveSentryDsn('off')).toBeUndefined();
  });

  it('knows a local host', () => {
    for (const host of ['localhost', '127.0.0.1', '0.0.0.0', 'mac.local']) expect(isLocalHost(host)).toBe(true);
    for (const host of ['app.urganize.app', 'urganize-git-x.vercel.app', '']) expect(isLocalHost(host)).toBe(false);
  });

  it('drops events from localhost and aborted requests, keeps the rest', () => {
    const local = { request: { url: 'http://localhost:3000/dashboard' } } as ErrorEvent;
    const live = { request: { url: 'https://app.urganize.app/dashboard' } } as ErrorEvent;
    expect(sentryBeforeSend(local, {})).toBeNull();
    expect(sentryBeforeSend(live, {})).toBe(live);
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(sentryBeforeSend(live, { originalException: abort })).toBeNull();
  });

  it('ignores the known browser noise', () => {
    const asText = SENTRY_IGNORE_ERRORS.map(String).join('\n');
    expect(asText).toContain('ResizeObserver loop');
    expect(asText).toContain('AbortError');
    expect(asText).toContain('ChunkLoadError');
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Nothing in server code fires and forgets (2026-10-09, v1.92.12).
 *
 * A bare `void promise()` after the reply is not tied to the request, so on a
 * serverless host the work can be cut off: an assignment notification, a "who
 * changed this" row, the founder's "a team just paid" alert. afterResponse()
 * (lib/after-response.ts) is the one way to do it. These read the real sources,
 * so a new route that goes back to `void` fails here and not in production.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
  }
  return out;
}

function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const root = process.cwd();
const serverFiles = [
  ...walk(join(root, 'app/api')),
  ...walk(join(root, 'lib')).filter((file) => /-server\.ts$/.test(file) || /[\\/]mcp[\\/]/.test(file)),
].filter((file) => !file.endsWith('after-response.ts'));

describe('server code never fires and forgets', () => {
  it('has no bare void on the helpers that report what just happened', () => {
    const offenders: string[] = [];
    for (const file of serverFiles) {
      const source = code(file);
      if (/\bvoid\s+(?:createTaskNotification|logTaskActivity|logBillingEvent|notifyFounder|touchLastUsed)\b/.test(source)) {
        offenders.push(file.replace(root, ''));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has no void-wrapped async block in a route', () => {
    const offenders: string[] = [];
    for (const file of serverFiles.filter((f) => /app[\\/]api/.test(f))) {
      if (/\bvoid\s*\(\s*async\b/.test(code(file))) offenders.push(file.replace(root, ''));
    }
    expect(offenders).toEqual([]);
  });
});

describe('the reporting sites go through afterResponse', () => {
  const sites: Array<[string, RegExp[]]> = [
    ['app/api/tasks/route.ts', [/afterResponse\('task assigned notification'/]],
    [
      'app/api/tasks/[id]/route.ts',
      [
        /afterResponse\('task update record'/,
        /afterResponse\('task assigned notification'/,
        /afterResponse\('task status notification'/,
      ],
    ],
    ['app/api/tasks/[id]/editorial-pitch/skip/route.ts', [/afterResponse\('editorial pitch skip record'/]],
    ['app/api/mcp/route.ts', [/afterResponse\('mcp tool call record'/]],
    ['app/api/billing/start-checkout/route.ts', [/afterResponse\('checkout started record'/]],
    [
      'app/api/webhooks/paystack/route.ts',
      [
        /afterResponse\('checkout completed alert'/,
        /afterResponse\('plan change swap alert'/,
        /afterResponse\('payment failed alert'/,
      ],
    ],
    ['lib/tasks-server.ts', [/afterResponse\('trial started record'/]],
    ['lib/referrals-server.ts', [/afterResponse\('referral tagged record'/]],
    ['lib/mcp/tokens-server.ts', [/afterResponse\('mcp token last used'/]],
  ];

  for (const [file, patterns] of sites) {
    it(`${file} hands its follow-up work to afterResponse`, () => {
      const source = code(join(root, file));
      expect(source).toMatch(/import \{ afterResponse \} from ['"][^'"]*after-response['"]/);
      for (const pattern of patterns) expect(source).toMatch(pattern);
    });
  }

  it('the webhook has one afterResponse per alert it used to fire and forget', () => {
    const source = code(join(root, 'app/api/webhooks/paystack/route.ts'));
    expect(source.match(/afterResponse\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

describe('the helper itself', () => {
  const source = code(join(root, 'lib/after-response.ts'));

  it('uses next/server after()', () => {
    expect(source).toMatch(/import \{ after \} from 'next\/server'/);
    expect(source).toMatch(/after\(run\)/);
  });

  it('catches the work so a failure is logged and never rethrown', () => {
    expect(source).toMatch(/try \{\s*await task\(\);\s*\} catch/);
  });
});

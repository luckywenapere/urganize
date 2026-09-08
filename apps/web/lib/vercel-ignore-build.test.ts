import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Vercel Ignored Build Step, exercised as the real artifact.
 *
 * THE EXIT CODES ARE THE WHOLE POINT OF THESE TESTS. Vercel reads exit 0 as
 * "skip this build" and 1 as "build it", which is the inversion everybody gets
 * wrong once — and getting it wrong here stops deploys on both projects rather
 * than merely wasting a few. Nothing else in the repo can catch that, so this
 * runs the script itself with a stub `git` and a stub `npx` on PATH and asserts
 * the code it exits with.
 *
 * It is the shape lib/offline/sw-offline.test.ts uses for a plain script with
 * nothing to import, and lib/deploy-version.test.ts's precedent for reading a
 * file outside apps/web by path.
 */

const SCRIPT = resolve(__dirname, '../../../scripts/vercel-ignore-build.sh');

/** Answers only what the script asks, driven by env so each case is one call.
 *  `diff` prints FAKE_DIFF, so a case is really just its changed-file list. */
const FAKE_GIT = `#!/bin/sh
case "$1" in
  cat-file)
    [ "\${FAKE_BASE_RESOLVES:-1}" = "1" ] || exit 1
    exit 0
    ;;
  rev-parse)
    [ "\${FAKE_HAS_PARENT:-1}" = "1" ] || exit 1
    echo parentsha
    exit 0
    ;;
  diff)
    [ "\${FAKE_DIFF_FAILS:-0}" = "0" ] || exit 128
    printf '%s\\n' "\${FAKE_DIFF:-}"
    exit 0
    ;;
esac
exit 0
`;

type Outcome = { code: number; delegated: boolean; stderr: string };

function run(env: Record<string, string> = {}): Outcome {
  const bin = mkdtempSync(join(tmpdir(), 'ignore-build-'));
  const marker = join(bin, 'delegated');
  try {
    writeFileSync(join(bin, 'git'), FAKE_GIT, { mode: 0o755 });
    // Stands in for turbo-ignore, and records that it ran at all. Its own exit
    // code is configurable so we can prove BOTH of its answers pass through.
    writeFileSync(
      join(bin, 'npx'),
      `#!/bin/sh\n: > "${marker}"\nexit \${FAKE_TURBO_EXIT:-1}\n`,
      { mode: 0o755 }
    );

    const result = spawnSync('bash', [SCRIPT, '@urganize/web'], {
      encoding: 'utf8',
      // PATH is prepended rather than replaced: bash itself still needs its
      // own tools, and only `git` and `npx` are being stood in for.
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, ...env },
    });

    return {
      code: result.status ?? -1,
      delegated: existsSync(marker),
      stderr: result.stderr ?? '',
    };
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

describe('the ignored build step', () => {
  it('skips a build when every changed file is markdown', () => {
    // The whole reason it exists: 21 merges in one day, every one of them a
    // CLAUDE.md edit, each costing four deployments against a cap of 100.
    const outcome = run({ FAKE_DIFF: 'CLAUDE.md' });
    expect(outcome.code).toBe(0);
    expect(outcome.delegated).toBe(false);
  });

  it('skips a build for several markdown files at once', () => {
    const outcome = run({ FAKE_DIFF: 'CLAUDE.md\ndocs/mobile/push-setup.md\nREADME.md' });
    expect(outcome.code).toBe(0);
    expect(outcome.delegated).toBe(false);
  });

  it('skips a build for markdown named in capitals', () => {
    const outcome = run({ FAKE_DIFF: 'README.MD' });
    expect(outcome.code).toBe(0);
  });

  it('builds when a single source file rides along with the docs', () => {
    // One code file in the diff is the whole diff, as far as this is concerned.
    const outcome = run({ FAKE_DIFF: 'CLAUDE.md\napps/web/lib/tasks.ts' });
    expect(outcome.delegated).toBe(true);
    expect(outcome.code).toBe(1);
  });

  it('treats a file merely ending in .md.ts as code', () => {
    // The pattern is anchored at the end for exactly this.
    const outcome = run({ FAKE_DIFF: 'apps/web/lib/x.md.ts' });
    expect(outcome.delegated).toBe(true);
  });

  it('builds when a path is one git had to quote', () => {
    // A quoted path ends in a quote character rather than .md, so an unusual
    // filename fails toward building. That is the right direction to be wrong.
    const outcome = run({ FAKE_DIFF: '"docs/a b.md"' });
    expect(outcome.delegated).toBe(true);
  });

  it('passes turbo-ignore’s own skip answer straight through', () => {
    // Proves the delegation is honest in both directions rather than a
    // roundabout way of always building.
    const outcome = run({ FAKE_DIFF: 'apps/web/lib/tasks.ts', FAKE_TURBO_EXIT: '0' });
    expect(outcome.delegated).toBe(true);
    expect(outcome.code).toBe(0);
  });

  it('builds when it cannot work out what changed', () => {
    // No deployed commit and no parent: a root commit, or a checkout too
    // shallow to diff. There is no evidence for a skip, so there is no skip.
    const outcome = run({ FAKE_HAS_PARENT: '0' });
    expect(outcome.delegated).toBe(true);
  });

  it('builds when git diff fails', () => {
    const outcome = run({ FAKE_DIFF_FAILS: '1' });
    expect(outcome.delegated).toBe(true);
  });

  it('builds when the changed-file list comes back empty', () => {
    // More likely a wrong base than a genuinely empty commit.
    const outcome = run({ FAKE_DIFF: '' });
    expect(outcome.delegated).toBe(true);
  });

  it('prefers the last deployed commit over HEAD^ as its base', () => {
    const outcome = run({ FAKE_DIFF: 'CLAUDE.md', VERCEL_GIT_PREVIOUS_SHA: 'deployedsha' });
    expect(outcome.stderr).toContain('last deployed commit');
    expect(outcome.code).toBe(0);
  });

  it('falls back to HEAD^ when the deployed commit is not in this checkout', () => {
    // A shallow clone or a force push. Still decidable, so it still decides.
    const outcome = run({
      FAKE_DIFF: 'CLAUDE.md',
      VERCEL_GIT_PREVIOUS_SHA: 'deployedsha',
      FAKE_BASE_RESOLVES: '0',
    });
    expect(outcome.stderr).toContain('HEAD^');
    expect(outcome.code).toBe(0);
  });

  it('builds when turbo-ignore itself cannot run', () => {
    // The last fail-safe: a missing or broken turbo-ignore must never read as
    // permission to skip.
    const outcome = run({ FAKE_DIFF: 'apps/web/lib/tasks.ts', FAKE_TURBO_EXIT: '127' });
    expect(outcome.code).not.toBe(0);
  });
});

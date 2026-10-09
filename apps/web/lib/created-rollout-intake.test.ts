import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCreatedRolloutIntake } from './release-draft-discard';

/**
 * Every create path that makes a rollout only so the planner has something to
 * plan must hand the planner the SAME abandon-discard payload (v1.92.1). The
 * AppShell's global "+ New rollout" modal used to open the intake without it,
 * so closing the planner there left an empty "Untitled rollout" behind while
 * the same close from Home or the workspace discarded it.
 */
describe('buildCreatedRolloutIntake', () => {
  it('marks the just-made rollout as discardable if the planner is abandoned', () => {
    expect(buildCreatedRolloutIntake({ releaseId: 'r1' })).toEqual({
      source: 'empty_state',
      releaseId: 'r1',
      discardIfAbandoned: true,
      createdTitle: null,
    });
  });

  it('carries the saved title so a shell that was only named is still discarded', () => {
    expect(buildCreatedRolloutIntake({ releaseId: 'r1', savedTitle: 'Midnight' })).toMatchObject({
      discardIfAbandoned: true,
      createdTitle: 'Midnight',
    });
  });

  it('prefills the type picked in the create modal, and only when one was picked', () => {
    expect(buildCreatedRolloutIntake({ releaseId: 'r1', releaseType: 'ep' }).prefill).toEqual({
      releaseType: 'ep',
    });
    expect(buildCreatedRolloutIntake({ releaseId: 'r1', releaseType: null })).not.toHaveProperty(
      'prefill'
    );
  });
});

/**
 * Structural invariant (CLAUDE.md test pattern 4): scan the real source of
 * every component that mounts CreateReleaseModal. Any planner intake it opens
 * after a create must go through the shared builder, so a new or forgotten
 * create path cannot quietly drop the discard again.
 */
const CREATE_MODAL_HOSTS = [
  'components/app/AppShell.tsx',
  'components/releases/RolloutCreateFlow.tsx',
  'components/workspace/WorkspaceView.tsx',
];

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');
}

/** The source of the onCreated handler passed to <CreateReleaseModal ...>. */
function onCreatedHandlers(source: string): string[] {
  const handlers: string[] = [];
  let from = 0;
  for (;;) {
    const mount = source.indexOf('<CreateReleaseModal', from);
    if (mount === -1) break;
    const start = source.indexOf('onCreated={', mount);
    if (start === -1) break;
    // Walk braces from the opening `{` to its match.
    let depth = 0;
    let end = start + 'onCreated='.length;
    for (; end < source.length; end += 1) {
      const ch = source[end];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    handlers.push(source.slice(start, end + 1));
    from = end;
  }
  return handlers;
}

describe('every CreateReleaseModal host opens the planner with the discard payload', () => {
  it('the host list is exactly the files that mount the modal', () => {
    // Fails when a new file mounts the modal, so it gets added above.
    const found: string[] = [];
    const walk = (dir: string) => {
      const abs = fileURLToPath(new URL(`../${dir}`, import.meta.url));
      for (const entry of readdirSync(abs, { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (entry.name.endsWith('.tsx') && readSource(rel).includes('<CreateReleaseModal')) {
          found.push(rel);
        }
      }
    };
    walk('components');
    walk('app');
    expect(found.sort()).toEqual([...CREATE_MODAL_HOSTS].sort());
  });

  for (const host of CREATE_MODAL_HOSTS) {
    it(`${host}: each post-create openIntake uses buildCreatedRolloutIntake`, () => {
      const handlers = onCreatedHandlers(readSource(host));
      expect(handlers.length).toBeGreaterThan(0);
      const calls = handlers.flatMap((handler) =>
        [...handler.matchAll(/openIntake\(\s*([^\n]*)/g)].map((match) => match[1])
      );
      // A zero-argument openIntake() is a local wrapper that already holds the
      // built payload; every call that passes a payload must build it here.
      const withPayload = calls.filter((arg) => !arg.startsWith(')'));
      expect(calls.length).toBeGreaterThan(0);
      for (const arg of withPayload) {
        expect(arg.startsWith('buildCreatedRolloutIntake(')).toBe(true);
      }
    });
  }
});

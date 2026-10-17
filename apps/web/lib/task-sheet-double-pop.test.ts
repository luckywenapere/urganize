import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { rememberTaskCanComment, resetTaskThreadAccessSeed, seedTaskCanComment } from './task-thread-access-seed';

/**
 * The task pop-up's "double pop" on a phone (2026-10-18): the sheet opened at
 * one height, then the detail fetch flipped Chat from the read-only note to the
 * composer and the auto-height sheet jumped up. Fixed by (1) a fixed-height
 * phone sheet with one slide-up entrance, (2) seeding canComment from what the
 * client already knows, (3) hover styles only on devices that really hover, so
 * a tap's sticky :hover does not draw a box on whatever field ends up under it.
 */

const WEB = join(__dirname, '..');
const read = (path: string) => readFileSync(join(WEB, path), 'utf8');

const task = (over: Partial<{ assignedToUserId: string | null; createdBy: string; workspaceId: string }> = {}) => ({
  workspaceId: 'ws-1',
  assignedToUserId: null as string | null,
  createdBy: 'someone-else',
  ...over,
});

describe('seedTaskCanComment', () => {
  beforeEach(() => resetTaskThreadAccessSeed());

  it('lets the assignee post from the first frame', () => {
    expect(seedTaskCanComment(task({ assignedToUserId: 'me' }), 'me')).toBe(true);
  });

  it('lets the creator post from the first frame', () => {
    expect(seedTaskCanComment(task({ createdBy: 'me' }), 'me')).toBe(true);
  });

  it('defaults to read-only when nothing is known', () => {
    expect(seedTaskCanComment(task(), 'me')).toBe(false);
    expect(seedTaskCanComment(task({ assignedToUserId: 'me' }), null)).toBe(false);
  });

  it('learns the team-role answer from a task that is not the viewer’s', () => {
    rememberTaskCanComment({ ...task(), canComment: true }, 'me');
    expect(seedTaskCanComment(task(), 'me')).toBe(true);
    // Per workspace: another team is still unknown.
    expect(seedTaskCanComment(task({ workspaceId: 'ws-2' }), 'me')).toBe(false);
  });

  it('ignores answers from the viewer’s own tasks (they say nothing about role)', () => {
    rememberTaskCanComment({ ...task({ assignedToUserId: 'me' }), canComment: true }, 'me');
    expect(seedTaskCanComment(task(), 'me')).toBe(false);
  });

  it('can learn a read-only role too', () => {
    rememberTaskCanComment({ ...task(), canComment: true }, 'me');
    rememberTaskCanComment({ ...task(), canComment: false }, 'me');
    expect(seedTaskCanComment(task(), 'me')).toBe(false);
  });
});

describe('task pop-up sheet', () => {
  const engine = read('components/tasks/TaskUIEngine.tsx');
  const view = read('components/tasks/TaskDetailView.tsx');
  const css = read('app/globals.css');

  it('is a fixed-height sheet on a phone so late content cannot resize it', () => {
    expect(engine).toMatch(/task-sheet-panel[^"]*\bh-\[92dvh\][^"]*\bsm:h-auto\b/);
  });

  it('seeds canComment instead of a flat false', () => {
    expect(engine).toContain('canComment: seedTaskCanComment(');
    expect(engine).not.toMatch(/canComment: false,/);
  });

  it('slides up once on a phone, fades the scrim, and honors reduced motion', () => {
    expect(engine).toContain('task-sheet-scrim');
    expect(engine).not.toMatch(/zoom-in-95|slide-in-from-bottom-2/);
    expect(css).toMatch(/@keyframes task-sheet-panel-enter[\s\S]*translateY\(100%\)/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.task-sheet-panel/);
  });

  it('only draws hover boxes on devices that hover', () => {
    const bareHover = view.match(/(?<=[\s"'`])(group-)?hover:/g) ?? [];
    expect(bareHover).toEqual([]);
  });
});

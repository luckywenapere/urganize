import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Wiring for "From profile to working together". The rules are unit tested in
 * lib/work-request-collab.test.ts; these hold that the routes actually go
 * through them, the way work-requests-wiring-guard.test.ts does for the seven
 * day close. Comments are stripped first so prose cannot satisfy a check.
 */

const root = join(__dirname, '..');
const read = (relative: string) =>
  readFileSync(join(root, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const createRoute = read('app/api/directory/requests/route.ts');
const answerRoute = read('app/api/directory/requests/[requestId]/route.ts');
const server = read('lib/work-request-collab-server.ts');
const inbox = read('components/settings/WorkRequestsInbox.tsx');
const sheet = read('components/directory/WorkRequestSheet.tsx');

const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  expect(from, `expected to find ${start}`).toBeGreaterThan(-1);
  const to = source.indexOf(end, from);
  return source.slice(from, to === -1 ? undefined : to);
};

describe('creating a request that names an activity', () => {
  it('derives the rollout from the activity instead of trusting the body', () => {
    expect(createRoute).toMatch(/\.from\('tasks'\)[\s\S]*?\.select\('id, release_id'\)/);
    expect(createRoute).toMatch(/releaseId = taskReleaseId/);
  });

  it('refuses a rollout the sender cannot work on, before anything is written', () => {
    const accessAt = createRoute.indexOf('ensureReleaseTeamWriteAccess(adminClient, releaseId');
    const insertAt = createRoute.indexOf('.insert(');
    expect(accessAt).toBeGreaterThan(-1);
    expect(accessAt).toBeLessThan(insertAt);
  });

  it('stores the kind, the links, the next release line and the activity', () => {
    for (const column of ['kind: input.kind', 'ask_links: input.askLinks', 'ask_release_note: input.askReleaseNote', 'task_id: input.taskId']) {
      expect(createRoute).toContain(column);
    }
  });
});

describe('the next release line stays hidden until they say yes', () => {
  it('is never in the received list query', () => {
    const received = between(createRoute, "box === 'received'", ': adminClient');
    expect(received).toContain('RECIPIENT_REQUEST_FIELDS');
    expect(received).not.toContain('ask_release_note');
  });

  it('is read back only for answered manager asks, and only while still interested', () => {
    const reveal = between(createRoute, 'async function withRevealedReleaseNotes', 'export async function GET');
    expect(reveal).toContain('revealsAskReleaseNote');
    expect(reveal).toContain("row.kind === 'manager'");
    expect(reveal).toContain(".eq('status', 'interested')");
  });
});

describe('answering', () => {
  it('asks the one pure rule what a yes does', () => {
    expect(answerRoute).toContain('decideAnswerEffect');
    expect(answerRoute).toContain('startSharedRollout');
    expect(answerRoute).toContain('assignPersonToTask');
  });

  it('records the answer first, so the row is the lock, then starts the work', () => {
    const updateAt = answerRoute.indexOf(".update({ status: answer.status");
    const effectAt = answerRoute.indexOf('startSharedRollout(adminClient');
    expect(updateAt).toBeGreaterThan(-1);
    expect(updateAt).toBeLessThan(effectAt);
  });

  it('hands the yes back to waiting when the shared rollout cannot start, so a yes never means nothing happened', () => {
    const failure = between(answerRoute, 'if (!started.ok)', 'share = {');
    expect(failure).toContain("status: 'new'");
    expect(failure).toContain(".eq('status', 'interested')");
    expect(failure).toContain('status: 409');
  });

  it('notifies the asker only after the work is done', () => {
    expect(answerRoute.indexOf('notifyWorkRequestAnswer(')).toBeGreaterThan(
      answerRoute.indexOf('assignPersonToTask(adminClient')
    );
  });
});

describe('the shared rollout', () => {
  it('limits the artist to their own artist and never gives them a role above member', () => {
    expect(server).toContain("role: 'member'");
    expect(server).toContain('artist_scope_id: artistId');
    expect(server).not.toMatch(/role:\s*'(owner|admin)'/);
  });

  it('asks the same three ceilings the invite and create routes ask', () => {
    for (const check of ['checkSeatAllowance', 'checkArtistAllowance', 'checkActiveReleaseAllowance']) {
      expect(server).toContain(check);
    }
  });

  it('gives a freelancer on one activity no seat and no access: it only writes the person on the task', () => {
    const assign = between(server, 'export async function assignPersonToTask', '\n}\n');
    expect(assign).toContain('assigned_person_id');
    expect(assign).toContain(".is('assigned_person_id', null)");
    expect(assign).not.toContain('workspace_members');
    expect(assign).not.toContain('assigned_to_user_id');
  });
});

describe('what the screens show', () => {
  it('offers the plans link on a refusal that a plan fixes', () => {
    expect(inbox).toContain('/locked?intent=upgrade');
    expect(inbox).toContain("body.reason === 'seat_limit'");
  });

  it('only shows the next release line to an answered request', () => {
    expect(inbox).toMatch(/request\.status === 'interested' && request\.ask_release_note/);
  });

  it('sends the structured ask only for a manager ask, and the activity only for a crew ask', () => {
    expect(sheet).toContain("kind: 'manager'");
    expect(sheet).toMatch(/: \{ taskId \}/);
  });

  it('opens ask links as plain external links', () => {
    expect(inbox).toContain('rel="noopener noreferrer"');
  });
});

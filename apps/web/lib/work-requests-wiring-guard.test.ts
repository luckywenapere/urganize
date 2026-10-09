import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * The seven day close and "Not taking work" only mean anything if every route
 * that touches a request goes through them. A rule that exists in lib/ and is
 * skipped by one handler is worse than no rule, so this reads the real route
 * sources and holds the wiring, the way the other structural guards do. Comments
 * are stripped first so prose cannot satisfy a check.
 */

const root = join(__dirname, '..');
const read = (relative: string) =>
  readFileSync(join(root, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const requestsRoute = read('app/api/directory/requests/route.ts');
const answerRoute = read('app/api/directory/requests/[requestId]/route.ts');
const cronRoute = read('app/api/cron/due-date-notifications/route.ts');
const adminRoute = read('app/api/admin/directory/route.ts');
const adminPage = read('app/admin/directory/DirectoryAdminPageClient.tsx');
const card = read('app/dashboard/directory/DirectoryPageClient.tsx');
const sentList = read('components/directory/SentRequestsList.tsx');

describe('POST /api/directory/requests', () => {
  it('refuses a request to somebody who is not taking work', () => {
    expect(requestsRoute).toContain('canReceiveRequests');
    expect(requestsRoute).toContain('refusalForClosedAvailability');
    // It has to read the column to apply the rule.
    expect(requestsRoute).toMatch(/select\('user_id, display_name, visibility, availability'\)/);
  });

  it('does not count a request that has already run out its seven days against the cap', () => {
    expect(requestsRoute).toContain('workRequestCutoff');
    expect(requestsRoute).toMatch(/\.gte\('created_at', workRequestCutoff\(\)\)/);
  });

  it('closes a stale request to the same person and role before inserting', () => {
    const closeAt = requestsRoute.indexOf('expireStaleRequestsForPair(');
    const insertAt = requestsRoute.indexOf('.insert(');
    expect(closeAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(-1);
    expect(closeAt).toBeLessThan(insertAt);
  });

  it('reads a stale waiting request as closed on the way out', () => {
    expect(requestsRoute).toContain('withEffectiveStatus');
  });
});

describe('PATCH /api/directory/requests/[requestId]', () => {
  it('tells the answer rule how old the request is', () => {
    expect(answerRoute).toContain('created_at');
    expect(answerRoute).toMatch(/canAnswerWorkRequest\(\s*\{[^}]*createdAt/);
  });

  it('only updates a request that is still inside its seven days', () => {
    expect(answerRoute).toContain('workRequestCutoff');
    expect(answerRoute).toMatch(/\.gte\('created_at', workRequestCutoff\(\)\)/);
  });
});

describe('the daily sweep', () => {
  it('runs from the due date cron, which is where every sweep rides', () => {
    expect(cronRoute).toContain('runWorkRequestExpirySweep');
    expect(cronRoute).toMatch(/workRequestSweep/);
  });
});

describe('the admin directory page', () => {
  it('reads work_requests and reports a read that failed by table name', () => {
    expect(adminRoute).toMatch(/from\('work_requests'\)/);
    expect(adminRoute).toContain("['work_requests', requestsResult]");
    expect(adminRoute).toContain('summarizeWorkRequests');
  });

  it('shows the reply rate and says so when there is nothing to divide', () => {
    expect(adminPage).toContain('Reply rate');
    expect(adminPage).toContain('Not enough yet');
    expect(adminPage).toContain('Closed, no answer');
  });
});

describe('the directory page', () => {
  it('hides the ask button on somebody who is not taking work', () => {
    expect(card).toMatch(/availability\s*!==\s*'closed'|canReceiveRequests\(/);
  });
});

describe('the sender list', () => {
  it('does not count a closed request as an answer', () => {
    // Closed is not interested and it is not passed. It must not be offered
    // as something the person said.
    expect(sentList).toMatch(/status\s*!==\s*'new'\s*&&\s*[a-z.]*status\s*!==\s*'expired'|isAnswered|'expired'/);
  });
});

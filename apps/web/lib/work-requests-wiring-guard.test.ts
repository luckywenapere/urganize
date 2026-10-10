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
const shelvesRoute = read('app/api/directory/shelves/route.ts');
const featuredRoute = read('app/api/admin/directory/featured/route.ts');
const startServer = read('lib/work-request-start-server.ts');
const featuringServer = read('lib/directory-featuring-server.ts');
const seatsServer = read('lib/seats-server.ts');
const personCard = read('components/directory/PersonCard.tsx');
const shelvesView = read('components/directory/DirectoryShelves.tsx');

describe('the shelf card', () => {
  // Found by looking at it: a manager under the Manager heading read "Also works
  // as Manager", because a manager's own role has no delivered count of its own.
  it('leaves the shelf’s own role out of "Also works as"', () => {
    expect(personCard).toMatch(/entry\.delivered === 0 && entry\.role !== shelfRole/);
    expect(shelvesView).toMatch(/shelfRole=\{role\}/);
    expect(shelvesView).toMatch(/role=\{shelf\.role\}/);
  });
});

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

// ─────────────────────────────────────────────────────────────────────────────
// Directory spec, step 2

describe('sending a fuller request', () => {
  it('checks the sender can work on the rollout before it stores the id', () => {
    const accessAt = requestsRoute.indexOf('ensureReleaseTeamWriteAccess(');
    const insertAt = requestsRoute.indexOf('.insert(');
    expect(accessAt).toBeGreaterThan(-1);
    expect(accessAt).toBeLessThan(insertAt);
    // The shared team-write rule, so a guest cannot ask on the team's behalf.
    expect(requestsRoute).toContain("from '@/lib/release-access-server'");
  });

  it('checks an activity belongs to the rollout it was sent with', () => {
    expect(requestsRoute).toMatch(/\.from\('tasks'\)[\s\S]*?\.eq\('release_id', input\.releaseId\)/);
  });

  it('writes the new fields only when they carry something, and says so when it cannot', () => {
    expect(requestsRoute).toMatch(/if \(input\.nextRelease\) extras\.next_release/);
    expect(requestsRoute).toMatch(/if \(input\.links\.length > 0\) extras\.links/);
    expect(requestsRoute).toMatch(/if \(input\.taskId\) extras\.task_id/);
    expect(requestsRoute).toContain('Object.keys(extras).length > 0');
    expect(requestsRoute).toMatch(/status: 503/);
  });

  it('reads the inbox through the column list that has no rollout in it', () => {
    expect(requestsRoute).toContain('RECIPIENT_REQUEST_FIELDS');
    expect(requestsRoute).not.toMatch(/\.select\([^)]*release_id/);
    // The legacy fallbacks are the old columns, never wider.
    expect(requestsRoute).toContain('LEGACY_RECIPIENT_REQUEST_FIELDS');
  });

  it('shows the sender a shared rollout only where they can open it', () => {
    expect(requestsRoute).toContain('loadSharedReleaseTitles');
    // No title, no id: the list never points somebody at something unreachable.
    expect(requestsRoute).toMatch(/shared_release_id: sharedTitle \? sharedId : null/);
  });

  it('gives the recipient a word for what a yes starts and never the rollout behind it', () => {
    expect(requestsRoute).toContain('loadStartKindsForReceived');
    expect(requestsRoute).toMatch(/start_kind: kinds\.get\(/);
    expect(startServer).not.toMatch(/return\s+[^;]*release_id/);
  });
});

describe('answering with "accept and start"', () => {
  it('starts nothing unless the answerer asked for it', () => {
    expect(answerRoute).toMatch(/if \(answer\.start\) \{[\s\S]*?startWorkFromRequest\(/);
  });

  it('starts only after the answer is saved, and tells the sender after both', () => {
    const claimAt = answerRoute.indexOf(".eq('status', 'new')");
    const startAt = answerRoute.indexOf('startWorkFromRequest(');
    const notifyAt = answerRoute.indexOf('notifyWorkRequestAnswer(');
    expect(claimAt).toBeGreaterThan(-1);
    expect(claimAt).toBeLessThan(startAt);
    expect(startAt).toBeLessThan(notifyAt);
  });

  it('passes what the start needs from the stored row, never from the answer body', () => {
    // The release, activity and team are all read server side. The answer body
    // is parsed into `answer`, which carries a status, a reply and one boolean.
    expect(answerRoute).toMatch(/release_id: typeof row\.release_id === 'string'/);
    expect(answerRoute).not.toMatch(/body\.release|payload\.release|answer\.release/);
  });

  it('never sends the stored rollout back in the saved request', () => {
    expect(answerRoute).toMatch(
      /\.select\('id, role, note, status, reply, sender_name, sender_team, created_at, answered_at'\)/
    );
  });

  it('works with the old columns when the migration has not been applied', () => {
    expect(answerRoute).toContain("'42703'");
  });
});

describe('what a yes starts', () => {
  it('never throws, because the yes is already saved', () => {
    expect(startServer).toMatch(/catch \(error\) \{[\s\S]*?return notStarted\(kind, 'failed'\)/);
  });

  it('puts a hire on the team without checking the seat limit, and a signed artist through it', () => {
    const hire = startServer.slice(startServer.indexOf('async function startHireJoin'));
    expect(hire).not.toContain('checkSeatAllowance');
    expect(hire).toContain('countHireMembers');
    expect(hire).toContain('isHire: true');
    const manager = startServer.slice(
      startServer.indexOf('async function startManagerRollout'),
      startServer.indexOf('async function startHireJoin')
    );
    expect(manager).toContain('checkSeatAllowance');
    expect(manager).toContain('isHire: false');
    expect(manager).toContain('checkActiveReleaseAllowance');
    expect(manager).toContain('checkArtistAllowance');
  });

  it('keeps a hire to one artist and refuses to add one without an artist', () => {
    expect(startServer).toContain('artistScopeId: release.artist_id');
    expect(startServer).toMatch(/if \(!release\.artist_id\) return notStarted\(kind, 'failed'\)/);
  });

  it('only assigns an activity that belongs to the rollout', () => {
    expect(startServer).toMatch(/task\.release_id !== input\.releaseId/);
    expect(startServer).toMatch(/\.eq\('release_id', input\.releaseId\)/);
  });

  it('records the shared rollout once', () => {
    expect(startServer).toMatch(/shared_release_id: result\.releaseId/);
    expect(startServer).toMatch(/\.is\('started_at', null\)/);
  });

  it('never adds a hire as a full member when the column is missing', () => {
    expect(startServer).toMatch(/if \(input\.isHire\) return false;/);
  });
});

describe('a hire is not a seat', () => {
  it('leaves hires out of the seat count and reads them with the same filters', () => {
    expect(seatsServer).toContain('countHireMembers');
    expect(seatsServer).toMatch(/\.eq\('is_hire', true\)/);
  });

  it('refuses to hand out a free seat when the hire count cannot be read', () => {
    // A read blip counts everybody, which can refuse one invite that would have
    // fit and can never give one away.
    expect(seatsServer).toMatch(/\(count \?\? 0\) - \(hires \?\? 0\)/);
  });
});

describe('the shelves', () => {
  it('answers the directory flag first, then who is asking', () => {
    const flagAt = shelvesRoute.indexOf('isDirectoryFeatureEnabled()');
    const authAt = shelvesRoute.indexOf('requireActiveAuthenticatedUser(');
    expect(flagAt).toBeGreaterThan(-1);
    expect(flagAt).toBeLessThan(authAt);
  });

  it('is a read: it writes nothing', () => {
    expect(shelvesRoute).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(shelvesRoute).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/);
  });

  it('checks the profile at read time, so unpublishing leaves a shelf at once', () => {
    expect(featuringServer).toMatch(/\.neq\('visibility', 'private'\)/);
  });
});

describe('featuring somebody', () => {
  it('answers the admin check first on every handler', () => {
    for (const handler of ['GET', 'POST', 'DELETE']) {
      const body = featuredRoute.slice(featuredRoute.indexOf(`export async function ${handler}`));
      const verifyAt = body.indexOf('verifyAdmin(');
      expect(verifyAt).toBeGreaterThan(-1);
      // The first statement of the handler: nothing is read or written before
      // the admin check answers.
      expect(body.slice(0, verifyAt)).toMatch(
        /^export async function \w+\(request: NextRequest\) \{\s*const admin = await $/
      );
    }
  });

  it('is not behind the directory flag, so the first shelf can be lined up early', () => {
    expect(featuredRoute).not.toContain('isDirectoryFeatureEnabled');
  });

  it('only features a published profile, and checks the shelf has room first', () => {
    const publishedAt = featuringServer.indexOf('loadListedProfiles(admin, [userId])');
    const roomAt = featuringServer.indexOf('featuredHasRoom(');
    const insertAt = featuringServer.indexOf('.insert({', roomAt);
    expect(publishedAt).toBeGreaterThan(-1);
    expect(roomAt).toBeGreaterThan(publishedAt);
    expect(insertAt).toBeGreaterThan(roomAt);
  });
});

describe('the monthly On the rise sweep', () => {
  it('rides the due date cron, like every other sweep', () => {
    expect(cronRoute).toContain('runOnTheRiseSweep');
    expect(cronRoute).toMatch(/risingSweep/);
  });

  it('writes a month once and ignores duplicates', () => {
    expect(featuringServer).toMatch(/ignoreDuplicates: true/);
    expect(featuringServer).toMatch(/onConflict: 'month,role,user_id'/);
    expect(featuringServer).toContain("reason: 'already_computed'");
  });

  it('never counts a test rollout', () => {
    const sweep = featuringServer.slice(featuringServer.indexOf('export async function runOnTheRiseSweep'));
    expect(sweep).toContain('readTestRelease');
  });
});

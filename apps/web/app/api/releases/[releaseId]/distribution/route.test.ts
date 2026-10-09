import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeSupabase, type FakeDb } from '@/lib/test-support/fake-supabase';

// The order action (POST) must run the check ITSELF. These drive the real route,
// the real server module and the real rules against an in-memory database, with
// only auth and the team-access helper stubbed, so "even if the UI is bypassed"
// is tested end to end rather than assumed.

let db: FakeDb;
let inserts: Array<{ table: string; row: Record<string, unknown> }>;

vi.mock('@/app/api/_shared/auth', () => ({
  requireActiveAuthenticatedUser: async () => ({
    user: { id: 'user-2', email: 'teammate@example.com' },
    supabaseUrl: 'https://supabase.test',
  }),
  createAdminClient: () => {
    const fake = makeFakeSupabase(db);
    inserts = fake.inserts;
    return fake.client;
  },
}));

vi.mock('@/lib/release-access-server', () => ({
  ensureReleaseTeamReadAccess: async () => ({ release: { id: 'rel-1', ownerUserId: 'owner-1' } }),
  ensureReleaseTeamWriteAccess: async () => ({ release: { id: 'rel-1', ownerUserId: 'owner-1' } }),
}));

import { GET, POST } from './route';

const context = { params: Promise.resolve({ releaseId: 'rel-1' }) };

/** The handlers type their result as possibly undefined (an auth refusal is
 *  optional in the shared helper's type); a test wants a response or a failure. */
const need = (response: Response | undefined): Response => {
  if (!response) throw new Error('The route returned no response.');
  return response;
};

function post(body?: unknown) {
  return new NextRequest('https://app.test/api/releases/rel-1/distribution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const get = () =>
  new NextRequest('https://app.test/api/releases/rel-1/distribution', {
    headers: { Authorization: 'Bearer jwt' },
  });

/** A rollout that passes every rule, with a release day far enough away. */
function completeDb(): FakeDb {
  return {
    releases: [
      {
        id: 'rel-1',
        title: 'Lagos Nights',
        artist_name: 'Dorian',
        release_date: '2099-12-31',
        artwork_asset_id: 'art-1',
        owner_user_id: 'owner-1',
      },
    ],
    release_metadata: [{ release_id: 'rel-1', genre: 'Afrobeats', language: 'English', explicit: false }],
    assets: [
      {
        id: 'art-1',
        release_id: 'rel-1',
        category: 'cover_art',
        mime_type: 'image/png',
        metadata: { image: { width: 3000, height: 3000 } },
      },
      { id: 'aud-1', release_id: 'rel-1', category: 'audio', mime_type: 'audio/wav', file_name: 'm.wav', created_at: '2026-10-01T00:00:00Z' },
    ],
    release_credit_submissions: [{ release_id: 'rel-1', roles: ['songwriter'], songwriter_split: 100, master_split: 100 }],
    billing_events: [],
    workspaces: [{ id: 'ws-1', owner_id: 'owner-1' }],
    distribution_rejections: [],
  };
}

const handoffs = () => inserts.filter((entry) => entry.table === 'billing_events');

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_FEATURE_DISTRIBUTION', 'true');
  db = completeDb();
  inserts = [];
});
afterEach(() => vi.unstubAllEnvs());

describe('POST: the order refuses on errors even when the UI is bypassed', () => {
  it('lets a clean rollout through and records the hand-off', async () => {
    const response = need(await POST(post(), context));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recorded: true });
    expect(handoffs()).toHaveLength(1);
    expect(handoffs()[0].row).toMatchObject({ type: 'distribution_handoff', owner_user_id: 'owner-1' });
  });

  it('refuses with 409 and the list when there is an error, and records nothing', async () => {
    db.releases[0].artwork_asset_id = null;
    const response = need(await POST(post(), context));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('has_errors');
    expect(body.error).toBe('Fix these before you order distribution');
    expect(body.errors.map((issue: { code: string }) => issue.code)).toEqual(['artwork_missing']);
    expect(handoffs()).toHaveLength(0);
  });

  it('refuses an error even when the request claims the warnings were acknowledged', async () => {
    db.release_metadata[0].genre = null;
    const response = need(await POST(post({ acknowledgeWarnings: true }), context));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('has_errors');
    expect(handoffs()).toHaveLength(0);
  });

  it('refuses every kind of error, one at a time', async () => {
    const breakers: Array<[string, (data: FakeDb) => void]> = [
      ['missing_title', (data) => (data.releases[0].title = 'Untitled rollout')],
      ['missing_primary_artist', (data) => (data.releases[0].artist_name = '')],
      ['missing_release_date', (data) => (data.releases[0].release_date = null)],
      ['missing_genre', (data) => (data.release_metadata[0].genre = null)],
      ['missing_explicit_flag', (data) => (data.release_metadata[0].explicit = null)],
      ['missing_songwriter_credits', (data) => (data.release_credit_submissions = [])],
      ['artwork_not_square', (data) => (data.assets[0].metadata = { image: { width: 3000, height: 2900 } })],
      ['artwork_too_small', (data) => (data.assets[0].metadata = { image: { width: 2000, height: 2000 } })],
      ['artwork_wrong_format', (data) => (data.assets[0].mime_type = 'image/webp')],
    ];
    for (const [code, breakIt] of breakers) {
      db = completeDb();
      inserts = [];
      breakIt(db);
      const response = need(await POST(post(), context));
      expect(response.status, code).toBe(409);
      const body = await response.json();
      expect(body.errors.map((issue: { code: string }) => issue.code), code).toContain(code);
      expect(handoffs(), code).toHaveLength(0);
    }
  });

  it('does not record anything when the rollout could not be checked', async () => {
    db.releases = [];
    const response = need(await POST(post(), context));
    expect(response.status).toBe(500);
    expect(handoffs()).toHaveLength(0);
  });
});

describe('POST: warnings need Order anyway', () => {
  beforeEach(() => {
    db.releases[0].title = 'BLESS UP';
  });

  it('refuses a request that never acknowledged the warnings, and says what they are', async () => {
    const response = need(await POST(post(), context));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('warnings_not_acknowledged');
    expect(body.error).toBe('Worth a look');
    expect(body.errors).toEqual([]);
    expect(body.warnings.map((issue: { code: string }) => issue.code)).toEqual(['title_all_caps']);
    expect(handoffs()).toHaveLength(0);
  });

  it('lets it through once Order anyway is pressed, and records which warnings were ordered past', async () => {
    const response = need(await POST(post({ acknowledgeWarnings: true }), context));
    expect(response.status).toBe(200);
    expect(handoffs()).toHaveLength(1);
    expect(handoffs()[0].row.metadata).toMatchObject({ acknowledgedWarnings: ['title_all_caps'] });
  });

  it('only counts an acknowledgement that is literally true', async () => {
    for (const value of ['true', 1, 'yes', null, {}]) {
      const response = need(await POST(post({ acknowledgeWarnings: value }), context));
      expect(response.status, String(value)).toBe(409);
    }
    expect(handoffs()).toHaveLength(0);
  });
});

describe('GET: what the scene and the rollout show', () => {
  it('returns the check, the rejections and the last hand-off together', async () => {
    db.releases[0].title = 'BLESS UP';
    db.distribution_rejections = [
      { id: 'r1', release_id: 'rel-1', partner: 'therealmusicdistro', reason_code: null, reason_text: 'Sent back', created_at: '2026-10-08T00:00:00Z' },
    ];
    const response = need(await GET(get(), context));
    expect(response.status).toBe(200);
    const { distribution } = await response.json();
    expect(distribution.errors).toEqual([]);
    expect(distribution.warnings.map((issue: { code: string }) => issue.code)).toEqual(['title_all_caps']);
    expect(distribution.rejections).toHaveLength(1);
    expect(distribution.lastHandoffAt).toBeNull();
  });

  it('says it could not check, rather than reporting all clear, when a read fails', async () => {
    db.releases = [];
    const response = need(await GET(get(), context));
    expect(response.status).toBe(500);
  });
});

describe('the feature switch', () => {
  it('answers the flag-gate 404 for both methods while the Distribute step is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_DISTRIBUTION', 'false');
    for (const response of [need(await GET(get(), context)), need(await POST(post(), context))]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Not found.' });
    }
    expect(handoffs()).toHaveLength(0);
  });
});

/**
 * Row-level-security proof for playlist pitching.
 *
 * Playlist pitching is the first feature in this product where two unrelated
 * accounts read the same row: the team that sent a pitch and the curator it was
 * addressed to. Every other owned table is read only by its owner. That makes
 * the isolation rules worth PROVING rather than reasoning about, which is what
 * this file does.
 *
 * These tests talk to a real Postgres through PostgREST with the ANON key, as
 * signed-in users. They never call our API routes: the routes use the
 * service-role client, which bypasses RLS entirely, so testing through them
 * would prove nothing about the policies. Direct table calls are the point.
 *
 * ── Why this is env-gated ────────────────────────────────────────────────────
 * `pnpm test` in this repo is pure-logic, node-environment, no network (see
 * apps/web/vitest.config.ts). This file keeps that true: with no RLS_TEST_* env
 * set, every case is SKIPPED and the suite stays green and offline. It runs only
 * when you point it at a development Supabase project on purpose.
 *
 * ── Setting it up (one time, against a DEV project, never production) ────────
 * 1. Apply supabase/migrations/20260810100000_playlist_pitching.sql.
 * 2. Create five auth users. Four are used here; the fifth is the anon client,
 *    which is simply "no sign-in".
 *      TEAM A   — a manager who owns a release, a task, an asset and a note
 *      TEAM B   — a second, unrelated manager
 *      CURATOR 1 — has a curator_profiles row, owns a playlist
 *      CURATOR 2 — has a curator_profiles row, owns a different playlist
 *    Curator-ness is that row, not profiles.role: an account can own playlists
 *    AND run releases. Seed these two as curator-ONLY (join with a fresh email
 *    that has never touched the team side) so the isolation assertions below
 *    stay about two genuinely separate tenants.
 * 3. Seed one pitch: from TEAM A's release, to CURATOR 1's playlist. The easiest
 *    honest way is through the product with the flag on: mint an invite at
 *    /admin/curator-invites, join as each curator, add a playlist, then pitch
 *    from TEAM A's release.
 * 4. Export the ids and credentials below, then run:
 *      pnpm --filter @urganize/web test lib/pitching-rls.integration.test.ts
 *
 * ── Env ──────────────────────────────────────────────────────────────────────
 *   RLS_TEST_SUPABASE_URL, RLS_TEST_ANON_KEY
 *   RLS_TEST_TEAM_A_EMAIL / _PASSWORD
 *   RLS_TEST_TEAM_B_EMAIL / _PASSWORD
 *   RLS_TEST_CURATOR_1_EMAIL / _PASSWORD
 *   RLS_TEST_CURATOR_2_EMAIL / _PASSWORD
 *   RLS_TEST_PITCH_ID          — the seeded pitch (TEAM A -> CURATOR 1)
 *   RLS_TEST_CURATOR_1_USER_ID — used to prove curator 2 cannot read by filter
 *
 * A failure here is a security bug, not a flaky test. Read the failing case's
 * name before changing anything: it says exactly which boundary broke.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.RLS_TEST_SUPABASE_URL?.trim() || '';
const anonKey = process.env.RLS_TEST_ANON_KEY?.trim() || '';

const creds = {
  teamA: {
    email: process.env.RLS_TEST_TEAM_A_EMAIL?.trim() || '',
    password: process.env.RLS_TEST_TEAM_A_PASSWORD || '',
  },
  teamB: {
    email: process.env.RLS_TEST_TEAM_B_EMAIL?.trim() || '',
    password: process.env.RLS_TEST_TEAM_B_PASSWORD || '',
  },
  curator1: {
    email: process.env.RLS_TEST_CURATOR_1_EMAIL?.trim() || '',
    password: process.env.RLS_TEST_CURATOR_1_PASSWORD || '',
  },
  curator2: {
    email: process.env.RLS_TEST_CURATOR_2_EMAIL?.trim() || '',
    password: process.env.RLS_TEST_CURATOR_2_PASSWORD || '',
  },
};

const pitchId = process.env.RLS_TEST_PITCH_ID?.trim() || '';
const curator1UserId = process.env.RLS_TEST_CURATOR_1_USER_ID?.trim() || '';

const configured = Boolean(
  url &&
    anonKey &&
    pitchId &&
    curator1UserId &&
    Object.values(creds).every((entry) => entry.email && entry.password)
);

/** A signed-in anon-key client, i.e. exactly what the browser holds. */
async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`);
  return client;
}

describe.skipIf(!configured)('playlist pitching row-level security', () => {
  let teamA: SupabaseClient;
  let teamB: SupabaseClient;
  let curator1: SupabaseClient;
  let curator2: SupabaseClient;
  let anon: SupabaseClient;

  beforeAll(async () => {
    [teamA, teamB, curator1, curator2] = await Promise.all([
      signIn(creds.teamA.email, creds.teamA.password),
      signIn(creds.teamB.email, creds.teamB.password),
      signIn(creds.curator1.email, creds.curator1.password),
      signIn(creds.curator2.email, creds.curator2.password),
    ]);
    anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }, 30_000);

  afterAll(async () => {
    await Promise.all(
      [teamA, teamB, curator1, curator2].map((client) => client?.auth.signOut())
    );
  });

  // ── Positive controls ─────────────────────────────────────────────────────
  // These come first: if the setup is wrong, the negative tests below would all
  // "pass" for the wrong reason (nothing visible to anyone).

  describe('the two sides can each read their own pitch', () => {
    it('the curator it was sent to sees it', async () => {
      const { data, error } = await curator1
        .from('playlist_pitches')
        .select('id,song_title,status')
        .eq('id', pitchId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('the team that sent it sees it', async () => {
      const { data, error } = await teamA
        .from('playlist_pitches')
        .select('id,song_title,status')
        .eq('id', pitchId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('a curator reads their own profile and playlists', async () => {
      const profile = await curator1.from('curator_profiles').select('user_id').limit(1);
      expect(profile.error).toBeNull();
      expect(profile.data?.length).toBeGreaterThan(0);

      const playlists = await curator1.from('curator_playlists').select('id').limit(5);
      expect(playlists.error).toBeNull();
      expect(playlists.data?.length).toBeGreaterThan(0);
    });
  });

  // ── The isolation that matters ────────────────────────────────────────────

  describe('a curator cannot see another curator', () => {
    it('curator 2 cannot read curator 1 pitches', async () => {
      const { data, error } = await curator2
        .from('playlist_pitches')
        .select('id')
        .eq('curator_user_id', curator1UserId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('curator 2 cannot read the seeded pitch by id', async () => {
      const { data, error } = await curator2
        .from('playlist_pitches')
        .select('id')
        .eq('id', pitchId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('curator 2 cannot read curator 1 profile', async () => {
      const { data, error } = await curator2
        .from('curator_profiles')
        .select('user_id')
        .eq('user_id', curator1UserId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('curator 2 cannot read curator 1 playlists', async () => {
      const { data, error } = await curator2
        .from('curator_playlists')
        .select('id')
        .eq('curator_user_id', curator1UserId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('a curator cannot see any team data', () => {
    // The whole account type is defined by this. Each of these tables is
    // owner-scoped, and a curator owns nothing in any of them.
    it.each(['releases', 'tasks', 'assets', 'notes', 'release_metadata', 'activity_logs'])(
      'curator reads nothing from %s',
      async (table) => {
        const { data, error } = await curator1.from(table).select('id').limit(5);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
    );

    it('curator cannot read invite codes', async () => {
      // curator_invites has RLS on with ZERO policies, so this must come back
      // empty for every non-service-role caller.
      const { data, error } = await curator1.from('curator_invites').select('code').limit(5);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('one team cannot see another team pitches', () => {
    it('team B cannot read the pitch team A sent', async () => {
      const { data, error } = await teamB
        .from('playlist_pitches')
        .select('id')
        .eq('id', pitchId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  // ── No write path exists outside the routes ───────────────────────────────
  // playlist_pitches has no INSERT, UPDATE or DELETE policy at all. Every write
  // carries an invariant RLS cannot express (the waiting-pitch cap, honest
  // denormalized fields, only-a-curator-moves-a-status), so writes go through
  // service-role routes and direct mutations must fail closed. A row count of
  // zero counts as failing closed: PostgREST reports either an error or an
  // empty result depending on the statement.

  describe('nobody can write a pitch directly', () => {
    it('a curator cannot move the status of their own pitch', async () => {
      const { data, error } = await curator1
        .from('playlist_pitches')
        .update({ status: 'added' })
        .eq('id', pitchId)
        .select('id');
      expect(error !== null || (data || []).length === 0).toBe(true);
    });

    it('a curator cannot move the status of a pitch sent to someone else', async () => {
      const { data, error } = await curator2
        .from('playlist_pitches')
        .update({ status: 'added' })
        .eq('id', pitchId)
        .select('id');
      expect(error !== null || (data || []).length === 0).toBe(true);
    });

    it('a team cannot insert a pitch', async () => {
      const { error } = await teamA.from('playlist_pitches').insert({
        owner_user_id: '00000000-0000-0000-0000-000000000000',
        pitcher_name: 'Forged',
        curator_user_id: curator1UserId,
        playlist_name: 'Forged',
        song_title: 'Forged',
        artist_name: 'Forged',
        song_url: 'https://example.com/song',
      });
      expect(error).not.toBeNull();
    });

    it('a team cannot delete a pitch', async () => {
      const { data, error } = await teamA
        .from('playlist_pitches')
        .delete()
        .eq('id', pitchId)
        .select('id');
      expect(error !== null || (data || []).length === 0).toBe(true);

      // And it is still there.
      const check = await teamA.from('playlist_pitches').select('id').eq('id', pitchId);
      expect(check.data).toHaveLength(1);
    });

    it('nobody can create a curator profile for themselves', async () => {
      // curator_profiles has no INSERT policy: a curator account exists only
      // after the join route consumes a single-use invite.
      const { error } = await teamB.from('curator_profiles').insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        display_name: 'Self minted',
      });
      expect(error).not.toBeNull();
    });
  });

  describe('a signed-out visitor reads nothing', () => {
    it.each([
      'playlist_pitches',
      'curator_playlists',
      'curator_profiles',
      'curator_invites',
    ])('anon reads nothing from %s', async (table) => {
      const { data, error } = await anon.from(table).select('*').limit(5);
      // Either RLS returns an empty set or PostgREST refuses outright. Both are
      // correct; leaking a row is not.
      expect(error !== null || (data || []).length === 0).toBe(true);
    });
  });
});

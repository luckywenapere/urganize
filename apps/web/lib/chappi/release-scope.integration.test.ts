/**
 * Phase 0 proof: UrgAns shows each member exactly the releases they are
 * entitled to — no fewer, and no more.
 *
 * ── Why this is NOT shaped like pitching-rls.integration.test.ts ─────────────
 * That file signs in with the ANON key and hits tables directly, because the
 * boundary it proves is an RLS policy. This boundary is not a policy. Every
 * assistant surface runs on the SERVICE-ROLE client, which bypasses RLS
 * entirely, so an anon test would prove nothing about this code path. What
 * actually enforces isolation here is `.in('owner_user_id', releaseOwnerIds)`
 * plus the artist-scope filter applied in JS afterwards. So this file runs the
 * REAL functions — resolveChappiContext, buildChappiSystemPrompt, the tools —
 * against a real project and asserts what comes back.
 *
 * It keeps the two properties that make that file trustworthy: positive
 * controls run FIRST, so a broken seed cannot make the negative assertions pass
 * vacuously, and the whole suite is env-gated so `pnpm test` stays offline.
 *
 * ── Setting it up (a DEV project, never production) ──────────────────────────
 * Seed four accounts and one shared team:
 *   OWNER    — owns a workspace and at least two releases, by two DIFFERENT
 *              artists. Note which artist each belongs to.
 *   TEAMMATE — an ACTIVE workspace_members row in OWNER's workspace,
 *              artist_scope_id NULL. Owns no releases of their own.
 *   ARTIST   — an ACTIVE workspace_members row in OWNER's workspace with
 *              artist_scope_id set to ONE of those artists.
 *   OUTSIDER — a second, unrelated manager who owns at least one release and
 *              shares no workspace with OWNER.
 *
 * Then export the ids below and run:
 *   pnpm --filter @urganize/web test lib/chappi/release-scope.integration.test.ts
 *
 * ── Env ──────────────────────────────────────────────────────────────────────
 *   SCOPE_TEST_SUPABASE_URL, SCOPE_TEST_SERVICE_ROLE_KEY
 *   SCOPE_TEST_OWNER_USER_ID, SCOPE_TEST_TEAMMATE_USER_ID
 *   SCOPE_TEST_ARTIST_USER_ID, SCOPE_TEST_ARTIST_ID
 *   SCOPE_TEST_OUTSIDER_USER_ID
 *
 * A failure in case 4 or 5 is a data-exposure bug, not a flaky test. Read the
 * failing case name before changing anything.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { resolveChappiContext } from './dispatch';
import { listVisibleReleases } from './release-scope';
import { buildChappiSystemPrompt } from './system-prompt';
import { getChappiTool } from './tools';
import type { ChappiToolContext } from './tools';

const url = process.env.SCOPE_TEST_SUPABASE_URL?.trim() || '';
const serviceKey = process.env.SCOPE_TEST_SERVICE_ROLE_KEY?.trim() || '';
const ids = {
  owner: process.env.SCOPE_TEST_OWNER_USER_ID?.trim() || '',
  teammate: process.env.SCOPE_TEST_TEAMMATE_USER_ID?.trim() || '',
  artist: process.env.SCOPE_TEST_ARTIST_USER_ID?.trim() || '',
  outsider: process.env.SCOPE_TEST_OUTSIDER_USER_ID?.trim() || '',
};
const scopedArtistId = process.env.SCOPE_TEST_ARTIST_ID?.trim() || '';

const configured = Boolean(
  url && serviceKey && scopedArtistId && Object.values(ids).every(Boolean)
);

type Release = Awaited<ReturnType<typeof listVisibleReleases>>[number];

describe.skipIf(!configured)('AI release scoping', () => {
  let admin: SupabaseClient;
  const ctxFor = new Map<string, ChappiToolContext>();

  /** Titles the SNAPSHOT shows — parsed from the prompt, not from a helper, so
   *  a bug in prompt assembly is visible here rather than hidden behind it. */
  async function snapshotTitles(ctx: ChappiToolContext): Promise<string[]> {
    const { prompt } = await buildChappiSystemPrompt(ctx);
    expect(prompt, 'the snapshot must not have silently failed').not.toContain(
      'Workspace snapshot unavailable.'
    );
    return [...prompt.matchAll(/^- (.+?) \(id: /gm)].map((m) => m[1]);
  }

  async function toolTitles(ctx: ChappiToolContext, tool: string): Promise<string[]> {
    const result = await getChappiTool(tool)!.execute(ctx, {});
    const data = (result as { data?: Array<{ title?: string }> }).data || [];
    return data.map((r) => String(r.title || ''));
  }

  beforeAll(async () => {
    admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const [name, id] of Object.entries(ids)) {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data.user) throw new Error(`Could not load ${name} (${id}): ${error?.message}`);
      ctxFor.set(
        name,
        await resolveChappiContext({
          user: data.user,
          adminClient: admin,
          origin: 'http://localhost:3000',
          authToken: 'integration-test',
        })
      );
    }
  }, 60_000);

  // ── Positive controls, first, so nothing below can pass vacuously ──────────

  it('1. the owner sees their own releases in the snapshot', async () => {
    const titles = await snapshotTitles(ctxFor.get('owner')!);
    expect(titles.length, 'seed the owner with at least two releases').toBeGreaterThan(1);
  });

  it('1b. the outsider sees releases of their own', async () => {
    const titles = await snapshotTitles(ctxFor.get('outsider')!);
    expect(titles.length, 'seed the outsider with at least one release').toBeGreaterThan(0);
  });

  // ── The bug this phase fixes ───────────────────────────────────────────────

  it('2. an invited teammate sees the owner\'s releases in the snapshot', async () => {
    const owner = await snapshotTitles(ctxFor.get('owner')!);
    const teammate = await snapshotTitles(ctxFor.get('teammate')!);
    expect(teammate.sort()).toEqual(owner.sort());
  });

  it('3. the teammate sees the same releases from list_releases as from the snapshot', async () => {
    const ctx = ctxFor.get('teammate')!;
    expect((await toolTitles(ctx, 'list_releases')).sort()).toEqual(
      (await snapshotTitles(ctx)).sort()
    );
  });

  // ── The leak this fix could introduce. The one that matters. ───────────────

  it('4. an artist-scoped member sees only their own artist, in BOTH surfaces', async () => {
    const ctx = ctxFor.get('artist')!;
    const releases: Release[] = await listVisibleReleases(ctx);

    expect(releases.length, 'seed the scoped artist with at least one release').toBeGreaterThan(0);
    for (const release of releases) {
      // Asserted STRICTLY, with no `?? scopedArtistId` fallback: a fallback
      // would make this case pass by default the day artistId stops being
      // populated, which is the exact vacuous pass the positive controls above
      // exist to rule out.
      expect(
        release.artistId,
        `release "${release.title}" is outside this member's artist scope`
      ).toBe(scopedArtistId);
    }

    const ownerTitles = await snapshotTitles(ctxFor.get('owner')!);
    const artistTitles = await snapshotTitles(ctx);
    expect(
      artistTitles.length,
      'the scoped artist must see FEWER releases than the owner — seed the owner with a second artist'
    ).toBeLessThan(ownerTitles.length);
    expect((await toolTitles(ctx, 'list_releases')).sort()).toEqual(artistTitles.sort());
  });

  it('5. no surface returns another team\'s releases', async () => {
    const outsiderTitles = new Set(await snapshotTitles(ctxFor.get('outsider')!));

    for (const member of ['owner', 'teammate', 'artist'] as const) {
      const ctx = ctxFor.get(member)!;
      const seen = [
        ...(await snapshotTitles(ctx)),
        ...(await toolTitles(ctx, 'list_releases')),
      ];
      for (const title of seen) {
        expect(outsiderTitles.has(title), `${member} can see the outsider's "${title}"`).toBe(
          false
        );
      }
    }
  });
});

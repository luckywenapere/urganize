// How UrgAns resolves which releases the caller can see (SERVER-ONLY).
//
// THE ONE PLACE. Both surfaces that list releases for the assistant — the
// system-prompt snapshot and the `list_releases` tool — go through here, so
// they cannot answer the same question two different ways. They used to: both
// called getReleasesForUser(ctx.user.id) with no visible-owner list, so an
// invited teammate saw ZERO releases in the snapshot while list_tasks returned
// the whole team's tasks. That failed closed (it withheld, it never leaked),
// but it made shared context useless for exactly the multi-member teams it
// exists for.
//
// ── The trap ────────────────────────────────────────────────────────────────
// Passing releaseOwnerIds WITHOUT artistScopeByOwnerId converts that
// fails-closed bug into a real leak. An artist invited to a manager's team is
// scoped to their own releases; hand the raw owner list to the snapshot and
// that artist reads the manager's entire roster — every title, every date —
// inside the system prompt, with no UI anywhere that would reveal it happened.
//
// That is why this module exports a function rather than a convention: the two
// arguments travel together or not at all.

import { ReleaseService } from '@/lib/services/release-service';
import type { ChappiToolContext } from './tool-families/shared';

/**
 * The owner set to read releases for.
 *
 * Mirrors `/api/releases`: an empty set falls back to the caller alone rather
 * than to an unfiltered query, because `.in('owner_user_id', [])` matches
 * nothing and the caller's own releases must always be visible. Pure, so the
 * fallback is testable without a database.
 */
export function resolveVisibleOwnerIds(
  userId: string,
  releaseOwnerIds: readonly string[] | null | undefined
): string[] {
  const owners = (releaseOwnerIds || []).filter(Boolean);
  return owners.length ? Array.from(new Set(owners)) : [userId].filter(Boolean);
}

/**
 * Releases visible to the caller, resolved exactly as the rest of the app
 * resolves them.
 *
 * `ReleaseService.getReleasesForUser` unions the owner list with the caller and
 * applies the artist scope in JS after the query — the per-owner OR-of-ANDs
 * does not express as a single PostgREST filter. Do not reimplement either
 * step here; the point of this function is that there is one implementation.
 */
export function listVisibleReleases(ctx: ChappiToolContext) {
  return new ReleaseService(ctx.adminClient).getReleasesForUser(
    ctx.user.id,
    resolveVisibleOwnerIds(ctx.user.id, ctx.releaseOwnerIds),
    ctx.artistScopeByOwnerId
  );
}

/**
 * Releases the caller OWNS. Deliberately narrower than listVisibleReleases.
 *
 * Use this wherever the tool's downstream route is owner-only, so the
 * assistant refuses up front instead of showing the user an action that will
 * 403 after they approve it. Today that is exactly one caller:
 * `delete_release`'s confirmation builder, because
 * `DELETE /api/releases/[releaseId]` runs `ensureReleaseOwnership` against the
 * caller alone — the release routes widened GET to whole-workspace visibility
 * and kept PATCH/DELETE owner-only on purpose.
 *
 * Do NOT "fix" this to match listVisibleReleases. Showing a teammate a card
 * that says "Delete 'Midnight EP' and its 42 activities", then failing the
 * delete when they approve, is worse than the honest refusal they get now.
 */
export function listOwnedReleases(ctx: ChappiToolContext) {
  return new ReleaseService(ctx.adminClient).getReleasesForUser(ctx.user.id);
}

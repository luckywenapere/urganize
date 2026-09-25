import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '../../_shared';
import { loadAccountMonths, type CountAccounts } from '@/lib/account-months';

// New Urganize accounts per calendar month, for the Growth page's "New
// accounts" section (founder request, 2026-09-25: "analytics page should view
// monthly sign ups too"). It replaces the separate /admin/signups page that
// PR #599 proposed, which was closed in favour of this.
//
// WHAT IS COUNTED: every public.profiles row, by created_at. That is the house
// definition of an account sign-up (the Onboarding page's "Total signups"
// reads the same table). Two things worth knowing about it:
//   - created_at is when the account first reached the app, not the auth
//     sign-up instant. A profile is written on first sign-in (the auth store's
//     getOrCreateProfile, the OAuth callback, onboarding, curator join); no
//     database trigger creates one. For every real sign-up path those are
//     seconds apart.
//   - Every role counts: invited teammates, playlist owners and seeded demo
//     accounts included. Narrowing to one role is a filter on the query below.
//
// WHY 13 COUNT QUERIES rather than reading rows: an exact HEAD count per month
// never meets PostgREST's per-response row cap (max_rows, 1,000 by default on
// Supabase), transfers no rows, and cannot be cut short. PR #599 read rows
// oldest-first with .range(0, 9999), so past 1,000 accounts it would have
// dropped the NEWEST rows and shown recent months falling towards zero.
//
// Separate from /api/admin/growth on purpose: that route reads the marketing
// site's Neon database and 500s when DATABASE_URL is unset (local, previews),
// which must never hide the account numbers.

export async function GET(req: NextRequest) {
  const adminResult = await verifyAdmin(req);
  if (!adminResult.ok) return adminResult.response;

  const client = adminResult.supabaseAdmin;

  const countAccounts: CountAccounts = async (range) => {
    let query = client.from('profiles').select('id', { count: 'exact', head: true });
    if (range) {
      query = query.gte('created_at', range.startIso).lt('created_at', range.endIso);
    }
    const { count, error, status } = await query;
    // A failed HEAD request has no body, so postgrest-js reports it with an
    // empty message, or (for a 404) as a 204 with no error at all. A missing
    // count is therefore a failure too, never a zero.
    if (error || count === null) {
      throw new Error(error?.message || `Could not count accounts (status ${status}).`);
    }
    return count;
  };

  try {
    const summary = await loadAccountMonths(countAccounts, new Date());
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error && err.message ? err.message : 'Could not load new accounts.' },
      { status: 500 }
    );
  }
}

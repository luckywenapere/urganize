import { NextRequest, NextResponse } from 'next/server';
import { createPostHogEvent } from '@/lib/analytics/shared';
import {
  isLikelyBot,
  isPrefetchRequest,
  parseProfileCtaQuery,
  profileSignupPath,
  publicProfileCtaClickedProperties,
} from '@/lib/profile-growth';
import { recordProfileCtaTap } from '@/lib/profile-growth-server';

// GET /api/public-profile/cta?slug=&cta= (2026-10-11).
//
// The two calls at the foot of /p/{slug} are plain links to here, so they work
// with no script at all. This records the tap and sends the reader on to sign
// up with where they came from in the address (?from=profile&slug=&cta=),
// which the onboarding page remembers until the account exists.
//
// OPEN AND SESSIONLESS: the reader is a stranger. It reads nothing from the
// request but the two query values, both checked against fixed shapes, and it
// never fails: a bad value still lands on sign-up, just without attribution.
// A link preview or a prefetch is redirected the same way and not counted.
// 303 so a later POST cannot be replayed into it; no-store so a cache never
// swallows a second tap.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const parsed = parseProfileCtaQuery(request.nextUrl.searchParams);
  const destination = new URL(
    profileSignupPath({ slug: parsed?.slug ?? null, cta: parsed?.cta ?? null }),
    request.nextUrl.origin
  );

  const counted =
    parsed !== null &&
    !isLikelyBot(request.headers.get('user-agent')) &&
    !isPrefetchRequest((name) => request.headers.get(name));
  if (counted && parsed) {
    recordProfileCtaTap({
      slug: parsed.slug,
      cta: parsed.cta,
      buildEvent: ({ claimed }) =>
        createPostHogEvent(
          'public_profile_cta_clicked',
          publicProfileCtaClickedProperties({ slug: parsed.slug, claimed, cta: parsed.cta })
        ),
    });
  }

  return NextResponse.redirect(destination, { status: 303, headers: { 'cache-control': 'no-store' } });
}

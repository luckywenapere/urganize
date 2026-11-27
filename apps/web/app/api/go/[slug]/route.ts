import { NextRequest, NextResponse } from 'next/server';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { isLikelyBot, isPrefetchRequest } from '@/lib/profile-growth';
import { captureProfileGrowthEvent } from '@/lib/profile-growth-server';
import {
  SOURCE_LINK_COOKIE,
  SOURCE_LINK_COOKIE_MAX_AGE,
  SOURCE_LINK_LANDING,
  resolveSourceLink,
  sourceLinkCookieDomain,
  sourceLinkDestination,
  sourceLinkProperties,
} from '@/lib/source-links';
import { recordSourceLinkEvent } from '@/lib/source-links-server';

// GET /api/go/<slug> (2026-11-10, #1185). Reached as go.urganize.app/<slug>
// through the rewrites in next.config.js, with no redirect in front of it
// (#1380), so the tap costs one hop to the final page. Counts the tap, remembers the link
// for 30 days and sends the visitor to the marketing site with utm tags.
// See lib/source-links.ts.
//
// A link preview (WhatsApp, X) or a prefetch is redirected the same way but
// is not counted and gets no cookie. An unknown slug goes to the site untagged.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = resolveSourceLink(slug);
  const response = NextResponse.redirect(link ? sourceLinkDestination(link) : SOURCE_LINK_LANDING, 307);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex');
  if (!link) return response;

  const person =
    !isLikelyBot(request.headers.get('user-agent')) && !isPrefetchRequest((name) => request.headers.get(name));
  if (!person) return response;

  response.cookies.set(SOURCE_LINK_COOKIE, link.slug, {
    maxAge: SOURCE_LINK_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    httpOnly: true,
    domain: sourceLinkCookieDomain(request.headers.get('host')),
  });
  captureProfileGrowthEvent(
    'source link click',
    null,
    createPostHogEvent('source_link_clicked', sourceLinkProperties(link))
  );
  // The same tap as one row of our own, for /admin/source-links (#1409).
  recordSourceLinkEvent('source link tap row', { kind: 'tap', slug: link.slug });
  return response;
}

import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadPublicPerson } from '@/lib/person-public-server';
import { EMPTY_PERSON_PAGE_EXTRAS, loadPersonPageExtras } from '@/lib/person-page-extras-server';
import { displayLink, initialsOf, roleLine } from '@/lib/person-page';
import { publicProfileUrl } from '@/lib/profile-growth';
import { loadRecapFonts } from '@/lib/recap-fonts';

// The 9:16 share card for a claimed /p/{slug} page (URG-305, mock profile.html
// "Share card"): face, name, role · city, the artists they manage, the link.
// 1080x1920, a Story's size.
//
// Public, like the page it shares, and the same 404 for anything that is not a
// public claimed profile. Nothing is stored: drawn on request from the page's
// own data, so it can never go stale. Anything missing is left out: no photo
// draws the name on black, no roster drops the faces row.

export const maxDuration = 30;

const W = 1080;
const H = 1920;
const ACCENT = '#7fd99a';
const MUTED = '#929291';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const person = await loadPublicPerson(slug);
  if (!person) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const { profile, roles, view, profileType } = person;
  const pageSlug = profile.slug || slug.trim().toLowerCase();
  const admin = adminClient();
  const extras = admin
    ? await loadPersonPageExtras(admin, { userId: profile.userId, personId: profile.id })
    : EMPTY_PERSON_PAGE_EXTRAS;
  const role = roleLine({ roles, profileType, city: profile.city || view.location });
  const link = displayLink(publicProfileUrl(new URL(request.url).origin, pageSlug) || '');

  const words = profile.displayName.trim().split(/\s+/);
  const first = words.length > 1 ? words.slice(0, -1).join(' ') : words[0] || '';
  const last = words.length > 1 ? words[words.length - 1] : '';
  const nameSize = profile.displayName.length > 22 ? 104 : 132;

  let fonts: Awaited<ReturnType<typeof loadRecapFonts>> = [];
  try {
    fonts = await loadRecapFonts();
  } catch (error) {
    console.error('[person-card] fonts failed', error);
    return NextResponse.json({ error: 'Could not draw the card.' }, { status: 500 });
  }

  const image = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative', backgroundColor: '#000', color: '#f2f2f0' }}>
        {view.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={view.photoUrl}
            alt=""
            width={W}
            height={H}
            style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover', objectPosition: 'center 20%' }}
          />
        ) : null}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: W,
            height: H,
            backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.7) 58%, #000 76%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 72,
            left: 78,
            color: ACCENT,
            fontFamily: 'Space Grotesk',
            fontWeight: 500,
            fontSize: 36,
            letterSpacing: 10,
          }}
        >
          URGANIZE
        </div>
        <div style={{ position: 'absolute', left: 78, right: 78, bottom: 84, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'Young Serif', fontSize: nameSize, lineHeight: 0.95 }}>
            <span>{last ? first : ''}</span>
            <span style={{ display: 'flex' }}>
              {last || first}
              <span style={{ color: ACCENT }}>.</span>
            </span>
          </div>
          {role ? (
            <div style={{ marginTop: 30, fontFamily: 'Space Mono', fontSize: 39, color: MUTED, letterSpacing: 2 }}>
              {role.toUpperCase()}
            </div>
          ) : null}
          {extras.managed.faces.length > 0 ? (
            <div style={{ display: 'flex', marginTop: 54 }}>
              {extras.managed.faces.map((face, index) => (
                <div
                  key={face.id}
                  style={{
                    width: 132,
                    height: 132,
                    borderRadius: 66,
                    marginLeft: index === 0 ? 0 : -36,
                    border: '6px solid #000',
                    backgroundColor: '#171719',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    fontFamily: 'Space Grotesk',
                    fontSize: 40,
                  }}
                >
                  {face.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={face.photoUrl} alt="" width={132} height={132} style={{ width: 132, height: 132, objectFit: 'cover' }} />
                  ) : (
                    initialsOf(face.name)
                  )}
                </div>
              ))}
            </div>
          ) : null}
          <div
            style={{
              marginTop: 60,
              height: 112,
              borderRadius: 56,
              backgroundColor: ACCENT,
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Space Grotesk',
              fontWeight: 500,
              fontSize: 42,
            }}
          >
            {link}
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts }
  );

  // Rendered to bytes and sent with our own headers: next/og's default is a
  // year-long immutable cache, wrong for a page whose owner can change it.
  const bytes = await image.arrayBuffer();
  return new NextResponse(bytes, {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=300' },
  });
}

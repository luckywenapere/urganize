import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  flagOffResponse,
  isPitchingFeatureEnabled,
} from '@/app/api/curator/_shared';
import {
  CURATOR_APPLICATION_GENRE_LABELS,
  MAX_APPLICATIONS_PER_CONTACT_PER_DAY,
  MAX_APPLICATIONS_PER_IP_PER_HOUR,
  looksLikeBot,
  parseCuratorApplication,
  playlistDisplayName,
  type CuratorApplicationReceipt,
} from '@/lib/curator-applications';
import {
  CURATOR_APPLICATIONS_TABLE,
  hashIp,
  readPlaylistName,
  requestIp,
} from '@/lib/curator-applications-server';

// POST /api/curator/apply — a playlist owner without an invite applies
// (2026-10-24, founder approved mock v2-apply). No sign-in.
//
// Spam guard, in order, all quiet:
//   1. The hidden "website" field is filled, or the form came back in under
//      2.5 seconds: answer as if it worked and save nothing, so a bot learns
//      nothing.
//   2. More than 5 applications from one network in an hour, or 3 from one
//      contact in a day: 429 with a plain line.
//   3. The same playlist link already waiting: answer with that one, no new row.
//
// Writes through the service role after those checks. The table's anon INSERT
// policy (supabase/migrations/20261024150000_curator_applications.sql) is the
// ceiling for anyone going around this route; nothing here relies on it.
//
// Flag: NEXT_PUBLIC_FEATURE_PITCHING, like every curator route. 404 when off.

export const dynamic = 'force-dynamic';

const HOUR_MS = 60 * 60 * 1000;

function receipt(input: {
  playlistName: string | null;
  playlistUrl: string;
  genre: string;
  followers: number;
  country: string;
}): CuratorApplicationReceipt {
  const genre = input.genre as keyof typeof CURATOR_APPLICATION_GENRE_LABELS;
  return {
    playlistName: playlistDisplayName(input),
    genre: CURATOR_APPLICATION_GENRE_LABELS[genre] ?? input.genre,
    followers: input.followers,
    country: input.country,
  };
}

async function countSince(
  query: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  try {
    const { count, error } = await query;
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

export async function POST(request: NextRequest) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please send it again.' }, { status: 400 });
  }

  const parsed = parseCuratorApplication(body);

  if (looksLikeBot(body)) {
    // Looks like success; nothing is saved.
    if (!parsed.ok) return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 });
    return NextResponse.json({ application: receipt({ ...parsed.application, playlistName: null }) }, { status: 201 });
  }

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 });
  }
  const application = parsed.application;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const client = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!client) {
    return NextResponse.json({ error: 'We could not take applications right now. Please try later.' }, { status: 500 });
  }

  const ipHash = hashIp(requestIp(request.headers));
  const hourAgo = new Date(Date.now() - HOUR_MS).toISOString();
  const dayAgo = new Date(Date.now() - 24 * HOUR_MS).toISOString();
  const head = { count: 'exact' as const, head: true };

  const [fromNetwork, fromContact] = await Promise.all([
    ipHash
      ? countSince(
          client.from(CURATOR_APPLICATIONS_TABLE).select('id', head).eq('ip_hash', ipHash).gte('created_at', hourAgo)
        )
      : Promise.resolve(0),
    countSince(
      client
        .from(CURATOR_APPLICATIONS_TABLE)
        .select('id', head)
        .eq('contact', application.contact)
        .gte('created_at', dayAgo)
    ),
  ]);
  if (fromNetwork >= MAX_APPLICATIONS_PER_IP_PER_HOUR || fromContact >= MAX_APPLICATIONS_PER_CONTACT_PER_DAY) {
    return NextResponse.json(
      { error: 'We got a lot of applications from you already. Please try again later.' },
      { status: 429 }
    );
  }

  // The same playlist already waiting: hand that one back.
  const { data: existing } = await client
    .from(CURATOR_APPLICATIONS_TABLE)
    .select('playlist_url,playlist_name,genre,followers,country')
    .eq('playlist_url', application.playlistUrl)
    .eq('status', 'new')
    .limit(1)
    .maybeSingle();
  if (existing) {
    const row = existing as Record<string, unknown>;
    return NextResponse.json(
      {
        application: receipt({
          playlistUrl: String(row.playlist_url || application.playlistUrl),
          playlistName: row.playlist_name ? String(row.playlist_name) : null,
          genre: String(row.genre || application.genre),
          followers: Number(row.followers) || application.followers,
          country: String(row.country || application.country),
        }),
      },
      { status: 200 }
    );
  }

  const playlistName = await readPlaylistName(application.playlistUrl, application.platform);

  const { error } = await client.from(CURATOR_APPLICATIONS_TABLE).insert({
    playlist_url: application.playlistUrl,
    playlist_name: playlistName,
    platform: application.platform,
    followers: application.followers,
    genre: application.genre,
    country: application.country,
    contact: application.contact,
    contact_kind: application.contactKind,
    note: application.note,
    status: 'new',
    ip_hash: ipHash,
  });

  if (error) {
    console.error('[curator-apply] insert failed:', error.message);
    return NextResponse.json({ error: 'We could not send that. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ application: receipt({ ...application, playlistName }) }, { status: 201 });
}

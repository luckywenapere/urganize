// SERVER ONLY: imports node:crypto and reaches the network.
//
// The IO half of curator applications (lib/curator-applications.ts holds the
// rules): hashing the sender's IP for the rate limit, reading a playlist's
// name from its public page, and minting the single-use invite on approve.

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_PLAYLIST_NAME_LENGTH,
  detectApplicationPlatform,
  type CuratorApplication,
  type CuratorApplicationPlatform,
  type ContactKind,
  isCuratorApplicationStatus,
} from '@/lib/curator-applications';
import { curatorInviteExpiry, generateCuratorInviteCode } from '@/lib/curator-invites';

export const CURATOR_APPLICATIONS_TABLE = 'curator_applications';

export const CURATOR_APPLICATION_COLUMNS =
  'id,playlist_url,playlist_name,platform,followers,genre,country,contact,contact_kind,note,status,invite_id,reviewed_at,created_at';

/** The sender's IP from the proxy headers Vercel sets, or null. */
export function requestIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || null;
}

/**
 * A salted hash of the IP, so the rate limit can count without storing the
 * address. The salt is the service-role key: server-only and already secret.
 */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY || 'urganize-curator-apply';
  return createHash('sha256').update(`${salt}:curator-apply:${ip}`).digest('hex');
}

const FETCH_TIMEOUT_MS = 2500;
const MAX_HTML_BYTES = 300_000;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

/** Drops the platform's own words from a page title ("X | Spotify Playlist"). */
export function cleanPlaylistTitle(raw: string): string | null {
  let title = decodeEntities(raw).replace(/\s+/g, ' ').trim();
  title = title
    .replace(/\s*[|\-–]\s*(playlist by .+?\s*[|\-–]\s*)?Spotify.*$/i, '')
    .replace(/\s+on Apple Music$/i, '')
    .replace(/\s*[|\-–]\s*Apple Music$/i, '')
    .replace(/\s*[|\-–]\s*Audiomack.*$/i, '')
    .replace(/\s*[|\-–]\s*Boomplay.*$/i, '')
    .trim();
  if (!title) return null;
  return title.slice(0, MAX_PLAYLIST_NAME_LENGTH);
}

async function fetchText(url: string): Promise<{ ok: boolean; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // redirect: 'manual' so a link can never walk the server off the four
    // platforms' own hosts.
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UrganizeBot/1.0; +https://urganize.app)' },
      cache: 'no-store',
    });
    if (!response.ok || !response.body) return { ok: false, text: '' };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    return { ok: true, text: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8') };
  } catch {
    return { ok: false, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best effort: the playlist's name from Spotify's free oEmbed, or the page's
 * og:title on the other three. Never throws; null when it cannot tell. No paid
 * API and no key.
 */
export async function readPlaylistName(
  playlistUrl: string,
  platform: CuratorApplicationPlatform | null = detectApplicationPlatform(playlistUrl)
): Promise<string | null> {
  if (!platform) return null;
  try {
    if (platform === 'spotify') {
      const { ok, text } = await fetchText(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(playlistUrl)}`
      );
      if (!ok) return null;
      const body = JSON.parse(text) as { title?: unknown };
      return typeof body.title === 'string' ? cleanPlaylistTitle(body.title) : null;
    }
    const { ok, text } = await fetchText(playlistUrl);
    if (!ok) return null;
    const match =
      text.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      text.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i) ||
      text.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? cleanPlaylistTitle(match[1]) : null;
  } catch {
    return null;
  }
}

/** A database row to what the admin page reads. */
export function toCuratorApplication(
  row: Record<string, unknown>,
  inviteUrlById: Map<string, string> = new Map()
): CuratorApplication {
  const inviteId = row.invite_id ? String(row.invite_id) : null;
  const status = isCuratorApplicationStatus(row.status) ? row.status : 'new';
  const contactKind: ContactKind = row.contact_kind === 'whatsapp' ? 'whatsapp' : 'email';
  const platform = detectApplicationPlatform(String(row.playlist_url || ''));
  return {
    id: String(row.id || ''),
    playlistUrl: String(row.playlist_url || ''),
    playlistName: row.playlist_name ? String(row.playlist_name) : null,
    platform,
    followers: Number(row.followers) || 0,
    genre: String(row.genre || ''),
    country: String(row.country || ''),
    contact: String(row.contact || ''),
    contactKind,
    note: row.note ? String(row.note) : null,
    status,
    inviteId,
    inviteUrl: inviteId ? inviteUrlById.get(inviteId) ?? null : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    createdAt: String(row.created_at || ''),
  };
}

/**
 * Mints one single-use curator invite, the same row POST
 * /api/admin/curator-invites makes (code and expiry from lib/curator-invites.ts).
 */
export async function mintCuratorInvite(
  client: SupabaseClient,
  createdBy: string
): Promise<{ id: string; code: string } | { error: string }> {
  const code = generateCuratorInviteCode();
  const { data, error } = await client
    .from('curator_invites')
    .insert({ code, created_by: createdBy, expires_at: curatorInviteExpiry() })
    .select('id,code')
    .maybeSingle();
  if (error || !data) return { error: error?.message || 'Could not create the invite.' };
  const row = data as Record<string, unknown>;
  return { id: String(row.id), code: String(row.code) };
}

// SERVER ONLY. The reads and writes behind lib/waitlist-share.ts.
//
// A held account gets a personal code. Each other account that signs up through
// it is one friend (waitlist_referrals, one row per friend, referred_id unique
// so a friend is credited to one sharer, once). At FRIENDS_NEEDED friends the
// sharer is approved with source 'friends'.

import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { approveUser } from '@/lib/access-gate-server';
import { sendEmail, isEmailConfigured } from '@/lib/email';
import {
  FRIENDS_NEEDED,
  buildShareUrl,
  hasEnoughFriends,
  looksLikeShareCode,
  makeShareCode,
  normalizeShareCode,
} from '@/lib/waitlist-share';

const CODES_TABLE = 'waitlist_share_codes';
const REFERRALS_TABLE = 'waitlist_referrals';

export type ShareState = {
  code: string;
  url: string;
  friends: number;
  place: number | null;
  name: string;
};

async function countFriends(admin: SupabaseClient, userId: string): Promise<number> {
  const result = await admin
    .from(REFERRALS_TABLE)
    .select('referred_id', { count: 'exact', head: true })
    .eq('referrer_id', userId);
  if (result.error) throw result.error;
  return result.count ?? 0;
}

async function placeInLine(admin: SupabaseClient, userId: string): Promise<number | null> {
  const result = await admin.rpc('waitlist_place_in_line', { p_user: userId });
  if (result.error || typeof result.data !== 'number') return null;
  return result.data;
}

/** The code for this account, made on first ask. `created` is true only then. */
async function getOrCreateCode(
  admin: SupabaseClient,
  userId: string
): Promise<{ code: string; created: boolean }> {
  const existing = await admin.from(CODES_TABLE).select('code').eq('user_id', userId).maybeSingle();
  if (existing.error) throw existing.error;
  const have = (existing.data as { code: string } | null)?.code;
  if (have) return { code: have, created: false };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const bytes = randomBytes(8);
    const code = makeShareCode((i) => bytes[i]);
    const inserted = await admin.from(CODES_TABLE).insert({ user_id: userId, code });
    if (!inserted.error) return { code, created: true };
    // Lost a race for this user (they now have one) or a code clash: read, then retry.
    const again = await admin.from(CODES_TABLE).select('code').eq('user_id', userId).maybeSingle();
    const found = (again.data as { code: string } | null)?.code;
    if (found) return { code: found, created: false };
  }
  throw new Error('could not make a share code');
}

export async function getShareState(
  admin: SupabaseClient,
  user: { id: string; email?: string | null },
  origin: string
): Promise<ShareState> {
  const { code, created } = await getOrCreateCode(admin, user.id);
  const [friends, place, profile] = await Promise.all([
    countFriends(admin, user.id),
    placeInLine(admin, user.id),
    admin.from('profiles').select('name').eq('id', user.id).maybeSingle(),
  ]);
  const name = ((profile.data as { name: string | null } | null)?.name || '').trim();
  const url = buildShareUrl(origin, code);

  // Told once, the first time the screen is made for this account. Never throws.
  if (created && user.email && place !== null && isEmailConfigured()) {
    try {
      await sendEmail(admin, {
        templateId: 'waitlist_joined',
        to: user.email,
        props: { recipientName: name, place, friendsNeeded: FRIENDS_NEEDED, shareUrl: url },
        trigger: 'waitlist_joined',
        recipientUserId: user.id,
      });
    } catch (error) {
      console.warn('[waitlist-share] joined email failed', error instanceof Error ? error.message : error);
    }
  }

  return { code, url, friends, place, name };
}

export type FriendOutcome = 'counted' | 'ignored' | 'error';

/**
 * Credits this account to the sharer behind `rawCode`. Counts only a held,
 * not-yet-credited account that is not the sharer. Approves the sharer at three.
 * Never throws.
 */
export async function recordFriend(
  admin: SupabaseClient,
  referredId: string,
  rawCode: unknown
): Promise<FriendOutcome> {
  if (typeof rawCode !== 'string' || !looksLikeShareCode(rawCode)) return 'ignored';
  const code = normalizeShareCode(rawCode);
  try {
    const owner = await admin.from(CODES_TABLE).select('user_id').eq('code', code).maybeSingle();
    if (owner.error) return 'error';
    const referrerId = (owner.data as { user_id: string } | null)?.user_id;
    if (!referrerId || referrerId === referredId) return 'ignored';

    // An account that is already let in is not a new person on the list.
    const profile = await admin
      .from('profiles')
      .select('access_approved_at')
      .eq('id', referredId)
      .maybeSingle();
    if (profile.error) return 'error';
    if (!profile.data || (profile.data as { access_approved_at: string | null }).access_approved_at) {
      return 'ignored';
    }

    const inserted = await admin
      .from(REFERRALS_TABLE)
      .insert({ referred_id: referredId, referrer_id: referrerId });
    // 23505: already credited (this link or another). Nothing more to do.
    if (inserted.error) return inserted.error.code === '23505' ? 'ignored' : 'error';

    if (hasEnoughFriends(await countFriends(admin, referrerId))) {
      await approveUser(admin, referrerId, 'friends');
    }
    return 'counted';
  } catch (error) {
    console.warn('[waitlist-share] record friend failed', error instanceof Error ? error.message : error);
    return 'error';
  }
}

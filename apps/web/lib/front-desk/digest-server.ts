// The UrgAns front desk daily digest (decision 3). A passenger on the 09:00
// Lagos notifications cron, like the other daily jobs.
//
// One email per curator per day, only when a question UrgAns could not answer
// is new since the last digest. Dedupe in three layers:
//   1. Per question: digest_sent_at is stamped after a send, and a question is
//      picked up again only if an item was added after that stamp
//      (last_item_at > digest_sent_at). Repeats never add items (text.ts).
//   2. Per curator per day: the email log dedupe key and Resend's idempotency
//      key are front_desk_digest:<curator>:<yyyy-mm-dd>.
//   3. Flag: a curator who is not on the front desk list, or who switched it
//      off, gets nothing.
// Never throws. Bounded by a small time budget.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { APP_URL } from '@/lib/email/links';
import { isFrontDeskEnabledFor } from './flag';
import { DESK_ANSWERS_TABLE, DESK_QUESTIONS_TABLE, loadDeskTerms, toDeskQuestion } from './server';
import type { EmailTemplateProps } from '@/lib/email/templates/props';

type FrontDeskDigestPitch = EmailTemplateProps['front_desk_digest']['pitches'][number];

export const FRONT_DESK_DIGEST_BUDGET_MS = 8_000;
const MAX_CURATORS_PER_RUN = 50;

type DigestRow = { id: string; curatorUserId: string; pitchId: string; items: string[]; lastItemAt: string; digestSentAt: string | null };

/** Pure: the questions a digest should carry (new since their last digest). */
export function questionsDue<T extends { lastItemAt: string; digestSentAt: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => !row.digestSentAt || row.lastItemAt > row.digestSentAt);
}

const lagosDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export async function runFrontDeskDigest(
  admin: SupabaseClient,
  options: { timeBudgetMs?: number; now?: Date } = {}
): Promise<{ curators: number; sent: number; skipped: number; errors: number }> {
  const startedAt = Date.now();
  const budget = options.timeBudgetMs ?? FRONT_DESK_DIGEST_BUDGET_MS;
  const now = options.now ?? new Date();
  const summary = { curators: 0, sent: 0, skipped: 0, errors: 0 };

  try {
    const { data, error } = await admin
      .from(DESK_QUESTIONS_TABLE)
      .select('id,pitch_id,curator_user_id,items,status,created_at,last_item_at,digest_sent_at')
      .eq('status', 'open')
      .order('last_item_at', { ascending: true })
      .limit(500);
    if (error) return { ...summary, errors: 1 };

    const rows: DigestRow[] = ((data as Record<string, unknown>[] | null) ?? []).map((raw) => ({
      id: String(raw.id),
      curatorUserId: String(raw.curator_user_id),
      pitchId: String(raw.pitch_id),
      items: toDeskQuestion(raw).items.map((item) => item.text),
      lastItemAt: String(raw.last_item_at || raw.created_at || ''),
      digestSentAt: typeof raw.digest_sent_at === 'string' ? raw.digest_sent_at : null,
    }));
    const due = questionsDue(rows);
    const byCurator = new Map<string, DigestRow[]>();
    for (const row of due) byCurator.set(row.curatorUserId, [...(byCurator.get(row.curatorUserId) ?? []), row]);

    for (const [curatorUserId, curatorRows] of Array.from(byCurator.entries()).slice(0, MAX_CURATORS_PER_RUN)) {
      if (Date.now() - startedAt > budget) break;
      summary.curators += 1;
      try {
        const { data: userData } = await admin.auth.admin.getUserById(curatorUserId);
        const email = userData?.user?.email || '';
        const record = await loadDeskTerms(admin, curatorUserId);
        if (!email || !isFrontDeskEnabledFor(email) || !record.enabled) {
          summary.skipped += 1;
          continue;
        }

        const { data: pitchData } = await admin
          .from('playlist_pitches')
          .select('id,song_title,artist_name,playlist_name')
          .eq('curator_user_id', curatorUserId)
          .in('id', curatorRows.map((row) => row.pitchId));
        const pitchById = new Map(((pitchData as Record<string, unknown>[] | null) ?? []).map((row) => [String(row.id), row]));
        const pitches: FrontDeskDigestPitch[] = curatorRows
          .filter((row) => pitchById.has(row.pitchId) && row.items.length)
          .map((row) => {
            const pitch = pitchById.get(row.pitchId) as Record<string, unknown>;
            return {
              songTitle: String(pitch.song_title || 'A pitch'),
              artistName: String(pitch.artist_name || ''),
              service: String(pitch.playlist_name || ''),
              questions: row.items,
            };
          });
        if (!pitches.length) {
          summary.skipped += 1;
          continue;
        }

        const since = curatorRows.reduce<string | null>(
          (oldest, row) => (row.digestSentAt && (!oldest || row.digestSentAt < oldest) ? row.digestSentAt : oldest),
          null
        );
        const { count } = await admin
          .from(DESK_ANSWERS_TABLE)
          .select('id', { count: 'exact', head: true })
          .eq('curator_user_id', curatorUserId)
          .gte('created_at', since || new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());

        const key = `front_desk_digest:${curatorUserId}:${lagosDay(now)}`;
        const { data: profile } = await admin.from('curator_profiles').select('display_name').eq('user_id', curatorUserId).maybeSingle();
        const result = await sendEmail(admin, {
          templateId: 'front_desk_digest',
          to: email,
          recipientUserId: curatorUserId,
          trigger: 'front_desk_digest',
          dedupeKey: key,
          idempotencyKey: key,
          props: {
            curatorName: String((profile as { display_name?: string } | null)?.display_name || ''),
            pitches,
            answeredCount: count ?? 0,
            ctaUrl: `${APP_URL}/curator/front-desk/inbox`,
          },
        });
        if (result.ok) {
          summary.sent += 1;
          // Stamp each question with the newest item it carried, so an item added
          // while this ran is still newer than the stamp and rides tomorrow.
          for (const row of curatorRows) {
            await admin.from(DESK_QUESTIONS_TABLE).update({ digest_sent_at: row.lastItemAt }).eq('id', row.id);
          }
        } else if (result.skipped) {
          summary.skipped += 1;
        } else {
          summary.errors += 1;
        }
      } catch {
        summary.errors += 1;
      }
    }
  } catch {
    summary.errors += 1;
  }
  return summary;
}

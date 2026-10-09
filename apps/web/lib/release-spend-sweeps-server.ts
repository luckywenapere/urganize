// The two daily steps behind release spend (brief 3, 2026-10-09). Both run as
// passengers on the 07:00 UTC cron (/api/cron/due-date-notifications), because
// the Hobby plan has two schedule slots and both are taken. Both are safe to run
// twice and neither throws: a missing table or a database blip costs that day's
// step, never the cron it rides on.
//
//   1. THE CREDITS SWEEP. UrgAns credits are spent per team, and the usage log
//      (ai_usage_events) is the only place a call is tied to a ROLLOUT. So each
//      morning the credits a rollout spent on each of the last three finished
//      Lagos days become one automatic spend line (₦15 a credit), keyed on the
//      rollout and the day, so running it again corrects the amount instead of
//      adding a second line. Three days, not one, so a call recorded late or a
//      missed morning is still folded in.
//
//      It WRITES NOTHING unless it read every row: a partial day (a failed read
//      or a hit cap) would write a total that is too low, and the upsert would
//      then overwrite a correct one.
//
//   2. THE PAYBACK QUESTION. Thirty days after release day, once, ask the owner
//      what the rollout paid back. The row in release_payback is inserted at that
//      moment with "ignore duplicates" and only an INSERTED row sends, which is
//      what makes it fire once however often the cron runs. Release day plus
//      thirty, within the last three days (paybackWindow), so a rollout that went
//      out months ago is never asked in a mass the day this ships. Test rollouts
//      and shelved (archived) ones are not asked.
//
//      Asked is recorded before the push and email go, so a failed send is lost
//      rather than repeated: "ask once" outranks "deliver at least once" for a
//      question. The answer can be given from the rollout's Spend section either
//      way.

import type { SupabaseClient } from '@supabase/supabase-js';

import { readAll, type Row } from './admin-read-server';
import { isEmailConfigured, sendEmail } from './email';
import { APP_URL } from './email/links';
import { addDays } from './lagos-day';
import { presenceDay } from './presence';
import { sendPushToUsers } from './push-server';
import {
  PAYBACK_CATCH_UP_DAYS,
  PAYBACK_DAYS_AFTER_RELEASE,
  SPEND_COPY,
  creditsDedupeKey,
  creditsLineAmountKobo,
  creditsLineNote,
  creditsSweepDays,
  groupCreditsByReleaseDay,
  lagosDayStartIso,
  paybackQuestion,
  paybackWindow,
} from './release-spend';
import { upsertUrganizeSpendLines, type UrganizeSpendLine } from './release-spend-server';
import { readTestRelease } from './test-release';

const USAGE_TABLE = 'ai_usage_events';
const RELEASES_TABLE = 'releases';
const WORKSPACES_TABLE = 'workspaces';
const PAYBACK_TABLE = 'release_payback';
const PROFILES_TABLE = 'profiles';

/** Rows of usage read per sweep. Three days of a busy product is far under this;
 *  hitting it means the read is partial, which the sweep treats as "write nothing". */
const USAGE_ROW_CAP = 20_000;
const CHUNK = 200;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function chunked<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += CHUNK) out.push(items.slice(index, index + CHUNK));
  return out;
}

// ---------------------------------------------------------------------------
// 1. The credits sweep
// ---------------------------------------------------------------------------

export type CreditsSweepSummary = {
  /** Rollouts that had credits on a day in the window. */
  releases: number;
  /** Spend lines written or corrected. */
  written: number;
  /** Why nothing was written, when that is the answer. */
  skipped: 'nothing_to_do' | 'usage_unreadable' | 'usage_truncated' | 'write_failed' | null;
};

export async function runSpendCreditsSweep(
  admin: SupabaseClient,
  now: Date = new Date(),
  options: { rowCap?: number } = {}
): Promise<CreditsSweepSummary> {
  const summary: CreditsSweepSummary = { releases: 0, written: 0, skipped: null };
  try {
    const days = creditsSweepDays(now);
    const since = days.length > 0 ? lagosDayStartIso(days[0]) : null;
    const until = lagosDayStartIso(presenceDay(now));
    if (!since || !until) return { ...summary, skipped: 'nothing_to_do' };

    const usage = await readAll(
      USAGE_TABLE,
      (from, to) =>
        admin
          .from(USAGE_TABLE)
          .select('release_id, workspace_id, created_at, credits_charged')
          .not('release_id', 'is', null)
          .gt('credits_charged', 0)
          .gte('created_at', since)
          .lt('created_at', until)
          .order('created_at', { ascending: true })
          .range(from, to),
      options.rowCap ?? USAGE_ROW_CAP
    );
    if (usage.source.status === 'missing') return { ...summary, skipped: 'nothing_to_do' };
    if (usage.source.status !== 'ok') {
      console.error('[release-spend] could not read the usage log:', usage.source.message);
      return { ...summary, skipped: 'usage_unreadable' };
    }
    if (usage.source.truncated) {
      console.error('[release-spend] the usage log was too big to read in one go; wrote nothing');
      return { ...summary, skipped: 'usage_truncated' };
    }

    const totals = groupCreditsByReleaseDay(
      usage.rows.map((row: Row) => ({
        releaseId: String(row.release_id ?? ''),
        createdAt: String(row.created_at ?? ''),
        creditsCharged: Number(row.credits_charged) || 0,
      })),
      days
    );
    if (totals.length === 0) return { ...summary, skipped: 'nothing_to_do' };

    const releaseIds = [...new Set(totals.map((total) => total.releaseId))];
    const ownerByRelease = new Map<string, string>();
    for (const ids of chunked(releaseIds)) {
      const { data, error } = await admin
        .from(RELEASES_TABLE)
        .select('id, owner_user_id, metadata')
        .in('id', ids);
      if (error || !Array.isArray(data)) {
        console.error('[release-spend] could not read the rollouts:', error?.message);
        return { ...summary, skipped: 'usage_unreadable' };
      }
      for (const release of data as Row[]) {
        // A throwaway rollout's credits are not a cost of a real release.
        if (readTestRelease(asRecord(release.metadata))) continue;
        const owner = text(release.owner_user_id);
        if (owner) ownerByRelease.set(String(release.id), owner);
      }
    }
    if (ownerByRelease.size === 0) return { ...summary, skipped: 'nothing_to_do' };

    // The team each rollout's owner runs, kept on the line for the Home card.
    const ownerIds = [...new Set(ownerByRelease.values())];
    const workspaceByOwner = new Map<string, string>();
    for (const ids of chunked(ownerIds)) {
      const { data } = await admin.from(WORKSPACES_TABLE).select('id, owner_id').in('owner_id', ids);
      for (const workspace of (Array.isArray(data) ? data : []) as Row[]) {
        const owner = text(workspace.owner_id);
        if (owner && !workspaceByOwner.has(owner)) workspaceByOwner.set(owner, String(workspace.id));
      }
    }

    const lines: UrganizeSpendLine[] = [];
    for (const total of totals) {
      const owner = ownerByRelease.get(total.releaseId);
      if (!owner) continue; // the rollout is gone, or a test one
      const amountKobo = creditsLineAmountKobo(total.credits);
      if (amountKobo <= 0) continue;
      lines.push({
        releaseId: total.releaseId,
        workspaceId: workspaceByOwner.get(owner) ?? null,
        category: 'other',
        amountKobo,
        spentOn: total.day,
        paidTo: SPEND_COPY.creditsPaidTo,
        note: creditsLineNote(total.credits),
        dedupeKey: creditsDedupeKey(total.releaseId, total.day),
      });
    }
    summary.releases = new Set(lines.map((line) => line.releaseId)).size;
    if (lines.length === 0) return { ...summary, skipped: 'nothing_to_do' };

    for (const batch of chunked(lines)) {
      const result = await upsertUrganizeSpendLines(admin, batch);
      if (result.error) return { ...summary, skipped: 'write_failed' };
      summary.written += result.written;
    }
  } catch (error) {
    console.error('[release-spend] the credits sweep failed', error);
    return { ...summary, skipped: summary.written > 0 ? null : 'write_failed' };
  }
  return summary;
}

// ---------------------------------------------------------------------------
// 2. The payback question
// ---------------------------------------------------------------------------

export type PaybackSweepSummary = { checked: number; asked: number };

type DueRelease = {
  id: string;
  title: string | null;
  owner_user_id: string | null;
  release_date: string | null;
  status: string | null;
  metadata: unknown;
};

/** The release days whose thirty-day mark falls in the window: today's mark and the two before. */
export function paybackReleaseDayRange(now: Date): { from: string; to: string } | null {
  const today = presenceDay(now);
  const to = addDays(today, -PAYBACK_DAYS_AFTER_RELEASE);
  const from = addDays(today, -(PAYBACK_DAYS_AFTER_RELEASE + PAYBACK_CATCH_UP_DAYS - 1));
  return from && to ? { from, to } : null;
}

export async function runPaybackQuestionSweep(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<PaybackSweepSummary> {
  const summary: PaybackSweepSummary = { checked: 0, asked: 0 };
  try {
    const range = paybackReleaseDayRange(now);
    if (!range) return summary;

    const due = await admin
      .from(RELEASES_TABLE)
      .select('id, title, owner_user_id, release_date, status, metadata')
      .gte('release_date', range.from)
      .lte('release_date', range.to)
      .limit(1000);
    if (due.error || !Array.isArray(due.data) || due.data.length === 0) return summary;

    const releases = (due.data as DueRelease[]).filter((release) => {
      if (!release.owner_user_id) return false;
      if (readTestRelease(asRecord(release.metadata))) return false;
      if (release.status === 'archived') return false;
      // The window is the rule; the range above only narrows the read.
      return paybackWindow(release.release_date, now) === 'open';
    });
    summary.checked = releases.length;
    if (releases.length === 0) return summary;

    // Insert the question rows. "Ignore duplicates" returns only the rows that
    // were really inserted, which is the set that gets asked, once.
    const inserted = await admin
      .from(PAYBACK_TABLE)
      .upsert(
        releases.map((release) => ({ release_id: release.id, asked_at: now.toISOString() })),
        { onConflict: 'release_id', ignoreDuplicates: true }
      )
      .select('release_id');
    if (inserted.error) {
      console.error('[release-spend] could not record the payback questions:', inserted.error.message);
      return summary;
    }
    const askedIds = new Set(
      (Array.isArray(inserted.data) ? (inserted.data as Row[]) : []).map((row) => String(row.release_id))
    );
    const toAsk = releases.filter((release) => askedIds.has(release.id));
    summary.asked = toAsk.length;
    if (toAsk.length === 0) return summary;

    const ownerIds = [...new Set(toAsk.map((release) => release.owner_user_id as string))];
    const profiles = new Map<string, { email: string; name: string }>();
    const found = await admin.from(PROFILES_TABLE).select('id, email, name').in('id', ownerIds);
    for (const profile of (Array.isArray(found.data) ? found.data : []) as Row[]) {
      profiles.set(String(profile.id), {
        email: String(profile.email ?? '').trim(),
        name: String(profile.name ?? '').trim(),
      });
    }

    for (const release of toAsk) {
      await notifyPaybackQuestion(admin, {
        releaseId: release.id,
        releaseTitle: release.title ?? '',
        ownerUserId: release.owner_user_id as string,
        email: profiles.get(release.owner_user_id as string)?.email ?? '',
        name: profiles.get(release.owner_user_id as string)?.name ?? '',
      });
    }
  } catch (error) {
    console.error('[release-spend] the payback sweep failed', error);
  }
  return summary;
}

/** The deep link that opens the rollout on its Spend section. */
export function paybackUrl(releaseId: string): string {
  return `/dashboard?release=${encodeURIComponent(releaseId)}&scene=spend`;
}

async function notifyPaybackQuestion(
  admin: SupabaseClient,
  input: { releaseId: string; releaseTitle: string; ownerUserId: string; email: string; name: string }
): Promise<void> {
  // Push and email side by side; either failing never stops the other, and
  // neither can undo the fact that the question was asked.
  await Promise.all([
    sendPushToUsers(admin, [input.ownerUserId], {
      title: paybackQuestion(input.releaseTitle),
      body: SPEND_COPY.paybackNotificationBody,
      url: paybackUrl(input.releaseId),
      tag: `payback-${input.releaseId}`,
    }).catch((error) => console.error('[release-spend] payback push failed', error)),
    (async () => {
      if (!input.email || !isEmailConfigured()) return;
      try {
        await sendEmail(admin, {
          templateId: 'release_payback_question',
          to: input.email,
          props: {
            recipientName: input.name,
            releaseTitle: input.releaseTitle,
            spendUrl: `${APP_URL}${paybackUrl(input.releaseId)}`,
          },
          trigger: 'release_payback_question',
          recipientUserId: input.ownerUserId,
          // Resend honours this for 24 hours, so a retried run cannot send twice.
          idempotencyKey: `payback-${input.releaseId}`,
        });
      } catch (error) {
        console.error('[release-spend] payback email failed', error);
      }
    })(),
  ]);
}

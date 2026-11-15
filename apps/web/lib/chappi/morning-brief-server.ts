// The 8am job for the morning brief (#1207). Called by pg_cron every ten
// minutes from 08:00 to 09:50 Lagos (/api/cron/morning-briefs). Each call
// writes the briefs still missing for today until its time runs out, so a big
// batch spreads over a few calls and a failed call is picked up by the next.
//
// Who gets one: people with the brief switched on (profiles.morning_brief),
// not a playlist-curator-only account, who opened the app or used the
// Assistant in the last 14 days (founder call, 11 Nov 2026).
//
// For each person: their Home data (the same load Home uses), the facts
// (lib/chappi/morning-brief.ts), one short AI call for the opening line and the
// first step (never the facts), then the brief is written into their one chat,
// recorded in morning_briefs (the once-a-day lock) and pushed.
//
// The brief is NOT charged to anyone's credits: nobody asked for it.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isAiConfigured } from '@/lib/ai/provider';
import { legacyModelFor } from '@/lib/ai/model-router';
import { generateRoutedStructuredOutput } from '@/lib/ai/routed';
import { recordRequestUsage } from '@/lib/ai/usage-log-server';
import { createUsageCollector } from '@/lib/credits/embedded';
import { loadHomeData } from '@/lib/home-server';
import { firstNameFrom } from '@/lib/home/header';
import { sendPushToUsers } from '@/lib/push-server';
import { URGANS_HREF } from '@/lib/shell-nav';
import { appendToMainChat } from './conversations-server';
import { readBriefPrefs, updateBriefPrefs } from './brief-answers-server';
import { pickBriefQuestion, type BriefPerson, type BriefPrefs, type BriefQuestion } from './brief-questions';
import {
  BRIEF_WORDING_SCHEMA,
  applyBriefWording,
  buildBriefWordingMessages,
  buildMorningBrief,
  lagosDateKey,
  MORNING_BRIEFS_TABLE,
  morningBriefPushBody,
  morningBriefText,
  parseBriefWording,
  type BriefTask,
  type MorningBrief,
} from './morning-brief';

export { MORNING_BRIEFS_TABLE };
const ACTIVE_DAYS = 14;
const WORDING_TIMEOUT_MS = 8_000;
const CONCURRENCY = 3;
const MAX_CANDIDATES = 2_000;

type Row = Record<string, unknown>;

export type MorningBriefRunResult = {
  date: string;
  candidates: number;
  written: number;
  skipped: number;
  failed: number;
  timedOut: boolean;
};

/** The whole switch for the job, for an emergency: MORNING_BRIEFS=off. */
export function areMorningBriefsOn(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.MORNING_BRIEFS ?? '').trim().toLowerCase() !== 'off';
}

/** People who used Urganize in the last 14 days. */
async function loadActiveUserIds(admin: SupabaseClient, now: Date): Promise<Set<string>> {
  const since = new Date(now.getTime() - ACTIVE_DAYS * 24 * 3600_000).toISOString();
  const active = new Set<string>();
  const [opens, chats] = await Promise.all([
    admin
      .from('scheduled_notifications')
      .select('user_id')
      .eq('kind', 'welcome')
      .gte('created_at', since)
      .limit(10_000),
    admin
      .from('urgans_conversations')
      .select('owner_user_id')
      .gte('last_message_at', since)
      .limit(10_000),
  ]);
  for (const row of (opens.data ?? []) as Row[]) if (row.user_id) active.add(String(row.user_id));
  for (const row of (chats.data ?? []) as Row[]) if (row.owner_user_id) active.add(String(row.owner_user_id));
  return active;
}

/** Who still needs today's brief, in a stable order. */
export async function loadBriefCandidates(admin: SupabaseClient, now: Date): Promise<string[]> {
  const date = lagosDateKey(now);
  const active = await loadActiveUserIds(admin, now);
  if (active.size === 0) return [];
  const ids = [...active].slice(0, MAX_CANDIDATES);

  const [profiles, done] = await Promise.all([
    admin.from('profiles').select('id, role, morning_brief').in('id', ids),
    admin.from(MORNING_BRIEFS_TABLE).select('user_id').eq('brief_date', date).in('user_id', ids),
  ]);
  if (profiles.error || done.error) return [];
  const already = new Set(((done.data ?? []) as Row[]).map((row) => String(row.user_id)));
  return ((profiles.data ?? []) as Row[])
    .filter((row) => row.role !== 'curator' && row.morning_brief !== false && !already.has(String(row.id)))
    .map((row) => String(row.id))
    .sort();
}

/** AI's wording for the brief, or null. Never throws. */
async function wordBrief(admin: SupabaseClient, brief: MorningBrief, userId: string, workspaceId: string | null) {
  if (!isAiConfigured()) return null;
  const collector = createUsageCollector(legacyModelFor('morning_brief') ?? null);
  let wording = null;
  try {
    wording = await generateRoutedStructuredOutput({
      surface: 'morning_brief',
      messages: buildBriefWordingMessages(brief),
      jsonSchema: BRIEF_WORDING_SCHEMA,
      timeoutMs: WORDING_TIMEOUT_MS,
      maxRetries: 1,
      maxOutputTokens: 300,
      onUsage: collector.onUsage,
      onFailure: collector.onFailure,
      parse: (raw) => parseBriefWording(raw, brief.needs.length),
      invalidFormatMessage: 'AI answered in a shape we could not read.',
    });
  } catch {
    wording = null;
  }
  await recordRequestUsage(admin, {
    context: {
      requestId: `morning_brief:${randomUUID()}`,
      feature: 'morning_brief',
      workspaceId,
      ownerUserId: userId,
      actorUserId: userId,
      releaseId: null,
    },
    calls: collector.calls,
    failures: collector.failures,
    creditsCharged: 0,
  });
  return wording;
}

/** Writes one person's brief. 'written', 'skipped' (already done today) or 'failed'. */
export async function writeMorningBrief(
  admin: SupabaseClient,
  userId: string,
  now: Date
): Promise<'written' | 'skipped' | 'failed'> {
  const date = lagosDateKey(now);
  try {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData?.user) return 'failed';
    const user = userData.user as User;

    const { commandCenter, home } = await loadHomeData(admin, user);
    const tasks: BriefTask[] = commandCenter.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      releaseId: task.releaseId,
      status: task.status,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      assignedToUserId: task.assignedToUserId,
      assigneeName: task.assignee?.name ?? null,
    }));
    // One question a day (#1314): whether this is their first brief (no
    // question on the first one), and who the questions can name.
    const earlierRead = await admin
      .from(MORNING_BRIEFS_TABLE)
      .select('id')
      .eq('user_id', userId)
      .lt('brief_date', date)
      .limit(1);
    const artists: BriefPerson[] = [];
    const seenArtists = new Set<string>();
    for (const release of commandCenter.releases) {
      const artistId = release.artistId ? String(release.artistId) : '';
      if (!artistId || seenArtists.has(artistId) || !release.artistName) continue;
      seenArtists.add(artistId);
      artists.push({ id: artistId, name: release.artistName });
    }
    const teammates: BriefPerson[] = [];
    const seenPeople = new Set<string>([userId]);
    for (const task of tasks) {
      const id = task.assignedToUserId;
      if (!id || seenPeople.has(id) || !task.assigneeName?.trim()) continue;
      seenPeople.add(id);
      teammates.push({ id, name: task.assigneeName.trim() });
    }
    // The question is saved BEFORE the brief goes out, so a tap on it always
    // finds it. A failed read or save asks nothing today rather than guess.
    let prefs: BriefPrefs = {};
    let question: BriefQuestion | null = null;
    if (!earlierRead.error) {
      const picked = await updateBriefPrefs(admin, userId, (current) => {
        const result = pickBriefQuestion(current, {
          today: date,
          hadEarlierBrief: (earlierRead.data ?? []).length > 0,
          artists,
          teammates,
        });
        const changed = JSON.stringify(result.prefs) !== JSON.stringify(current);
        return { prefs: changed ? result.prefs : null, value: result.question };
      });
      if (picked.ok) {
        prefs = picked.prefs;
        question = picked.value;
      }
    }
    if (!question) prefs = (await readBriefPrefs(admin, userId)) ?? prefs;

    const facts = buildMorningBrief({
      userId,
      firstName: home.header.firstName || firstNameFrom(null),
      tasks,
      releases: commandCenter.releases.map((release) => ({
        id: release.id,
        title: release.title,
        artistName: release.artistName,
        artistId: release.artistId ?? null,
        releaseDate: release.releaseDate,
      })),
      since: new Date(now.getTime() - 24 * 3600_000),
      now,
      prefs,
      question,
    });
    const brief = applyBriefWording(facts, await wordBrief(admin, facts, userId, null));

    // The lock: one brief per person per day. A second run stops here.
    const messageId = `brief-${date}`;
    const lock = await admin
      .from(MORNING_BRIEFS_TABLE)
      .insert({ user_id: userId, brief_date: date, payload: brief, message_id: messageId })
      .select('id')
      .single();
    if (lock.error) {
      return (lock.error as { code?: string }).code === '23505' ? 'skipped' : 'failed';
    }

    const appended = await appendToMainChat(
      admin,
      userId,
      {
        id: messageId,
        role: 'assistant',
        content: morningBriefText(brief),
        kind: 'brief',
        brief,
        at: now.toISOString(),
      },
      now
    );
    if (!appended.ok) {
      // Give the lock back so the next run tries again.
      await admin.from(MORNING_BRIEFS_TABLE).delete().eq('user_id', userId).eq('brief_date', date);
      return 'failed';
    }

    await sendPushToUsers(admin, [userId], {
      title: 'Your morning brief is ready',
      body: morningBriefPushBody(brief),
      url: URGANS_HREF,
      tag: 'urganize-morning-brief',
    });
    await admin
      .from(MORNING_BRIEFS_TABLE)
      .update({ pushed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('brief_date', date);
    return 'written';
  } catch (error) {
    console.error('[morning-brief] failed for a user', error instanceof Error ? error.message : error);
    return 'failed';
  }
}

/** One run of the job: writes missing briefs until the time budget is spent. */
export async function runMorningBriefs(
  admin: SupabaseClient,
  options: { timeBudgetMs: number; now?: Date }
): Promise<MorningBriefRunResult> {
  const now = options.now ?? new Date();
  const startedAt = Date.now();
  const result: MorningBriefRunResult = {
    date: lagosDateKey(now),
    candidates: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    timedOut: false,
  };
  if (!areMorningBriefsOn()) return result;

  const queue = await loadBriefCandidates(admin, now);
  result.candidates = queue.length;
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      if (Date.now() - startedAt > options.timeBudgetMs) {
        result.timedOut = true;
        return;
      }
      const userId = queue[next];
      next += 1;
      const outcome = await writeMorningBrief(admin, userId, now);
      result[outcome] += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return result;
}

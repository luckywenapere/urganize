// What UrgAns knows about each rollout's smart link (Oct 29, 2026, #858).
//
// Altlink asked on the Oct 28 call that the assistant prompt the smart link at
// the right point in a rollout. The right point is when Altlink CAN make it: a
// UPC or ISRC is in (a code-less create is refused, 422 missing_identifier) and
// the link has not been shared yet. So a rollout with no code gets no line at
// all, and with no line the model has nothing to offer: ROLE tells it never to
// offer a link this section does not list.
//
// The formatting is pure and tested; loadSmartLinkPromptFacts is the one read.
// Product copy rule: "smart link", never "pre-save link".

import type { SupabaseClient } from '@supabase/supabase-js';
import { isAltlinkEnabled, isReleasedOn, normalizeIsrc, normalizeUpc, readStats } from '@/lib/altlink/rules';
import { SMART_LINKS_TABLE } from '@/lib/altlink/server';
import { isSmartLinkTask } from '@/lib/smart-link-task';
import { readTestRelease } from '@/lib/test-release';
import type { Release } from '@/types/releases';
import type { Task } from '@/types/tasks';

export type SmartLinkPromptFacts = {
  title: string;
  releaseDate: string | null;
  /** A valid UPC or ISRC, from the details or the TRM submission. */
  hasCode: boolean;
  isTest: boolean;
  isArchived: boolean;
  link: { url: string | null; status: string; presaves: number } | null;
  /** The "Set up and share your smart link" activity: done means shared. */
  shareTask: 'open' | 'done' | 'none';
};

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** One line for the prompt, or null when UrgAns should say nothing about it. */
export function smartLinkLine(facts: SmartLinkPromptFacts, today: string): string | null {
  if (facts.isTest || facts.isArchived) return null;
  const out = isReleasedOn(facts.releaseDate, Date.parse(`${today}T12:00:00Z`));
  const link = facts.link;

  if (link?.status === 'pending') return `- ${facts.title}: smart link being made right now`;

  if (link && link.url && link.status !== 'failed') {
    const presaves = plural(link.presaves, 'pre-save', 'pre-saves');
    if (out || link.status === 'converted') {
      return `- ${facts.title}: smart link ${link.url} (live, the music is out; ${presaves} before release day)`;
    }
    const shared =
      facts.shareTask === 'done'
        ? 'shared'
        : 'not shared yet, its "Set up and share your smart link" activity is still open';
    return `- ${facts.title}: smart link ${link.url} (${presaves} so far; ${shared})`;
  }

  // No working link. Only worth a word while it can still collect pre-saves.
  if (!facts.hasCode || out || !facts.releaseDate) return null;
  return `- ${facts.title}: has its UPC or ISRC, smart link not made yet; opening the Smart link tab on its Distribute page makes it`;
}

/** The whole section, or '' so the prompt carries no heading over nothing. */
export function formatSmartLinksSection(rows: SmartLinkPromptFacts[], today: string): string {
  const lines = rows.map((row) => smartLinkLine(row, today)).filter((line): line is string => Boolean(line));
  if (!lines.length) return '';
  return `Smart links (Altlink: one fan page that points to every store; fans pre-save on it before release day):\n${lines.join('\n')}`;
}

type CodeRow = { release_id: string; upc: unknown; isrc: unknown };
type LinkRow = { release_id: string; url: string | null; status: string; presave_signups: number | null; stats: unknown };

/**
 * Facts for each rollout, three reads for the lot. Never throws: a failed read
 * leaves UrgAns knowing nothing about smart links, which is the safe default.
 */
export async function loadSmartLinkPromptFacts(
  admin: SupabaseClient,
  releases: Release[],
  tasks: Task[]
): Promise<SmartLinkPromptFacts[]> {
  if (!isAltlinkEnabled() || !releases.length) return [];
  const ids = releases.map((release) => release.id);
  try {
    const [links, details, trm] = await Promise.all([
      admin.from(SMART_LINKS_TABLE).select('release_id,url,status,presave_signups,stats').in('release_id', ids),
      admin.from('release_metadata').select('release_id,upc,isrc').in('release_id', ids),
      admin.from('distribution_submissions').select('release_id,upc,isrc').eq('partner', 'trm').in('release_id', ids),
    ]);
    if (links.error) throw links.error;

    const linkById = new Map(((links.data ?? []) as LinkRow[]).map((row) => [row.release_id, row]));
    const coded = new Set<string>();
    for (const row of [...((details.data ?? []) as CodeRow[]), ...((trm.data ?? []) as CodeRow[])]) {
      if (normalizeUpc(row.upc) || normalizeIsrc(row.isrc)) coded.add(row.release_id);
    }

    return releases.map((release) => {
      const row = linkById.get(release.id);
      const linkTasks = tasks.filter((task) => task.releaseId === release.id && isSmartLinkTask(task));
      const shareTask = !linkTasks.length
        ? 'none'
        : linkTasks.some((task) => task.status === 'done')
          ? 'done'
          : 'open';
      return {
        title: release.title,
        releaseDate: release.releaseDate,
        hasCode: coded.has(release.id),
        isTest: readTestRelease((release.metadata ?? {}) as Parameters<typeof readTestRelease>[0]),
        isArchived: release.status === 'archived',
        link: row
          ? {
              url: row.url,
              status: row.status,
              presaves: Math.max(row.presave_signups ?? 0, readStats(row.stats)?.presaves ?? 0),
            }
          : null,
        shareTask,
      };
    });
  } catch (error) {
    console.error('[chappi] smart link facts failed:', error);
    return [];
  }
}

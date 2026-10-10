// The part of UrgAns's context that travels (SERVER-ONLY, 2026-08-25).
//
// buildChappiSystemPrompt composes four things: a ROLE block, the team brief,
// the workspace snapshot, and today's date. Only the ROLE block is specific to
// the assistant inside this app — it names tools an outside model does not have
// and rules about confirmation cards it will never see. Everything else is just
// TRUE, and is exactly what a manager means when they say they want to take
// their context to another LLM.
//
// So this module holds that portable half, and buildChappiSystemPrompt now
// calls it rather than assembling its own copy. ONE composition, two consumers:
// an answer from claude.ai and an answer from UrgAns are working from the same
// facts by construction, which is what "consistently" in the original request
// actually requires. A second renderer here would drift within a month — this
// repo has had to undo that duplication for isRecapEligible, for the scene-flag
// expression, and for four copies of getAccessToken.
//
// It lives in lib/chappi/ rather than lib/mcp/ deliberately: lib/mcp imports
// lib/chappi and never the reverse (see the header of lib/mcp/tools.ts). Putting
// the shared builder in lib/mcp would invert that.

import { TaskService } from '@/lib/services/task-service';
// The canonical predicate — Task surfaces taskType, so there is no need to dig
// through metadata.template here (and no second definition to drift).
import { isEventMilestone } from '@/lib/tasks';
import type { Release } from '@/types/releases';
import { assistantReleaseStatus, dayToDate } from './release-status';
import type { Task } from '@/types/tasks';
import {
  formatTeamBriefForPrompt,
  isTeamBriefEnabled,
  listInjectedBriefSections,
  type TeamBriefSection,
} from '@/lib/team-brief';
import { loadTeamBriefEntries } from '@/lib/team-brief-server';
import { listVisibleReleases } from './release-scope';
import { buildWorkspaceSummary } from './workspace-summary';
import type { ChappiToolContext } from './tool-families/shared';

export type PortableContext = {
  /** The whole thing, ready to hand to a model or paste into a chat. */
  text: string;
  /** Which brief sections were included, for the attribution marker. */
  briefSections: TeamBriefSection[];
};

/**
 * Team brief + workspace snapshot + today.
 *
 * Never throws. A snapshot that fails to build degrades to a line saying so,
 * and a brief that fails to load contributes nothing — the same posture
 * buildChappiSystemPrompt has always taken, for the same reason: a partial
 * context is worth far more than an error.
 */
export async function buildPortableWorkspaceContext(
  ctx: ChappiToolContext
): Promise<PortableContext> {
  const today = new Date().toISOString().slice(0, 10);

  let snapshot = 'Team snapshot unavailable.';
  try {
    const releases = await listVisibleReleases(ctx);
    const tasks = ctx.workspaceIds.length
      ? await new TaskService(ctx.adminClient).getTasksForUser(ctx.user.id, ctx.workspaceIds)
      : [];
    snapshot = await buildWorkspaceSummary(ctx, releases, tasks, today);
  } catch (error) {
    console.error('[chappi] snapshot build failed:', error);
  }

  const brief = await loadTeamBriefBlock(ctx);

  return {
    // The brief sits ABOVE the snapshot, which is the precedence the brief's
    // own opening lines restate to the model: standing background first, live
    // data second, and where they disagree the live data wins.
    text: [brief.block, snapshot, `Today is ${today}.`]
      .filter((part) => Boolean(part && part.trim()))
      .join('\n\n'),
    briefSections: brief.sections,
  };
}

/** Never throws, and returns '' whenever the feature is off, the caller has no
 *  team, or the read fails — the assistant must answer with or without it. */
export async function loadTeamBriefBlock(
  ctx: ChappiToolContext
): Promise<{ block: string; sections: TeamBriefSection[] }> {
  const nothing = { block: '', sections: [] as TeamBriefSection[] };
  if (!isTeamBriefEnabled()) return nothing;
  const workspaceId = ctx.workspaceIds[0];
  if (!workspaceId) return nothing;
  try {
    const entries = await loadTeamBriefEntries(ctx.adminClient, workspaceId);
    // Both derived from the same entries, so the marker cannot name a section
    // the model was not shown. listInjectedBriefSections returns [] for exactly
    // the inputs that make the block empty — a property the tests in
    // lib/team-brief.test.ts assert over generated combinations, which is why
    // there is no redundant "only if the block is non-empty" guard here.
    return {
      block: formatTeamBriefForPrompt(entries),
      sections: listInjectedBriefSections(entries),
    };
  } catch (error) {
    console.error('[chappi] team brief load failed:', error);
    return nothing;
  }
}

// ── One release ─────────────────────────────────────────────────────────────

/** Titles listed before a section switches to a bare count. */
const MAX_TITLES = 8;

const isOpen = (task: Task): boolean => task.status !== 'done' && task.status !== 'cancelled';

/**
 * How far off the release is, in words.
 *
 * Deliberately relative as well as absolute: "2026-11-14" tells a model the
 * date and nothing about the urgency, and every question a manager asks about a
 * release is really a question about how much runway is left.
 */
function describeRunway(releaseDate: string | null, today: string): string {
  if (!releaseDate) return 'no date set yet';
  const target = Date.parse(`${releaseDate.slice(0, 10)}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(target) || !Number.isFinite(now)) return 'no date set yet';
  const days = Math.round((target - now) / 86_400_000);
  if (days === 0) return 'out today';
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} away`;
  const past = Math.abs(days);
  return `out ${past} day${past === 1 ? '' : 's'} ago`;
}

function titleList(tasks: Task[]): string {
  const shown = tasks.slice(0, MAX_TITLES).map((task) => `- ${task.title}`);
  const more = tasks.length > MAX_TITLES ? `\n- ...and ${tasks.length - MAX_TITLES} more` : '';
  return `${shown.join('\n')}${more}`;
}

/**
 * One release, as prose a model can act on. PURE — `today` is injected so the
 * runway maths is testable without a clock.
 *
 * Every section is omitted entirely when it has nothing in it. A heading over
 * an empty list teaches a model to invent something to put under it, which is
 * the same reasoning formatWorkspaceSummary records.
 */
export function formatReleaseContext(input: {
  release: Release;
  tasks: Task[];
  today: string;
}): string {
  const { release, tasks, today } = input;

  const done = tasks.filter((task) => task.status === 'done');
  const open = tasks.filter(isOpen);
  const blocked = open.filter((task) => task.status === 'blocked');
  const inProgress = open.filter((task) => task.status === 'in_progress');
  const overdue = open.filter((task) => task.dueDate && task.dueDate < today);
  const milestones = tasks.filter(isEventMilestone);

  const sections: string[] = [];

  sections.push(
    [
      `Rollout: ${release.title}`,
      `Artist: ${release.artistName || 'not set'}`,
      `Type: ${release.releaseType || 'single'}`,
      `Date: ${release.releaseDate || 'not set'} (${describeRunway(release.releaseDate ?? null, today)})`,
      `Status: ${assistantReleaseStatus(release, { done: done.length, total: tasks.length }, dayToDate(today))}`,
      `Activities: ${done.length} of ${tasks.length} done`,
    ].join('\n')
  );

  if (release.description?.trim()) {
    sections.push(`What this rollout is:\n${release.description.trim()}`);
  }

  if (overdue.length) {
    sections.push(`Overdue (${overdue.length}):\n${titleList(overdue)}`);
  }
  if (blocked.length) {
    sections.push(`Blocked (${blocked.length}):\n${titleList(blocked)}`);
  }
  if (inProgress.length) {
    sections.push(`In progress (${inProgress.length}):\n${titleList(inProgress)}`);
  }

  // Not-yet-started work that is neither overdue nor blocked nor in progress —
  // what is genuinely next, rather than everything still open.
  const upcoming = open.filter(
    (task) => !overdue.includes(task) && !blocked.includes(task) && !inProgress.includes(task)
  );
  if (upcoming.length) {
    sections.push(`Still to do (${upcoming.length}):\n${titleList(upcoming)}`);
  }

  if (milestones.length) {
    const lines = milestones
      .slice(0, MAX_TITLES)
      .map((task) => `- ${task.title}${task.dueDate ? ` (${task.dueDate})` : ''}`);
    sections.push(`Dated moments:\n${lines.join('\n')}`);
  }

  sections.push(`Today is ${today}.`);

  return sections.join('\n\n');
}

/**
 * Load and format one release the caller can actually see.
 *
 * Resolution goes through listVisibleReleases rather than a direct query, and
 * that is not a convenience: it is the ONE place that pairs releaseOwnerIds
 * with artistScopeByOwnerId, and lib/chappi/release-scope.ts records that
 * splitting them fails OPEN — an artist-scoped member would read a manager's
 * entire roster. A release the caller cannot see is indistinguishable from one
 * that does not exist.
 */
export async function buildReleaseContext(
  ctx: ChappiToolContext,
  releaseId: string
): Promise<string | null> {
  const id = String(releaseId || '').trim();
  if (!id) return null;

  const releases = await listVisibleReleases(ctx);
  const release = releases.find((candidate) => candidate.id === id);
  if (!release) return null;

  const allTasks = ctx.workspaceIds.length
    ? await new TaskService(ctx.adminClient).getTasksForUser(ctx.user.id, ctx.workspaceIds)
    : [];

  return formatReleaseContext({
    release,
    tasks: allTasks.filter((task) => task.releaseId === id),
    today: new Date().toISOString().slice(0, 10),
  });
}

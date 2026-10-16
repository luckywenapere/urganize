import { ROLE } from '@/lib/chappi/system-prompt';
import { formatWorkspaceSummary, type SnapshotMember } from '@/lib/chappi/workspace-summary';
import type { Release } from '@/types/releases';
import type { Task } from '@/types/tasks';

import type { ToolCase } from './model-eval';

/**
 * What the model evaluation asks, and the workspace it asks it in.
 *
 * The cases are things a manager actually types to UrgAns, each with the first
 * move that is right. They are judged against the REAL system prompt and the
 * REAL 91 tool schemas (about 14,000 tokens of fixed prompt on every request),
 * because that is what the router's rungs will be handed: a model that picks
 * tools well from a five-tool toy prompt has proved nothing about this one.
 *
 * A first move is right when it is one of `tools`, or, if `allowNone`, no tool
 * at all. The sets are deliberately generous about reading first (looking
 * before acting is what the prompt asks for) and strict about the things the
 * prompt forbids: guessing an id, writing on a question, using update_release
 * for a date, starting a plan with create_release, authoring an outcome for
 * somebody. Those are where a small model shows itself.
 *
 * model-eval-cases.test.ts keeps every name here honest against the live tool
 * registry, so a renamed tool fails a normal test run rather than quietly
 * scoring every model wrong on a case that can no longer be passed.
 */

// ── The workspace the cases are asked in ─────────────────────────────────────

const MIDNIGHT = '3f8a1c52-6d0e-4b8a-9a55-1c2d4e6f7a01';
const LAGOS = '3f8a1c52-6d0e-4b8a-9a55-1c2d4e6f7a02';
const SUNDAY = '3f8a1c52-6d0e-4b8a-9a55-1c2d4e6f7a03';
const ADA = '9b2e7d10-52a4-4c77-8d3a-0a1b2c3d4e01';
const TUNDE = '9b2e7d10-52a4-4c77-8d3a-0a1b2c3d4e02';

/** A fixed "today", so overdue work reads the same on every run. */
export const EVAL_TODAY = '2026-09-30';

const release = (id: string, title: string, status: string, releaseDate: string | null) =>
  ({ id, title, status, releaseDate, artistName: 'Dorian', releaseType: 'ep' }) as unknown as Release;

const task = (
  releaseId: string,
  title: string,
  status: string,
  dueDate: string | null,
  assignee: { id: string; name: string } | null
) =>
  ({
    id: `task-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    releaseId,
    title,
    status,
    dueDate,
    assignedToUserId: assignee?.id ?? null,
    assignedTo: assignee?.name ?? null,
  }) as unknown as Task;

const RELEASES: Release[] = [
  release(MIDNIGHT, 'Midnight EP', 'in_progress', '2026-12-12'),
  release(LAGOS, 'Lagos Nights', 'draft', null),
  release(SUNDAY, 'Sunday Best', 'released', '2026-08-14'),
];

const ada = { id: ADA, name: 'Ada Okafor' };
const tunde = { id: TUNDE, name: 'Tunde Bello' };

const TASKS: Task[] = [
  task(MIDNIGHT, 'Send masters to distributor', 'todo', '2026-10-05', ada),
  task(MIDNIGHT, 'Brief the cover artist', 'in_progress', '2026-09-25', tunde),
  task(MIDNIGHT, 'Book the video shoot', 'todo', '2026-10-10', null),
  task(MIDNIGHT, 'Submit to editorial playlists', 'todo', '2026-11-01', ada),
  task(MIDNIGHT, 'Write the press release', 'todo', '2026-09-20', tunde),
  task(MIDNIGHT, 'Finalise artwork', 'done', '2026-09-15', tunde),
  task(MIDNIGHT, 'Mastering approved', 'done', '2026-09-10', ada),
  task(SUNDAY, 'Upload to distributor', 'done', '2026-07-30', ada),
  task(SUNDAY, 'Release day post', 'done', '2026-08-14', tunde),
];

const MEMBERS: SnapshotMember[] = [
  { userId: ADA, name: 'Ada Okafor', accountRole: 'artist-manager', workspaceRole: 'owner', status: 'active', isCurrentUser: true },
  { userId: TUNDE, name: 'Tunde Bello', accountRole: 'team-member', workspaceRole: 'member', status: 'active', isCurrentUser: false },
];

/** UrgAns's real instructions plus a small, realistic workspace snapshot. */
export function buildEvalSystemPrompt(): string {
  const snapshot = formatWorkspaceSummary({ releases: RELEASES, tasks: TASKS, members: MEMBERS, today: EVAL_TODAY });
  return [ROLE, snapshot, `Today's date is ${EVAL_TODAY}.`].join('\n\n');
}

// ── The cases ────────────────────────────────────────────────────────────────

// Pasted feedback, long enough to trip the router's "long input" rule and to
// make the model read rather than skim.
const LABEL_FEEDBACK = [
  'Here is what the label sent back on the Midnight EP rollout, turn this into tasks for Midnight EP:',
  '',
  '1. The lead single needs a clean radio edit under three minutes, and the label wants it by the 8th.',
  '2. Get the artwork resized for the streaming stores and the vinyl mock-up before the 15th.',
  '3. We need a one-page press sheet with the story of the EP, the three quotes we already have and the tour dates.',
  '4. Ask the videographer for the lyric video cut-down for short-form social, vertical, thirty seconds.',
  '5. Confirm the mastering credits and the split sheets with everybody before anything goes to the distributor.',
  '6. Send the pitch list for the editorial playlists to the label so they can add their own picks by the 20th.',
].join('\n');

export const TOOL_CASES: readonly ToolCase[] = [
  {
    id: 'plate-this-week',
    prompt: "What's on my plate this week?",
    expect: { tools: ['get_dashboard', 'list_tasks'] },
    note: 'A plain lookup. The cheapest rung should never miss it.',
  },
  {
    id: 'midnight-blocked',
    prompt: 'Which tasks on Midnight EP are still blocked right now?',
    expect: { tools: ['list_tasks', 'get_release_context', 'get_release'] },
    note: 'A lookup with a filter. State questions need live data, not the snapshot.',
  },
  {
    id: 'status-for-label',
    prompt: 'Give me a status update on Midnight EP that I can send to the label.',
    expect: { tools: ['generate_status_update'], requireArgs: { tool: 'generate_status_update', keys: ['releaseId'] } },
    note: 'A named tool, with the rollout id readable from the snapshot.',
  },
  {
    id: 'complete-masters',
    prompt: "I've sent the masters to the distributor, mark that done.",
    expect: { tools: ['list_tasks', 'get_release_context'] },
    note: 'The task id is not in the snapshot. Calling complete_task now means guessing an id, which the prompt forbids.',
  },
  {
    id: 'add-videographer-task',
    prompt: 'Add a task to Midnight EP: brief the videographer, due next Friday.',
    expect: {
      tools: ['create_task', 'get_release', 'list_releases'],
      requireArgs: { tool: 'create_task', keys: ['releaseId', 'title'] },
    },
    note: 'An explicit write with everything needed already in the snapshot.',
  },
  {
    id: 'assign-artwork',
    prompt: 'Assign the artwork task on Midnight EP to Tunde.',
    expect: { tools: ['list_workspace_members', 'list_tasks', 'get_release_context'] },
    note: 'Assigning needs two ids the model does not have. Going straight to update_task means inventing them.',
  },
  {
    id: 'move-release-date',
    prompt: 'Move the Midnight EP release date to 19 December.',
    expect: { tools: ['schedule_release'], requireArgs: { tool: 'schedule_release', keys: ['releaseId', 'releaseDate'] } },
    note: 'The prompt says use schedule_release, not update_release, for a date. A classic small-model slip.',
  },
  {
    id: 'push-date-tradeoffs',
    prompt: 'Should we push the Midnight EP date back a week? Give me the trade-offs.',
    expect: {
      tools: ['get_release_context', 'get_release', 'list_tasks', 'get_dashboard', 'compare_releases', 'get_team_workload'],
      allowNone: true,
    },
    note: 'A question, not an instruction. Reading is fine; changing the date would be a rash write.',
  },
  {
    id: 'caption-ideas',
    prompt: 'Give me five caption ideas for announcing the Midnight EP.',
    expect: { tools: ['get_release_context', 'get_release'], allowNone: true },
    note: 'Creative work. Grounding it in the rollout is welcome; saving anything is not asked for.',
  },
  {
    id: 'no-streaming-data',
    prompt: 'How many streams did Sunday Best get in its first week?',
    expect: { tools: ['get_release', 'get_release_context', 'list_releases', 'get_dashboard'], allowNone: true },
    note: 'Urganize holds no streaming numbers. The right move is to say so, not to reach for a tool that pretends otherwise.',
  },
  {
    id: 'compare-rollouts',
    prompt: 'Compare my last three rollouts and tell me what I should do differently.',
    expect: { tools: ['compare_releases'] },
    note: 'The one tool built for exactly this, named in the prompt.',
  },
  {
    id: 'who-is-overloaded',
    prompt: 'Who on the team is carrying the most open work right now?',
    expect: { tools: ['get_team_workload', 'list_workspace_members', 'get_dashboard'] },
    note: 'A team question. get_team_workload is the intended tool.',
  },
  {
    id: 'press-bio',
    prompt: "Write a short bio for Dorian's press kit.",
    expect: { tools: ['list_artists', 'list_press_kits', 'get_press_kit'], allowNone: true },
    note: 'The bio is composed in the conversation first and saved on a yes. Writing the section straight away is too early.',
  },
  {
    id: 'plan-new-single',
    prompt: 'I want to plan the rollout for a new single called Lagos Nights.',
    expect: { tools: [], allowNone: true },
    note: 'The interview starts by asking. create_release is explicitly not the first step of planning, and nothing else is ready to call.',
  },
  {
    id: 'delete-midnight',
    prompt: "Delete Midnight EP, it's a mess.",
    expect: { tools: ['delete_release', 'get_release'], requireArgs: { tool: 'delete_release', keys: ['releaseId'] } },
    note: 'A destructive request. The runner turns delete_release into a confirmation card, so choosing it is right.',
  },
  {
    id: 'archive-sunday',
    prompt: 'Sunday Best is done, archive it.',
    expect: { tools: ['archive_release'], requireArgs: { tool: 'archive_release', keys: ['releaseId', 'archived'] } },
    note: 'Archive, not delete: the safe action for a finished rollout.',
  },
  {
    id: 'invite-tunde',
    prompt: 'Invite tunde@example.com to the team.',
    expect: { tools: ['invite_teammate'], requireArgs: { tool: 'invite_teammate', keys: ['email'] } },
    note: 'A gated action with one clear argument.',
  },
  {
    id: 'add-artist',
    prompt: 'Add Victony to the roster.',
    expect: { tools: ['create_artist', 'list_artists'], requireArgs: { tool: 'create_artist', keys: ['name'] } },
    note: 'A newer family, short and unambiguous.',
  },
  {
    id: 'go-to-notes',
    prompt: 'Take me to my notes.',
    expect: { tools: ['navigate'], requireArgs: { tool: 'navigate', keys: ['target'] } },
    note: 'Navigation is a tool, not a sentence.',
  },
  {
    id: 'pitch-playlists',
    prompt: 'Which playlists could I pitch Lagos Nights to?',
    expect: { tools: ['list_pitch_playlists'] },
    note: 'A read in the promotion family.',
  },
  {
    id: 'write-outcome-for-me',
    prompt: "Just write the how-did-it-go note for the mastering task for me, I'm busy.",
    expect: { tools: [], allowNone: true },
    note: 'How an activity went is the person\'s own answer. The prompt says never write one for them, so any tool call is wrong.',
  },
  {
    id: 'email-my-fans',
    prompt: 'Email all my fans about the new single.',
    expect: { tools: [], allowNone: true },
    note: 'Nothing in the product sends email to fans. The right move is to say so.',
  },
  {
    id: 'label-feedback-to-tasks',
    prompt: LABEL_FEEDBACK,
    expect: { tools: ['create_task', 'list_tasks', 'get_release_context', 'get_release'], allowNone: true },
    note: 'Long pasted input and an explicit request. Reading first, or confirming the list in words, are both reasonable.',
  },
  {
    id: 'set-isrc-genre',
    prompt: 'Set the ISRC on Midnight EP to NGABC2600001 and the genre to Afrobeats.',
    expect: { tools: ['update_release_metadata', 'get_release_metadata'] },
    note: 'Two fields in one sentence, in a family with a read-then-merge rule.',
  },
  {
    id: 'content-calendar-ideas',
    prompt: 'Draft a two-week content calendar for the Midnight EP announcement.',
    expect: {
      tools: ['get_release_context', 'get_release'],
      allowNone: true,
    },
    note: 'Ideas are talked through in prose (the content calendar is cut, URG-319); activities only once the user says yes.',
  },
];

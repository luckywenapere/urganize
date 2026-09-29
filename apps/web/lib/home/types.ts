// Shared payload contracts for the Home tab. One place so the server
// (lib/home-server.ts, app/api/home/route.ts) and the client (useHomeStore,
// components/home/*) can never disagree about the shape of a Home response.
//
// STEP 2 SCOPE: role and state selection are built and typed in full here
// (every role/state combination), but only manager/mid_release renders real
// sections in this step — every other combination gets an honest "not built
// yet" placeholder in the UI rather than a half-built screen. See the
// approved plan's step 2 scope note.

import type { DbReleaseType } from '@/types/releases';
import type { TaskPriority, TaskStatus } from '@/types/tasks';
import type { PitchState } from '@/types/pitching';

export type HomeRole = 'manager' | 'artist' | 'label';

/**
 * Role + lifecycle state, combined into one key so the UI has exactly one
 * switch to route on rather than two independently-varying enums (which
 * would allow nonsense combinations like 'label' + 'mid_release').
 */
export type HomeStateKey =
  | 'manager_new'
  | 'manager_mid_release'
  | 'manager_between'
  | 'manager_all_clear'
  | 'artist_new'
  | 'artist_mid_release'
  | 'artist_between'
  | 'label_new'
  | 'label_busy'
  | 'label_gap';

export type HomeHeader = {
  /** "Good morning" / "Good afternoon" / "Good evening", device-clock based. */
  greeting: string;
  /** First word of the viewer's name, or 'there' when no name is on file. */
  firstName: string;
  /** e.g. "Monday, 29 September" — device date, no year (matches the
   * screens' header, which never shows a year for "today"). */
  dateLabel: string;
  /** The primary team's name, or null when it could not be resolved. */
  teamName: string | null;
};

export type HomeArtistChip = {
  id: string;
  name: string;
};

export type HomeTaskItem = {
  id: string;
  title: string;
  releaseId: string | null;
  releaseTitle: string | null;
  artistName: string | null;
  dueDate: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** Who the task is assigned to — used by Waiting on others and, for an
   * artist viewer, "From {assigner}" (falls back to the release owner until
   * migration #3 exists — see lib/home/tasks.ts). */
  assigneeName: string | null;
  assignerName: string | null;
};

export type HomeWaitingTask = HomeTaskItem & {
  /** Whole days past due, always >= 1 (a task due today is not yet waiting). */
  daysLate: number;
};

export type HomeYourTasks = {
  late: HomeTaskItem[];
  today: HomeTaskItem[];
  week: HomeTaskItem[];
};

export type HomeWaitingDjLink = {
  showId: string;
  recipientId: string;
  recipientName: string;
  /** "{artistName} · {venueName}" — the show this link belongs to. */
  showLabel: string;
  hoursWaiting: number;
};

export type HomeWaiting = {
  tasks: HomeWaitingTask[];
  djLinks: HomeWaitingDjLink[];
  /** Open, not late, assigned to someone other than the viewer, on a release
   * the viewer runs. The "N tasks are with your team and on time" line. */
  onTimeCount: number;
};

export type HomeReleaseSummary = {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  releaseType: DbReleaseType;
  releaseDate: string | null;
  /** Days until release day; negative once it has passed. Null with no date. */
  daysOut: number | null;
  /** true once daysOut is 14 or fewer (and not yet past), or the release has
   * already passed within the in-flight grace window — the "dark" state the
   * screens use to mark urgency. */
  isSoon: boolean;
  progress: { done: number; total: number };
  /** "Week X of Y" against the playbook's own lead/span, or null when the
   * release has no date (nothing to count weeks from) or an unrecognised
   * release type. */
  week: { current: number; total: number } | null;
  /** Open tasks past due on this release. */
  slippingCount: number;
  yourDone: number;
  yourTotal: number;
  teamSize: number;
};

// Derived from the canonical PitchState (types/pitching.ts) rather than a
// second hand-rolled union, so a state that type adds later (curator pitch
// payments' 'awaiting_payment'/'expired', flag-off as of 2026-09-25) can't
// silently drift out of sync here again — buildPlacements (lib/home/
// placements.ts) already treats anything that isn't 'added'/'new'/'listened'
// the same way it treats 'passed': visible on neither list, still reachable
// from the team's own Pitching page.
export type PitchStatusValue = PitchState;

export type HomePitchItem = {
  id: string;
  releaseId: string | null;
  releaseTitle: string | null;
  playlistName: string;
  curatorName: string | null;
  songTitle: string;
  status: PitchStatusValue;
  sentDaysAgo: number;
};

export type HomePlacements = {
  placed: HomePitchItem[];
  underReview: HomePitchItem[];
};

export type HomeSetlistFit = 'over' | 'under' | 'on_time';

export type HomeNextShow = {
  id: string;
  artistName: string;
  venueName: string | null;
  city: string | null;
  dateLabel: string;
  setTimeLabel: string;
  daysUntil: number | null;
  setlist: {
    /** Sum of everything that could be measured, in minutes. A FLOOR, not the
     * real length, when isPartial is true — see lib/setlist.ts's
     * SetlistSummary, which this is derived from verbatim. */
    totalMinutes: number;
    slotMinutes: number;
    fit: HomeSetlistFit;
    isPartial: boolean;
  } | null;
  djLinks: { opened: number; total: number } | null;
  /** Artist-role viewers only; deferred to step 4, kept in the type now. */
  soundcheckLabel: string | null;
};

/**
 * The whole Home payload the server hands the client in one request.
 * `tasks`/`releases` carry the SAME shape the catalog already loads
 * (ExecutionTask/ExecutionRelease, via the moved command-center loader) so
 * the release store and task store stay the single source of truth; the
 * Home-specific derivations (yourTasks, waiting, releases summaries,
 * placements, nextShow) are computed from that shared data plus the
 * Home-only reads (shows, receipts, pitches).
 */
export type HomePayload = {
  role: HomeRole;
  state: HomeStateKey;
  header: HomeHeader;
  /** The primary team's owner id — "releases you run". Exposed so the client
   * can recompute yourTasks/waiting/releases LIVE after a tick, using the
   * exact same scoping the server used to build the initial payload (see
   * lib/home/tasks.ts's buildWaitingOnOthers and lib/home/releases.ts). */
  primaryOwnerId: string;
  artists: HomeArtistChip[];
  yourTasks: HomeYourTasks;
  waiting: HomeWaiting;
  releases: HomeReleaseSummary[];
  placements: HomePlacements;
  nextShow: HomeNextShow | null;
};

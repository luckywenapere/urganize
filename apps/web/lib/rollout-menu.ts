/**
 * What is in a rollout's menu, in what order, and which row is lit.
 *
 * ONE BUILDER FOR TWO SURFACES. The menu appears twice: as the vertical card at
 * the top of the right-hand column on a desktop, and as the folded list behind
 * the hamburger at the base of the tasks panel on a phone. Until 2026-09-30 the
 * desktop one was a row of pills built by hand in TasksPanel and the phone one a
 * second, separately written list, and they had already drifted (Content and Fan
 * capture vanished from the desktop row whenever a scene was open; the order
 * differed; the phone menu had a Notes row the desktop pill spelled another way).
 * Both now render what this returns, so a row added, hidden or reordered here is
 * added, hidden or reordered everywhere.
 *
 * WHY IT IS A lib MODULE. vitest runs node-only in this repo with no component
 * tests, so logic left in a .tsx is logic nothing can hold. This file is pure:
 * no React, no router, no environment reads. The feature flags arrive as an
 * argument, which is what lets a test exercise both states of every one of them
 * without stubbing `process.env` at module scope. The component layer
 * (components/workspace/useRolloutMenuActions.ts) reads the flags, attaches an
 * icon and a click handler to each entry, and is the only place that does.
 *
 * ORDER is lib/release-menu.ts — see that file for the argument, including the
 * honest note that no usage data exists. The sort at the end of the builder is
 * what decides; the array literal is only written in the same order so the two
 * agree on sight.
 */

import { orderReleaseMenu, type ReleaseMenuKey } from './release-menu';
import type { SceneName } from './scene-cache';

/** The spend tracker is cut (Oct 16, 2026 brief, URG-319). See lib/scene-cache.ts. */
const SPEND_CUT = true;

/** Where the menu is being drawn. It changes exactly one row: Notes. */
export type RolloutMenuVariant = 'rail' | 'phone';

/**
 * Which features are switched on. Each one owns exactly one row (and the
 * `notes` row is the only one that navigates away rather than swapping the
 * panel). A flag that is off removes its row and nothing else.
 */
export type RolloutMenuFlags = {
  /** Owns TWO rows, Timeline and Activities: they switch between the two main
   *  views, and with the timeline off there is only one. */
  timeline: boolean;
  releaseChat: boolean;
  /** The release brief scene (NEXT_PUBLIC_FEATURE_RELEASE_BRIEF, ships on). */
  releaseBrief: boolean;
  contentCalendar: boolean;
  pitching: boolean;
  /** The release pitch kit scene (NEXT_PUBLIC_FEATURE_PITCH_KIT). */
  pitchKit: boolean;
  metadata: boolean;
  notes: boolean;
  coverArt: boolean;
  files: boolean;
  capture: boolean;
};

/**
 * One of the three rows that open a dialog. The builder sees a label and a
 * disabled flag and never a handler: the state behind Share, Change artist and
 * Archive (who owns the rollout, how many artists there are, whether it is
 * finished, whether the dialog is open) lives in WorkspaceView.
 */
export type RolloutMenuDialogAction = {
  label: string;
  disabled?: boolean;
};

export type RolloutMenuInput = {
  /** The rollout the menu is for. Null means none is open, and the menu is empty. */
  releaseId: string | null;
  /** The scene the URL currently names, already run through the feature gates. */
  activeScene: SceneName | null;
  variant: RolloutMenuVariant;
  flags: RolloutMenuFlags;
  share?: RolloutMenuDialogAction | null;
  changeArtist?: RolloutMenuDialogAction | null;
  archive?: RolloutMenuDialogAction | null;
  /** Delete rollout (moves it to Trash). Owner-only; the caller passes it only
   *  for the owner, so a teammate never sees a row the server would refuse. */
  deleteRollout?: RolloutMenuDialogAction | null;
  /**
   * Show the Spend row. NOT a feature flag: spend is always built, and who may
   * see it is a per-person, per-rollout answer from the database (the owner and
   * team managers). The caller passes true only once the server has said this
   * person may, so a member who cannot see a cost is never shown a row that
   * leads to a refusal.
   */
  showSpend?: boolean;
  /** The Promote row's words: "Pre-save link" until release day, "Smart link"
   *  after (Altlink pilot, Oct 2026: one entry with fan capture). */
  captureLabel?: string;
};

/** What pressing a row does. A `scene` swaps the panel body and toggles closed
 *  on a second press; a `link` navigates; a `modal` opens a dialog, which the
 *  entry's `key` identifies. */
export type RolloutMenuTarget =
  | { kind: 'scene'; scene: SceneName }
  | { kind: 'link'; href: string }
  | { kind: 'modal' };

export type RolloutMenuEntry = {
  key: ReleaseMenuKey;
  label: string;
  target: RolloutMenuTarget;
  /**
   * SCENE ROWS ONLY: whether this is the scene that is open. Left undefined on
   * the link and dialog rows on purpose. There is no open panel for them to
   * describe, and a stray `aria-pressed` would announce them as toggles.
   */
  isActive?: boolean;
  /** DIALOG ROWS ONLY. */
  disabled?: boolean;
};

/** The keys that are also scene names, i.e. the rows that swap the panel body. */
type SceneRowKey = Extract<ReleaseMenuKey, SceneName>;

export function buildRolloutMenu(input: RolloutMenuInput): RolloutMenuEntry[] {
  const { releaseId, activeScene, variant, flags } = input;
  if (!releaseId) return [];

  const scene = (key: SceneRowKey, label: string): RolloutMenuEntry => ({
    key,
    label,
    target: { kind: 'scene', scene: key },
    isActive: activeScene === key,
  });

  const dialog = (
    key: 'share' | 'change-artist' | 'archive' | 'delete',
    action: RolloutMenuDialogAction
  ): RolloutMenuEntry => ({
    key,
    label: action.label,
    target: { kind: 'modal' },
    ...(action.disabled ? { disabled: true } : {}),
  });

  // Notes is a global surface that happens to filter by rollout, so it is a
  // navigation and not a scene. On a laptop it is a plain link to the filtered
  // notes page. On a phone the bar's Notes tab carries no rollout at all, so
  // this row is what closes that gap, and it asks for a blank note straight away
  // (`&new=1` is consumed once by the notes page, which strips it so a refresh
  // cannot mint a second note).
  const id = encodeURIComponent(releaseId);
  const note: RolloutMenuEntry =
    variant === 'phone'
      ? {
          key: 'note',
          label: 'Note this',
          target: { kind: 'link', href: `/dashboard/notes?release=${id}&new=1` },
        }
      : {
          key: 'note',
          label: 'Jot a note',
          target: { kind: 'link', href: `/dashboard/notes?release=${id}` },
        };

  const entries: (RolloutMenuEntry | null)[] = [
    flags.timeline ? scene('timeline', 'See the timeline') : null,
    flags.timeline ? scene('activities', 'Work the plan') : null,
    flags.releaseBrief ? scene('brief', 'Read the brief') : null,
    flags.releaseChat ? scene('chat', 'Talk to the team') : null,
    flags.contentCalendar ? scene('calendar', 'Plan content') : null,
    // Release prep in the order the work happens (2026-10-16).
    // Not on a phone (founder call, Oct 24, 2026: "this menu is too crowded"):
    // the phone's cover lives on the tile beside the rollout title
    // (RolloutCoverTile), so the row would be a second door to one place. The
    // computer's header has no cover, so the rail keeps the row.
    flags.coverArt && variant !== 'phone' ? scene('coverart', 'Add cover art') : null,
    flags.metadata ? scene('metadata', 'Fill in details') : null,
    scene('distribute', 'Distribute now'),
    flags.files ? scene('files', 'Add files') : null,
    // ONE row since 2026-10-16 (Pitch this! as one place): the pitch kit and
    // promo channels live inside it, so "Build your pitch kit" and "Find
    // promo" are gone from the menu. Old ?scene=pitchkit / ?scene=promo links
    // open this row (resolveActiveScene). With pitching off, the two old rows
    // come back so neither feature is stranded.
    flags.pitching ? scene('pitch', 'Pitch this!') : null,
    !flags.pitching && flags.pitchKit ? scene('pitchkit', 'Build your pitch kit') : null,
    !flags.pitching ? scene('promo', 'Find promo') : null,
    // Track spend is cut (Oct 16, 2026 brief, URG-319): no row, whatever
    // showSpend says. The spend lines stay in release_spend.
    input.showSpend && !SPEND_CUT ? scene('spend', 'Track spend') : null,
    flags.notes ? note : null,
    input.share ? dialog('share', input.share) : null,
    flags.capture ? scene('capture', input.captureLabel ?? 'Pre-save link') : null,
    // What UrgAns did moved to the UrgAns page (2026-10-29, #849).
    input.changeArtist ? dialog('change-artist', input.changeArtist) : null,
    input.archive ? dialog('archive', input.archive) : null,
    input.deleteRollout ? dialog('delete', input.deleteRollout) : null,
  ];

  return orderReleaseMenu(entries.filter((entry): entry is RolloutMenuEntry => entry !== null));
}

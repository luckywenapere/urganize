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

/** Where the menu is being drawn. It changes exactly one row: Notes. */
export type RolloutMenuVariant = 'rail' | 'phone';

/**
 * Which features are switched on. Each one owns exactly one row (and the
 * `notes` row is the only one that navigates away rather than swapping the
 * panel). A flag that is off removes its row and nothing else.
 */
export type RolloutMenuFlags = {
  /** Also decides whether the Activities row exists: it switches between the two
   *  main views, and with the timeline off there is only one. */
  timeline: boolean;
  releaseChat: boolean;
  contentCalendar: boolean;
  pitching: boolean;
  /** The release pitch kit scene (NEXT_PUBLIC_FEATURE_PITCH_KIT). */
  pitchKit: boolean;
  /** The Distribute step (NEXT_PUBLIC_FEATURE_DISTRIBUTION). */
  distribution: boolean;
  metadata: boolean;
  notes: boolean;
  coverArt: boolean;
  songUpload: boolean;
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
    key: 'share' | 'change-artist' | 'archive',
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
          label: 'Notes',
          target: { kind: 'link', href: `/dashboard/notes?release=${id}` },
        };

  const entries: (RolloutMenuEntry | null)[] = [
    flags.timeline ? scene('activities', 'Activities') : null,
    flags.releaseChat ? scene('chat', 'Chat') : null,
    flags.contentCalendar ? scene('calendar', 'Content') : null,
    flags.pitching ? scene('pitch', 'Pitch') : null,
    flags.pitchKit ? scene('pitchkit', 'Pitch kit') : null,
    flags.metadata ? scene('metadata', 'Metadata') : null,
    flags.distribution ? scene('distribute', 'Distribute') : null,
    flags.notes ? note : null,
    flags.coverArt ? scene('coverart', 'Cover art') : null,
    flags.songUpload ? scene('song', 'Song') : null,
    flags.files ? scene('files', 'Files') : null,
    input.share ? dialog('share', input.share) : null,
    flags.capture ? scene('capture', 'Fan capture') : null,
    input.changeArtist ? dialog('change-artist', input.changeArtist) : null,
    input.archive ? dialog('archive', input.archive) : null,
  ];

  return orderReleaseMenu(entries.filter((entry): entry is RolloutMenuEntry => entry !== null));
}

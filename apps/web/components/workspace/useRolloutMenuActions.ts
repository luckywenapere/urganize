'use client';

import type { ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  CalendarDays,
  ClipboardList,
  FolderOpen,
  Image as ImageIcon,
  ListChecks,
  Mail,
  MessageCircle,
  Music,
  NotebookPen,
  Radio,
  Share2,
  Users,
  type LucideProps,
} from '@/components/icons';
import type { ReleaseMenuKey } from '@/lib/release-menu';
import {
  buildRolloutMenu,
  type RolloutMenuDialogAction,
  type RolloutMenuVariant,
} from '@/lib/rollout-menu';
import { ROLLOUT_MENU_FLAGS } from '@/lib/rollout-menu-flags';
import { resolveActiveScene, type SceneName } from '@/lib/scene-cache';
import { useSceneOverlay } from './useSceneOverlay';

/**
 * One icon per ranked key. A `Record` over the closed `ReleaseMenuKey` union, so
 * a new menu entry that is not given an icon here fails to type-check — the same
 * compiler pressure `RELEASE_MENU_ORDER` puts on its position.
 */
const ICONS: Record<ReleaseMenuKey, ComponentType<LucideProps>> = {
  // The desktop pill for this row had no icon (the only one in its row without
  // one); a menu row needs one, and a checklist is what the buckets are. The
  // slot held a Gantt mark while it pointed at the timeline.
  activities: ListChecks,
  chat: MessageCircle,
  calendar: CalendarDays,
  pitch: Radio,
  metadata: ClipboardList,
  note: NotebookPen,
  coverart: ImageIcon,
  song: Music,
  files: FolderOpen,
  share: Share2,
  capture: Mail,
  'change-artist': Users,
  archive: Archive,
};

/**
 * A dialog-shaped action WorkspaceView owns: Share, Change artist, Archive. The
 * label and the disabled flag decide what the row says; `onClick` opens the
 * dialog, and the state behind it is why these three are passed in rather than
 * built here.
 */
export type RolloutMenuDialogInput = RolloutMenuDialogAction & { onClick: () => void };

/** One row, with everything a surface needs to draw it: the icon, what it says,
 *  whether it is lit, and what pressing it does. */
export type RolloutMenuAction = {
  key: ReleaseMenuKey;
  label: string;
  icon: ComponentType<LucideProps>;
  onClick: () => void;
  disabled?: boolean;
  /** Lit when this row's scene is the open one, and only ever set on a scene row.
   *  It replaces what the old mobile top tabs said with `aria-pressed`: which
   *  surface you are looking at, and that pressing it again closes it. Undefined
   *  on the rest, which omits the attribute rather than announcing them as
   *  unpressed toggles. */
  isActive?: boolean;
  /** Set on the row that navigates (Notes). A desktop menu draws a real link
   *  from it, so middle-click and "open in a new tab" work; the phone menu just
   *  calls `onClick`. */
  href?: string;
};

type UseRolloutMenuActionsInput = {
  /** The rollout the menu is for, or null when none is open (the menu is then
   *  empty). */
  releaseId: string | null;
  variant: RolloutMenuVariant;
  share?: RolloutMenuDialogInput | null;
  changeArtist?: RolloutMenuDialogInput | null;
  archive?: RolloutMenuDialogInput | null;
};

/**
 * The rollout menu, as rows a component can render: what is in it and in which
 * order (lib/rollout-menu.ts), plus an icon and a click handler for each.
 *
 * Both surfaces call this — the vertical card in the right-hand column and the
 * folded list behind the hamburger on a phone — so the two cannot drift. The
 * only difference between them is the `variant`.
 *
 * DELIBERATELY NOT MEMOIZED. Every row's `onClick` closes over `toggle`, which
 * closes over the current `activeScene`: memoizing the array on anything that
 * does not include the scene risks serving a stale closure, and pressing "Song"
 * after switching scenes would toggle against a scene that is no longer the open
 * one. It is thirteen rows at most, so recomputing them each render costs
 * nothing worth guarding.
 */
export function useRolloutMenuActions({
  releaseId,
  variant,
  share,
  changeArtist,
  archive,
}: UseRolloutMenuActionsInput): RolloutMenuAction[] {
  const router = useRouter();
  const { activeScene: urlScene, openScene, closeScene } = useSceneOverlay();
  // Through the shared resolver rather than trusting the URL: with a feature off,
  // a stale `?scene=…` must not light a row for a scene that is not rendering.
  const activeScene = resolveActiveScene(urlScene);

  const toggle = (scene: SceneName, id: string) => {
    if (activeScene === scene) {
      closeScene();
      return;
    }
    openScene(scene, id);
  };

  const entries = buildRolloutMenu({
    releaseId,
    activeScene,
    variant,
    flags: ROLLOUT_MENU_FLAGS,
    share,
    changeArtist,
    archive,
  });

  const dialogFor = (key: ReleaseMenuKey): RolloutMenuDialogInput | null | undefined =>
    key === 'share' ? share : key === 'change-artist' ? changeArtist : key === 'archive' ? archive : null;

  return entries.map((entry): RolloutMenuAction => {
    const base = { key: entry.key, label: entry.label, icon: ICONS[entry.key] };
    const { target } = entry;

    if (target.kind === 'scene') {
      const id = releaseId ?? '';
      return { ...base, isActive: entry.isActive, onClick: () => toggle(target.scene, id) };
    }
    if (target.kind === 'link') {
      return { ...base, href: target.href, onClick: () => router.push(target.href) };
    }
    const dialog = dialogFor(entry.key);
    return {
      ...base,
      disabled: entry.disabled,
      onClick: () => dialog?.onClick(),
    };
  });
}

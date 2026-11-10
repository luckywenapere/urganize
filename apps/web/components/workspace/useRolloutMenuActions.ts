'use client';

import type { ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  ListChecks,
  Link2,
  Megaphone,
  MessageCircle,
  Newspaper,
  NotebookPen,
  Radio,
  Share2,
  Sparkles,
  Trash2,
  Users,
  Wallet2,
  type LucideProps,
} from '@/components/icons';
import type { ReleaseMenuKey } from '@/lib/release-menu';
import { isPlanView, pickPlanView, recallPlanView } from '@/lib/plan-view';
import { useNarrowPortrait } from '@/lib/use-narrow-portrait';
import {
  buildRolloutMenu,
  type RolloutMenuDialogAction,
  type RolloutMenuVariant,
} from '@/lib/rollout-menu';
import { ROLLOUT_MENU_FLAGS } from '@/lib/rollout-menu-flags';
import { resolvePanelBody, type SceneName } from '@/lib/scene-cache';
import { useCanViewSpend } from '@/stores/useSpendAccessStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useSceneOverlay } from './useSceneOverlay';
import { useSmartLinkReady } from '@/components/releases/useSmartLinkReady';
import { captureRowLabel } from '@/lib/smart-link-task';

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
  timeline: CalendarClock,
  // The brief is a page you read: an open book.
  brief: BookOpen,
  // The same spark the Add idea button carried on the top line.
  'add-idea': Sparkles,
  chat: MessageCircle,
  calendar: CalendarDays,
  pitch: Radio,
  pitchkit: Newspaper,
  // Radio, blogs and communities: a loudhailer, not the Pitch radio mark.
  promo: Megaphone,
  metadata: ClipboardList,
  // Their own mark is a globe ("upload once, distribute everywhere").
  distribute: Globe,
  // Money, in a wallet. The shim carries Wallet2 already.
  spend: Wallet2,
  note: NotebookPen,
  coverart: ImageIcon,
  files: FolderOpen,
  share: Share2,
  // The pre-save / smart link (with fan capture inside): a link.
  capture: Link2,
  'release-date': CalendarDays,
  'change-artist': Users,
  archive: Archive,
  delete: Trash2,
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
  /** Set on Delete rollout only: surfaces draw it in red, under a line. */
  destructive?: boolean;
};

type UseRolloutMenuActionsInput = {
  /** The rollout the menu is for, or null when none is open (the menu is then
   *  empty). */
  releaseId: string | null;
  variant: RolloutMenuVariant;
  share?: RolloutMenuDialogInput | null;
  /** Add idea (#1179). Passed on the computer only. */
  addIdea?: RolloutMenuDialogInput | null;
  releaseDate?: RolloutMenuDialogInput | null;
  changeArtist?: RolloutMenuDialogInput | null;
  archive?: RolloutMenuDialogInput | null;
  deleteRollout?: RolloutMenuDialogInput | null;
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
  addIdea,
  releaseDate,
  changeArtist,
  archive,
  deleteRollout,
}: UseRolloutMenuActionsInput): RolloutMenuAction[] {
  const router = useRouter();
  const upright = useNarrowPortrait();
  // Asked once per rollout and shared by every surface that draws the menu. The
  // row appears only after the server says this person may see the cost.
  const showSpend = useCanViewSpend(releaseId);
  const { activeScene: urlScene, openScene, closeScene } = useSceneOverlay();
  // Through the shared resolver rather than trusting the URL: with a feature off,
  // a stale `?scene=…` must not light a row for a scene that is not rendering.
  // `resolvePanelBody` rather than `resolveActiveScene`, so a bare rollout (no
  // `?scene=`) lights Timeline: that is the view it is actually showing.
  // The Promote row is "Smart link" once the rollout has a link or a UPC/ISRC,
  // "Fan emails" until then (Altlink call, #852); never "Pre-save link" (#850).
  const smartLinkReady = useSmartLinkReady(releaseId);
  // Distribute, Pitch this! and the Smart link all hang off release day, so
  // they wait for a date (2026-10-26, declutter). Unknown release: show all.
  const dateMissing = useReleaseStore((state) => {
    const found = state.releases.find((release) => release.id === releaseId);
    return Boolean(found) && !found?.releaseDate;
  });
  // A rollout with no date lands on Work the plan, so that row is the lit one.
  const activeScene = resolvePanelBody(urlScene, dateMissing);
  const NEEDS_DATE: ReadonlyArray<ReleaseMenuKey> = ['distribute', 'pitch', 'capture'];

  const toggle = (scene: SceneName, id: string) => {
    if (activeScene === scene) {
      closeScene();
      return;
    }
    openScene(scene, id);
  };

  const allEntries = buildRolloutMenu({
    releaseId,
    activeScene,
    variant,
    flags: ROLLOUT_MENU_FLAGS,
    showSpend,
    captureLabel: captureRowLabel(smartLinkReady),
    share,
    addIdea,
    releaseDate,
    changeArtist,
    archive,
    deleteRollout,
  });

  // Timeline is not a row of its own: it is the other view of Work the plan,
  // behind the List / Timeline switch (founder approved, Oct 28, 2026). The
  // Work the plan row is lit for either view.
  const entries = (dateMissing ? allEntries.filter((entry) => !NEEDS_DATE.includes(entry.key)) : allEntries)
    .filter((entry) => entry.key !== 'timeline')
    .map((entry) => (entry.key === 'activities' ? { ...entry, isActive: isPlanView(activeScene) } : entry));

  const dialogFor =(key: ReleaseMenuKey): RolloutMenuDialogInput | null | undefined =>
    key === 'share' ? share : key === 'add-idea' ? addIdea : key === 'release-date' ? releaseDate : key === 'change-artist' ? changeArtist : key === 'archive' ? archive : key === 'delete' ? deleteRollout : null;

  return entries.map((entry): RolloutMenuAction => {
    const base = { key: entry.key, label: entry.label, icon: ICONS[entry.key] };
    const { target } = entry;

    if (target.kind === 'scene') {
      const id = releaseId ?? '';
      if (entry.key === 'activities') {
        // Opens the view the person last used (the default on a first visit);
        // pressed while on either view it stays put.
        return {
          ...base,
          isActive: entry.isActive,
          onClick: () => {
            if (isPlanView(activeScene)) return;
            openScene(
              pickPlanView({
                last: dateMissing ? null : recallPlanView(id),
                fallback: dateMissing ? 'activities' : 'timeline',
                narrowPortrait: upright,
              }),
              id
            );
          },
        };
      }
      return { ...base, isActive: entry.isActive, onClick: () => toggle(target.scene, id) };
    }
    if (target.kind === 'link') {
      return { ...base, href: target.href, onClick: () => router.push(target.href) };
    }
    const dialog = dialogFor(entry.key);
    return {
      ...base,
      disabled: entry.disabled,
      ...(entry.key === 'delete' ? { destructive: true } : {}),
      onClick: () => dialog?.onClick(),
    };
  });
}

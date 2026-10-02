'use client';

import { useEffect } from 'react';
import { ArrowLeft } from '@/components/icons';
import type { Release } from '@/types/releases';
import type { Task } from '@/types/tasks';
import type { SceneName } from '@/components/workspace/useSceneOverlay';
import { captureFeatureDiscoveryByName } from '@/lib/analytics';
import { resolveMainView } from '@/lib/scene-cache';
import { MetadataSection } from '@/components/releases/MetadataSection';
import { CaptureSection } from '@/components/releases/CaptureSection';
import { AssetSection } from '@/components/releases/AssetSection';
import { SongSection } from '@/components/releases/SongSection';
import { CoverArtSection } from '@/components/releases/CoverArtSection';
import { CalendarScene } from '@/components/content-calendar/CalendarScene';
import { PitchScene } from '@/components/pitching/PitchScene';
import { TimelineScene } from '@/components/releases/TimelineScene';
import { ReleaseChatSection } from '@/components/releases/ReleaseChatSection';
import { PitchKitSection } from '@/components/releases/PitchKitSection';
import { calendarFontVariables } from '@/components/content-calendar/calendar-fonts';

/**
 * A release scene (Metadata / Files / Press kit / Content calendar) rendered
 * INLINE, in the slot the activity list normally occupies.
 *
 * Founder call (2026-08-05), correcting the first attempt: these were briefly
 * built as centered modal overlays, and that was wrong — *"I didnt want it to
 * be pop up, I want it like the way UrgAns is on the side but in the place
 * where activity lists appear."* So: no scrim, no fixed positioning, no body
 * scroll lock, nothing covered. The scene sits in the layout exactly like the
 * UrgAns side rail does, just in the centre column instead of beside it.
 *
 * Consequences of being in-flow rather than a modal, all deliberate:
 * - NO Escape-to-close. Same precedent as the UrgAns rail, which CLAUDE.md
 *   records as having none on purpose ("modals own Escape") — and it means the
 *   content calendar's PostModal keeps Escape entirely to itself, so the
 *   two-listeners-one-keypress conflict the modal version had to guard against
 *   simply cannot arise here.
 * - No z-index of its own. It is ordinary layout content.
 * - The way back is explicit: the "Activities" control below, or clicking the
 *   already-lit pill in the header row above (TasksPanel owns that toggle).
 *
 * TasksPanel keeps rendering its own header row of pills above this, so the
 * scene switcher stays put while the body swaps — the pills are the navigation,
 * this is the panel they drive.
 */

/** The scenes the generic section below renders a body for. */
const SECTION_SCENES = [
  'metadata',
  'song',
  'coverart',
  'files',
  'pitch',
  'capture',
  'timeline',
  'chat',
  'pitchkit',
] as const;

// No compile-time coverage check beside this list, deliberately. One was
// written and then deleted: `SCENE_LABELS` is a `Record<SceneName, string>`,
// and `SCENE_PERSISTED` and `ScenePayloadMap` are the same shape, so a name
// added to `SceneName` already fails the build in three places before it
// could reach here. Verified by mutation rather than assumed. The runtime bail
// below is a different question and is NOT redundant — `activities` is a legal
// `SceneName` a caller can pass today.

const SCENE_LABELS: Record<SceneName, string> = {
  // Present for completeness only. The activity buckets never render through
  // this panel — they are chromeless, the way the timeline is when it is the
  // main view — so this string has no on-screen home today.
  activities: 'Activities',
  metadata: 'Metadata',
  files: 'Files',
  // "Content", not "Content calendar" (founder call, 2026-08-31). Shortened
  // so it stops reading as a second calendar next to Shows, which used the
  // same icon until that icon became a microphone in the same pass.
  calendar: 'Content',
  pitch: 'Playlist pitches',
  capture: 'Fan capture',
  song: 'Song',
  coverart: 'Cover art',
  timeline: 'Timeline',
  chat: 'Chat',
  pitchkit: 'Pitch kit',
};

type ReleaseScenePanelProps = {
  scene: SceneName;
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'releaseDate'>;
  onClose: () => void;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
  /** The scoped release's activities. Only the Timeline scene reads these:
   * unlike every other scene it fetches nothing, laying itself out from the
   * rows the workspace is already holding. */
  tasks?: Task[];
  /** Open the activity detail pop-up. Timeline clicks route here rather than
   * building a second editing surface. */
  onOpenTask?: (taskId: string) => void;
  /** A timeline drag changed an activity's date; re-read the workspace. */
  onTaskRescheduled?: () => void;
};

/** Shared "get me back to the activity list" control. Reads as a return
 * affordance rather than a modal dismissal, because that is what it is. */
/**
 * The way out of a scene: back to whatever the release's main view is.
 *
 * The label is derived rather than the literal "Activities" it was until
 * 2026-09-06, because closing a scene lands on the main view and that is the
 * timeline once its flag is on — a control promising "Activities" that hands
 * you a week grid is a control that lies about where it goes.
 */
function BackToMainView({ onClose }: { onClose: () => void }) {
  const label = resolveMainView() === 'timeline' ? 'Timeline' : 'Activities';
  return (
    <button
      type="button"
      onClick={onClose}
      // shrink-0 because the heading block beside this can now carry a long
      // release title; without it a wide title squeezes the label into a
      // wrap. The title truncates instead (min-w-0 + truncate over there).
      className="motion-focus inline-flex shrink-0 items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-content-primary"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </button>
  );
}

export function ReleaseScenePanel({
  scene,
  release,
  onClose,
  onToast,
  tasks = [],
  onOpenTask,
  onTaskRescheduled,
}: ReleaseScenePanelProps) {
  // Feature-discovery analytics used to ride the route change (a
  // featureRouteMatchers entry for the old /metadata path). With no route change
  // left, report it explicitly on the open transition; the localStorage dedupe
  // inside the helper keeps once-per-browser semantics unchanged.
  useEffect(() => {
    if (scene === 'metadata') {
      captureFeatureDiscoveryByName('release_metadata');
    }
  }, [scene]);

  // Reflect the open scene in the tab title, restoring the previous title when
  // it closes — WorkspaceView's own title effect is keyed on the release title,
  // so it won't re-fire just because a scene closed.
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${release.title} | ${SCENE_LABELS[scene]} | Urganize`;
    return () => {
      document.title = previousTitle;
    };
  }, [scene, release.title]);

  // The calendar is its own brand island (URG.001 ink/cream/spring, theme-
  // flipped) and brings its own header and month nav — so it gets the island
  // wrapper and none of the generic chrome. Its way back is the lit Content row
  // in the rollout menu. The month grid's width is a budget now, not a layout
  // switch: the release rails are gone (2026-09-30) and, with UrgAns closed, the
  // right-hand column is only the narrow menu (see CalendarScene).
  if (scene === 'calendar') {
    return (
      <section
        aria-label={`${release.title} content calendar`}
        className={`cc-island overflow-hidden border border-[var(--cc-border)] bg-[var(--cc-ground)] text-[var(--cc-text)] ${calendarFontVariables}`}
      >
        <CalendarScene release={release} onClose={onClose} onToast={onToast} />
      </section>
    );
  }

  // Every scene this generic section knows how to fill. `activities` is a
  // SceneName with no body here on purpose — it IS the main view, so nothing
  // routes it to this panel — and `calendar` returned above.
  //
  // The bail matters because the failure without it is silent: an unhandled
  // scene rendered this header with `SCENE_LABELS[scene]` resolving to
  // undefined and nothing underneath, which reads as a broken page rather than
  // a missing branch. Returning null hands the decision back to the caller,
  // which falls through to the main view.
  if (!(SECTION_SCENES as readonly string[]).includes(scene)) return null;

  return (
    <section aria-label={`${release.title} — ${SCENE_LABELS[scene]}`} className="min-w-0">
      {/* `items-start`, not `items-center`: the heading block is two lines now,
          and the back control should sit level with the scene name. */}
      <div className="flex items-start justify-between gap-3 border-b border-stroke-subtle pb-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-content-primary">
            {SCENE_LABELS[scene]}
          </h2>
          {/* Which release this scene belongs to (founder report, 2026-08-12:
              "no way for any user to know which particular release they are
              collecting metadata for"). The panel always KNEW — the release is
              in this section's aria-label and in the tab title just above —
              but neither is visible on screen, and the topbar's own copy sits
              far from the form and reads as generic page context rather than
              "this is what you are editing".

              Phrased "for <release>" rather than shown as a bare eyebrow so
              the relationship is stated, not inferred. Applies to every scene
              that uses this generic header — Files, Press kit and Pitch had
              the same ambiguity. The calendar scene is unaffected: it bypasses
              this header and has always named its release in its own. */}
          <p className="mt-0.5 truncate text-xs text-content-secondary">
            for <span className="font-medium text-content-primary">{release.title}</span>
            {release.artistName ? ` · ${release.artistName}` : ''}
          </p>
        </div>
        <BackToMainView onClose={onClose} />
      </div>

      {/* Each section fetches its own data and renders its own internal
          loading/empty/error states, so there is nothing panel-level to gate
          on — this is why an inline open feels instant where the old route
          navigation did not. The sections carry an `mt-8` top margin of their
          own, which sits fine under the divider above. */}
      {scene === 'metadata' ? (
        <MetadataSection releaseId={release.id} releaseTitle={release.title} onToast={onToast} />
      ) : null}
      {scene === 'song' ? <SongSection releaseId={release.id} onToast={onToast} /> : null}
      {scene === 'coverart' ? <CoverArtSection releaseId={release.id} onToast={onToast} /> : null}
      {scene === 'files' ? <AssetSection releaseId={release.id} onToast={onToast} /> : null}
      {scene === 'pitch' ? <PitchScene release={release} onToast={onToast} /> : null}
      {scene === 'capture' ? <CaptureSection releaseId={release.id} onToast={onToast} /> : null}
      {scene === 'chat' ? <ReleaseChatSection releaseId={release.id} onToast={onToast} /> : null}
      {scene === 'pitchkit' ? <PitchKitSection releaseId={release.id} onToast={onToast} /> : null}
      {scene === 'timeline' ? (
        <TimelineScene
          release={release}
          tasks={tasks}
          onOpenTask={onOpenTask ?? (() => {})}
          onToast={onToast}
          onRescheduled={onTaskRescheduled ?? (() => {})}
        />
      ) : null}
    </section>
  );
}

'use client';

import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Release } from '@/types/releases';
import type { Task } from '@/types/tasks';
import type { SceneName } from '@/components/workspace/useSceneOverlay';
import { captureFeatureDiscoveryByName } from '@/lib/analytics';
import { MetadataSection } from '@/components/releases/MetadataSection';
import { CaptureSection } from '@/components/releases/CaptureSection';
import { AssetSection } from '@/components/releases/AssetSection';
import { SongSection } from '@/components/releases/SongSection';
import { CoverArtSection } from '@/components/releases/CoverArtSection';
import { CalendarScene } from '@/components/content-calendar/CalendarScene';
import { PitchScene } from '@/components/pitching/PitchScene';
import { PlanScene } from '@/components/planner/PlanScene';
import { TimelineScene } from '@/components/releases/TimelineScene';
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

const SCENE_LABELS: Record<SceneName, string> = {
  metadata: 'Metadata',
  files: 'Files',
  // "Content", not "Content calendar" (founder call, 2026-08-31). Shortened
  // so it stops reading as a second calendar next to Shows, which used the
  // same icon until that icon became a microphone in the same pass.
  calendar: 'Content',
  pitch: 'Playlist pitches',
  plan: 'Plan',
  capture: 'Fan capture',
  song: 'Song',
  coverart: 'Cover art',
  timeline: 'Timeline',
};

type ReleaseScenePanelProps = {
  scene: SceneName;
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'releaseDate'>;
  onClose: () => void;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
  /** Activities already on this release, so the plan scene can say that
   * approving adds to them rather than replacing them. */
  existingTaskCount?: number;
  /** The scoped release's activities. Only the Timeline scene reads these:
   * unlike every other scene it fetches nothing, laying itself out from the
   * rows the workspace is already holding. */
  tasks?: Task[];
  /** Open the activity detail pop-up. Timeline clicks route here rather than
   * building a second editing surface. */
  onOpenTask?: (taskId: string) => void;
  /** A timeline drag changed an activity's date; re-read the workspace. */
  onTaskRescheduled?: () => void;
  /** The plan was approved: its tasks now exist. */
  onPlanApproved?: () => void;
  /** Start the intake, for a plan scene reached without a draft. */
  onStartPlanIntake?: () => void;
};

/** Shared "get me back to the activity list" control. Reads as a return
 * affordance rather than a modal dismissal, because that is what it is. */
function BackToActivities({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      // shrink-0 because the heading block beside this can now carry a long
      // release title; without it a wide title squeezes "Activities" into a
      // wrap. The title truncates instead (min-w-0 + truncate over there).
      className="motion-focus inline-flex shrink-0 items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-content-primary"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Activities
    </button>
  );
}

export function ReleaseScenePanel({
  scene,
  release,
  onClose,
  onToast,
  existingTaskCount = 0,
  tasks = [],
  onOpenTask,
  onTaskRescheduled,
  onPlanApproved,
  onStartPlanIntake,
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
  // flipped) and brings its own header, month nav, and back control — so it
  // gets the island wrapper and none of the generic chrome. WorkspaceView
  // additionally hides the release rails for this scene only, so the month grid
  // gets the width it needs (founder call).
  // The plan scene brings its own header (it needs the save indicator and the
  // task count beside it), so it skips the generic chrome the same way the
  // calendar does.
  if (scene === 'plan') {
    return (
      <PlanScene
        release={release}
        existingTaskCount={existingTaskCount}
        onClose={onClose}
        onToast={onToast}
        onApproved={onPlanApproved ?? onClose}
        onStartIntake={onStartPlanIntake ?? onClose}
      />
    );
  }

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
        <BackToActivities onClose={onClose} />
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

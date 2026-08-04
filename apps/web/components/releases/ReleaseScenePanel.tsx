'use client';

import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Release } from '@/types/releases';
import type { SceneName } from '@/components/workspace/useSceneOverlay';
import { captureFeatureDiscoveryByName } from '@/lib/analytics';
import { MetadataSection } from '@/components/releases/MetadataSection';
import { EpkSection } from '@/components/releases/EpkSection';
import { AssetSection } from '@/components/releases/AssetSection';
import { CalendarScene } from '@/components/content-calendar/CalendarScene';
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
  epk: 'Press kit',
  calendar: 'Content calendar',
};

type ReleaseScenePanelProps = {
  scene: SceneName;
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'releaseDate'>;
  onClose: () => void;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

/** Shared "get me back to the activity list" control. Reads as a return
 * affordance rather than a modal dismissal, because that is what it is. */
function BackToActivities({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="motion-focus inline-flex items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-content-primary"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Activities
    </button>
  );
}

export function ReleaseScenePanel({ scene, release, onClose, onToast }: ReleaseScenePanelProps) {
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
      <div className="flex items-center justify-between gap-3 border-b border-stroke-subtle pb-3">
        <h2 className="font-display text-lg font-semibold text-content-primary">
          {SCENE_LABELS[scene]}
        </h2>
        <BackToActivities onClose={onClose} />
      </div>

      {/* Each section fetches its own data and renders its own internal
          loading/empty/error states, so there is nothing panel-level to gate
          on — this is why an inline open feels instant where the old route
          navigation did not. The sections carry an `mt-8` top margin of their
          own, which sits fine under the divider above. */}
      {scene === 'metadata' ? <MetadataSection releaseId={release.id} onToast={onToast} /> : null}
      {scene === 'files' ? <AssetSection releaseId={release.id} onToast={onToast} /> : null}
      {scene === 'epk' ? <EpkSection releaseId={release.id} onToast={onToast} /> : null}
    </section>
  );
}

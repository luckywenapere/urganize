'use client';

import { Suspense, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useReleaseScope } from '@/components/workspace/useReleaseScope';
import { useSceneOverlay, type SceneName } from '@/components/workspace/useSceneOverlay';
import { useToast } from '@/components/shared/ToastProvider';
import { SceneOverlayShell } from '@/components/shared/SceneOverlayShell';
import { formatArtistName } from '@/lib/release-execution';
import { ReleaseSceneHeaderSkeleton } from '@/components/loading/ReleaseSectionSkeletons';
import { CalendarGridSkeleton } from '@/components/content-calendar/CalendarGridSkeleton';
import { captureFeatureDiscoveryByName } from '@/lib/analytics';
import { MetadataSection } from '@/components/releases/MetadataSection';
import { EpkSection } from '@/components/releases/EpkSection';
import { AssetSection } from '@/components/releases/AssetSection';
import { CalendarScene } from '@/components/content-calendar/CalendarScene';
import type { Release } from '@/types/releases';

/**
 * Hosts the release scenes as in-place overlay windows over the workspace
 * (2026-08-04, founder call: "make it so that each of the features, metadata,
 * calendar and the rest open in a window just like the activity lists open,
 * not a whole separate page, where the top menu vanishes and the load is so
 * strenuous").
 *
 * Mounted once by AppShell, so it is available on every authenticated surface —
 * the same arrangement TaskUIProvider uses for the activity pop-up.
 *
 * WHY THIS FIXES "the load is so strenuous": as separate routes, each scene was
 * its own route segment, so the first open per session paid a JS chunk fetch,
 * then a mount, then a PAGE-level skeleton — all on top of each section's OWN
 * internal skeleton for its own data fetch. Two skeletons in sequence for one
 * click. Here the three simple sections are STATICALLY imported into a
 * component that is already mounted before a pill is even visible, so opening
 * costs zero network and renders synchronously; only each section's own small
 * internal skeleton remains. (Same reasoning as TaskUIProvider statically
 * importing TaskDetailView.)
 *
 * WHY THE TOPBAR NO LONGER "VANISHES": AppTopbar's ContextTitle only renders
 * the release identity on /dashboard with ?release=. Scenes used to navigate
 * away from that path; now the URL stays on /dashboard, so the release art +
 * title stay put behind the window.
 */

// Same NEXT_PUBLIC_ inlining convention as everywhere else; each scene's API
// routes 404 on the same flag server-side. These are defensive here — the
// pills in TasksPanel are already flag-gated — but they keep a hand-typed or
// bookmarked ?scene= URL from rendering a surface whose backend is dark.
const METADATA_ENABLED = process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';
const FILES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';
const EPK_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EPK === 'true';
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';

/**
 * The calendar window's panel classes. `cc-island` is declared HERE, on the
 * dialog panel itself, so the whole window is the Brand Bible island — if the
 * panel kept the neutral app surface and only the content inside were ink/cream,
 * there'd be a visible colour seam around the frame. A full replacement of the
 * shell's default surface classes, which is what SceneOverlayShell's
 * panelClassName contract is for.
 */
const CALENDAR_PANEL_CLASS =
  'cc-island border-t border-[var(--cc-border)] bg-[var(--cc-ground)] text-[var(--cc-text)] sm:border';

const SCENE_LABELS: Record<SceneName, string> = {
  metadata: 'Metadata',
  files: 'Files',
  epk: 'Press kit',
  calendar: 'Content calendar',
};

const SCENE_ENABLED: Record<SceneName, boolean> = {
  metadata: METADATA_ENABLED,
  files: FILES_ENABLED,
  epk: EPK_ENABLED,
  calendar: CONTENT_CALENDAR_ENABLED,
};

/** The calendar gets the wide window; everything else matches the activity
 * pop-up's size. Founder call: size per scene, because the calendar's month
 * grid needs ~1200px and would otherwise be demoted to its mobile agenda list
 * on every desktop. */
const sceneSize = (scene: SceneName): 'sm' | 'lg' => (scene === 'calendar' ? 'lg' : 'sm');

/** Artist eyebrow + release title + a close affordance. Replaces three
 * verbatim copies of the same header that lived in the retired
 * Metadata/Epk/Files page clients — and replaces their "Back to release"
 * links, since inside a window "back to release" and "close" are the same
 * action and a close affordance reads correctly where a nav link doesn't. */
function SceneOverlayHeader({
  release,
  scene,
  onClose,
}: {
  release: Pick<Release, 'title' | 'artistName'>;
  scene: SceneName;
  onClose: () => void;
}) {
  return (
    <div className="mb-1 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          {formatArtistName(release.artistName)}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-content-primary">
          {release.title}
        </h1>
        <p className="mt-1 text-xs text-content-secondary">{SCENE_LABELS[scene]}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${SCENE_LABELS[scene].toLowerCase()}`}
        className="motion-focus grid h-8 w-8 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function SceneNotFoundBody({ error, onClose }: { error: string | null; onClose: () => void }) {
  return (
    <div>
      <div className="flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Release not found.</p>
          <p className="mt-1 text-status-error/80">{error || 'This release may have been deleted.'}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-4 inline-flex h-9 items-center rounded-full border border-stroke-default bg-bg-surface px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover"
      >
        Close
      </button>
    </div>
  );
}

function ReleaseSceneOverlayInner() {
  const { activeScene, closeScene } = useSceneOverlay();
  const { scopedReleaseId } = useReleaseScope();
  const { releases, isInitialLoading, error } = useReleaseStore();
  const { pushToast } = useToast();

  const release = scopedReleaseId
    ? releases.find((candidate) => candidate.id === scopedReleaseId)
    : undefined;

  // Feature-discovery analytics used to ride the route change (a
  // featureRouteMatchers entry for the old /metadata path in
  // lib/analytics/client.ts). With no route change left, fire it explicitly on
  // the open transition instead. The localStorage dedupe inside the helper
  // keeps once-per-browser semantics unchanged.
  useEffect(() => {
    if (activeScene === 'metadata') {
      captureFeatureDiscoveryByName('release_metadata');
    }
  }, [activeScene]);

  // Reflect the open scene in the tab title, and restore whatever the host
  // page had set on close — WorkspaceView's own title effect is keyed on the
  // release title, so it won't re-fire just because a window closed.
  useEffect(() => {
    if (!activeScene || !release?.title) return;
    const previousTitle = document.title;
    document.title = `${release.title} | ${SCENE_LABELS[activeScene]} | Urganize`;
    return () => {
      document.title = previousTitle;
    };
  }, [activeScene, release?.title]);

  if (!activeScene || !SCENE_ENABLED[activeScene]) return null;

  const size = sceneSize(activeScene);
  const isCalendar = activeScene === 'calendar';
  // The calendar's own root supplies the font variables; the panel supplies the
  // island colours so the window frame matches its content.
  const panelClassName = isCalendar ? CALENDAR_PANEL_CLASS : undefined;

  // Only reachable on a cold load straight into a scene URL (a legacy-route
  // redirect, a bookmark, a hard refresh) — a pill click can never land here,
  // because the pill itself only renders once the command center has loaded.
  if (isInitialLoading) {
    return (
      <SceneOverlayShell
        size={size}
        ariaLabel={SCENE_LABELS[activeScene]}
        onClose={closeScene}
        panelClassName={panelClassName}
        rounded={!isCalendar}
      >
        <div className={isCalendar ? 'mx-auto max-w-[1200px] px-4 pb-8 pt-6 sm:px-6' : undefined}>
          <ReleaseSceneHeaderSkeleton />
          {isCalendar ? <CalendarGridSkeleton /> : null}
        </div>
      </SceneOverlayShell>
    );
  }

  if (!release) {
    return (
      <SceneOverlayShell size="sm" ariaLabel={SCENE_LABELS[activeScene]} onClose={closeScene}>
        <SceneNotFoundBody error={error} onClose={closeScene} />
      </SceneOverlayShell>
    );
  }

  // Every section already renders its own internal loading/empty/error states
  // for its own fetch, so there is nothing page-level to gate on here.
  const onToast = (message: string, tone: 'success' | 'error' | 'warning') => pushToast(message, tone);

  // The calendar brings its own header (artist / title / Beta stamp, in island
  // type), its own close affordance, and its own Escape handling — see
  // CalendarScene for why Escape can't be shell-owned there.
  if (isCalendar) {
    return (
      <SceneOverlayShell
        size="lg"
        ariaLabel={`${release.title} — ${SCENE_LABELS.calendar}`}
        onClose={closeScene}
        panelClassName={CALENDAR_PANEL_CLASS}
        rounded={false}
        ownsEscape={false}
      >
        <CalendarScene release={release} onClose={closeScene} onToast={onToast} />
      </SceneOverlayShell>
    );
  }

  return (
    <SceneOverlayShell
      size="sm"
      ariaLabel={`${release.title} — ${SCENE_LABELS[activeScene]}`}
      onClose={closeScene}
    >
      <SceneOverlayHeader release={release} scene={activeScene} onClose={closeScene} />
      {activeScene === 'metadata' ? (
        <MetadataSection releaseId={release.id} onToast={onToast} />
      ) : null}
      {activeScene === 'files' ? <AssetSection releaseId={release.id} onToast={onToast} /> : null}
      {activeScene === 'epk' ? <EpkSection releaseId={release.id} onToast={onToast} /> : null}
    </SceneOverlayShell>
  );
}

/** Own Suspense boundary because useSceneOverlay/useReleaseScope call
 * useSearchParams, which requires one when rendered from layout-level chrome —
 * same pattern as NavigationTracker and AppTopbar's ContextTitle. */
export function ReleaseSceneOverlay() {
  return (
    <Suspense fallback={null}>
      <ReleaseSceneOverlayInner />
    </Suspense>
  );
}

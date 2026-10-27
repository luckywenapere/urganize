'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Release } from '@/types/releases';
import type { Task } from '@/types/tasks';
import { FIELD_PARAM, type SceneName } from '@/components/workspace/useSceneOverlay';
import { isMetadataFixField } from '@/lib/distribution-fix';
import { captureFeatureDiscoveryByName } from '@/lib/analytics';
import { MetadataSection } from '@/components/releases/MetadataSection';
import { SmartLinkSection } from '@/components/releases/SmartLinkSection';
import { AssetSection } from '@/components/releases/AssetSection';
import { CoverArtSection } from '@/components/releases/CoverArtSection';
import { CalendarScene } from '@/components/content-calendar/CalendarScene';
import { PitchScene } from '@/components/pitching/PitchScene';
import { PromoChannelsSection } from '@/components/promo/PromoChannelsSection';
import { TimelineScene } from '@/components/releases/TimelineScene';
import { ReleaseChatSection } from '@/components/releases/ReleaseChatSection';
import { PitchKitSection } from '@/components/releases/PitchKitSection';
import { DistributionSection } from '@/components/releases/DistributionSection';
import { SpendSection } from '@/components/releases/SpendSection';
import { UrgansActivityList } from '@/components/urgans-activity/UrgansActivityList';
import { ReleaseBriefScene } from '@/components/releases/ReleaseBriefScene';
import { BriefIdeaGate } from '@/components/releases/BriefIdeaGate';
import { onlyPreProductionWork } from '@/lib/pre-production';
import { SPEND_ADD_FIELD } from '@/lib/home/spend-card';
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
  'coverart',
  'files',
  'pitch',
  'capture',
  'timeline',
  'chat',
  'pitchkit',
  'distribute',
  'spend',
  'promo',
  'brief',
  'urgans',
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
  pitch: 'Pitch this!',
  capture: 'Pre-save link',
  coverart: 'Cover art',
  timeline: 'Timeline',
  chat: 'Chat',
  pitchkit: 'Pitch kit',
  distribute: 'Distribute',
  // The brief's own section title.
  spend: 'Spend',
  promo: 'Promo',
  brief: 'Brief',
  urgans: 'What UrgAns did',
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
  /** The Distribute scene's Fix buttons for the rollout's title, its release day
   *  and its artist open dialogs the workspace owns. Passed only for the person
   *  who may use them (the owner), so a Fix button never leads to a refusal. */
  onOpenDetails?: () => void;
  onChangeArtist?: () => void;
  /** The rollout's idea card, shown in the Brief's place until the rollout
   *  has a plan or a recorded idea (BriefIdeaGate). */
  briefIdeaScreen?: ReactNode;
  /** Open the planner from an approved brief (2026-10-27). Owner only. */
  onBuildPlanFromBrief?: (notes: string) => void;
};

export function ReleaseScenePanel({
  scene,
  release,
  onClose,
  onToast,
  tasks = [],
  onOpenTask,
  onTaskRescheduled,
  onOpenDetails,
  onChangeArtist,
  briefIdeaScreen,
  onBuildPlanFromBrief,
}: ReleaseScenePanelProps) {
  // The input a Fix button sent the person to (`?field=`). Read here and passed
  // down, with the section KEYED on it, so a different field is a fresh arrival:
  // the step that holds it opens and the input takes focus, with nothing in the
  // section needing to react to the URL after it has mounted.
  const searchParams = useSearchParams();
  const requestedField = searchParams.get(FIELD_PARAM);
  const focusField = scene === 'metadata' && isMetadataFixField(requestedField) ? requestedField : null;
  // Home's money card sends `field=add` to land on Spend with the form open.
  const spendStartAdding = scene === 'spend' && requestedField === SPEND_ADD_FIELD;

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
        // `shrink-0` is load-bearing (2026-10-11, founder: "on desktop I can't
        // even scroll on it"). This section is a flex item inside TasksPanel's
        // desktop scroll box (a `flex-col` with `lg:overflow-y-auto`). A flex
        // item with `overflow-hidden` loses its automatic `min-height: auto`
        // floor, so the default `flex-shrink: 1` squeezed the whole calendar
        // down to the box's height and the overflow-hidden clipped the rest:
        // the box never overflowed, so there was nothing to scroll, and the
        // bottom weeks of the month were simply cut off. The other scenes
        // never hit this because they carry no overflow of their own.
        className={`cc-island shrink-0 overflow-hidden border border-[var(--cc-border)] bg-[var(--cc-ground)] text-[var(--cc-text)] ${calendarFontVariables}`}
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
    <section
      aria-label={`${release.title} — ${SCENE_LABELS[scene]}`}
      // No visible header on any scene (founder, 2026-10-11: "remove this from
      // all the tabs, I don't want the title to appear twice"). The tab strip
      // already names the scene and the rollout header names the release and
      // artist, so the old "<Scene> / for <release> · <artist>" block and its
      // "← Timeline" back link were pure repetition; the way back is the tab
      // strip (See the timeline). The h2 stays for screen readers, and
      // `[&>h2+*]:mt-4` pulls the first section up into the space the header
      // left: each section brings its own mt-6/mt-8, which used to sit under
      // the divider and now would only leave a gap under the tabs.
      className={`min-w-0 [&>h2+*]:mt-4 ${scene === 'chat' ? 'flex flex-1 flex-col' : ''}`}
    >
      <h2 className="sr-only">
        {SCENE_LABELS[scene]} for {release.title}
        {release.artistName ? ` by ${release.artistName}` : ''}
      </h2>

      {/* Each section fetches its own data and renders its own internal
          loading/empty/error states, so there is nothing panel-level to gate
          on — this is why an inline open feels instant where the old route
          navigation did not. Their own top margins are overridden by the
          section's `[&>h2+*]` rule above. */}
      {scene === 'metadata' ? (
        <MetadataSection
          key={focusField ?? 'metadata'}
          releaseId={release.id}
          releaseTitle={release.title}
          focusField={focusField}
          onToast={onToast}
        />
      ) : null}
      {scene === 'coverart' ? <CoverArtSection releaseId={release.id} onToast={onToast} /> : null}
      {scene === 'files' ? <AssetSection releaseId={release.id} onToast={onToast} /> : null}
      {scene === 'pitch' ? (
        <PitchScene
          release={release}
          tasks={tasks}
          onTaskAdded={onTaskRescheduled ?? (() => {})}
          onToast={onToast}
        />
      ) : null}
      {scene === 'capture' ? <SmartLinkSection releaseId={release.id} onToast={onToast} /> : null}
      {scene === 'chat' ? <ReleaseChatSection releaseId={release.id} onToast={onToast} /> : null}
      {scene === 'pitchkit' ? <PitchKitSection releaseId={release.id} onToast={onToast} /> : null}
      {scene === 'distribute' ? (
        <DistributionSection
          release={release}
          onOpenDetails={onOpenDetails}
          onChangeArtist={onChangeArtist}
        />
      ) : null}
      {scene === 'spend' ? (
        <SpendSection
          key={`${release.id}:${spendStartAdding ? 'add' : 'view'}`}
          startAdding={spendStartAdding}
          releaseId={release.id}
          releaseTitle={release.title}
          tasks={tasks.map((task) => ({ id: task.id, title: task.title }))}
          onToast={onToast}
        />
      ) : null}
      {scene === 'promo' ? (
        <PromoChannelsSection
          key={release.id}
          release={release}
          tasks={tasks}
          onTaskAdded={onTaskRescheduled ?? (() => {})}
          onToast={onToast}
        />
      ) : null}
      {scene === 'brief' ? (
        <BriefIdeaGate
          key={release.id}
          releaseId={release.id}
          hasPlan={!onlyPreProductionWork(tasks)}
          ideaScreen={briefIdeaScreen}
        >
          <ReleaseBriefScene
            releaseId={release.id}
            onToast={onToast}
            hasPlan={!onlyPreProductionWork(tasks)}
            onBuildPlan={onBuildPlanFromBrief}
          />
        </BriefIdeaGate>
      ) : null}
      {scene === 'urgans' ? (
        <div className="mt-6">
          <p className="mb-4 text-sm text-content-secondary">
            Every change UrgAns made on this rollout in the last 30 days, and who asked for it.
          </p>
          <UrgansActivityList releaseId={release.id} />
        </div>
      ) : null}
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

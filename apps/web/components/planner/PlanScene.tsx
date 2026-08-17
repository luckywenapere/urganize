'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Info, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@urganize/ui';

import type { Release } from '@/types/releases';
import type { WorkspaceMember } from '@/lib/tasks';
import { supabase } from '@/lib/supabase/client';
import { usePlannerStore } from '@/stores/usePlannerStore';
import { captureAnalyticsEvent, createPostHogEvent } from '@/lib/analytics';
import {
  PLAN_PHASE_ORDER,
  activeDraftTasks,
  type DraftTask,
  type PlanPhase,
} from '@/lib/release-planning';
import { usePlanDraft } from './usePlanDraft';
import { PlanPhaseSection } from './PlanPhaseSection';
import { PlanSceneSkeleton } from './PlanSceneSkeleton';

/**
 * The draft plan, reviewed and edited in place.
 *
 * Rendered inline in the slot the activity list normally occupies, exactly like
 * the other release scenes — no scrim, no fixed positioning, no Escape. The
 * pill row above stays put while this body swaps, so the switcher never
 * disappears with the thing it switches.
 */

type PlanSceneProps = {
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'releaseDate'>;
  /** Activities that already exist on this release, so approval can say so. */
  existingTaskCount: number;
  onClose: () => void;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
  onApproved: () => void;
  onStartIntake: () => void;
};

const noticeClass =
  'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5';

// Warning notices carry text-content-primary, not the text-content-secondary
// the neutral and brand notices use. Grey secondary on a same-hue amber tint
// measured 4.40:1 on bg-base (the real ground here) and 4.04:1 on bg-overlay in
// light mode, under AA's 4.5 for this 11px copy — and it cannot be fixed from
// the warning token, since deepening the amber lowers it further. Dropping the
// tint to /5 still failed on bg-overlay. Primary clears every ground in both
// themes (12.5:1+). Semantics still come from the border, tint and icon color,
// so the notice system is intact; a warning just reads a little stronger than
// an info notice.
const warningNoticeClass = `${noticeClass} border-status-warning/30 bg-status-warning/10 text-content-primary`;

async function loadMembers(): Promise<WorkspaceMember[]> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return [];
    const response = await fetch('/api/workspace/members', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    const payload = (await response.json().catch(() => ({}))) as { members?: WorkspaceMember[] };
    return Array.isArray(payload.members) ? payload.members : [];
  } catch {
    return [];
  }
}

export function PlanScene({
  release,
  existingTaskCount,
  onClose,
  onToast,
  onApproved,
  onStartIntake,
}: PlanSceneProps) {
  const draft = usePlanDraft(release.id);
  const isGeneratingElsewhere = usePlannerStore((state) =>
    state.generatingReleaseIds.includes(release.id)
  );
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [slowNotice, setSlowNotice] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadMembers().then((loaded) => {
      if (!cancelled) setMembers(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    captureAnalyticsEvent(
      createPostHogEvent('planner_scene_opened', { has_draft: draft.phase === 'ready' })
    );
    // Report the open once, not on every state transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Twenty seconds in, say something. A silent skeleton past that point reads
  // as broken rather than busy.
  useEffect(() => {
    if (!isGeneratingElsewhere) {
      setSlowNotice(false);
      return;
    }
    const timer = setTimeout(() => setSlowNotice(true), 20_000);
    return () => clearTimeout(timer);
  }, [isGeneratingElsewhere]);

  const doc = draft.doc;

  const tasksByPhase = useMemo(() => {
    const grouped: Record<PlanPhase, DraftTask[]> = {
      setup: [],
      pre_release: [],
      release_week: [],
      post_release: [],
    };
    if (!doc) return grouped;
    for (const task of doc.tasks) {
      grouped[task.phase].push(task);
    }
    return grouped;
  }, [doc]);

  const activeCount = doc ? activeDraftTasks(doc).length : 0;

  const dateMoved = Boolean(
    doc &&
      doc.generated_for_release_date &&
      release.releaseDate &&
      doc.generated_for_release_date !== release.releaseDate
  );

  const handleApprove = async () => {
    const result = await draft.approve();
    if (!result.ok) {
      onToast(draft.error || 'Could not schedule the plan. Your draft is untouched.', 'error');
      return;
    }

    captureAnalyticsEvent(
      createPostHogEvent('planner_draft_approved', {
        task_count: result.tasksCreated,
        tasks_removed: doc ? doc.tasks.filter((task) => task.removed).length : 0,
        tasks_added: doc ? doc.tasks.filter((task) => task.origin === 'user').length : 0,
        ai_applied: Boolean(doc?.ai.applied),
      })
    );

    for (const warning of result.warnings) {
      onToast(warning, 'warning');
    }
    onToast(
      `Plan approved. ${result.tasksCreated} ${
        result.tasksCreated === 1 ? 'activity' : 'activities'
      } scheduled.`,
      'success'
    );
    onApproved();
  };

  const handleRegenerate = async (phase: PlanPhase) => {
    const ok = await draft.regeneratePhase(phase);
    captureAnalyticsEvent(createPostHogEvent('planner_phase_regenerated', { phase, ok }));
  };

  // --- Header -----------------------------------------------------------------

  const header = (
    <div className="flex items-center justify-between gap-3 border-b border-stroke-subtle pb-3">
      <h2 className="font-display text-lg font-semibold text-content-primary">Plan</h2>
      <button
        type="button"
        onClick={onClose}
        className="motion-focus inline-flex items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-content-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Activities
      </button>
    </div>
  );

  // --- Waiting, missing, broken ------------------------------------------------

  if (isGeneratingElsewhere || (draft.phase === 'loading' && !doc)) {
    return (
      <section aria-label={`${release.title} plan`} className="min-w-0">
        {header}
        <div className="mt-6">
          <PlanSceneSkeleton
            label={
              isGeneratingElsewhere
                ? slowNotice
                  ? 'UrgAns is drafting your plan. Taking a little longer than usual. Hang on.'
                  : 'UrgAns is drafting your plan.'
                : undefined
            }
          />
        </div>
      </section>
    );
  }

  if (draft.phase === 'missing') {
    return (
      <section aria-label={`${release.title} plan`} className="min-w-0">
        {header}
        <div className="mt-6 rounded-xl border border-stroke-default bg-bg-surface p-5 text-center">
          <p className="text-sm text-content-secondary">No draft plan here yet.</p>
          <Button type="button" onClick={onStartIntake} className="mt-4">
            Plan this release with UrgAns
          </Button>
        </div>
      </section>
    );
  }

  if (draft.phase === 'error' || !doc) {
    return (
      <section aria-label={`${release.title} plan`} className="min-w-0">
        {header}
        <div className="mt-6 rounded-xl border border-stroke-default bg-bg-surface p-5 text-center">
          <p className="text-sm text-content-secondary">
            {draft.error || 'Could not load your draft.'}
          </p>
          <Button type="button" variant="secondary" onClick={draft.reload} className="mt-4">
            Retry
          </Button>
        </div>
      </section>
    );
  }

  // --- The draft --------------------------------------------------------------

  const summary = [
    `${activeCount} ${activeCount === 1 ? 'task' : 'tasks'}`,
    `${PLAN_PHASE_ORDER.length} phases`,
    release.releaseDate
      ? `drops ${new Intl.DateTimeFormat('en', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${release.releaseDate}T00:00:00.000Z`))}`
      : 'no date set',
  ].join(' · ');

  const saveLabel =
    draft.saveState === 'saving'
      ? 'Saving'
      : draft.saveState === 'saved'
        ? 'Saved'
        : draft.saveState === 'error'
          ? "Couldn't save"
          : '';

  return (
    <section aria-label={`${release.title} plan`} className="min-w-0">
      {header}

      {/* Mobile-only, always-visible approve bar (2026-08-17 fix): the
          desktop-only footer bar further down (still `sticky bottom-0`
          inside TasksPanel's own bounded scroll column at lg+, where that
          works correctly) required scrolling past every phase — up to ~113
          tasks on an album plan — before it ever came into view on mobile,
          since a sticky element only sticks once scrolled to its rest
          position. And once scrolled to, `bottom: 0` put it directly behind
          the fixed MobileNavBar / TasksPanel mobile dock that already own
          the screen's bottom edge there — a fully hidden CTA on the surface
          most users open this scene from. Placed right under the header
          instead, so it's on screen the instant the scene opens, with no
          scroll needed at all. `sticky top-16` (not `top-0`) keeps it
          visible while scrolling too: below `lg` TasksPanel's own scroll
          body has no bounded height, so this sticks relative to the actual
          document scroll — the same scroll box AppTopbar's own
          `sticky top-0 z-30` uses, and `top-0` here would stick this bar
          directly BEHIND that topbar rather than under it. `lg:hidden` —
          desktop keeps the original bottom bar below, unchanged. */}
      <div className="sticky top-16 z-20 mt-4 flex items-center justify-between gap-3 border-b border-stroke-default bg-bg-base py-3 lg:hidden">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
          {activeCount} {activeCount === 1 ? 'task' : 'tasks'} ready
        </p>
        <Button
          type="button"
          onClick={() => void handleApprove()}
          disabled={draft.isApproving || activeCount === 0 || !release.releaseDate}
          className="h-10 shrink-0 justify-center px-4"
        >
          {draft.isApproving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Scheduling
            </>
          ) : (
            'Approve plan'
          )}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
          {summary}
        </p>
        <p
          aria-live="polite"
          className={`flex items-center gap-1.5 font-mono text-[11px] ${
            draft.saveState === 'error' ? 'text-status-error' : 'text-content-tertiary'
          }`}
        >
          {draft.saveState === 'saving' ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : null}
          {saveLabel}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {!doc.ai.applied ? (
          <p className={`${noticeClass} border-stroke-default bg-bg-elevated text-content-secondary`}>
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-tertiary" aria-hidden="true" />
            <span>
              {doc.ai.failure === 'not_configured'
                ? 'This is the standard playbook plan. UrgAns tailoring is not switched on here. The plan works without it, so edit anything below.'
                : 'This is the standard playbook plan. UrgAns could not tailor it this time, so nothing was changed. Edit anything below.'}
            </span>
          </p>
        ) : doc.ai.rationale ? (
          <p className={`${noticeClass} border-brand/30 bg-brand/5 text-content-secondary`}>
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
            <span>{doc.ai.rationale}</span>
          </p>
        ) : null}

        {dateMoved ? (
          <p className={warningNoticeClass}>
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning"
              aria-hidden="true"
            />
            <span>
              The release date moved. Every task date below follows it.
            </span>
          </p>
        ) : null}

        {existingTaskCount > 0 ? (
          <p className={`${noticeClass} border-stroke-default bg-bg-elevated text-content-secondary`}>
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-tertiary" aria-hidden="true" />
            <span>
              This release already has {existingTaskCount}{' '}
              {existingTaskCount === 1 ? 'activity' : 'activities'}. Approving adds the plan
              alongside them.
            </span>
          </p>
        ) : null}

        {!release.releaseDate ? (
          <p className={warningNoticeClass}>
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning"
              aria-hidden="true"
            />
            <span>Set a release date before approving. Every task is dated from release day.</span>
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        {PLAN_PHASE_ORDER.map((phase) => (
          <PlanPhaseSection
            key={phase}
            phase={phase}
            tasks={tasksByPhase[phase]}
            releaseDate={release.releaseDate}
            members={members}
            canRegenerate={doc.ai.applied}
            isRegenerating={draft.regeneratingPhase === phase}
            regenerateError={draft.phaseError?.phase === phase ? draft.phaseError.message : null}
            disabled={draft.isApproving}
            onRegenerate={() => void handleRegenerate(phase)}
            onChangeTask={draft.updateTask}
            onRemoveTask={draft.removeTask}
            onRestoreTask={draft.restoreTask}
            onAddTask={(offsetDays) => draft.addTask(phase, offsetDays)}
          />
        ))}
      </div>

      {/* Desktop footer — unchanged. Sticky within TasksPanel's own bounded
          scroll column at lg+, which is where sticky-to-bottom already works
          correctly (see the mobile bar right under the header above for why
          it doesn't below lg). */}
      <div className="mt-4 hidden items-center justify-between gap-3 border-t border-stroke-default bg-bg-base py-3 lg:sticky lg:bottom-0 lg:flex">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-tertiary">
          {activeCount} {activeCount === 1 ? 'task' : 'tasks'} ready
        </p>
        <Button
          type="button"
          onClick={() => void handleApprove()}
          disabled={draft.isApproving || activeCount === 0 || !release.releaseDate}
          className="h-9 justify-center"
        >
          {draft.isApproving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Scheduling
            </>
          ) : (
            'Approve plan'
          )}
        </Button>
      </div>
    </section>
  );
}


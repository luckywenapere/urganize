'use client';

import { recallLast, rememberLast } from '@/lib/last-seen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@urganize/ui';
import { ADD_IDEA_EVENT, IDEAS_CHANGED_EVENT } from './RolloutFirstSteps';
import { Check, Copy, Loader2, Lock, MessageCircle, Sparkles, UserPlus, X } from '@/components/icons';
import { VoicePill } from './VoicePill';
import { useSceneOverlay } from './useSceneOverlay';
import { IdeaRoundLoop } from './IdeaRoundLoop';
import { IDEA_ROUND_COPY as ROUND_COPY, isIdeaRoundEnabled } from '@/lib/idea-round';
import { runBriefFromIdeas } from '@/lib/urgans-actions/client';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { buildWhatsAppShareUrl } from '@/lib/access-gate';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { useAuthStore } from '@/lib/auth-store';
import { formatRelativeTime } from '@/lib/relative-time';
import {
  MAX_IDEA_LENGTH,
  ROLLOUT_IDEAS_COPY as COPY,
  addPendingInvite,
  chimeInShareText,
  ideasPathFor,
  ideaReviewTitle,
  ideasToExtraNotes,
  isIdeaEmailInvitesEnabled,
  isIdeaReviewPromptEnabled,
  isRolloutIdeasEnabled,
  notesToReview,
  reviewBaseline,
  withInviteNext,
  type IdeaInviteRole,
  type IdeaNote,
  type IdeasPath,
  type IdeasPerson,
  type PendingIdeaInvite,
} from '@/lib/rollout-ideas';
import {
  missingItems,
  nextUp,
  type BriefTask,
  type RolloutBrief,
} from '@/lib/rollout-brief';
import { IDEA_CHANGES_COPY, isEmptyChanges, type IdeaChangeView } from '@/lib/rollout-idea-changes';
import { copyText } from '@/lib/share-file';
import { supabase } from '@/lib/supabase/client';
import type { OnboardingPersona } from '@/lib/onboarding';

const ENABLED = isRolloutIdeasEnabled();
const ROUND_ENABLED = isIdeaRoundEnabled();

type IdeasData = {
  notes: IdeaNote[];
  people: IdeasPerson[];
  ownerName: string | null;
  isOwner: boolean;
  voice: boolean;
  /** The idea round (2026-10-27); null with the flag off. */
  round?: {
    state: 'open' | 'closed' | 'approved';
    canRun: boolean;
    askedCount: number;
    inCount: number;
    ideaCount: number;
  } | null;
};

async function authHeaders(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

/**
 * The Ideas card on a rollout (2026-10-26, "Chime in"). Talk or type an idea,
 * ask others to chime in, then turn everyone's notes into a plan: Draft with
 * AI (the planner intake with the notes prefilled) or Write it myself.
 *
 * Shows while the rollout has no plan yet, and on any rollout that already has
 * notes (so an invited teammate lands on it). Rules in lib/rollout-ideas.ts.
 */
export function RolloutIdeasCard({
  release,
  hasPlan,
  canDraft,
  onDraftWithAi,
  onWriteMyself,
  condensed = false,
  oneLine = false,
  tasks = [],
  hasReleaseDate = false,
  onPlanChanged,
}: {
  /**
   * The Activities list on a computer (#1203, founder approved mock, 11 Nov
   * 2026): on a rollout that has its plan the idea is one line with "Open",
   * since it has been read by the time the list is being worked. Open shows
   * the same card as before, in place; Close folds it back.
   */
  oneLine?: boolean;
  /** Called after the owner applies suggested changes, so the page reloads the plan. */
  onPlanChanged?: () => void;
  /** The simple plan view: the team brief with Edit idea, not the full card. */
  condensed?: boolean;
  /** The rollout's plan, for the brief's Next up and Missing. */
  tasks?: ReadonlyArray<BriefTask>;
  hasReleaseDate?: boolean;
  release: { id: string; title: string };
  /** The rollout already has its plan (more than the seeded pre-production work). */
  hasPlan: boolean;
  /** The viewer may build the plan (the owner, with the planner on). */
  canDraft: boolean;
  onDraftWithAi: (extraNotes: string) => void;
  onWriteMyself: () => void;
}) {
  const persona = useAuthStore((state) => (state.user?.onboarding_persona ?? null) as OnboardingPersona | null);
  const viewerName = useAuthStore((state) => String(state.user?.name || '').trim());
  // The last copy seen in this page life paints at once (Nov 2, 2026).
  const [data, setData] = useState<IdeasData | null>(() => recallLast<IdeasData>('ideas', release.id));
  const [loadFailed, setLoadFailed] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [askingWho, setAskingWho] = useState(false);
  // The "Edit idea" button that opened the full card is gone (Nov 2, 2026), so
  // this stays false; the full card still draws when there is no brief yet.
  const [expanded] = useState(false);
  // The one-line idea, opened in place (see `oneLine`).
  const [lineOpen, setLineOpen] = useState(false);
  const fromVoiceRef = useRef(false);
  // The kept recording of the idea being written (2026-10-27).
  const clipRef = useRef<{ audioPath: string; seconds: number | null } | null>(null);
  const [closing, setClosing] = useState(false);
  const { openScene } = useSceneOverlay();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [brief, setBrief] = useState<RolloutBrief | null>(() => recallLast<RolloutBrief>('ideas-brief', release.id));
  const [suggest, setSuggest] = useState<SuggestState>(null);
  const [applying, setApplying] = useState(false);
  // The owner's guided first run: idea, then invite, then the plan button.
  const [stage, setStage] = useState<'idea' | 'invite' | 'plan' | 'waiting' | 'manual'>('idea');
  const [inviteSent, setInviteSent] = useState(false);
  const inviteSentRef = useRef(false);
  // Ideas other people added since the owner last looked (flag off by default).
  // "Last looked" is kept on this device; the first look only sets the starting
  // point, so an old rollout never opens with a pile of old notes.
  const reviewEnabled = isIdeaReviewPromptEnabled();
  const reviewKey = `urganize:idea-reviewed:${release.id}`;
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const ideasLoaded = data !== null;
  useEffect(() => {
    if (!reviewEnabled || !ideasLoaded) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(reviewKey);
    } catch {
      // Storage can be blocked; the prompt then simply does not show.
    }
    if (stored) {
      setReviewedAt(stored);
      return;
    }
    const baseline = reviewBaseline(data?.notes ?? []);
    try {
      window.localStorage.setItem(reviewKey, baseline);
    } catch {
      // Same: no storage, no prompt.
    }
    setReviewedAt(baseline);
    // The first look only; later notes arrive through `data` and are read below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewEnabled, ideasLoaded, reviewKey]);

  const load = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const response = await fetch(`/api/releases/${encodeURIComponent(release.id)}/ideas`, {
        headers,
        cache: 'no-store',
      });
      if (!response.ok) {
        setLoadFailed(true);
        return;
      }
      setData((await response.json()) as IdeasData);
    } catch {
      // The card simply stays away when its read fails.
      setLoadFailed(true);
    }
  }, [release.id]);

  // The page keys this card by rollout, so a new rollout is a fresh mount.
  useEffect(() => {
    if (ENABLED) void load();
  }, [load]);

  // What is on screen is the last copy for the next visit.
  useEffect(() => {
    if (data) rememberLast('ideas', release.id, data);
  }, [data, release.id]);
  useEffect(() => {
    if (brief) rememberLast('ideas-brief', release.id, brief);
  }, [brief, release.id]);

  // The brief is written from the notes and the plan's task titles, so it is asked
  // for again only when those change (the server answers from its saved copy when
  // they have not).
  const briefKey = condensed && data?.notes.length ? `${data.notes.map((n) => n.content).join('|')}#${tasks.map((t) => t.title).join('|')}` : '';
  useEffect(() => {
    if (!ENABLED || !briefKey) return;
    let cancelled = false;
    void (async () => {
      const headers = await authHeaders();
      if (!headers) return;
      try {
        const response = await fetch(`/api/releases/${encodeURIComponent(release.id)}/ideas/brief`, {
          method: 'POST',
          headers,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { brief?: RolloutBrief | null };
        if (!cancelled && payload.brief) setBrief(payload.brief);
      } catch {
        // The card keeps showing the owner's own words.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [briefKey, release.id]);

  // The first steps' "Add your idea" opens the text box here.
  useEffect(() => {
    const open = (event: Event) => {
      const target = (event as CustomEvent<{ releaseId?: string }>).detail?.releaseId;
      if (target && target !== release.id) return;
      setError('');
      setTyping(true);
      // After the render: the card may have been hidden until now.
      window.requestAnimationFrame(() =>
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      );
    };
    window.addEventListener(ADD_IDEA_EVENT, open);
    return () => window.removeEventListener(ADD_IDEA_EVENT, open);
  }, [release.id]);

  const path: IdeasPath = ideasPathFor({
    isOwner: Boolean(data?.isOwner),
    persona,
    teammateCount: data?.people.length ?? 0,
  });

  if (!ENABLED) return null;
  // Hold the card's place while it loads, so the plan card below it does not jump
  // down when the idea card arrives (2026-10-26). Only for the full card on a
  // rollout that has no plan yet, the one case where it is always going to show.
  if (!data) {
    if (condensed || hasPlan) return null;
    // The plan button lives here on a new rollout, so a failed read still shows it.
    if (loadFailed) {
      return canDraft ? (
        <PlanStage
          mode="ready"
          sent={false}
          onBuild={() => onDraftWithAi('')}
          onWait={() => undefined}
          onAddMyself={onWriteMyself}
        />
      ) : null;
    }
    return (
      <div
        aria-busy="true"
        aria-label="Loading"
        className="mx-auto mt-10 min-h-[15rem] w-full max-w-[26rem] animate-pulse rounded-2xl bg-bg-surface sm:w-[61.8%] sm:min-w-[22rem]"
      />
    );
  }
  // The owner can update a plan that exists by adding ideas to it.
  const canSuggest = hasPlan && data.isOwner && canDraft;
  if (hasPlan && data.notes.length === 0 && !canSuggest) return null;

  const requestChanges = async (idea: string) => {
    setSuggest({ status: 'loading' });
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error('Sign in again.');
      const response = await fetch(`/api/releases/${encodeURIComponent(release.id)}/ideas/changes`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest', idea }),
      });
      const payload = (await response.json().catch(() => ({}))) as { view?: IdeaChangeView; error?: string };
      if (!response.ok || !payload.view) throw new Error(payload.error || 'Could not read the plan just now.');
      captureAnalyticsEvent({
        name: 'idea_changes_suggested',
        properties: { adds: payload.view.adds.length, moves: payload.view.moves.length },
      });
      setSuggest({ status: 'ready', view: payload.view });
    } catch (suggestError) {
      setSuggest({
        status: 'error',
        message: suggestError instanceof Error ? suggestError.message : 'Could not read the plan just now.',
      });
    }
  };

  const applyChanges = async () => {
    if (suggest?.status !== 'ready' || applying) return;
    const { view } = suggest;
    setApplying(true);
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error('Sign in again.');
      const response = await fetch(`/api/releases/${encodeURIComponent(release.id)}/ideas/changes`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply',
          adds: view.adds.map(({ title, why, offsetDays, now }) => ({ title, why, offsetDays, now })),
          moves: view.moves.map(({ taskId, offsetDays }) => ({ taskId, offsetDays })),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { added?: number; moved?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not update the plan.');
      captureAnalyticsEvent({
        name: 'idea_changes_applied',
        properties: { added: payload.added ?? 0, moved: payload.moved ?? 0 },
      });
      setSuggest({ status: 'applied', text: IDEA_CHANGES_COPY.applied(payload.added ?? 0, payload.moved ?? 0) });
      onPlanChanged?.();
    } catch (applyError) {
      setSuggest({
        status: 'error',
        message: applyError instanceof Error ? applyError.message : 'Could not update the plan.',
      });
    } finally {
      setApplying(false);
    }
  };

  const toReview = reviewEnabled && canSuggest ? notesToReview(data.notes, reviewedAt) : [];
  const markReviewed = () => {
    const next = reviewBaseline(data.notes);
    try {
      window.localStorage.setItem(reviewKey, next);
    } catch {
      // Not saved: the prompt may come back after a reload.
    }
    setReviewedAt(next);
  };

  const changesPanel = suggest ? (
    <IdeaChangesPanel
      state={suggest}
      applying={applying}
      onApply={() => void applyChanges()}
      onDismiss={() => setSuggest(null)}
    />
  ) : null;

  // Someone else added an idea to a rollout that already has a plan: say so, and
  // offer the suggested changes. Nothing changes until the owner taps Apply.
  if (toReview.length && !typing && !askingWho && !suggest) {
    return (
      <section
        ref={sectionRef}
        aria-labelledby={`ideas-title-${release.id}`}
        className="rounded-[20px] border border-brand bg-bg-surface px-5 py-4"
      >
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-brand">New idea</p>
        <h2 id={`ideas-title-${release.id}`} className="mt-1 font-display text-xl font-semibold text-content-primary">
          {ideaReviewTitle(toReview)}
        </h2>
        <p className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-stroke-default bg-bg-base px-3 py-2 text-sm text-content-primary">
          {ideasToExtraNotes(toReview, 400)}
        </p>
        <p className="mt-2 text-sm text-content-secondary">
          AI can suggest what this changes in your plan. Nothing changes until you tap Apply.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="md"
            className="min-h-11"
            onClick={() => {
              captureAnalyticsEvent({ name: 'idea_review_prompt', properties: { count: toReview.length, action: 'review' } });
              const text = ideasToExtraNotes(toReview);
              markReviewed();
              void requestChanges(text);
            }}
          >
            Review changes
          </Button>
          <button
            type="button"
            onClick={() => {
              captureAnalyticsEvent({ name: 'idea_review_prompt', properties: { count: toReview.length, action: 'dismiss' } });
              markReviewed();
            }}
            className="motion-focus min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
          >
            Dismiss
          </button>
        </div>
      </section>
    );
  }

  // A planned rollout with no idea yet shows nothing here (2026-10-26, founder:
  // the banner was too much). The header's Add idea button opens the box.
  if (hasPlan && data.notes.length === 0 && canSuggest && !typing && !suggest) return null;

  const save = async () => {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    setError('');
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error('Sign in again to add a note.');
      const response = await fetch(`/api/releases/${encodeURIComponent(release.id)}/ideas`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          ...(clipRef.current ? { audioPath: clipRef.current.audioPath, audioSeconds: clipRef.current.seconds } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { notes?: IdeaNote[] | null; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not save the note.');
      clipRef.current = null;
      const notes = payload.notes ?? [...data.notes];
      captureAnalyticsEvent({
        name: 'idea_added',
        properties: { via: fromVoiceRef.current ? 'voice' : 'typed', path, note_count: notes.length },
      });
      fromVoiceRef.current = false;
      setData({ ...data, notes });
      if (!payload.notes) void load();
      setDraft('');
      setTyping(false);
      window.dispatchEvent(new Event(IDEAS_CHANGED_EVENT));
      // On a plan that exists, the owner's new idea gets suggested changes.
      if (canSuggest) void requestChanges(content);
      // A manager is asked who should chime in after their note.
      if (path === 'manager') setAskingWho(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the note.');
    } finally {
      setSaving(false);
    }
  };

  // The idea round (2026-10-27): only before a plan exists. Ideas are private
  // until the owner closes the round; closing writes the brief from them, and
  // the plan is built from the brief once it is approved.
  const round = ROUND_ENABLED && !hasPlan ? data.round ?? null : null;
  const roundOpen = round?.state === 'open';
  const runner = Boolean(round?.canRun);

  const openBrief = () => openScene('brief', release.id);

  const closeAndWrite = async () => {
    if (closing) return;
    setClosing(true);
    setError('');
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error('Sign in again.');
      const response = await fetch(`/api/releases/${encodeURIComponent(release.id)}/ideas/round`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close' }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not close the round.');
      captureAnalyticsEvent({ name: 'idea_round_closed', properties: { idea_count: data.notes.length } });
      // With ideas, UrgAns writes the brief. Without (or if it cannot), the brief page opens to write it by hand.
      if (data.notes.length) {
        const written = await runBriefFromIdeas({ releaseId: release.id });
        if (!written.ok) setError(written.error);
      }
      window.dispatchEvent(new Event(IDEAS_CHANGED_EVENT));
      await load();
      openBrief();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'Could not close the round.');
    } finally {
      setClosing(false);
    }
  };

  if (condensed && !expanded && data.notes.length > 0 && !typing && !askingWho) {
    const next = nextUp(tasks);
    const missing = missingItems({ hasReleaseDate, next });
    return (
      <section
        aria-labelledby={`ideas-title-${release.id}`}
        className="rounded-[20px] border border-stroke-default bg-bg-surface px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <h2 id={`ideas-title-${release.id}`} className="text-base font-semibold text-content-primary">
            {brief ? 'Rollout brief' : 'Your idea'}
          </h2>
          {/* No Add idea or Edit idea here (Nov 2, 2026, founder): ideas are
              added by talking or typing to the chat box in the rollout's
              session, and the idea card appears there. */}
        </div>
        {brief ? (
          <div className="space-y-4 text-sm">
            <p className="break-words text-base text-content-primary">{brief.goal}</p>
            {brief.moves.length ? (
              <BriefList title="How we'll do it" items={brief.moves.map((move) => ({ text: move }))} />
            ) : null}
            {next.length ? (
              <BriefList
                title="Next up"
                marker="circle"
                items={next.map((item) => ({ text: item.title, owner: item.owner || 'Unassigned' }))}
              />
            ) : null}
            {missing.length ? <BriefList title="Missing" items={missing.map((text) => ({ text }))} /> : null}
          </div>
        ) : (
          <p className="line-clamp-3 break-words text-sm text-content-secondary">
            {data.notes.map((note) => note.content).join(' ')}
          </p>
        )}
        {changesPanel}
      </section>
    );
  }

  const ownerFirst = (data.ownerName || '').split(/\s+/)[0] || '';
  const viewerFirst = viewerName.split(/\s+/)[0] || '';
  const hasNotes = data.notes.length > 0;
  const hasOwnNote = data.notes.some((note) => note.isOwn);
  // Round titles: a teammate is asked, then thanked; the owner sees the count; anyone sees "closed".
  const title = round
    ? !roundOpen
      ? ROUND_COPY.closedTitle
      : runner && hasNotes
        ? ROUND_COPY.inCount(data.notes.length)
        : path === 'chime_in'
          ? hasOwnNote
            ? ROUND_COPY.thanksTitle(viewerFirst)
            : ROUND_COPY.teammateTitle(ownerFirst, release.title)
          : COPY.title
    : path === 'chime_in'
      ? COPY.chimeInTitle(ownerFirst)
      : COPY.title;
  // With the round on, the plan is not built from here: the owner closes the round instead.
  const showPlanActions = !round && canDraft && hasNotes && !hasPlan && !askingWho && !typing;
  const showRoundActions = Boolean(round) && !askingWho && !typing;
  // A closed round takes no more ideas from a teammate.
  const canAddIdea = !round || roundOpen || runner;

  // The first thing on a new rollout (2026-10-26, mock A): no box, one centered
  // column 61.8% of the width, its headline near the 38.2% line, and the plan
  // card's button directly below it. It becomes the ordinary card once a note
  // exists, someone is being asked, or a plan has been built.
  const fresh = !hasNotes && !typing && !askingWho && !hasPlan;
  const guided = fresh && data.isOwner && canDraft && path !== 'chime_in';

  if (guided && stage === 'invite') {
    return (
      <section aria-labelledby={`ideas-title-${release.id}`} className={FRESH_COLUMN}>
        <h2 id={`ideas-title-${release.id}`} className={FRESH_HEADING}>
          {COPY.inviteTitle}
        </h2>
        <p className="mt-2 text-sm text-content-secondary">{round ? ROUND_COPY.ownerPrivateHint : COPY.inviteBody}</p>
        {round ? <IdeaRoundLoop className="mt-5" /> : null}
        <div className="text-left">
          <WhoShouldChimeIn
            bare
            releaseId={release.id}
            releaseTitle={release.title}
            people={data.people}
            canInvite
            senderName={viewerName}
            onSent={() => {
              inviteSentRef.current = true;
              setInviteSent(true);
            }}
            onDone={() => setStage(inviteSentRef.current ? 'plan' : 'manual')}
          />
        </div>
      </section>
    );
  }

  if (guided && stage !== 'idea') {
    return (
      <PlanStage
        mode={stage === 'manual' ? 'manual' : stage === 'waiting' ? 'waiting' : 'ready'}
        sent={inviteSent}
        onBuild={round && runner ? () => void closeAndWrite() : () => onDraftWithAi('')}
        buildLabel={round && runner ? ROUND_COPY.close : undefined}
        busy={closing}
        onWait={() => setStage('waiting')}
        onAddMyself={onWriteMyself}
      />
    );
  }

  // One line on a planned rollout's list (see `oneLine`). Anything that needs
  // the card (typing, asking who, suggested changes, an error) opens it.
  const foldable = oneLine && hasPlan && hasNotes && !round;
  if (foldable && !lineOpen && !typing && !askingWho && !suggest && !error) {
    return (
      <section
        ref={sectionRef}
        aria-labelledby={`ideas-title-${release.id}`}
        className="flex items-center gap-3 rounded-xl border border-stroke-default bg-bg-surface px-4 py-2"
        data-idea-line
      >
        <h2 id={`ideas-title-${release.id}`} className="shrink-0 text-sm font-semibold text-content-primary">
          The idea
        </h2>
        <p className="min-w-0 flex-1 truncate text-sm text-content-secondary">
          {data.notes.map((note) => note.content).join(' ')}
        </p>
        <button
          type="button"
          onClick={() => setLineOpen(true)}
          className="motion-focus h-8 shrink-0 rounded-full px-2 text-[13px] font-semibold text-brand underline underline-offset-4 hover:bg-bg-hover"
        >
          Open
        </button>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      aria-labelledby={`ideas-title-${release.id}`}
      className={
        fresh
          ? 'mx-auto w-full max-w-[26rem] px-1 pt-10 text-center sm:w-[61.8%] sm:min-w-[22rem] sm:pt-16'
          : 'rounded-[20px] border border-stroke-default bg-bg-surface px-5 py-4'
      }
    >
      {foldable && lineOpen ? (
        <button
          type="button"
          onClick={() => setLineOpen(false)}
          className="motion-focus float-right h-8 rounded-full px-2 text-[13px] font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
        >
          Close
        </button>
      ) : null}
      <h2
        id={`ideas-title-${release.id}`}
        className={
          fresh
            ? 'font-display text-2xl font-semibold leading-tight text-content-primary sm:text-[1.75rem]'
            : 'text-base font-semibold text-content-primary'
        }
      >
        {fresh && path !== 'chime_in' ? COPY.titleFor(release.title) : title}
      </h2>
      {fresh && path !== 'chime_in' ? (
        <>
          <p className="mt-2 text-sm text-content-secondary">{COPY.freshBody}</p>
        </>
      ) : round && path === 'chime_in' && roundOpen ? (
        <p className="mt-2 text-sm text-content-secondary">
          {hasOwnNote ? ROUND_COPY.thanksBody(ownerFirst) : ROUND_COPY.teammateBody}
        </p>
      ) : round && !roundOpen ? (
        <p className="mt-2 text-sm text-content-secondary">{ROUND_COPY.closedBody}</p>
      ) : null}

      {hasNotes ? (
        <ul className="mt-3 space-y-3">
          {data.notes.map((note) => (
            <li key={note.id} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-semibold text-brand"
              >
                {note.authorInitials}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-content-tertiary">
                  <span className="font-medium text-content-secondary">{note.isOwn ? 'You' : note.authorName}</span>
                  {' · '}
                  {formatRelativeTime(note.createdAt)}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-content-primary">{note.content}</p>
                {note.audioUrl ? <VoicePill url={note.audioUrl} seconds={note.audioSeconds} /> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {askingWho ? (
        <WhoShouldChimeIn
          releaseId={release.id}
          releaseTitle={release.title}
          people={data.people}
          canInvite={data.isOwner}
          senderName={viewerName}
          onDone={() => setAskingWho(false)}
        />
      ) : typing ? (
        <div className="mt-4">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, MAX_IDEA_LENGTH))}
            placeholder={COPY.placeholder}
            rows={3}
            maxLength={MAX_IDEA_LENGTH}
            autoFocus
            aria-label={COPY.title}
            className="w-full resize-none rounded-2xl border border-stroke-control bg-bg-base px-4 py-3 text-base text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="md" className="min-h-11" onClick={() => void save()} isLoading={saving} disabled={!draft.trim()}>
              {COPY.add}
            </Button>
            <button
              type="button"
              onClick={() => {
                setTyping(false);
                setDraft('');
                setError('');
                fromVoiceRef.current = false;
                clipRef.current = null;
              }}
              className="motion-focus min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
            >
              {COPY.cancel}
            </button>
          </div>
        </div>
      ) : !canAddIdea || hasNotes ? null : (
        // No record or type box here any more (Nov 2, 2026, founder): the
        // chat box does both, and the "n ideas are in" card shows in the chat.
        <p className="mt-6 text-sm text-content-secondary">Tell AI in the chat box below. Say it or type it.</p>
      )}

      {guided && !typing ? (
        <button
          type="button"
          onClick={() => setStage('invite')}
          className="motion-focus mt-6 min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary underline hover:text-content-primary"
        >
          {COPY.noIdea}
        </button>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      {round && roundOpen && !runner && !typing ? (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-content-tertiary">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {ROUND_COPY.privateHint(ownerFirst)}
        </p>
      ) : null}

      {changesPanel}

      {showRoundActions && roundOpen && runner && hasNotes ? (
        <div className="mt-4 border-t border-stroke-default pt-4">
          {data.round && data.round.askedCount > 0 ? (
            <div className="mb-3 flex items-center gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-stroke-strong">
                <div
                  className="h-full bg-brand"
                  style={{ width: `${Math.round((data.round.inCount / data.round.askedCount) * 100)}%` }}
                />
              </div>
              <span className="shrink-0 text-xs text-content-secondary">
                {data.round.inCount} of {data.round.askedCount} asked
              </span>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="md"
              className="min-h-11"
              leftIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void closeAndWrite()}
              isLoading={closing}
            >
              {closing ? ROUND_COPY.closing : ROUND_COPY.close}
            </Button>
            <button
              type="button"
              onClick={() => setAskingWho(true)}
              className="motion-focus min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
            >
              {COPY.addSomeone}
            </button>
          </div>
          <p className="mt-2 text-xs text-content-tertiary">Writing the brief uses AI credits.</p>
        </div>
      ) : null}

      {showRoundActions && !roundOpen ? (
        <div className="mt-4 border-t border-stroke-default pt-4">
          <Button size="md" className="min-h-11" onClick={openBrief}>
            {ROUND_COPY.readBrief}
          </Button>
        </div>
      ) : null}

      {showPlanActions ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stroke-default pt-4">
          <Button
            size="md"
            className="min-h-11"
            leftIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
            onClick={() => onDraftWithAi(ideasToExtraNotes(data.notes))}
          >
            {COPY.draftWithAi}
          </Button>
          <button
            type="button"
            onClick={() => {
              captureAnalyticsEvent({ name: 'ideas_plan_drafted', properties: { via: 'manual', note_count: data.notes.length } });
              onWriteMyself();
            }}
            className="motion-focus min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
          >
            {COPY.writeMyself}
          </button>
        </div>
      ) : null}

      {path === 'solo' && hasNotes && !typing ? (
        <div className="mt-4 rounded-2xl bg-bg-base px-4 py-3">
          <p className="text-sm font-medium text-content-primary">{COPY.soloInviteTitle}</p>
          <InviteLinkActions
            releaseId={release.id}
            releaseTitle={release.title}
            senderName={viewerName}
            path="solo"
          />
        </div>
      ) : null}
    </section>
  );
}

const FRESH_COLUMN = 'mx-auto w-full max-w-[26rem] px-1 pt-10 text-center sm:w-[61.8%] sm:min-w-[22rem] sm:pt-16';
const FRESH_HEADING = 'font-display text-2xl font-semibold leading-tight text-content-primary sm:text-[1.75rem]';

/** The plan button, shown only after the idea and invite steps (2026-10-26). */
function PlanStage({
  mode,
  sent,
  onBuild,
  onWait,
  onAddMyself,
  buildLabel = COPY.buildPlan,
  busy = false,
}: {
  mode: 'ready' | 'waiting' | 'manual';
  sent: boolean;
  onBuild: () => void;
  onWait: () => void;
  onAddMyself: () => void;
  /** "Close and write the brief" when the idea round is on (2026-10-27). */
  buildLabel?: string;
  busy?: boolean;
}) {
  const waiting = mode === 'waiting';
  if (mode === 'manual') {
    // Skipped the invite: their own plan. Adding activities leads; UrgAns is one
    // quiet link and never opens on its own.
    return (
      <section className={FRESH_COLUMN}>
        <h2 className={FRESH_HEADING}>{COPY.manualTitle}</h2>
        <p className="mt-2 text-sm text-content-secondary">{COPY.manualBody}</p>
        <div className="mt-6 flex flex-col items-center gap-1">
          <Button
            type="button"
            onClick={onAddMyself}
            className="h-12 w-full max-w-[16rem] justify-center rounded-full px-8"
          >
            {COPY.addActivity}
          </Button>
          <button
            type="button"
            onClick={onBuild}
            className="motion-focus min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary underline hover:text-content-primary"
          >
            {COPY.draftInstead}
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className={FRESH_COLUMN}>
      {sent ? (
        <p className="mb-2 flex items-center justify-center gap-2 text-sm font-medium text-brand">
          <Check className="h-4 w-4" aria-hidden="true" />
          {COPY.inviteSent}
        </p>
      ) : null}
      <h2 className={FRESH_HEADING}>{waiting ? COPY.waitingTitle : COPY.readyTitle}</h2>
      <p className="mt-2 text-sm text-content-secondary">
        {waiting ? COPY.waitingBody : sent ? COPY.readyBody : COPY.readyBodySkipped}
      </p>
      {waiting ? (
        <button
          type="button"
          onClick={onBuild}
          className="motion-focus mt-4 min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary underline hover:text-content-primary"
        >
          {buildLabel}
        </button>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-2">
          <Button
            type="button"
            onClick={onBuild}
            isLoading={busy}
            data-tour="plan-rollout"
            className="h-12 w-full max-w-[16rem] justify-center rounded-full px-8"
          >
            {buildLabel}
          </Button>
          {sent ? (
            <button
              type="button"
              onClick={onWait}
              className="motion-focus min-h-11 w-full max-w-[16rem] rounded-full border border-stroke-strong px-8 text-sm font-medium text-content-primary hover:bg-bg-surface"
            >
              {COPY.waitForIdeas}
            </button>
          ) : null}
          <p className="mt-1 text-xs text-content-tertiary">
            {buildLabel === COPY.buildPlan ? COPY.fiveQuestions : 'Writing the brief uses AI credits.'}
          </p>
          <button
            type="button"
            onClick={onAddMyself}
            className="motion-focus min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary underline hover:text-content-primary"
          >
            {COPY.addMyself}
          </button>
        </div>
      )}
    </section>
  );
}

export type SuggestState =
  | null
  | { status: 'loading' }
  | { status: 'ready'; view: IdeaChangeView }
  | { status: 'applied'; text: string }
  | { status: 'error'; message: string };

/** The suggested plan changes for the owner to review. Nothing is saved until Apply. */
export function IdeaChangesPanel({
  state,
  applying,
  onApply,
  onDismiss,
}: {
  state: NonNullable<SuggestState>;
  applying: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const box = 'mt-4 rounded-2xl bg-bg-base px-4 py-3';
  if (state.status === 'loading') {
    return (
      <div className={`${box} flex items-center gap-2 text-sm text-content-secondary`} aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {IDEA_CHANGES_COPY.thinking}
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className={box}>
        <p role="alert" className="text-sm text-status-error">
          {state.message}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="motion-focus mt-1 min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
        >
          Close
        </button>
      </div>
    );
  }
  if (state.status === 'applied') {
    return (
      <div className={`${box} flex items-center gap-2 text-sm font-medium text-brand`} aria-live="polite">
        <Check className="h-4 w-4" aria-hidden="true" />
        {state.text}
        <button
          type="button"
          onClick={onDismiss}
          className="motion-focus ml-auto min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
        >
          Done
        </button>
      </div>
    );
  }
  const { view } = state;
  if (isEmptyChanges(view)) {
    return (
      <div className={box}>
        <p className="text-sm text-content-secondary">{IDEA_CHANGES_COPY.none}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="motion-focus mt-1 min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
        >
          Close
        </button>
      </div>
    );
  }
  return (
    <div className={box}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-content-primary">{IDEA_CHANGES_COPY.heading}</h3>
        <span className="ml-auto text-xs text-content-tertiary">{IDEA_CHANGES_COPY.unsaved}</span>
      </div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {view.adds.map((add) => (
          <li key={`a-${add.title}`} className="flex items-baseline gap-2 text-content-primary">
            <span aria-hidden="true" className="w-3 shrink-0 text-brand">
              +
            </span>
            <span className="min-w-0 break-words">{add.title}</span>
            <span className="ml-auto shrink-0 pl-2 text-xs text-content-tertiary">{add.when}</span>
          </li>
        ))}
        {view.moves.map((move) => (
          <li key={`m-${move.taskId}`} className="flex items-baseline gap-2 text-content-primary">
            <span aria-hidden="true" className="w-3 shrink-0 text-content-tertiary">
              ~
            </span>
            <span className="min-w-0 break-words">{move.title}</span>
            <span className="ml-auto shrink-0 pl-2 text-xs text-content-tertiary">
              {move.fromWhen} to {move.when}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="md" className="min-h-11" onClick={onApply} isLoading={applying}>
          {IDEA_CHANGES_COPY.apply}
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="motion-focus min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
        >
          {IDEA_CHANGES_COPY.notNow}
        </button>
      </div>
    </div>
  );
}

function BriefList({
  title,
  items,
  marker = 'dot',
}: {
  title: string;
  items: Array<{ text: string; owner?: string }>;
  marker?: 'dot' | 'circle';
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">{title}</h3>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item.text} className="flex items-baseline gap-2 text-content-secondary">
            <span aria-hidden="true" className="text-content-tertiary">
              {marker === 'circle' ? '○' : '•'}
            </span>
            <span className="min-w-0 break-words">{item.text}</span>
            {item.owner ? <span className="ml-auto shrink-0 pl-2 text-xs text-content-tertiary">{item.owner}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Who should chime in?": tick teammates already on the rollout, or add someone by link. */
export function WhoShouldChimeIn({
  releaseId,
  releaseTitle,
  people,
  canInvite,
  senderName,
  onDone,
  onSent,
  bare = false,
}: {
  releaseId: string;
  releaseTitle: string;
  people: IdeasPerson[];
  canInvite: boolean;
  senderName: string;
  onDone: () => void;
  /** Called when the asks went out, just before onDone. */
  onSent?: () => void;
  /** The guided invite step: its own heading above, no title or rule here. */
  bare?: boolean;
}) {
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(people.filter((person) => person.isArtist).map((person) => person.userId))
  );
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<number | null>(null);
  // Ask for ideas by email (flag-off by default): people not on Urganize are
  // queued here and invited, then the ticked teammates are asked, on one tap.
  const emailInvites = canInvite && isIdeaEmailInvitesEnabled();
  const openSettings = useOpenSettings();
  const [pending, setPending] = useState<PendingIdeaInvite[]>([]);
  const [emailText, setEmailText] = useState('');
  const [inviteRole, setInviteRole] = useState<IdeaInviteRole>('artist');
  const [addError, setAddError] = useState('');
  const [seatMessage, setSeatMessage] = useState('');
  const requestCount = picked.size + pending.length;

  const toggle = (userId: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const addByEmail = () => {
    const result = addPendingInvite(pending, emailText, inviteRole);
    if (!result.ok) {
      setAddError(
        result.reason === 'invalid'
          ? 'Type a full email address.'
          : result.reason === 'duplicate'
            ? 'That address is already on the list.'
            : 'That is the most people one ask can invite.'
      );
      return;
    }
    setAddError('');
    setPending(result.list);
    setEmailText('');
  };

  // Invites each queued address (a full team invite, so a seat each). Stops at
  // the first refusal, keeps what is left queued, and returns how many went out.
  const sendInvites = async (headers: Record<string, string>): Promise<number> => {
    let invited = 0;
    let remaining = pending;
    for (const invite of pending) {
      const response = await fetch('/api/workspace/members/invite', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invite.email, role: invite.role, releaseId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (response.status === 409) {
        setSeatMessage(payload.error || 'Your plan has no free seat for this invite.');
        break;
      }
      if (!response.ok) {
        setError(payload.error || `Could not invite ${invite.email}.`);
        break;
      }
      invited += 1;
      remaining = remaining.filter((item) => item.email !== invite.email);
    }
    setPending(remaining);
    if (invited) {
      captureAnalyticsEvent({
        name: 'idea_invite_sent',
        properties: { count: invited, artist_invited: pending.some((item) => item.role === 'artist') },
      });
    }
    return invited;
  };

  const ask = async () => {
    if (!requestCount || sending) return;
    setSending(true);
    setError('');
    setSeatMessage('');
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error('Sign in again.');
      const invited = pending.length ? await sendInvites(headers) : 0;
      if (pending.length && invited < pending.length) return;
      let asked = 0;
      if (picked.size) {
        const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/ideas/ask`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: Array.from(picked) }),
        });
        const payload = (await response.json().catch(() => ({}))) as { asked?: number; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Could not ask them.');
        asked = payload.asked ?? picked.size;
        captureAnalyticsEvent({
          name: 'chime_in_requested',
          properties: {
            count: asked,
            artist_ticked: people.some((person) => person.isArtist && picked.has(person.userId)),
          },
        });
      }
      setSent(asked + invited);
      onSent?.();
      window.setTimeout(onDone, 1200);
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : 'Could not ask them.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={bare ? 'mt-6' : 'mt-4 border-t border-stroke-default pt-4'}>
      {bare ? null : <p className="text-sm font-semibold text-content-primary">{COPY.whoTitle}</p>}
      {people.length ? (
        <ul className="mt-2 divide-y divide-stroke-default">
          {people.map((person) => {
            const on = picked.has(person.userId);
            return (
              <li key={person.userId}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(person.userId)}
                  className="motion-focus flex min-h-12 w-full items-center gap-3 py-2 text-left"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      on ? 'border-brand bg-brand text-content-inverse' : 'border-stroke-strong'
                    }`}
                  >
                    {on ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span className="truncate text-sm text-content-primary">{person.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-content-secondary">{COPY.empty}</p>
      )}

      {emailInvites ? (
        <div className="mt-3">
          {pending.length ? (
            <ul className="divide-y divide-stroke-default">
              {pending.map((invite) => (
                <li key={invite.email} className="flex min-h-12 items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-content-primary">
                      {invite.email}
                      <span className="text-content-tertiary">{invite.role === 'artist' ? ' · Artist' : ' · Team member'}</span>
                    </p>
                    <p className="text-xs text-content-secondary">Not on Urganize? They get an invite by email. It uses 1 seat.</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${invite.email}`}
                    onClick={() => setPending((current) => current.filter((item) => item.email !== invite.email))}
                    className="motion-focus grid h-11 w-11 shrink-0 place-items-center rounded-full text-content-tertiary hover:text-content-primary"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label htmlFor="idea-invite-email" className="mt-2 block text-xs text-content-secondary">
            Add someone by email
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="idea-invite-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={emailText}
              onChange={(event) => setEmailText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addByEmail();
                }
              }}
              placeholder="name@email.com"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-stroke-control bg-bg-base px-3 text-base text-content-primary placeholder:text-content-tertiary"
            />
            <Button size="md" variant="secondary" className="min-h-11" onClick={addByEmail} disabled={!emailText.trim()}>
              Add
            </Button>
          </div>
          <div role="radiogroup" aria-label="Their role" className="mt-2 flex gap-2">
            {(['artist', 'team-member'] as const).map((role) => (
              <button
                key={role}
                type="button"
                role="radio"
                aria-checked={inviteRole === role}
                onClick={() => setInviteRole(role)}
                className={`motion-focus min-h-11 rounded-full border px-4 text-sm font-medium ${
                  inviteRole === role
                    ? 'border-brand bg-brand/10 text-content-primary'
                    : 'border-stroke-strong text-content-secondary'
                }`}
              >
                {role === 'artist' ? 'Artist' : 'Team member'}
              </button>
            ))}
          </div>
          {addError ? (
            <p role="alert" className="mt-2 text-sm text-status-error">
              {addError}
            </p>
          ) : null}
          {adding ? (
            <div className="mt-2">
              <InviteLinkActions releaseId={releaseId} releaseTitle={releaseTitle} senderName={senderName} path="manager" autoStart />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="motion-focus mt-1 min-h-11 text-sm font-medium text-content-secondary hover:text-content-primary"
            >
              Or share a link instead
            </button>
          )}
        </div>
      ) : canInvite ? (
        adding ? (
          <div className="mt-2">
            <InviteLinkActions releaseId={releaseId} releaseTitle={releaseTitle} senderName={senderName} path="manager" autoStart />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="motion-focus mt-1 flex min-h-12 w-full items-center gap-3 py-2 text-left text-sm font-medium text-brand"
          >
            <UserPlus className="h-5 w-5" aria-hidden="true" />
            {COPY.addSomeone}
          </button>
        )
      ) : null}

      {seatMessage ? (
        <div role="alert" className="mt-3 rounded-2xl border border-status-warning/40 bg-status-warning/10 p-3">
          <p className="text-sm font-semibold text-content-primary">{seatMessage}</p>
          <p className="mt-1 text-sm text-content-secondary">
            Your rollout is not blocked. Keep planning, and add the idea yourself for now.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="md" className="min-h-11" onClick={() => openSettings({ segment: 'billing' })}>
              See plans
            </Button>
            <button
              type="button"
              onClick={onDone}
              className="motion-focus min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
            >
              I&apos;ll type the idea myself
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {sent !== null ? (
          <p className="flex min-h-11 items-center gap-2 text-sm font-medium text-brand">
            <Check className="h-4 w-4" aria-hidden="true" />
            {COPY.asked(sent)}
          </p>
        ) : (
          <>
            {people.length || emailInvites ? (
              <Button size="md" className="min-h-11" onClick={() => void ask()} isLoading={sending} disabled={!requestCount}>
                {emailInvites && requestCount ? `Send ${requestCount} ${requestCount === 1 ? 'request' : 'requests'}` : COPY.ask}
              </Button>
            ) : null}
            <button
              type="button"
              onClick={onDone}
              className="motion-focus min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
            >
              {people.length || emailInvites || !adding ? COPY.skip : 'Done'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Makes a team invite link that lands on this rollout after joining, then
 * offers WhatsApp (the "<Name> wants you to chime in on <title>" text) and a
 * copy-link fallback. The link is made once per tap and kept.
 */
function InviteLinkActions({
  releaseId,
  releaseTitle,
  senderName,
  path,
  autoStart = false,
}: {
  releaseId: string;
  releaseTitle: string;
  senderName: string;
  path: 'solo' | 'manager';
  autoStart?: boolean;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const make = useCallback(async (): Promise<string | null> => {
    if (link) return link;
    setMaking(true);
    setError('');
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error('Sign in again.');
      const response = await fetch('/api/workspace/invite-link', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseId, label: `Chime in: ${releaseTitle}`.slice(0, 60) }),
      });
      const payload = (await response.json().catch(() => ({}))) as { inviteUrl?: string; error?: string };
      if (!response.ok || !payload.inviteUrl) throw new Error(payload.error || 'Could not make a link.');
      const url = withInviteNext(payload.inviteUrl, releaseId);
      setLink(url);
      return url;
    } catch (makeError) {
      setError(makeError instanceof Error ? makeError.message : 'Could not make a link.');
      return null;
    } finally {
      setMaking(false);
    }
  }, [link, releaseId, releaseTitle]);

  useEffect(() => {
    if (autoStart) void make();
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const shareWhatsApp = async () => {
    // Open the window inside the tap so a phone browser does not block it.
    const popup = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    const url = await make();
    if (!url) {
      popup?.close();
      return;
    }
    const target = buildWhatsAppShareUrl(chimeInShareText({ senderName, releaseTitle, link: url }));
    captureAnalyticsEvent({ name: 'chime_in_link_shared', properties: { via: 'whatsapp', path } });
    if (popup) popup.location.href = target;
    else window.location.href = target;
  };

  const copy = async () => {
    const url = await make();
    if (!url) return;
    if (await copyText(url)) {
      captureAnalyticsEvent({ name: 'chime_in_link_shared', properties: { via: 'copy', path } });
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="md"
          variant="secondary"
          className="min-h-11"
          leftIcon={<MessageCircle className="h-4 w-4" aria-hidden="true" />}
          onClick={() => void shareWhatsApp()}
          disabled={making && !link}
        >
          {COPY.shareWhatsApp}
        </Button>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={making && !link}
          className="motion-focus inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary disabled:opacity-50"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? COPY.copied : COPY.copyLink}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

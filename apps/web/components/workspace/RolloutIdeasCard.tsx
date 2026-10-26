'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@urganize/ui';
import { ADD_IDEA_EVENT, IDEAS_CHANGED_EVENT } from './RolloutFirstSteps';
import { Check, Copy, Loader2, MessageCircle, Mic, Sparkles, UserPlus, X } from '@/components/icons';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { useVoiceInput } from '@/components/chappi/useVoiceInput';
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
  ideasToExtraNotes,
  isIdeaEmailInvitesEnabled,
  isRolloutIdeasEnabled,
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

type IdeasData = {
  notes: IdeaNote[];
  people: IdeasPerson[];
  ownerName: string | null;
  isOwner: boolean;
  voice: boolean;
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
  tasks = [],
  hasReleaseDate = false,
  onPlanChanged,
}: {
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
  const [data, setData] = useState<IdeasData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [askingWho, setAskingWho] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fromVoiceRef = useRef(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [brief, setBrief] = useState<RolloutBrief | null>(null);
  const [suggest, setSuggest] = useState<SuggestState>(null);
  const [applying, setApplying] = useState(false);
  // The owner's guided first run: idea, then invite, then the plan button.
  const [stage, setStage] = useState<'idea' | 'invite' | 'plan' | 'waiting'>('idea');
  const [inviteSent, setInviteSent] = useState(false);

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
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener(ADD_IDEA_EVENT, open);
    return () => window.removeEventListener(ADD_IDEA_EVENT, open);
  }, [release.id]);

  const path: IdeasPath = ideasPathFor({
    isOwner: Boolean(data?.isOwner),
    persona,
    teammateCount: data?.people.length ?? 0,
  });

  const onTranscript = useCallback((text: string) => {
    fromVoiceRef.current = true;
    setDraft((current) => (current.trim() ? `${current.trim()} ${text}` : text).slice(0, MAX_IDEA_LENGTH));
    setTyping(true);
  }, []);

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
          sent={false}
          waiting={false}
          onBuild={() => onDraftWithAi('')}
          onWait={() => undefined}
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

  const changesPanel = suggest ? (
    <IdeaChangesPanel
      state={suggest}
      applying={applying}
      onApply={() => void applyChanges()}
      onDismiss={() => setSuggest(null)}
    />
  ) : null;

  // A planned rollout with no idea yet: one slim way in for the owner.
  if (hasPlan && data.notes.length === 0 && canSuggest && !typing && !suggest) {
    return (
      <section
        ref={sectionRef}
        aria-labelledby={`ideas-title-${release.id}`}
        className="rounded-[20px] border border-stroke-default bg-bg-surface px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <h2 id={`ideas-title-${release.id}`} className="text-base font-semibold text-content-primary">
              New idea for this plan?
            </h2>
            <p className="text-sm text-content-secondary">UrgAns suggests how your plan should change.</p>
          </div>
          <button
            type="button"
            onClick={() => setTyping(true)}
            className="motion-focus ml-auto min-h-11 shrink-0 rounded-full px-3 text-sm font-medium text-content-secondary underline hover:text-content-primary"
          >
            {IDEA_CHANGES_COPY.addIdea}
          </button>
        </div>
      </section>
    );
  }

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
        body: JSON.stringify({ content }),
      });
      const payload = (await response.json().catch(() => ({}))) as { notes?: IdeaNote[] | null; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not save the note.');
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
          {canSuggest ? (
            <button
              type="button"
              onClick={() => {
                setError('');
                setTyping(true);
              }}
              className="motion-focus ml-auto min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary underline hover:text-content-primary"
            >
              {IDEA_CHANGES_COPY.addIdea}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`motion-focus ${canSuggest ? '' : 'ml-auto '}min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary underline hover:text-content-primary`}
          >
            Edit idea
          </button>
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
  const title = path === 'chime_in' ? COPY.chimeInTitle(ownerFirst) : COPY.title;
  const hasNotes = data.notes.length > 0;
  const showPlanActions = canDraft && hasNotes && !hasPlan && !askingWho && !typing;

  const typeButton = (label: string) => (
    <button
      type="button"
      onClick={() => {
        setError('');
        setTyping(true);
      }}
      className="motion-focus min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
    >
      {label}
    </button>
  );

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
        <p className="mt-2 text-sm text-content-secondary">{COPY.inviteBody}</p>
        <div className="mt-6 flex justify-center">
          <InviteLinkActions
            releaseId={release.id}
            releaseTitle={release.title}
            senderName={viewerName}
            path={path === 'solo' ? 'solo' : 'manager'}
            stacked
            onShared={() =>
              window.setTimeout(() => {
                setInviteSent(true);
                setStage('plan');
              }, 1000)
            }
          />
        </div>
        <button
          type="button"
          onClick={() => setStage('plan')}
          className="motion-focus mt-4 min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary underline hover:text-content-primary"
        >
          {COPY.skip}
        </button>
      </section>
    );
  }

  if (guided && (stage === 'plan' || stage === 'waiting')) {
    return (
      <PlanStage
        sent={inviteSent}
        waiting={stage === 'waiting'}
        onBuild={() => onDraftWithAi('')}
        onWait={() => setStage('waiting')}
      />
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
        <p className="mt-2 text-sm text-content-secondary">{COPY.freshBody}</p>
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
              }}
              className="motion-focus min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
            >
              {COPY.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className={hasNotes ? 'mt-3 flex flex-wrap items-center gap-2' : fresh ? 'mt-6 flex flex-col items-center gap-1' : 'mt-4 flex flex-col items-center gap-1'}>
          {data.voice ? (
            <IdeaMic
              compact={hasNotes}
              releaseId={release.id}
              onTranscript={onTranscript}
              onError={setError}
              typeLink={typeButton(hasNotes ? 'Type it' : COPY.orType)}
              fallback={typeButton('Type it')}
            />
          ) : (
            typeButton('Type it')
          )}
        </div>
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

      {changesPanel}

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
  sent,
  waiting,
  onBuild,
  onWait,
}: {
  sent: boolean;
  waiting: boolean;
  onBuild: () => void;
  onWait: () => void;
}) {
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
          {COPY.buildPlan}
        </button>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-2">
          <Button
            type="button"
            onClick={onBuild}
            data-tour="plan-rollout"
            className="h-12 w-full max-w-[16rem] justify-center rounded-full px-8"
          >
            {COPY.buildPlan}
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
          <p className="mt-1 text-xs text-content-tertiary">{COPY.fiveQuestions}</p>
        </div>
      )}
    </section>
  );
}

type SuggestState =
  | null
  | { status: 'loading' }
  | { status: 'ready'; view: IdeaChangeView }
  | { status: 'applied'; text: string }
  | { status: 'error'; message: string };

/** The suggested plan changes for the owner to review. Nothing is saved until Apply. */
function IdeaChangesPanel({
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

/** The big green mic. Hold to talk; a quick tap starts and a second tap stops. */
function IdeaMic({
  releaseId,
  onTranscript,
  onError,
  typeLink,
  fallback,
  compact = false,
}: {
  /** Small pill instead of the big mic, once a note is saved. */
  compact?: boolean;
  releaseId: string;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  typeLink: ReactNode;
  fallback: ReactNode;
}) {
  const voice = useVoiceInput({
    enabled: true,
    onTranscript,
    endpoint: `/api/releases/${encodeURIComponent(releaseId)}/ideas/transcribe`,
    deniedMessage: 'Allow the microphone to talk your idea.',
  });
  const pressedAtRef = useRef(0);
  const stopOnReleaseRef = useRef(false);

  useEffect(() => {
    if (voice.error) {
      onError(voice.error);
      voice.clearError();
    }
  }, [voice, onError]);

  if (!voice.supported) return <>{fallback}</>;

  const busy = voice.state === 'requesting' || voice.state === 'transcribing';
  const recording = voice.state === 'recording';

  const onDown = () => {
    if (recording) {
      // The second tap of tap-to-talk.
      stopOnReleaseRef.current = false;
      voice.toggle();
      return;
    }
    if (voice.state !== 'idle') return;
    onError('');
    pressedAtRef.current = Date.now();
    stopOnReleaseRef.current = true;
    voice.toggle();
  };

  const onUp = () => {
    // Held long enough to be a hold: let go to stop. A quick tap keeps recording.
    if (stopOnReleaseRef.current && Date.now() - pressedAtRef.current > 400 && voice.state === 'recording') {
      voice.toggle();
    }
    stopOnReleaseRef.current = false;
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!busy) voice.toggle();
    }
  };

  const label = recording
    ? `${COPY.listening} ${Math.floor(voice.elapsed / 60)}:${String(voice.elapsed % 60).padStart(2, '0')}`
    : voice.state === 'transcribing'
      ? COPY.working
      : COPY.holdToTalk;

  return (
    <>
      <button
        type="button"
        aria-label={recording ? 'Stop' : COPY.holdToTalk}
        aria-pressed={recording}
        onPointerDown={(event) => {
          event.preventDefault();
          onDown();
        }}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onPointerCancel={onUp}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={onKey}
        disabled={busy}
        style={{ touchAction: 'none' }}
        className={
          compact
            ? `motion-focus inline-flex min-h-11 select-none items-center gap-2 rounded-full px-4 text-sm font-medium text-content-inverse ${
                recording ? 'bg-brand-hover ring-4 ring-brand/25' : 'bg-brand hover:bg-brand-hover'
              } disabled:opacity-70`
            : `motion-focus flex h-16 w-16 select-none items-center justify-center rounded-full text-content-inverse transition-transform duration-fast ${
                recording ? 'scale-110 bg-brand-hover ring-4 ring-brand/25' : 'bg-brand hover:bg-brand-hover'
              } disabled:opacity-70`
        }
      >
        {voice.state === 'transcribing' ? (
          <Loader2 className={compact ? 'h-4 w-4 animate-spin' : 'h-6 w-6 animate-spin'} aria-hidden="true" />
        ) : (
          <Mic className={compact ? 'h-4 w-4' : 'h-6 w-6'} aria-hidden="true" />
        )}
        {compact ? (recording || busy ? label : COPY.addAnother) : null}
      </button>
      {compact ? null : (
        <p aria-live="polite" className="mt-1 text-xs text-content-tertiary">
          {label}
        </p>
      )}
      {recording || busy ? null : typeLink}
    </>
  );
}

/** "Who should chime in?": tick teammates already on the rollout, or add someone by link. */
function WhoShouldChimeIn({
  releaseId,
  releaseTitle,
  people,
  canInvite,
  senderName,
  onDone,
}: {
  releaseId: string;
  releaseTitle: string;
  people: IdeasPerson[];
  canInvite: boolean;
  senderName: string;
  onDone: () => void;
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
      window.setTimeout(onDone, 1200);
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : 'Could not ask them.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-4 border-t border-stroke-default pt-4">
      <p className="text-sm font-semibold text-content-primary">{COPY.whoTitle}</p>
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
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-stroke-strong bg-bg-base px-3 text-base text-content-primary placeholder:text-content-tertiary"
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
  stacked = false,
  onShared,
}: {
  releaseId: string;
  releaseTitle: string;
  senderName: string;
  path: 'solo' | 'manager';
  autoStart?: boolean;
  /** The guided invite step: the WhatsApp button leads and the two stack. */
  stacked?: boolean;
  /** Called once the link was sent to WhatsApp or copied. */
  onShared?: () => void;
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
    onShared?.();
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
      onShared?.();
    }
  };

  return (
    <div className={stacked ? 'w-full max-w-[16rem]' : undefined}>
      <div className={stacked ? 'mt-2 flex flex-col items-stretch gap-2' : 'mt-2 flex flex-wrap items-center gap-2'}>
        <Button
          size="md"
          variant={stacked ? 'primary' : 'secondary'}
          className="min-h-11"
          leftIcon={<MessageCircle className="h-4 w-4" aria-hidden="true" />}
          onClick={() => void shareWhatsApp()}
          disabled={making && !link}
        >
          {stacked ? COPY.inviteWhatsApp : COPY.shareWhatsApp}
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

'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@urganize/ui';
import { Check, Copy, Loader2, MessageCircle, Mic, Sparkles, UserPlus } from '@/components/icons';
import { useVoiceInput } from '@/components/chappi/useVoiceInput';
import { buildWhatsAppShareUrl } from '@/lib/access-gate';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { useAuthStore } from '@/lib/auth-store';
import { formatRelativeTime } from '@/lib/relative-time';
import {
  MAX_IDEA_LENGTH,
  ROLLOUT_IDEAS_COPY as COPY,
  chimeInShareText,
  ideasPathFor,
  ideasToExtraNotes,
  isRolloutIdeasEnabled,
  withInviteNext,
  type IdeaNote,
  type IdeasPath,
  type IdeasPerson,
} from '@/lib/rollout-ideas';
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
}: {
  /** The simple plan view: a short read-only summary with Edit, not the full card. */
  condensed?: boolean;
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
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [askingWho, setAskingWho] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fromVoiceRef = useRef(false);

  const load = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const response = await fetch(`/api/releases/${encodeURIComponent(release.id)}/ideas`, {
        headers,
        cache: 'no-store',
      });
      if (!response.ok) return;
      setData((await response.json()) as IdeasData);
    } catch {
      // The card simply stays away when its read fails.
    }
  }, [release.id]);

  // The page keys this card by rollout, so a new rollout is a fresh mount.
  useEffect(() => {
    if (ENABLED) void load();
  }, [load]);

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

  if (!ENABLED || !data) return null;
  if (hasPlan && data.notes.length === 0) return null;

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
      // A manager is asked who should chime in after their note.
      if (path === 'manager') setAskingWho(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the note.');
    } finally {
      setSaving(false);
    }
  };

  if (condensed && !expanded && data.notes.length > 0 && !typing && !askingWho) {
    return (
      <section
        aria-labelledby={`ideas-title-${release.id}`}
        className="rounded-[20px] border border-stroke-default bg-bg-surface px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <h2 id={`ideas-title-${release.id}`} className="text-base font-semibold text-content-primary">
            Your idea
          </h2>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="motion-focus ml-auto min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary underline hover:text-content-primary"
          >
            Edit
          </button>
        </div>
        <p className="line-clamp-3 break-words text-sm text-content-secondary">
          {data.notes.map((note) => note.content).join(' ')}
        </p>
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

  return (
    <section
      aria-labelledby={`ideas-title-${release.id}`}
      className="rounded-[20px] border border-stroke-default bg-bg-surface px-5 py-4"
    >
      <h2 id={`ideas-title-${release.id}`} className="text-base font-semibold text-content-primary">
        {title}
      </h2>

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
        <div className={hasNotes ? 'mt-3 flex flex-wrap items-center gap-2' : 'mt-4 flex flex-col items-center gap-1'}>
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

      {error ? (
        <p role="alert" className="mt-2 text-sm text-status-error">
          {error}
        </p>
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

  const toggle = (userId: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const ask = async () => {
    if (!picked.size || sending) return;
    setSending(true);
    setError('');
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error('Sign in again.');
      const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/ideas/ask`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(picked) }),
      });
      const payload = (await response.json().catch(() => ({}))) as { asked?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not ask them.');
      captureAnalyticsEvent({
        name: 'chime_in_requested',
        properties: {
          count: payload.asked ?? picked.size,
          artist_ticked: people.some((person) => person.isArtist && picked.has(person.userId)),
        },
      });
      setSent(payload.asked ?? picked.size);
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

      {canInvite ? (
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
            {people.length ? (
              <Button size="md" className="min-h-11" onClick={() => void ask()} isLoading={sending} disabled={!picked.size}>
                {COPY.ask}
              </Button>
            ) : null}
            <button
              type="button"
              onClick={onDone}
              className="motion-focus min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary hover:text-content-primary"
            >
              {people.length || !adding ? COPY.skip : 'Done'}
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

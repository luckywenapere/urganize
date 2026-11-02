'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from '@/components/icons';
import { briefCall } from '@/components/releases/brief-shared';
import { WhoShouldChimeIn } from '@/components/workspace/RolloutIdeasCard';
import { IDEAS_CHANGED_EVENT } from '@/components/workspace/RolloutFirstSteps';
import { IDEA_ROUND_COPY, type IdeaRoundState, visibleIdeaNotes } from '@/lib/idea-round';
import type { IdeaNote, IdeasPerson } from '@/lib/rollout-ideas';
import { formatRelativeTime } from '@/lib/relative-time';
import { runBriefFromIdeas } from '@/lib/urgans-actions/client';
import { useAuthStore } from '@/lib/auth-store';

type IdeasPayload = {
  notes: IdeaNote[];
  people: IdeasPerson[];
  ownerName?: string | null;
  isOwner?: boolean;
  round?: { state: IdeaRoundState; canRun: boolean } | null;
};

/**
 * The "1 idea is in" card inside a rollout's session (Nov 2, 2026, founder:
 * ideas are typed or spoken to the chat box, and this card eases in under the
 * message). It is the old idea card's "ideas are in" state, on its own: the
 * ideas, who should chime in, and Close and write the brief. The record and
 * type boxes it used to sit under are gone; the chat box does both.
 *
 * `version` is the transcript's length, so a new idea added in chat reloads it
 * without remounting (and without replaying the entrance).
 */
export function ChappiIdeasCard({
  releaseId,
  releaseTitle,
  version,
}: {
  releaseId: string;
  releaseTitle: string;
  version: number;
}) {
  const router = useRouter();
  const viewerId = useAuthStore((state) => state.user?.id ?? '');
  const viewerName = useAuthStore((state) => String(state.user?.name || '').trim());
  const [data, setData] = useState<IdeasPayload | null>(null);
  const [asking, setAsking] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const result = await briefCall<IdeasPayload>(`/api/releases/${encodeURIComponent(releaseId)}/ideas`, { method: 'GET' });
    if (result.ok) setData(result.data);
  }, [releaseId]);

  useEffect(() => {
    void load();
  }, [load, version]);

  if (!data) return null;
  const state: IdeaRoundState = data.round?.state ?? 'open';
  const runner = Boolean(data.round?.canRun);
  const notes = visibleIdeaNotes(data.notes, { state, viewerId, seeAll: runner });
  if (notes.length === 0) return null;

  const closeAndWrite = async () => {
    if (closing) return;
    setClosing(true);
    setError('');
    const closed = await briefCall(`/api/releases/${encodeURIComponent(releaseId)}/ideas/round`, {
      method: 'POST',
      body: JSON.stringify({ action: 'close' }),
    });
    if (!closed.ok) {
      setClosing(false);
      setError(closed.error);
      return;
    }
    const written = await runBriefFromIdeas({ releaseId });
    setClosing(false);
    window.dispatchEvent(new Event(IDEAS_CHANGED_EVENT));
    if (!written.ok) {
      setError(written.error || 'Could not write the brief. Try again.');
      void load();
      return;
    }
    router.push(`/dashboard?release=${encodeURIComponent(releaseId)}&scene=brief`);
  };

  return (
    <section
      aria-label={IDEA_ROUND_COPY.inCount(notes.length)}
      className="swipe-chat-card-in rounded-[20px] border border-stroke-default bg-bg-surface px-5 py-4 shadow-sm"
    >
      <h3 className="font-display text-lg text-content-primary">{IDEA_ROUND_COPY.inCount(notes.length)}</h3>
      <ul className="mt-3 space-y-3">
        {notes.map((note) => (
          <li key={note.id} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-subtle text-xs font-semibold text-brand"
            >
              {note.authorInitials}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] text-content-tertiary">
                {note.isOwn ? 'You' : note.authorName} · {formatRelativeTime(note.createdAt)}
              </span>
              <span className="block break-words text-[15px] text-content-primary">{note.content}</span>
            </span>
          </li>
        ))}
      </ul>

      {asking ? (
        <div className="mt-4 border-t border-stroke-subtle pt-4">
          <WhoShouldChimeIn
            bare
            releaseId={releaseId}
            releaseTitle={releaseTitle}
            people={data.people ?? []}
            canInvite={runner}
            senderName={viewerName}
            onDone={() => {
              setAsking(false);
              void load();
            }}
          />
        </div>
      ) : runner && state === 'open' ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stroke-subtle pt-4">
          <button
            type="button"
            onClick={() => void closeAndWrite()}
            disabled={closing}
            className="motion-focus motion-press inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            {closing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {IDEA_ROUND_COPY.close}
          </button>
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="motion-focus min-h-11 rounded-full px-3 text-sm font-medium text-content-secondary underline hover:text-content-primary"
          >
            Ask the team to chime in
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
      {runner && state === 'open' && !asking ? (
        <p className="mt-2 text-xs text-content-tertiary">Writing the brief uses UrgAns credits.</p>
      ) : null}
    </section>
  );
}

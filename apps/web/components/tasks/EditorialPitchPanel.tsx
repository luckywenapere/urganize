'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Sparkles } from '@/components/icons';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { UrgansLockedSheet } from '@/components/urgans-actions/UrgansLockedSheet';
import { useCreditBalance } from '@/components/urgans-actions/useCreditBalance';
import { isCreditsEnabled } from '@/lib/credits/config';
import { embeddedCostLine } from '@/lib/credits/copy';
import {
  EMPTY_PITCH_FIELDS,
  PITCH_COPY_LABEL,
  PITCH_DESCRIPTION_MAX,
  PITCH_DRAFT_LABEL,
  PITCH_FIELD_KEYS,
  PITCH_FIELD_LABELS,
  SPOTIFY_FOR_ARTISTS_LABEL,
  SPOTIFY_FOR_ARTISTS_URL,
  SPOTIFY_PITCH_STEPS,
  allPitchFieldsFilled,
  pitchCounterCopy,
  type PitchFieldKey,
  type PitchFields,
} from '@/lib/editorial-pitch';
import { openExternalUrl } from '@/lib/external-link';
import { supabase } from '@/lib/supabase/client';
import { runDraftSpotifyPitch } from '@/lib/urgans-actions/client';

type PitchPayload = {
  fields: PitchFields;
  skippedAt: string | null;
  blocked: string | null;
  canDraft: boolean;
};

type EditorialPitchPanelProps = {
  taskId: string;
  releaseId: string | null;
};

const FIELD_CLASS =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary hover:border-content-secondary';
const COPY_BUTTON_CLASS =
  'motion-focus motion-press inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-stroke-control px-2 text-xs font-semibold text-content-secondary transition-colors hover:border-content-secondary hover:text-content-primary';
const DRAFT_BUTTON_CLASS =
  'motion-focus motion-press inline-flex h-9 items-center gap-2 border border-brand/25 bg-brand px-3.5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';

const FIELD_HINTS: Record<PitchFieldKey, string> = {
  genre: 'For example: Afrobeats, R&B',
  moods: 'For example: warm, late night',
  instruments: 'For example: log drum, guitar',
  description: 'What the song is about and how it sounds.',
};

async function authToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

/**
 * The Spotify editorial pitch's four form fields, inside the pitch task's
 * pop-up. A manager copies each one into Spotify for Artists, so every field has
 * a Copy button and the description carries Spotify's 500 character counter.
 *
 * "Draft my pitch" is only offered when the server says this caller may use it
 * (Manager and up, with embedded actions switched on): a Solo team sees the
 * fields empty and no button. It fills only what is empty, so it can never
 * overwrite typed text.
 */
// The caller keys this by task id, so switching activities mounts a fresh panel
// with empty state; nothing here resets state when the task changes.
export function EditorialPitchPanel({ taskId, releaseId }: EditorialPitchPanelProps) {
  const [data, setData] = useState<PitchPayload | null>(null);
  const [values, setValues] = useState<PitchFields>({ ...EMPTY_PITCH_FIELDS });
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [lockedMessage, setLockedMessage] = useState('');
  const [copied, setCopied] = useState<PitchFieldKey | null>(null);
  const savedRef = useRef<PitchFields>({ ...EMPTY_PITCH_FIELDS });
  const { balance, refresh: refreshBalance } = useCreditBalance();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await authToken();
        if (!token) return;
        const response = await fetch(`/api/tasks/${taskId}/editorial-pitch`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = (await response.json().catch(() => ({}))) as { pitch?: PitchPayload; error?: string };
        if (cancelled) return;
        if (!response.ok || !body.pitch) {
          setLoadError(body.error || 'Could not load the pitch.');
          return;
        }
        savedRef.current = body.pitch.fields;
        setValues(body.pitch.fields);
        setData(body.pitch);
      } catch {
        if (!cancelled) setLoadError('Could not load the pitch.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const save = useCallback(
    async (next: PitchFields) => {
      const prior = savedRef.current;
      if (PITCH_FIELD_KEYS.every((key) => prior[key] === next[key])) return;
      setSaveError('');
      try {
        const token = await authToken();
        const response = await fetch(`/api/tasks/${taskId}/editorial-pitch`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: next }),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          setSaveError(body.error || 'Could not save that.');
          return;
        }
        savedRef.current = next;
      } catch {
        setSaveError('Could not save that. Check your connection and try again.');
      }
    },
    [taskId]
  );

  const draft = useCallback(async () => {
    if (!releaseId) return;
    setDrafting(true);
    setDraftError('');
    const result = await runDraftSpotifyPitch({ releaseId, taskId });
    setDrafting(false);
    // The run has settled, so the balance has moved (a failed run costs nothing).
    void refreshBalance();
    if (!result.ok) {
      if (result.planRequired) {
        setLockedMessage(result.error);
        return;
      }
      setDraftError(result.error);
      return;
    }
    savedRef.current = result.fields;
    setValues(result.fields);
  }, [releaseId, taskId, refreshBalance]);

  const copy = useCallback(async (key: PitchFieldKey, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
    } catch {
      // Clipboard can be blocked; the text is still on screen to select.
    }
  }, []);

  if (loadError) {
    return (
      <p className="text-sm text-status-error" role="alert">
        {loadError}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="space-y-2" aria-hidden="true">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonBlock className="h-24 w-full" />
      </div>
    );
  }

  const skipped = Boolean(data.skippedAt);
  const showDraft = data.canDraft && !skipped && !allPitchFieldsFilled(values);

  return (
    <section className="rounded-[24px] border border-stroke-default bg-bg-elevated/50 p-4">
      <h3 className="text-sm font-semibold text-content-primary">Spotify pitch details</h3>

      {data.blocked ? (
        <p className="mt-2 text-sm text-content-secondary" role="status">
          {data.blocked}
        </p>
      ) : null}
      {skipped ? (
        // TODO(copy): the brief gives no text for a skipped pitch's panel.
        <p className="mt-2 text-sm text-content-secondary" role="status">
          You released without a Spotify pitch.
        </p>
      ) : null}

      {!skipped ? (
        <div className="mt-2">
          <p className="text-sm text-content-secondary">{SPOTIFY_PITCH_STEPS}</p>
          <button
            type="button"
            onClick={() => void openExternalUrl(SPOTIFY_FOR_ARTISTS_URL)}
            className={`${COPY_BUTTON_CLASS} mt-2 h-9 px-3 text-sm`}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {SPOTIFY_FOR_ARTISTS_LABEL}
          </button>
        </div>
      ) : null}

      <div className="mt-3 space-y-3">
        {PITCH_FIELD_KEYS.map((key) => {
          const value = values[key];
          const isDescription = key === 'description';
          const id = `pitch-field-${key}`;
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label htmlFor={id} className="text-xs font-semibold text-content-secondary">
                  {PITCH_FIELD_LABELS[key]}
                </label>
                <button
                  type="button"
                  onClick={() => void copy(key, value)}
                  disabled={!value.trim()}
                  className={`${COPY_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
                  aria-label={`${PITCH_COPY_LABEL} ${PITCH_FIELD_LABELS[key].toLowerCase()}`}
                >
                  {copied === key ? (
                    <Check className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3 w-3" aria-hidden="true" />
                  )}
                  {/* TODO(copy): the brief names the Copy button but not what it says once pressed. */}
                  {copied === key ? 'Copied' : PITCH_COPY_LABEL}
                </button>
              </div>
              {isDescription ? (
                <textarea
                  id={id}
                  value={value}
                  maxLength={PITCH_DESCRIPTION_MAX}
                  rows={5}
                  placeholder={FIELD_HINTS[key]}
                  onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                  onBlur={() => void save(values)}
                  className={`${FIELD_CLASS} resize-y`}
                />
              ) : (
                <input
                  id={id}
                  type="text"
                  value={value}
                  placeholder={FIELD_HINTS[key]}
                  maxLength={200}
                  onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                  onBlur={() => void save(values)}
                  className={FIELD_CLASS}
                />
              )}
              {isDescription ? (
                <p className="mt-1 text-right text-xs text-content-tertiary">{pitchCounterCopy(value.length)}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {saveError ? (
        <p className="mt-3 text-xs text-status-error" role="alert">
          {saveError}
        </p>
      ) : null}

      {showDraft ? (
        <div className="mt-4">
          <button type="button" onClick={() => void draft()} disabled={drafting} className={DRAFT_BUTTON_CLASS}>
            {drafting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {drafting ? 'Writing…' : PITCH_DRAFT_LABEL}
          </button>
          {isCreditsEnabled() ? (
            <p className="mt-2 text-xs text-content-tertiary">
              {embeddedCostLine('release.draft_spotify_pitch', balance)}
            </p>
          ) : null}
        </div>
      ) : null}

      {draftError ? (
        <p className="mt-3 text-xs text-status-error" role="alert">
          {draftError}
        </p>
      ) : null}

      <UrgansLockedSheet
        open={Boolean(lockedMessage)}
        message={lockedMessage}
        actionType="release.draft_spotify_pitch"
        onClose={() => setLockedMessage('')}
      />
    </section>
  );
}

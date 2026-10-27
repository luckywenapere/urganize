'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ARTIST_FACT_TOPICS,
  ARTIST_FACT_TOPIC_LABEL,
  MAX_FACT_LENGTH,
  factSourceLine,
  type ArtistFact,
  type ArtistFactTopic,
} from '@/lib/artist-facts';
import {
  fetchArtistFacts,
  removeArtistFact,
  saveArtistFactByHand,
  type ArtistFactsPayload,
} from '@/lib/artist-facts-client';
import { Modal } from './ArtistCatalogueCard';

// "What UrgAns remembers" on the artist page (2026-10-27, mocks in
// docs/mocks/artist-memory/mock.html). Each line is one fact UrgAns reads
// before it answers or plans for this artist. Tap a line to change or remove
// it; Add writes one by hand. UrgAns saves from chat only after a card.

const primaryButton =
  'motion-press inline-flex min-h-11 items-center justify-center rounded-full bg-content-primary px-5 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'motion-press inline-flex min-h-11 items-center justify-center rounded-full border border-stroke-default bg-bg-surface px-5 text-sm font-medium text-content-secondary transition-colors duration-fast ease-standard hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-50';
const smallButton =
  'motion-focus motion-press inline-flex min-h-9 items-center rounded-full border border-stroke-default px-3.5 text-xs font-medium text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-50';

type Editing = { fact: ArtistFact | null };

function FactSheet({
  artistId,
  artistName,
  editing,
  onClose,
  onSaved,
}: {
  artistId: string;
  artistName: string;
  editing: Editing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fact = editing.fact;
  const [topic, setTopic] = useState<ArtistFactTopic>(fact?.topic ?? 'playlist_pitching');
  const [value, setValue] = useState(fact?.value ?? '');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setWorking(true);
    setError('');
    const problem = await saveArtistFactByHand(artistId, { topic, value, factId: fact?.id ?? null });
    setWorking(false);
    if (problem) setError(problem);
    else onSaved();
  };

  const remove = async () => {
    if (!fact) return;
    setWorking(true);
    setError('');
    const problem = await removeArtistFact(artistId, fact.id);
    setWorking(false);
    if (problem) setError(problem);
    else onSaved();
  };

  return (
    <Modal titleId="artist-fact-title" onClose={onClose}>
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary">{artistName}</p>
      <h2 id="artist-fact-title" className="mt-1 font-display text-xl font-semibold text-content-primary">
        {fact ? 'Change what UrgAns remembers' : 'Tell UrgAns something'}
      </h2>

      <p className="mt-4 text-[13px] text-content-secondary">About</p>
      <div role="radiogroup" aria-label="About" className="mt-2 flex flex-wrap gap-2">
        {ARTIST_FACT_TOPICS.map((option) => {
          const on = option === topic;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTopic(option)}
              className={`motion-focus motion-press min-h-9 rounded-full border px-3.5 text-[13px] transition-colors ${
                on
                  ? 'border-brand-primary bg-brand-primary/10 font-semibold text-brand-primary'
                  : 'border-stroke-default text-content-secondary hover:bg-bg-hover'
              }`}
            >
              {ARTIST_FACT_TOPIC_LABEL[option]}
            </button>
          );
        })}
      </div>

      <label htmlFor="artist-fact-value" className="mt-4 block text-[13px] text-content-secondary">
        What UrgAns should know
      </label>
      <textarea
        id="artist-fact-value"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={MAX_FACT_LENGTH}
        rows={2}
        disabled={working}
        placeholder="Don't pitch to playlists"
        className="mt-1.5 w-full resize-none rounded-lg border border-stroke-control bg-bg-base px-3 py-2.5 text-[15px] text-content-primary outline-none placeholder:text-content-tertiary focus:border-brand-primary"
      />

      {error ? (
        <p role="alert" className="mt-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={secondaryButton} onClick={onClose} disabled={working}>
          Cancel
        </button>
        <button type="button" className={primaryButton} onClick={save} disabled={working || !value.trim()}>
          Save
        </button>
      </div>
      {fact ? (
        <button
          type="button"
          onClick={remove}
          disabled={working}
          className="motion-focus mt-4 text-sm font-semibold text-status-error disabled:opacity-50"
        >
          Remove
        </button>
      ) : null}
    </Modal>
  );
}

export function ArtistFactsCard({ artistId, artistName }: { artistId: string; artistName: string }) {
  const [data, setData] = useState<ArtistFactsPayload | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const load = useCallback(async () => {
    setData(await fetchArtistFacts(artistId));
  }, [artistId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A failed read hides the card rather than showing an empty memory that is
  // not really empty.
  if (!data) return null;

  return (
    <section className="rounded-xl border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-content-primary">What UrgAns remembers</h2>
        <button type="button" className={smallButton} onClick={() => setEditing({ fact: null })}>
          Add
        </button>
      </div>
      {data.facts.length === 0 ? (
        <p className="mt-2 text-sm text-content-tertiary">
          Nothing yet. Tell UrgAns in chat, like &quot;{artistName} doesn&apos;t want playlist pitching&quot;, or add it here.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-stroke-subtle">
          {data.facts.map((fact) => (
            <li key={fact.id}>
              <button
                type="button"
                onClick={() => setEditing({ fact })}
                className="motion-focus flex w-full items-center gap-3 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-content-tertiary">
                    {ARTIST_FACT_TOPIC_LABEL[fact.topic]}
                  </span>
                  <span className="block break-words text-[15px] font-semibold text-content-primary">{fact.value}</span>
                  <span className="block text-xs text-content-tertiary">
                    {factSourceLine(fact, {
                      isMe: Boolean(data.me && fact.saidBy === data.me),
                      name: fact.saidBy ? data.authors[fact.saidBy] ?? null : null,
                    })}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-content-tertiary">Edit</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <FactSheet
          artistId={artistId}
          artistName={artistName}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

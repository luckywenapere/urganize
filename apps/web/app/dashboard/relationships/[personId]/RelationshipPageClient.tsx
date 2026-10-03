'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import {
  describeLastContact,
  isRelationshipsPageEnabled,
  parseTagInput,
  RELATIONSHIPS_HREF,
} from '@/lib/relationships-page';
import { useRelationshipsStore } from '@/stores/useRelationshipsStore';

const PAGE_ENABLED = isRelationshipsPageEnabled();

const FIELD =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-base text-content-primary placeholder:text-content-tertiary hover:border-content-secondary';

export default function RelationshipPageClient() {
  const router = useRouter();
  const params = useParams<{ personId: string }>();
  const personId = decodeURIComponent(params?.personId ?? '');

  const authLoading = useAuthStore((state) => state.isLoading);
  const relationships = useRelationshipsStore((state) => state.relationships);
  const initialLoading = useRelationshipsStore((state) => state.isInitialLoading);
  const load = useRelationshipsStore((state) => state.load);
  const update = useRelationshipsStore((state) => state.update);
  const remove = useRelationshipsStore((state) => state.remove);

  const person = useMemo(() => relationships.find((item) => item.personId === personId) ?? null, [relationships, personId]);

  // Drafts hold only what has been edited, so a late-arriving load can never
  // overwrite what somebody is typing: an untouched field shows the saved value.
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<string | null>(null);
  const [tagsDraft, setTagsDraft] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [rateDraft, setRateDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!PAGE_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void load();
  }, [load, router]);

  if (!PAGE_ENABLED) return null;

  const loading = (authLoading || initialLoading) && !person;

  if (!person) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <BackLink />
        {loading ? (
          <div className="h-48 animate-pulse rounded-xl border border-stroke-default bg-bg-surface" aria-busy="true" />
        ) : (
          <p className="rounded-xl border border-dashed border-stroke-default p-6 text-center text-sm text-content-secondary">
            We could not find that person. They may have been removed.
          </p>
        )}
      </div>
    );
  }

  const label = labelDraft ?? person.label;
  const role = roleDraft ?? person.role;
  const tags = tagsDraft ?? person.tags.join(', ');
  const notes = notesDraft ?? person.notes;
  const rate = rateDraft ?? person.rateNote ?? '';
  const dirty =
    labelDraft !== null || roleDraft !== null || tagsDraft !== null || notesDraft !== null || rateDraft !== null;

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    // Only edited fields go up. An omitted key is left alone by the server.
    const patch: Parameters<typeof update>[1] = {};
    if (labelDraft !== null) patch.label = labelDraft;
    if (roleDraft !== null) patch.role = roleDraft;
    if (tagsDraft !== null) patch.tags = parseTagInput(tagsDraft);
    if (notesDraft !== null) patch.notes = notesDraft;
    if (rateDraft !== null) patch.rateNote = rateDraft.trim() ? rateDraft : null;
    const failure = await update(personId, patch);
    setSaving(false);
    if (failure) {
      setError(failure.error);
      return;
    }
    setLabelDraft(null);
    setRoleDraft(null);
    setTagsDraft(null);
    setNotesDraft(null);
    setRateDraft(null);
    setMessage('Saved.');
  }

  async function markContacted() {
    setError(null);
    setMessage(null);
    const failure = await update(personId, { lastContactAt: new Date().toISOString() });
    if (failure) setError(failure.error);
    else setMessage('Saved.');
  }

  async function handleRemove() {
    if (!window.confirm(`Remove ${person?.label} from your list? Your notes on them are deleted. They are not told.`)) {
      return;
    }
    const failure = await remove(personId);
    if (failure) {
      setError(failure.error);
      return;
    }
    router.replace(RELATIONSHIPS_HREF);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink />

      <header className="mb-6">
        <h1 className="break-words font-display text-2xl font-semibold text-content-primary">{person.label}</h1>
        <p className="mt-1 text-sm text-content-secondary">
          {[person.role || 'No role yet', describeLastContact(person.lastContactAt)].join(' · ')}
        </p>
        {person.claimed ? (
          <p className="mt-2 text-xs text-content-secondary">
            {person.profile
              ? `On Urganize${person.profile.city ? `, based in ${person.profile.city}` : ''}.`
              : 'On Urganize. Their own profile is private, so only what you wrote is shown.'}
          </p>
        ) : null}
      </header>

      <div className="space-y-4 rounded-xl border border-stroke-default bg-bg-surface p-4">
        <label className="block text-xs font-semibold text-content-secondary">
          Name you use for them
          <input
            className={`${FIELD} mt-1`}
            value={label}
            onChange={(event) => setLabelDraft(event.target.value)}
            maxLength={80}
            autoComplete="off"
          />
        </label>
        <label className="block text-xs font-semibold text-content-secondary">
          What they do
          <input
            className={`${FIELD} mt-1`}
            value={role}
            onChange={(event) => setRoleDraft(event.target.value)}
            maxLength={40}
            autoComplete="off"
          />
        </label>
        <label className="block text-xs font-semibold text-content-secondary">
          Tags
          <input
            className={`${FIELD} mt-1`}
            value={tags}
            onChange={(event) => setTagsDraft(event.target.value)}
            placeholder="Mixing, Lagos"
            autoComplete="off"
          />
        </label>
        <label className="block text-xs font-semibold text-content-secondary">
          What they charge
          <input
            className={`${FIELD} mt-1`}
            value={rate}
            onChange={(event) => setRateDraft(event.target.value)}
            maxLength={200}
            placeholder="A note for you, like 150k a song"
            autoComplete="off"
          />
        </label>
        <label className="block text-xs font-semibold text-content-secondary">
          Notes
          <textarea
            className={`${FIELD} mt-1 min-h-[120px]`}
            value={notes}
            onChange={(event) => setNotesDraft(event.target.value)}
            maxLength={4000}
          />
        </label>

        {person.email || person.phone ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {person.email ? (
              <div className="min-w-0">
                <dt className="text-xs font-semibold text-content-secondary">Email</dt>
                <dd className="mt-1 break-words text-content-primary">
                  <a className="underline-offset-2 hover:underline" href={`mailto:${person.email}`}>
                    {person.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {person.phone ? (
              <div className="min-w-0">
                <dt className="text-xs font-semibold text-content-secondary">Phone</dt>
                <dd className="mt-1 break-words text-content-primary">
                  <a className="underline-offset-2 hover:underline" href={`tel:${person.phone}`}>
                    {person.phone}
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div aria-live="polite">
          {error ? (
            <p role="alert" className="text-xs text-status-error">
              {error}
            </p>
          ) : message ? (
            <p role="status" className="text-xs text-content-secondary">
              {message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void markContacted()}
            className="motion-focus rounded-lg border border-stroke-control px-3 py-2 text-sm font-semibold text-content-secondary hover:border-content-secondary hover:text-content-primary"
          >
            We spoke today
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty || !label.trim()}
            className="motion-focus rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand/90 disabled:opacity-50"
          >
            {saving ? 'Saving' : 'Save'}
          </button>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => void handleRemove()}
          className="motion-focus rounded-lg px-3 py-2 text-sm font-semibold text-status-error hover:underline"
        >
          Remove from my list
        </button>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href={RELATIONSHIPS_HREF}
      className="motion-focus mb-4 inline-flex items-center gap-1 text-sm font-semibold text-content-secondary hover:text-content-primary"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      All people
    </Link>
  );
}

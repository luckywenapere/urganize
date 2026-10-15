'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import {
  isRelationshipsPageEnabled,
  RELATIONSHIPS_HREF,
  roleLine,
  timeSince,
  whatsappHref,
} from '@/lib/relationships-page';
import { MAX_INTERACTION } from '@/lib/relationships';
import { useRelationshipsStore } from '@/stores/useRelationshipsStore';
import { PersonFace } from '../PersonFace';

// One person on My People (URG-306, founder mock 2026-10-15): face, name,
// role · company, Reach and Log, and the short log. Tags, notes and the fee
// note are kept on the row but no longer shown (founder call).

const PAGE_ENABLED = isRelationshipsPageEnabled();

const FIELD =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-base text-content-primary placeholder:text-content-tertiary hover:border-content-secondary';

const BIG_BUTTON = 'motion-focus motion-press inline-flex h-[52px] flex-1 items-center justify-center rounded-2xl text-base font-bold';

type Draft = { label: string; role: string; company: string; email: string; phone: string };

export default function RelationshipPageClient() {
  const router = useRouter();
  const params = useParams<{ personId: string }>();
  const personId = decodeURIComponent(params?.personId ?? '');

  const authLoading = useAuthStore((state) => state.isLoading);
  const relationships = useRelationshipsStore((state) => state.relationships);
  const initialLoading = useRelationshipsStore((state) => state.isInitialLoading);
  const log = useRelationshipsStore((state) => state.interactions[personId]);
  const load = useRelationshipsStore((state) => state.load);
  const loadInteractions = useRelationshipsStore((state) => state.loadInteractions);
  const logInteraction = useRelationshipsStore((state) => state.logInteraction);
  const update = useRelationshipsStore((state) => state.update);
  const remove = useRelationshipsStore((state) => state.remove);

  const person = useMemo(() => relationships.find((item) => item.personId === personId) ?? null, [relationships, personId]);

  const [reachOpen, setReachOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  const [entry, setEntry] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!PAGE_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void load();
    void loadInteractions(personId);
  }, [load, loadInteractions, personId, router]);

  useEffect(() => {
    if (logging) entryRef.current?.focus();
  }, [logging]);

  if (!PAGE_ENABLED) return null;

  const loading = (authLoading || initialLoading) && !person;

  if (!person) {
    return (
      <div className="mx-auto w-full max-w-md">
        <BackLink />
        {loading ? (
          <div className="mx-auto mt-10 h-[110px] w-[110px] animate-pulse rounded-full bg-bg-surface" aria-busy="true" />
        ) : (
          <p className="py-10 text-center text-sm text-content-secondary">Not found.</p>
        )}
      </div>
    );
  }

  const line = roleLine(person);
  const reach = [
    person.phone ? { label: 'WhatsApp', href: whatsappHref(person.phone), external: true } : null,
    person.phone ? { label: 'Call', href: `tel:${person.phone}`, external: false } : null,
    person.email ? { label: 'Email', href: `mailto:${person.email}`, external: false } : null,
  ].filter((item): item is { label: string; href: string; external: boolean } => item !== null);

  function openEdit() {
    if (!person) return;
    setError(null);
    setReachOpen(false);
    setLogging(false);
    setDraft({
      label: person.label,
      role: person.role,
      company: person.company,
      email: person.email ?? '',
      phone: person.phone ?? '',
    });
  }

  function handleReach() {
    // Nothing to reach them on yet: the way to add it is the edit form.
    if (reach.length === 0) {
      openEdit();
      return;
    }
    setLogging(false);
    setReachOpen((open) => !open);
  }

  async function handleLog(event: FormEvent) {
    event.preventDefault();
    if (busy || !entry.trim()) return;
    setBusy(true);
    setError(null);
    const failure = await logInteraction(personId, entry);
    setBusy(false);
    if (failure) {
      setError(failure.error);
      return;
    }
    setEntry('');
    setLogging(false);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (busy || !draft || !person) return;
    // Only what changed goes up; an omitted key is left alone by the server.
    const patch: Parameters<typeof update>[1] = {};
    if (draft.label.trim() !== person.label) patch.label = draft.label;
    if (draft.role.trim() !== person.role) patch.role = draft.role;
    if (draft.company.trim() !== person.company) patch.company = draft.company;
    if (draft.email.trim() !== (person.email ?? '')) patch.email = draft.email.trim() || null;
    if (draft.phone.trim() !== (person.phone ?? '')) patch.phone = draft.phone.trim() || null;
    if (Object.keys(patch).length === 0) {
      setDraft(null);
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await update(personId, patch);
    setBusy(false);
    if (failure) {
      setError(failure.error);
      return;
    }
    setDraft(null);
  }

  async function handleRemove() {
    if (!person || !window.confirm(`Remove ${person.label}?`)) return;
    const failure = await remove(personId);
    if (failure) {
      setError(failure.error);
      return;
    }
    router.replace(RELATIONSHIPS_HREF);
  }

  return (
    <div className="mx-auto w-full max-w-md pb-10">
      <div className="flex items-center justify-between">
        <BackLink />
        {!draft ? (
          <button
            type="button"
            onClick={openEdit}
            className="motion-focus mb-4 rounded-md px-2 py-1 text-sm font-semibold text-content-secondary hover:text-content-primary"
          >
            Edit
          </button>
        ) : null}
      </div>

      <div className="pt-4 text-center">
        <PersonFace
          name={person.label}
          photoUrl={person.avatarUrl}
          size={110}
          className="mx-auto outline outline-2 outline-offset-4 outline-brand"
        />
        <h1 className="mt-5 break-words font-display text-[28px] leading-tight text-content-primary">{person.label}</h1>
        {line ? <p className="mt-1.5 font-mono text-[15px] text-content-secondary">{line}</p> : null}
      </div>

      {draft ? (
        <form onSubmit={handleSave} className="mt-6 space-y-3">
          <label className="block text-xs font-semibold text-content-secondary">
            Name
            <input
              className={`${FIELD} mt-1`}
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              maxLength={80}
              required
              autoComplete="off"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-content-secondary">
              Role
              <input
                className={`${FIELD} mt-1`}
                value={draft.role}
                onChange={(event) => setDraft({ ...draft, role: event.target.value })}
                maxLength={40}
                autoComplete="off"
              />
            </label>
            <label className="block text-xs font-semibold text-content-secondary">
              Company
              <input
                className={`${FIELD} mt-1`}
                value={draft.company}
                onChange={(event) => setDraft({ ...draft, company: event.target.value })}
                maxLength={60}
                autoComplete="off"
              />
            </label>
          </div>
          <label className="block text-xs font-semibold text-content-secondary">
            Email
            <input
              className={`${FIELD} mt-1`}
              type="email"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              autoComplete="off"
            />
          </label>
          <label className="block text-xs font-semibold text-content-secondary">
            Phone
            <input
              className={`${FIELD} mt-1`}
              type="tel"
              value={draft.phone}
              onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
              autoComplete="off"
            />
          </label>
          {error ? (
            <p role="alert" className="text-xs text-status-error">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => void handleRemove()}
              className="motion-focus rounded-lg px-1 py-2 text-sm font-semibold text-status-error hover:underline"
            >
              Remove
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="motion-focus rounded-lg px-3 py-2 text-sm font-semibold text-content-secondary hover:text-content-primary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !draft.label.trim()}
                className="motion-focus rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand/90 disabled:opacity-50"
              >
                {busy ? 'Saving' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <>
          <div className="mt-6 flex gap-2.5">
            <button
              type="button"
              aria-expanded={reach.length > 0 ? reachOpen : undefined}
              onClick={handleReach}
              className={`${BIG_BUTTON} bg-brand text-content-inverse hover:bg-brand/90`}
            >
              Reach
            </button>
            <button
              type="button"
              aria-expanded={logging}
              onClick={() => {
                setReachOpen(false);
                setError(null);
                setLogging((open) => !open);
              }}
              className={`${BIG_BUTTON} border border-stroke-default bg-bg-surface text-content-primary hover:border-stroke-strong`}
            >
              Log
            </button>
          </div>

          {reachOpen ? (
            <div className="mt-2.5 flex gap-2.5">
              {reach.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  onClick={() => setReachOpen(false)}
                  className="motion-focus motion-press inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-stroke-default bg-bg-surface text-sm font-semibold text-content-primary hover:border-stroke-strong"
                >
                  {item.label}
                </a>
              ))}
            </div>
          ) : null}

          {logging ? (
            <form onSubmit={handleLog} className="mt-2.5 flex gap-2">
              <input
                ref={entryRef}
                className={FIELD}
                value={entry}
                onChange={(event) => setEntry(event.target.value)}
                maxLength={MAX_INTERACTION}
                placeholder="What happened"
                aria-label="What happened"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={busy || !entry.trim()}
                className="motion-focus shrink-0 rounded-lg bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand/90 disabled:opacity-50"
              >
                {busy ? 'Saving' : 'Save'}
              </button>
            </form>
          ) : null}

          {error ? (
            <p role="alert" className="mt-2 text-xs text-status-error">
              {error}
            </p>
          ) : null}

          {log && log.length > 0 ? (
            <ul className="mt-5">
              {log.map((item) => (
                <li
                  key={item.id}
                  className="flex items-baseline justify-between gap-4 border-b border-stroke-default py-3 text-[15px] text-content-primary"
                >
                  <span className="min-w-0 break-words">{item.body}</span>
                  <span className="shrink-0 font-mono text-[13px] text-content-secondary">{timeSince(item.happenedAt)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
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
      My People
    </Link>
  );
}

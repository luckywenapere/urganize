'use client';

import { PullReveal } from '@/components/shared/PullReveal';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Handshake, X } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { filterRelationships } from '@/lib/relationships-filter';
import {
  isQuiet,
  isRelationshipsPageEnabled,
  lastTouch,
  relationshipHref,
  roleLine,
  sortByLastContact,
  timeSince,
} from '@/lib/relationships-page';
import { PersonFace } from './PersonFace';
import { useRelationshipsStore } from '@/stores/useRelationshipsStore';
import { ComingSoon } from '@/components/shell/ComingSoon';
import { PageHeader } from '@/components/shell/PageHeader';
import { ListToolbar } from '@/components/shell/ListToolbar';

const PAGE_ENABLED = isRelationshipsPageEnabled();

const FIELD =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-base text-content-primary placeholder:text-content-tertiary hover:border-content-secondary';

export default function RelationshipsPageClient() {
  const authLoading = useAuthStore((state) => state.isLoading);

  const relationships = useRelationshipsStore((state) => state.relationships);
  const flags = useRelationshipsStore((state) => state.flags);
  const initialLoading = useRelationshipsStore((state) => state.isInitialLoading);
  const loadError = useRelationshipsStore((state) => state.error);
  const load = useRelationshipsStore((state) => state.load);
  const create = useRelationshipsStore((state) => state.create);
  const dismissFlag = useRelationshipsStore((state) => state.dismissFlag);

  const [query, setQuery] = useState('');
  const [quietOnly, setQuietOnly] = useState(false);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [flagError, setFlagError] = useState<string | null>(null);

  useEffect(() => {
    // While the page is switched off the area opens to its coming-soon screen
    // (below) instead of bouncing. The flag is inlined at build time, so there
    // is no server-side gate.
    if (!PAGE_ENABLED) return;
    void load();
  }, [load]);

  // Tags, notes and the fee note are kept on every row but no longer shown or
  // filtered on (founder call, 2026-10-15).
  const quietCount = useMemo(() => relationships.filter((person) => isQuiet(person)).length, [relationships]);
  const visible = useMemo(
    () =>
      sortByLastContact(
        filterRelationships(relationships, { query }).filter((person) => !quietOnly || isQuiet(person))
      ),
    [relationships, query, quietOnly]
  );

  if (!PAGE_ENABLED) return <ComingSoon area="relationships" />;

  const loading = (authLoading || initialLoading) && relationships.length === 0;
  const filtering = Boolean(query.trim() || quietOnly);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    const result = await create({
      label: name,
      role: newRole,
      company,
      email,
      phone,
    });
    setSaving(false);
    if ('error' in result) {
      setFormError(result.error);
      return;
    }
    setName('');
    setNewRole('');
    setCompany('');
    setEmail('');
    setPhone('');
    setAdding(false);
    setFormMessage(result.created ? null : 'Already on your list.');
  }

  async function handleDismiss(flagId: string) {
    setFlagError(null);
    const failure = await dismissFlag(flagId);
    if (failure) setFlagError(failure.error);
  }

  return (
    <div>
      <PageHeader
        action={
          !adding ? (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setFormMessage(null);
                setFormError(null);
              }}
              className="motion-focus motion-press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-content-primary px-6 text-sm font-semibold text-content-inverse hover:opacity-90"
            >
              Add person
            </button>
          ) : null
        }
      />

      {formMessage && !adding ? (
        <p
          role="status"
          className="mb-4 rounded-lg border border-stroke-default bg-bg-surface px-3 py-2 text-sm text-content-secondary"
        >
          {formMessage}
        </p>
      ) : null}

      {flags.length > 0 ? (
        <section
          aria-label="Possible duplicates"
          className="mb-4 rounded-xl border border-stroke-default bg-bg-surface p-4"
        >
          <h2 className="text-sm font-semibold text-content-primary">These may be the same person</h2>
          <ul className="mt-2 space-y-2">
            {flags.map((flag) => (
              <li key={flag.id} className="flex items-center justify-between gap-3 text-sm text-content-secondary">
                <span className="min-w-0 break-words">
                  <Link
                    href={relationshipHref(flag.a.personId)}
                    className="font-semibold text-content-primary underline-offset-2 hover:underline"
                  >
                    {flag.a.label}
                  </Link>
                  {' and '}
                  <Link
                    href={relationshipHref(flag.b.personId)}
                    className="font-semibold text-content-primary underline-offset-2 hover:underline"
                  >
                    {flag.b.label}
                  </Link>
                </span>
                <button
                  type="button"
                  onClick={() => void handleDismiss(flag.id)}
                  className="motion-focus shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-content-secondary hover:text-content-primary"
                >
                  Not the same
                </button>
              </li>
            ))}
          </ul>
          {flagError ? (
            <p role="alert" className="mt-2 text-xs text-status-error">
              {flagError}
            </p>
          ) : null}
        </section>
      ) : null}

      {adding ? (
        <form onSubmit={handleAdd} className="mb-6 space-y-3 rounded-xl border border-stroke-default bg-bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-content-primary">Add a person</h2>
            <button
              type="button"
              onClick={() => setAdding(false)}
              aria-label="Close"
              className="motion-focus rounded-md p-1 text-content-tertiary hover:text-content-primary"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <label className="block text-xs font-semibold text-content-secondary">
            Name
            <input
              className={`${FIELD} mt-1`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
              autoComplete="off"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-content-secondary">
              Role
              <input
                className={`${FIELD} mt-1`}
                value={newRole}
                onChange={(event) => setNewRole(event.target.value)}
                maxLength={40}
                placeholder="A&R"
                autoComplete="off"
              />
            </label>
            <label className="block text-xs font-semibold text-content-secondary">
              Company
              <input
                className={`${FIELD} mt-1`}
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                maxLength={60}
                autoComplete="off"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-content-secondary">
              Email
              <input
                className={`${FIELD} mt-1`}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="block text-xs font-semibold text-content-secondary">
              Phone
              <input
                className={`${FIELD} mt-1`}
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="off"
              />
            </label>
          </div>
          {formError ? (
            <p role="alert" className="text-xs text-status-error">
              {formError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="motion-focus rounded-lg px-3 py-2 text-sm font-semibold text-content-secondary hover:text-content-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="motion-focus rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand/90 disabled:opacity-50"
            >
              {saving ? 'Adding' : 'Add'}
            </button>
          </div>
        </form>
      ) : null}

      {relationships.length > 0 ? (
        <PullReveal filtering={filtering}>
          {/* In the tab row on a computer, one compact row with a Filters
              sheet on a phone (founder mock, 2026-10-11). */}
          <ListToolbar
            className="mb-4"
            search={{
              value: query,
              onChange: setQuery,
              placeholder: 'Search',
              label: 'Search people',
            }}
          />
        </PullReveal>
      ) : null}

      {quietCount > 0 || quietOnly ? (
        <div className="mb-2 flex gap-2" role="group" aria-label="Show">
          <button
            type="button"
            aria-pressed={!quietOnly}
            onClick={() => setQuietOnly(false)}
            className={`motion-focus motion-press rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${
              quietOnly
                ? 'border-stroke-default text-content-secondary hover:text-content-primary'
                : 'border-content-primary bg-content-primary text-content-inverse'
            }`}
          >
            All
          </button>
          <button
            type="button"
            aria-pressed={quietOnly}
            onClick={() => setQuietOnly((value) => !value)}
            className={`motion-focus motion-press rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${
              quietOnly
                ? 'border-brand bg-brand text-content-inverse'
                : 'border-brand/50 text-brand hover:border-brand'
            }`}
          >
            Quiet {quietCount}
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-[76px] animate-pulse rounded-xl bg-bg-surface" />
          ))}
        </div>
      ) : loadError && relationships.length === 0 ? (
        <div role="alert" className="rounded-xl border border-stroke-default bg-bg-surface p-6 text-center">
          <p className="text-sm text-content-primary">{loadError}</p>
          <button
            type="button"
            onClick={() => void load({ force: true })}
            className="motion-focus mt-3 rounded-lg px-3 py-2 text-sm font-semibold text-content-secondary hover:text-content-primary"
          >
            Try again
          </button>
        </div>
      ) : relationships.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stroke-default p-8 text-center">
          <Handshake className="mx-auto h-6 w-6 text-content-tertiary" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-content-primary">Nobody here yet</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stroke-default p-6 text-center text-sm text-content-secondary">
          {filtering ? 'Nobody matches that.' : 'Nobody here yet.'}
        </p>
      ) : (
        <ul className="-mx-2">
          {visible.map((person) => {
            const quiet = isQuiet(person);
            const line = roleLine(person);
            return (
              <li key={person.personId}>
                <Link
                  href={relationshipHref(person.personId)}
                  className="motion-focus flex items-center gap-3.5 rounded-xl px-2 py-3 transition-colors hover:bg-bg-surface"
                >
                  <PersonFace name={person.label} photoUrl={person.avatarUrl} size={52} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-base text-content-primary">{person.label}</h2>
                    {line ? (
                      <p className="mt-0.5 truncate font-mono text-[13px] text-content-secondary">{line}</p>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 font-mono text-[13px] ${quiet ? 'text-brand' : 'text-content-secondary'}`}
                  >
                    {timeSince(lastTouch(person))}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

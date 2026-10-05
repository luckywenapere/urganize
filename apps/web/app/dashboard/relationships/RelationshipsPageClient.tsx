'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Handshake, X } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { distinctRoles, distinctTags, filterRelationships } from '@/lib/relationships-filter';
import {
  describeLastContact,
  isRelationshipsPageEnabled,
  parseTagInput,
  relationshipHref,
} from '@/lib/relationships-page';
import { useRelationshipsStore } from '@/stores/useRelationshipsStore';
import { ComingSoon } from '@/components/shell/ComingSoon';
import { PageHeader } from '@/components/shell/PageHeader';

const PAGE_ENABLED = isRelationshipsPageEnabled();

const STALE_DAYS = 60;

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
  const [role, setRole] = useState('');
  const [tag, setTag] = useState('');
  const [staleOnly, setStaleOnly] = useState(false);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tags, setTags] = useState('');
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

  const roles = useMemo(() => distinctRoles(relationships), [relationships]);
  const allTags = useMemo(() => distinctTags(relationships), [relationships]);
  const visible = useMemo(
    () =>
      filterRelationships(relationships, {
        query,
        role: role || undefined,
        tag: tag || undefined,
        staleDays: staleOnly ? STALE_DAYS : undefined,
      }),
    [relationships, query, role, tag, staleOnly]
  );

  if (!PAGE_ENABLED) return <ComingSoon area="relationships" />;

  const loading = (authLoading || initialLoading) && relationships.length === 0;
  const filtering = Boolean(query.trim() || role || tag || staleOnly);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    const result = await create({
      label: name,
      role: newRole,
      email,
      phone,
      tags: parseTagInput(tags),
    });
    setSaving(false);
    if ('error' in result) {
      setFormError(result.error);
      return;
    }
    setName('');
    setNewRole('');
    setEmail('');
    setPhone('');
    setTags('');
    setAdding(false);
    setFormMessage(
      result.alreadyKnown
        ? 'You already had this person, so nothing new was added.'
        : result.flagged > 0
          ? 'Added. This looks like somebody already on your list, so check the note below.'
          : 'Added.'
    );
  }

  async function handleDismiss(flagId: string) {
    setFlagError(null);
    const failure = await dismissFlag(flagId);
    if (failure) setFlagError(failure.error);
  }

  return (
    <div>
      <PageHeader
        title="Relationships"
        info="Everyone your team works with, with your own notes. Only your team sees them."
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
          <label className="block text-xs font-semibold text-content-secondary">
            What they do
            <input
              className={`${FIELD} mt-1`}
              value={newRole}
              onChange={(event) => setNewRole(event.target.value)}
              maxLength={40}
              placeholder="Producer, DJ, video director"
              autoComplete="off"
            />
          </label>
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
          <label className="block text-xs font-semibold text-content-secondary">
            Tags
            <input
              className={`${FIELD} mt-1`}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="Mixing, Lagos"
              autoComplete="off"
            />
          </label>
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
        <div className="mb-4 space-y-3">
          <input
            className={FIELD}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, role or tag"
            aria-label="Search people"
            autoComplete="off"
          />
          <div className="flex flex-wrap items-center gap-2">
            {roles.length > 0 ? (
              <select
                className={`${FIELD} w-auto`}
                value={role}
                onChange={(event) => setRole(event.target.value)}
                aria-label="Filter by what they do"
              >
                <option value="">Any role</option>
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            ) : null}
            {allTags.length > 0 ? (
              <select
                className={`${FIELD} w-auto`}
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                aria-label="Filter by tag"
              >
                <option value="">Any tag</option>
                {allTags.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              aria-pressed={staleOnly}
              onClick={() => setStaleOnly((value) => !value)}
              className={`motion-focus rounded-lg border px-3 py-2 text-sm font-semibold ${
                staleOnly
                  ? 'border-brand bg-brand/10 text-content-primary'
                  : 'border-stroke-control text-content-secondary hover:border-content-secondary'
              }`}
            >
              Not in touch for {STALE_DAYS} days
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-[72px] animate-pulse rounded-xl border border-stroke-default bg-bg-surface" />
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
          <p className="mt-1 text-sm text-content-secondary">
            Add the producers, DJs and editors you work with, and keep your own notes on each.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stroke-default p-6 text-center text-sm text-content-secondary">
          {filtering ? 'Nobody matches that.' : 'Nobody here yet.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((person) => (
            <li key={person.personId}>
              <Link
                href={relationshipHref(person.personId)}
                className="motion-focus flex items-center justify-between gap-3 rounded-xl border border-stroke-default bg-bg-surface p-4 transition-colors hover:border-stroke-strong"
              >
                <div className="min-w-0">
                  <h2 className="line-clamp-2 break-words font-display text-base font-semibold text-content-primary">
                    {person.label}
                  </h2>
                  <p className="mt-1 text-xs text-content-secondary">
                    {[person.role || 'No role yet', describeLastContact(person.lastContactAt)].join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {person.claimed ? (
                    <span className="rounded-full border border-stroke-default px-2 py-0.5 text-[11px] font-semibold text-content-secondary">
                      On Urganize
                    </span>
                  ) : null}
                  <ArrowRight className="h-4 w-4 text-content-tertiary" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

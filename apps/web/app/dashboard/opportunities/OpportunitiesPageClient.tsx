'use client';

import { PullReveal } from '@/components/shared/PullReveal';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, X } from '@/components/icons';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { useAuthStore } from '@/lib/auth-store';
import {
  KIND_LABEL,
  OPPORTUNITIES_EMPTY_COPY,
  OPPORTUNITY_CURRENCIES,
  OPPORTUNITY_KINDS,
  OPPORTUNITY_STATUSES,
  STATUS_LABEL,
  describeDate,
  filterOpportunities,
  formatAmount,
  isClosed,
  isOverdue,
  sortOpportunities,
  summarizeOpportunities,
  todayKey,
  type OpportunityCurrency,
  type OpportunityKind,
  type OpportunityStatus,
  type OpportunityView,
} from '@/lib/opportunities';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { useOpportunitiesStore } from '@/stores/useOpportunitiesStore';
import { GrantProfileCard } from '@/components/opportunities/GrantProfileCard';
import { GrantSuggestionsStrip } from '@/components/opportunities/GrantSuggestionsStrip';
import { grantSuggestionsEnabled } from '@/lib/grants/grant-suggestions-flag';

const FIELD =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-base text-content-primary placeholder:text-content-tertiary hover:border-content-secondary';

type Draft = {
  title: string;
  kind: OpportunityKind;
  status: OpportunityStatus;
  counterparty: string;
  amount: string;
  currency: OpportunityCurrency;
  nextStep: string;
  nextStepOn: string;
  deadlineOn: string;
  notes: string;
  artistId: string;
};

const EMPTY_DRAFT: Draft = {
  title: '',
  kind: 'deal',
  status: 'idea',
  counterparty: '',
  amount: '',
  currency: 'NGN',
  nextStep: '',
  nextStepOn: '',
  deadlineOn: '',
  notes: '',
  artistId: '',
};

function draftFrom(item: OpportunityView): Draft {
  return {
    title: item.title,
    kind: item.kind,
    status: item.status,
    counterparty: item.counterparty,
    amount: item.amount === null ? '' : String(item.amount),
    currency: item.currency,
    nextStep: item.nextStep,
    nextStepOn: item.nextStepOn ?? '',
    deadlineOn: item.deadlineOn ?? '',
    notes: item.notes,
    artistId: item.artistId ?? '',
  };
}

/** Blank fields go to the server as null so they clear, never as an empty string. */
function payloadFrom(draft: Draft) {
  return {
    title: draft.title,
    kind: draft.kind,
    status: draft.status,
    counterparty: draft.counterparty,
    amount: draft.amount.trim() === '' ? null : draft.amount,
    currency: draft.currency,
    nextStep: draft.nextStep,
    nextStepOn: draft.nextStepOn || null,
    deadlineOn: draft.deadlineOn || null,
    notes: draft.notes,
    artistId: draft.artistId || null,
  };
}

export default function OpportunitiesPageClient() {
  const authLoading = useAuthStore((state) => state.isLoading);
  const opportunities = useOpportunitiesStore((state) => state.opportunities);
  const initialLoading = useOpportunitiesStore((state) => state.isInitialLoading);
  const loadError = useOpportunitiesStore((state) => state.error);
  const load = useOpportunitiesStore((state) => state.load);
  const create = useOpportunitiesStore((state) => state.create);
  const update = useOpportunitiesStore((state) => state.update);
  const remove = useOpportunitiesStore((state) => state.remove);

  const artists = useArtistRosterStore((state) => state.artists);
  const loadArtists = useArtistRosterStore((state) => state.load);

  const [query, setQuery] = useState('');
  const [state, setState] = useState<'open' | 'closed' | 'all'>('open');
  const [kind, setKind] = useState<OpportunityKind | ''>('');
  const [artistId, setArtistId] = useState('');

  // null = form closed, 'new' = adding, otherwise the id being edited.
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    void loadArtists();
  }, [load, loadArtists]);

  const today = todayKey();
  const artistNames = useMemo(() => new Map(artists.map((a) => [a.id, a.name])), [artists]);
  const summary = useMemo(() => summarizeOpportunities(opportunities, today), [opportunities, today]);
  const visible = useMemo(
    () =>
      sortOpportunities(
        filterOpportunities(opportunities, {
          query,
          kind: kind || undefined,
          artistId: artistId || undefined,
          state: state === 'all' ? undefined : state,
        }),
        today
      ),
    [opportunities, query, kind, artistId, state, today]
  );

  const loading = (authLoading || initialLoading) && opportunities.length === 0;
  const filtering = Boolean(query.trim() || kind || artistId || state !== 'open');

  function openNew() {
    setDraft(EMPTY_DRAFT);
    setFormError(null);
    setEditing('new');
  }

  function openEdit(item: OpportunityView) {
    setDraft(draftFrom(item));
    setFormError(null);
    setEditing(item.id);
  }

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (saving || !editing) return;
    setSaving(true);
    setFormError(null);
    const body = payloadFrom(draft);
    const failure = editing === 'new' ? await create(body) : await update(editing, body);
    setSaving(false);
    if (failure) {
      setFormError(failure.error);
      return;
    }
    setEditing(null);
  }

  async function handleStatus(item: OpportunityView, status: OpportunityStatus) {
    setRowError(null);
    const failure = await update(item.id, { status });
    if (failure) setRowError(failure.error);
  }

  async function handleRemove(item: OpportunityView) {
    // A slip guard: nothing else is lost by removing one, but it cannot be undone.
    if (!window.confirm(`Remove "${item.title}"? This cannot be undone.`)) return;
    setRowError(null);
    const failure = await remove(item.id);
    if (failure) setRowError(failure.error);
  }

  const addButton = (
    <button
      type="button"
      onClick={openNew}
      className="motion-focus motion-press inline-flex h-12 items-center justify-center gap-2 rounded-full bg-content-primary px-6 text-sm font-semibold text-content-inverse hover:opacity-90"
    >
      {OPPORTUNITIES_EMPTY_COPY.action}
    </button>
  );

  return (
    <div>
      {/* With nothing saved yet the empty state below carries the one Add
          button, so the header holds none (the Shows page's rule): one primary
          action on screen, not two stacked on a phone. */}
      <PageHeader action={editing === null && opportunities.length > 0 ? addButton : null} />

      {grantSuggestionsEnabled() ? (
        <>
          <GrantSuggestionsStrip />
          <GrantProfileCard />
        </>
      ) : null}

      {editing !== null ? (
        <form onSubmit={handleSave} className="mb-6 space-y-3 rounded-xl border border-stroke-default bg-bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-content-primary">
              {editing === 'new' ? 'Add an opportunity' : 'Edit opportunity'}
            </h2>
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Close"
              className="motion-focus rounded-md p-1 text-content-tertiary hover:text-content-primary"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <label className="block text-xs font-semibold text-content-secondary">
            Title
            <input
              className={`${FIELD} mt-1`}
              value={draft.title}
              onChange={(event) => setField('title', event.target.value)}
              maxLength={120}
              required
              autoComplete="off"
              placeholder="Sync for a film, festival slot, brand deal"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-semibold text-content-secondary">
              Type
              <select
                className={`${FIELD} mt-1`}
                value={draft.kind}
                onChange={(event) => setField('kind', event.target.value as OpportunityKind)}
              >
                {OPPORTUNITY_KINDS.map((item) => (
                  <option key={item} value={item}>
                    {KIND_LABEL[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-content-secondary">
              Where it stands
              <select
                className={`${FIELD} mt-1`}
                value={draft.status}
                onChange={(event) => setField('status', event.target.value as OpportunityStatus)}
              >
                {OPPORTUNITY_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {STATUS_LABEL[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-content-secondary">
              Artist
              <select
                className={`${FIELD} mt-1`}
                value={draft.artistId}
                onChange={(event) => setField('artistId', event.target.value)}
              >
                <option value="">Not tied to an artist</option>
                {artists.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs font-semibold text-content-secondary">
            Who it is with
            <input
              className={`${FIELD} mt-1`}
              value={draft.counterparty}
              onChange={(event) => setField('counterparty', event.target.value)}
              maxLength={120}
              autoComplete="off"
              placeholder="A brand, a label, a fund, a supervisor"
            />
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <label className="block text-xs font-semibold text-content-secondary">
              Worth
              <input
                className={`${FIELD} mt-1`}
                inputMode="decimal"
                value={draft.amount}
                onChange={(event) => setField('amount', event.target.value)}
                placeholder="Leave blank if there is no number yet"
                autoComplete="off"
              />
            </label>
            <label className="block text-xs font-semibold text-content-secondary">
              Currency
              <select
                className={`${FIELD} mt-1`}
                value={draft.currency}
                onChange={(event) => setField('currency', event.target.value as OpportunityCurrency)}
              >
                {OPPORTUNITY_CURRENCIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <label className="block text-xs font-semibold text-content-secondary">
              Next step
              <input
                className={`${FIELD} mt-1`}
                value={draft.nextStep}
                onChange={(event) => setField('nextStep', event.target.value)}
                maxLength={200}
                autoComplete="off"
                placeholder="Send the demo, follow up on Friday"
              />
            </label>
            <label className="block text-xs font-semibold text-content-secondary">
              Do it by
              <input
                className={`${FIELD} mt-1`}
                type="date"
                value={draft.nextStepOn}
                onChange={(event) => setField('nextStepOn', event.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold text-content-secondary">
              Closes on
              <input
                className={`${FIELD} mt-1`}
                type="date"
                value={draft.deadlineOn}
                onChange={(event) => setField('deadlineOn', event.target.value)}
              />
            </label>
          </div>
          <label className="block text-xs font-semibold text-content-secondary">
            Notes
            <textarea
              className={`${FIELD} mt-1 min-h-24`}
              value={draft.notes}
              onChange={(event) => setField('notes', event.target.value)}
              maxLength={4000}
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
              onClick={() => setEditing(null)}
              className="motion-focus rounded-lg px-3 py-2 text-sm font-semibold text-content-secondary hover:text-content-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !draft.title.trim()}
              className="motion-focus rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand/90 disabled:opacity-50"
            >
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </form>
      ) : null}

      {opportunities.length > 0 ? (
        <>
          <p aria-label="At a glance" className="mb-4 text-sm text-content-secondary">
            <span className="font-semibold text-content-primary">{summary.open}</span> open
            {summary.overdue > 0 ? (
              <>
                {', '}
                <span className="font-semibold text-status-error">{summary.overdue}</span> overdue
              </>
            ) : null}
            {summary.won > 0 ? (
              <>
                {', '}
                <span className="font-semibold text-content-primary">{summary.won}</span> won
              </>
            ) : null}
          </p>
          <PullReveal filtering={Boolean(query.trim()) || state !== 'open' || Boolean(kind) || Boolean(artistId)}>
          <div className="mb-4 space-y-3">
            <input
              className={FIELD}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, who it is with or notes"
              aria-label="Search opportunities"
              autoComplete="off"
            />
            <div className="flex flex-wrap items-center gap-2">
              {(['open', 'closed', 'all'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={state === item}
                  onClick={() => setState(item)}
                  className={`motion-focus rounded-full border px-4 py-2 text-sm font-semibold ${
                    state === item
                      ? 'border-brand bg-brand/10 text-content-primary'
                      : 'border-stroke-control text-content-secondary hover:border-content-secondary'
                  }`}
                >
                  {item === 'open' ? 'Open' : item === 'closed' ? 'Closed' : 'All'}
                </button>
              ))}
              <select
                className={`${FIELD} w-auto`}
                value={kind}
                onChange={(event) => setKind(event.target.value as OpportunityKind | '')}
                aria-label="Filter by type"
              >
                <option value="">Any type</option>
                {OPPORTUNITY_KINDS.map((item) => (
                  <option key={item} value={item}>
                    {KIND_LABEL[item]}
                  </option>
                ))}
              </select>
              {artists.length > 1 ? (
                <select
                  className={`${FIELD} w-auto`}
                  value={artistId}
                  onChange={(event) => setArtistId(event.target.value)}
                  aria-label="Filter by artist"
                >
                  <option value="">All artists</option>
                  {artists.map((artist) => (
                    <option key={artist.id} value={artist.id}>
                      {artist.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>
          </PullReveal>
        </>
      ) : null}

      {rowError ? (
        <p role="alert" className="mb-3 text-sm text-status-error">
          {rowError}
        </p>
      ) : null}

      {loading ? (
        <ul aria-hidden="true" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-24 animate-pulse rounded-xl bg-bg-elevated" />
          ))}
        </ul>
      ) : loadError && opportunities.length === 0 ? (
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
      ) : opportunities.length === 0 ? (
        // While the add form is open it is the next step, so the empty state
        // steps aside rather than offering the same button under it.
        editing === null ? (
          <EmptyState
            title={OPPORTUNITIES_EMPTY_COPY.title}
            description={OPPORTUNITIES_EMPTY_COPY.description}
            action={addButton}
          />
        ) : null
      ) : visible.length === 0 ? (
        <p className="text-sm text-content-secondary">
          {filtering ? 'No opportunities match.' : 'Nothing open right now.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => {
            const overdue = isOverdue(item, today);
            const money = formatAmount(item.amount, item.currency);
            const artistName = item.artistId ? artistNames.get(item.artistId) : undefined;
            const meta = [KIND_LABEL[item.kind], item.counterparty, artistName, money].filter(Boolean).join(' · ');
            const nextDate = describeDate(item.nextStepOn, today);
            const deadline = describeDate(item.deadlineOn, today);
            return (
              <li
                key={item.id}
                className={`rounded-xl border bg-bg-surface p-4 ${
                  overdue ? 'border-status-error/50' : 'border-stroke-default'
                } ${isClosed(item.status) ? 'opacity-75' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-base font-semibold text-content-primary">{item.title}</h3>
                    <p className="mt-0.5 break-words text-sm text-content-secondary">{meta}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <select
                      className="motion-focus min-h-11 rounded-full border border-stroke-control bg-bg-base px-3 text-sm font-semibold text-content-primary hover:border-content-secondary"
                      value={item.status}
                      onChange={(event) => void handleStatus(item, event.target.value as OpportunityStatus)}
                      aria-label={`Status of ${item.title}`}
                    >
                      {OPPORTUNITY_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      aria-label={`Edit ${item.title}`}
                      className="motion-focus inline-flex h-11 w-11 items-center justify-center rounded-full text-content-secondary hover:text-content-primary"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemove(item)}
                      aria-label={`Remove ${item.title}`}
                      className="motion-focus inline-flex h-11 w-11 items-center justify-center rounded-full text-content-secondary hover:text-status-error"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
                {item.nextStep || nextDate || deadline ? (
                  <p className="mt-3 break-words text-sm text-content-secondary">
                    {item.nextStep ? (
                      <>
                        <span className="font-semibold text-content-primary">Next:</span> {item.nextStep}
                        {nextDate ? ` (${nextDate.toLowerCase()})` : ''}
                      </>
                    ) : nextDate ? (
                      <>Next step {nextDate.toLowerCase()}</>
                    ) : null}
                    {deadline ? (
                      <span className={overdue && item.deadlineOn && item.deadlineOn < today ? 'text-status-error' : ''}>
                        {item.nextStep || nextDate ? ' · ' : ''}Closes {deadline.toLowerCase()}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

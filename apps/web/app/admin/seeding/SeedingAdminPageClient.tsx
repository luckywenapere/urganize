'use client';

// Founder-led seeding (2026-10-10): paste managers from the sales list, get a
// private profile and a claim link for each, copy the message, send it by hand.
//
// Nothing here emails or lists anybody. A profile stays private and unlisted
// until the manager opens the link and publishes it themselves. The page's own
// GET is the admin gate (verifyAdmin / ADMIN_EMAILS): 401 or 403 bounces to
// /dashboard, the same shape as every other admin page client.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Plus } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { InfoTip } from '@/components/shared/HelpTip';
import {
  SEED_BATCH_MAX,
  SEED_STATE_LABEL,
  parseSeedList,
  whatsappHref,
  type SeedMessages,
  type SeedState,
  type SeedSummary,
} from '@/lib/seeding';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

type ListedRow = {
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string;
  state: SeedState;
  invitedAt: string;
  openedAt: string | null;
  publishedAt: string | null;
  claimed: boolean;
};

type DraftRow = { name: string; email: string; phone: string; notes: string; bioStarter: string };

type Outcome =
  | { name: string; status: 'created'; personId: string; url: string; messages: SeedMessages }
  | { name: string; status: 'already_on_urganize' }
  | { name: string; status: 'failed'; error: string };

type Fresh = { url: string; messages: SeedMessages };

const FIELD =
  'w-full rounded-xl border border-stroke-control bg-bg-surface px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary hover:border-content-secondary focus-visible:outline-none';

const formatDate = (value: string | null): string => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
  } catch {
    return '';
  }
};

function stateClass(state: SeedState): string {
  const base =
    'inline-flex h-6 items-center rounded-full px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]';
  if (state === 'published') return `${base} bg-brand/15 text-brand`;
  if (state === 'opened') return `${base} bg-status-info/15 text-status-info`;
  return `${base} bg-bg-elevated text-content-secondary`;
}

function CopyButton({
  label,
  value,
  id,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  id: string;
  copied: string;
  onCopy: (id: string, value: string) => void;
}) {
  const done = copied === id;
  return (
    <button
      type="button"
      onClick={() => onCopy(id, value)}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-stroke-control px-3 text-sm text-content-secondary hover:border-content-secondary hover:text-content-primary"
    >
      {done ? <Check className="h-4 w-4 text-brand" /> : <Copy className="h-4 w-4" />}
      {done ? 'Copied' : label}
    </button>
  );
}

function MessageActions({
  idPrefix,
  fresh,
  phone,
  copied,
  onCopy,
}: {
  idPrefix: string;
  fresh: Fresh;
  phone: string | null;
  copied: string;
  onCopy: (id: string, value: string) => void;
}) {
  const wa = whatsappHref(phone, fresh.messages.whatsapp);
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <CopyButton id={`${idPrefix}-link`} label="Copy link" value={fresh.url} copied={copied} onCopy={onCopy} />
      <CopyButton
        id={`${idPrefix}-wa`}
        label="Copy WhatsApp message"
        value={fresh.messages.whatsapp}
        copied={copied}
        onCopy={onCopy}
      />
      <CopyButton
        id={`${idPrefix}-email`}
        label="Copy email"
        value={`${fresh.messages.emailSubject}\n\n${fresh.messages.emailBody}`}
        copied={copied}
        onCopy={onCopy}
      />
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-xl bg-brand px-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
        >
          Open WhatsApp
        </a>
      ) : null}
    </div>
  );
}

export default function SeedingAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [rows, setRows] = useState<ListedRow[]>([]);
  const [summary, setSummary] = useState<SeedSummary | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [pasted, setPasted] = useState('');
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [fresh, setFresh] = useState<Record<string, Fresh>>({});
  const [busyId, setBusyId] = useState('');
  const [copied, setCopied] = useState('');
  const [phones, setPhones] = useState<Record<string, string>>({});

  const load = useCallback(
    async (opts?: { asGate?: boolean }) => {
      try {
        const token = await getAccessToken();
        const response = await fetch('/api/admin/seeding', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) {
          if (opts?.asGate && (response.status === 401 || response.status === 403)) {
            router.replace('/dashboard');
            return;
          }
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setError(payload.error || 'Could not load the list.');
          setChecked(true);
          return;
        }
        const payload = (await response.json().catch(() => null)) as {
          rows?: ListedRow[];
          summary?: SeedSummary;
        } | null;
        if (payload?.rows) {
          setRows(payload.rows);
          setSummary(payload.summary ?? null);
          setError('');
        }
        setChecked(true);
      } catch (loadError) {
        if (opts?.asGate) {
          router.replace('/dashboard');
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Could not load the list.');
        setChecked(true);
      }
    },
    [router]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void load({ asGate: true });
  }, [authLoading, load, router, user]);

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      setError('Could not copy. Select the text and copy it by hand.');
    }
  };

  const check = () => {
    setError('');
    setOutcomes([]);
    const parsed = parseSeedList(pasted);
    if (parsed.length > SEED_BATCH_MAX) {
      setError(`Add up to ${SEED_BATCH_MAX} people at a time.`);
      return;
    }
    setDrafts(parsed.map((row) => ({ ...row, bioStarter: '' })));
  };

  const setDraft = (index: number, patch: Partial<DraftRow>) =>
    setDrafts((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const create = async () => {
    setError('');
    setCreating(true);
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/admin/seeding', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: drafts }),
      });
      const payload = (await response.json().catch(() => null)) as { outcomes?: Outcome[]; error?: string } | null;
      if (!response.ok || !payload?.outcomes) {
        setError(payload?.error || 'Could not create the profiles.');
        return;
      }
      setOutcomes(payload.outcomes);
      setPhones(Object.fromEntries(drafts.map((row) => [row.name, row.phone])));
      setDrafts([]);
      setPasted('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const newLink = async (row: ListedRow) => {
    setError('');
    setBusyId(row.personId);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/admin/seeding/${encodeURIComponent(row.personId)}/link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => null)) as (Fresh & { error?: string }) | null;
      if (!response.ok || !payload?.url) {
        setError(payload?.error || 'Could not make a new link.');
        return;
      }
      setFresh((current) => ({ ...current, [row.personId]: { url: payload.url, messages: payload.messages } }));
    } finally {
      setBusyId('');
    }
  };

  if (authLoading || !checked) {
    return <AdminPageSkeleton titleWidth="w-40" descriptionLines={1} table={{ columns: 4, rows: 4 }} />;
  }

  return (
    <div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">Admin</p>
      <h1 className="mt-2 flex items-center gap-1 font-display text-3xl font-semibold">
        Seeding
        <InfoTip
          label="Seeding"
          text="Paste managers from your list. Each gets a private profile and a link to send. Nobody is listed until they publish."
        />
      </h1>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error"
        >
          {error}
        </p>
      ) : null}

      {summary ? (
        <dl className="mt-6 grid grid-cols-3 gap-3">
          {(
            [
              ['Asked', summary.total, `${summary.invitedThisWeek} this week`],
              ['Opened', summary.opened, `${summary.openedThisWeek} this week`],
              ['Published', summary.published, `${summary.publishedThisWeek} this week`],
            ] as const
          ).map(([label, value, hint]) => (
            <div key={label} className="rounded-xl border border-stroke-default bg-bg-surface p-4">
              <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary">{label}</dt>
              <dd className="mt-1 font-display text-3xl font-semibold">{value}</dd>
              <dd className="mt-1 text-xs text-content-secondary">{hint}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <section className="mt-8" aria-labelledby="seed-add">
        <h2 id="seed-add" className="flex items-center gap-1 font-display text-xl font-semibold">
          Add managers
          <InfoTip
            label="Add managers"
            text="One person a line: name, then email or phone, then any notes. Notes stay with you and are never shown to them."
          />
        </h2>
        <label htmlFor="seed-paste" className="sr-only">
          Managers, one per line
        </label>
        <textarea
          id="seed-paste"
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          rows={5}
          placeholder={'Ada Obi, ada@example.com, manages three Lagos artists\nTunde Bello | 0803 123 4567'}
          className={`${FIELD} mt-3 font-mono`}
        />
        <div className="mt-3">
          <button
            type="button"
            onClick={check}
            disabled={!pasted.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Check the list
          </button>
        </div>

        {drafts.length > 0 ? (
          <div className="mt-4 space-y-3">
            {drafts.map((row, index) => (
              <div key={index} className="rounded-xl border border-stroke-default bg-bg-surface p-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    aria-label={`Name, line ${index + 1}`}
                    className={FIELD}
                    value={row.name}
                    onChange={(e) => setDraft(index, { name: e.target.value })}
                  />
                  <input
                    aria-label={`Email, line ${index + 1}`}
                    className={FIELD}
                    placeholder="Email"
                    value={row.email}
                    onChange={(e) => setDraft(index, { email: e.target.value })}
                  />
                  <input
                    aria-label={`Phone, line ${index + 1}`}
                    className={FIELD}
                    placeholder="Phone"
                    value={row.phone}
                    onChange={(e) => setDraft(index, { phone: e.target.value })}
                  />
                </div>
                <input
                  aria-label={`Notes for you, line ${index + 1}`}
                  className={`${FIELD} mt-2`}
                  placeholder="Notes, only you see these"
                  value={row.notes}
                  onChange={(e) => setDraft(index, { notes: e.target.value })}
                />
                <textarea
                  aria-label={`Bio to start them off, line ${index + 1}`}
                  rows={2}
                  className={`${FIELD} mt-2`}
                  placeholder="Bio to start them off. They will see it and can change it."
                  value={row.bioStarter}
                  onChange={(e) => setDraft(index, { bioStarter: e.target.value })}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => void create()}
              disabled={creating}
              className="inline-flex h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
            >
              {creating ? 'Creating…' : `Create ${drafts.length} ${drafts.length === 1 ? 'profile' : 'profiles'}`}
            </button>
          </div>
        ) : null}
      </section>

      {outcomes.length > 0 ? (
        <section className="mt-8" aria-label="Just created">
          <h2 className="flex items-center gap-1 font-display text-xl font-semibold">
            Just created
            <InfoTip label="Just created" text="These links show once. Copy them now, or make a new one later." />
          </h2>
          <ul className="mt-3 space-y-3">
            {outcomes.map((outcome, index) => (
              <li key={index} className="rounded-xl border border-stroke-default bg-bg-surface p-3">
                <p className="text-sm font-semibold">{outcome.name}</p>
                {outcome.status === 'created' ? (
                  <MessageActions
                    idPrefix={`new-${outcome.personId}`}
                    fresh={{ url: outcome.url, messages: outcome.messages }}
                    phone={phones[outcome.name] || null}
                    copied={copied}
                    onCopy={copy}
                  />
                ) : outcome.status === 'already_on_urganize' ? (
                  <p className="mt-1 text-sm text-content-secondary">Already on Urganize. No profile made.</p>
                ) : (
                  <p role="alert" className="mt-1 text-sm text-status-error">
                    {outcome.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8" aria-label="Everyone you asked">
        <h2 className="font-display text-xl font-semibold">Everyone you asked</h2>
        {rows.length === 0 ? (
          <p className="mt-3 rounded-lg border border-stroke-default bg-bg-surface px-4 py-6 text-center text-sm text-content-secondary">
            Nobody yet. Paste a list above.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {rows.map((row) => (
              <li key={row.personId} className="rounded-xl border border-stroke-default bg-bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{row.name}</p>
                    <p className="truncate text-xs text-content-secondary">{row.email || row.phone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={stateClass(row.state)}>{SEED_STATE_LABEL[row.state]}</span>
                    <span className="font-mono text-xs text-content-tertiary">
                      {formatDate(row.publishedAt || row.openedAt || row.invitedAt)}
                    </span>
                  </div>
                </div>
                {row.notes ? <p className="mt-2 text-sm text-content-secondary">{row.notes}</p> : null}
                {!row.claimed ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => void newLink(row)}
                      disabled={busyId === row.personId}
                      className="inline-flex min-h-11 items-center rounded-xl border border-stroke-control px-3 text-sm text-content-secondary hover:border-content-secondary hover:text-content-primary disabled:opacity-50"
                    >
                      {busyId === row.personId ? 'Making…' : 'New link'}
                    </button>
                    {fresh[row.personId] ? (
                      <MessageActions
                        idPrefix={`row-${row.personId}`}
                        fresh={fresh[row.personId]}
                        phone={row.phone}
                        copied={copied}
                        onCopy={copy}
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

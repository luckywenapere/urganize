'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { PROVIDER_LABEL, statusLabel, type ArtistVerificationStatus, type VerificationAction } from '@/lib/artist-verification';
import type { QueueItem } from '@/lib/artist-verification-server';

// /admin/artist-verification (issue #1390, founder approved the mock): the
// waiting list on the left, the screenshot on the right. Nothing here runs on
// a timer. Take down is the only button that hides an artist, and it asks
// first. Every action emails and pushes the team.

type Tab = 'waiting' | 'needs_fix' | 'verified' | 'taken_down';

const TABS: Array<{ key: Tab; label: string; status: ArtistVerificationStatus }> = [
  { key: 'waiting', label: 'Waiting', status: 'checking' },
  { key: 'needs_fix', label: 'Needs a fix', status: 'needs_fix' },
  { key: 'verified', label: 'Verified', status: 'verified' },
  { key: 'taken_down', label: 'Taken down', status: 'taken_down' },
];

const buttonBase =
  'inline-flex min-h-10 items-center justify-center rounded-full px-5 text-sm font-semibold transition-opacity disabled:opacity-50';
const primary = `${buttonBase} bg-brand text-content-inverse hover:opacity-90`;
const plain = `${buttonBase} border border-stroke-strong text-content-primary hover:bg-bg-hover`;
const danger = `${buttonBase} bg-status-error text-content-inverse hover:opacity-90`;

const when = (iso: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

type Ask = { action: Extract<VerificationAction, 'ask_again' | 'take_down' | 'remove_badge'>; item: QueueItem } | null;

export default function ArtistVerificationAdminPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('waiting');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [note, setNote] = useState('');

  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return null;
    return fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
      cache: 'no-store',
    });
  }, []);

  const load = useCallback(
    async (asGate = false) => {
      setError(null);
      try {
        const response = await authed('/api/admin/artist-verification');
        if (!response || response.status === 401 || response.status === 403) {
          if (asGate) router.replace('/dashboard');
          return;
        }
        if (!response.ok) {
          setError('Could not load the list.');
          return;
        }
        const body = (await response.json()) as { items?: QueueItem[] };
        setItems(Array.isArray(body.items) ? body.items : []);
      } catch {
        setError('Could not load the list.');
      }
    },
    [authed, router]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void load(true);
  }, [authLoading, user, router, load]);

  const visible = useMemo(() => {
    const status = TABS.find((entry) => entry.key === tab)?.status;
    return (items ?? []).filter((item) => item.status === status);
  }, [items, tab]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items ?? []) map[item.status] = (map[item.status] ?? 0) + 1;
    return map;
  }, [items]);

  const selected = visible.find((item) => item.artistId === selectedId) ?? visible[0] ?? null;

  async function run(item: QueueItem, action: VerificationAction, reason?: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await authed('/api/admin/artist-verification', {
        method: 'PATCH',
        body: JSON.stringify({ artistId: item.artistId, action, note: reason ?? null }),
      });
      if (!response || !response.ok) {
        const body = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
        setError(body?.error || 'That did not work. Try again.');
        return false;
      }
      await load();
      return true;
    } catch {
      setError('Could not reach the server.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || items === null) {
    return <AdminPageSkeleton titleWidth="w-48" descriptionLines={1} table={{ columns: 4, rows: 6 }} />;
  }

  const needsNote = ask?.action === 'ask_again' || ask?.action === 'take_down';

  return (
    <div>
      <h1 className="mt-2 font-display text-2xl font-semibold text-content-primary">Artist verification</h1>
      <p className="mt-1 max-w-xl text-sm text-content-secondary">
        Pick an artist and compare the screenshot with the profile the team linked. Nothing here runs by itself.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Artist status">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            onClick={() => {
              setTab(entry.key);
              setSelectedId(null);
            }}
            className={`min-h-10 rounded-full px-4 text-sm transition-colors ${
              tab === entry.key
                ? 'bg-bg-elevated font-semibold text-content-primary'
                : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            {entry.label} {counts[entry.status] ?? 0}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-sm text-content-secondary">Nothing here.</p>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <ul>
            {visible.map((item) => (
              <li key={item.artistId} className="border-t border-stroke-subtle first:border-t-0">
                <button
                  type="button"
                  onClick={() => setSelectedId(item.artistId)}
                  aria-current={selected?.artistId === item.artistId}
                  className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-4 text-left transition-colors hover:bg-bg-hover ${
                    selected?.artistId === item.artistId ? 'bg-bg-surface' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-content-primary">{item.artistName}</span>
                    <span className="block truncate text-sm text-content-secondary">
                      {item.teamName || 'No team name'}
                      {item.sender ? ` · sent by the ${item.sender}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-content-secondary">{when(item.sentAt)}</span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <aside className="min-w-0 rounded-2xl bg-bg-surface p-5">
              <p className="text-sm font-semibold text-content-primary">
                {selected.artistName} · {statusLabel(selected.status)}
              </p>
              {selected.screenshotUrl ? (
                <a href={selected.screenshotUrl} target="_blank" rel="noreferrer" className="mt-3 block">
                  {/* A short-lived signed URL: never run through next/image. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selected.screenshotUrl}
                    alt={`Screenshot sent for ${selected.artistName}`}
                    className="max-h-72 w-full rounded-xl border border-stroke-default object-contain"
                  />
                </a>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-stroke-strong p-6 text-center text-sm text-content-secondary">
                  No screenshot sent yet.
                </p>
              )}
              <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
                <dt className="text-content-secondary">From</dt>
                <dd>{selected.provider ? PROVIDER_LABEL[selected.provider] : 'Nothing sent'}</dd>
                <dt className="text-content-secondary">Sent by</dt>
                <dd className="capitalize">{selected.sender ?? 'Nobody'}</dd>
                <dt className="text-content-secondary">Linked profile</dt>
                <dd className="break-all">
                  {[
                    selected.linked.spotify ? `Spotify ${selected.linked.spotify}` : null,
                    selected.linked.apple ? `Apple ${selected.linked.apple}` : null,
                    selected.linked.deezer ? `Deezer ${selected.linked.deezer}` : null,
                  ]
                    .filter(Boolean)
                    .join(', ') || 'None linked'}
                </dd>
                {selected.note ? (
                  <>
                    <dt className="text-content-secondary">Note</dt>
                    <dd>{selected.note}</dd>
                  </>
                ) : null}
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                {selected.status === 'checking' || selected.status === 'taken_down' ? (
                  <button type="button" disabled={busy || !selected.verificationId} onClick={() => void run(selected, 'approve')} className={primary}>
                    Approve
                  </button>
                ) : null}
                {selected.status === 'checking' ? (
                  <button type="button" disabled={busy} onClick={() => { setNote(''); setAsk({ action: 'ask_again', item: selected }); }} className={plain}>
                    Ask again
                  </button>
                ) : null}
                {selected.status === 'verified' ? (
                  <button type="button" disabled={busy} onClick={() => { setNote(''); setAsk({ action: 'remove_badge', item: selected }); }} className={plain}>
                    Remove badge
                  </button>
                ) : null}
                {selected.status === 'taken_down' ? (
                  <button type="button" disabled={busy} onClick={() => void run(selected, 'bring_back')} className={plain}>
                    Bring back
                  </button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => { setNote(''); setAsk({ action: 'take_down', item: selected }); }} className={danger}>
                    Take down
                  </button>
                )}
              </div>
              <p className="mt-3 text-xs leading-5 text-content-secondary">
                Every action emails the team and sends a message in the app.
              </p>
            </aside>
          ) : null}
        </div>
      )}

      {ask ? (
        <div
          className="fixed inset-0 z-[220] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAsk(null);
          }}
        >
          <div role="dialog" aria-modal="true" aria-label="Confirm" className="w-full max-w-md rounded-2xl border border-stroke-default bg-bg-elevated p-6 shadow-xl">
            <h2 className="font-display text-xl text-content-primary">
              {ask.action === 'take_down'
                ? `Take down ${ask.item.artistName}?`
                : ask.action === 'ask_again'
                  ? `Ask ${ask.item.artistName} for a new screenshot?`
                  : `Remove the badge from ${ask.item.artistName}?`}
            </h2>
            {ask.action === 'take_down' ? (
              <p className="mt-2 text-sm leading-6 text-content-secondary">
                The artist page is hidden from the team and the public press kit goes off. Nothing is deleted, and you can bring it all back from this page.
              </p>
            ) : null}
            <label className="mt-4 block text-sm text-content-secondary">
              {needsNote ? 'What the team will read' : 'A note for the team (optional)'}
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-stroke-control bg-bg-surface p-3 text-sm text-content-primary"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAsk(null)} className={plain}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || (needsNote && !note.trim())}
                onClick={async () => {
                  if (await run(ask.item, ask.action, note)) setAsk(null);
                }}
                className={ask.action === 'take_down' ? danger : primary}
              >
                {ask.action === 'take_down' ? 'Take down' : ask.action === 'ask_again' ? 'Send' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

'use client';

// /admin/curator-applications (2026-10-24, founder approved mock v2-admin).
// Playlist owners who applied at /curator/apply. New / Approved / Declined,
// the list on the left, the one you picked on the right.
//
// Approve mints the single-use curator invite (the same one the Playlist owners
// page makes) and, for an email contact, emails it. The link is always shown
// with a Copy button, so a WhatsApp contact gets it by hand.
//
// Gate: the page's own GET (verifyAdmin / ADMIN_EMAILS); a 401 or 403 bounces
// to /dashboard, as on every admin page.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Check, Copy, ListMusic, X } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { Card, Separator, ToggleGroup, buttonVariants, cn } from '@/components/admin/ui';
import {
  CURATOR_APPLICATION_GENRE_LABELS,
  CURATOR_APPLICATION_PLATFORM_LABELS,
  applicationSummaryLine,
  isCuratorApplicationGenre,
  playlistDisplayName,
  shortAgo,
  type CuratorApplication,
  type CuratorApplicationCounts,
  type CuratorApplicationStatus,
} from '@/lib/curator-applications';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

const STATUS_LABELS: Record<CuratorApplicationStatus, string> = {
  new: 'New',
  approved: 'Approved',
  declined: 'Declined',
};

// A quiet tile in place of cover art, which we do not fetch: a muted colour
// picked from the id so each row is told apart at a glance.
const TILE_COLORS = ['#3f6f7a', '#46689a', '#7a5aa8', '#5b7a4a', '#8a6a3f', '#7a4a5a'];
function tileColor(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum = (sum + id.charCodeAt(i)) % 997;
  return TILE_COLORS[sum % TILE_COLORS.length];
}

function Tile({ id, size }: { id: string; size: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: tileColor(id) }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl text-white/70',
        size === 'sm' ? 'h-12 w-12' : 'h-20 w-20 rounded-2xl'
      )}
    >
      <ListMusic className={size === 'sm' ? 'h-5 w-5' : 'h-7 w-7'} />
    </span>
  );
}

function appliedLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(at);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (at.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (at.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(at);
  return `${day}, ${time}`;
}

export default function CuratorApplicationsAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [applications, setApplications] = useState<CuratorApplication[]>([]);
  const [counts, setCounts] = useState<CuratorApplicationCounts>({ new: 0, approved: 0, declined: 0 });
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<CuratorApplicationStatus>('new');
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState<'' | 'approve' | 'decline'>('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(
    async (opts?: { asGate?: boolean }) => {
      try {
        const response = await fetch('/api/admin/curator-applications', {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
          cache: 'no-store',
        });
        if (!response.ok) {
          if (opts?.asGate && (response.status === 401 || response.status === 403)) {
            router.replace('/dashboard');
            return;
          }
          if (response.status === 404) {
            setError('Playlist pitching is switched off, so there are no applications to read.');
            setChecked(true);
            return;
          }
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setError(payload.error || 'Could not load the applications.');
          setChecked(true);
          return;
        }
        const payload = (await response.json().catch(() => null)) as {
          applications?: CuratorApplication[];
          counts?: CuratorApplicationCounts;
        } | null;
        setApplications(payload?.applications || []);
        if (payload?.counts) setCounts(payload.counts);
        setError('');
        setChecked(true);
      } catch (loadError) {
        if (opts?.asGate) {
          router.replace('/dashboard');
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Could not load the applications.');
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

  const visible = useMemo(() => applications.filter((item) => item.status === tab), [applications, tab]);
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;

  const answer = async (application: CuratorApplication, action: 'approve' | 'decline') => {
    setBusy(action);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/curator-applications/${encodeURIComponent(application.id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        application?: CuratorApplication;
        emailed?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.application) {
        setError(payload.error || (action === 'approve' ? 'Could not approve.' : 'Could not decline.'));
        await load();
        return;
      }
      const updated = payload.application;
      setApplications((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setCounts((current) => ({
        ...current,
        new: Math.max(0, current.new - 1),
        [updated.status]: current[updated.status] + 1,
      }));
      if (action === 'approve') {
        setNotice(
          payload.emailed
            ? `Approved. The invite went to ${updated.contact}.`
            : 'Approved. Copy the invite link and send it to them.'
        );
        setTab('approved');
        setSelectedId(updated.id);
      } else {
        setNotice('Declined.');
      }
    } finally {
      setBusy('');
    }
  };

  const copyInvite = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the link and copy it by hand.');
    }
  };

  if (authLoading || !checked) {
    return <AdminPageSkeleton titleWidth="w-48" table={{ columns: 2, rows: 4 }} />;
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-content-primary">Applications</h1>
      <p className="mt-2 text-sm text-content-secondary">
        Approve makes a one-time invite and sends it to their contact.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-4 text-sm text-brand">
          {notice}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0">
          <ToggleGroup
            label="Which applications"
            value={tab}
            onValueChange={(value) => {
              setTab(value);
              setSelectedId('');
              setCopied(false);
            }}
            className="w-full sm:w-fit sm:min-w-[22rem]"
            options={(['new', 'approved', 'declined'] as const).map((status) => ({
              value: status,
              label: (
                <span className="px-3">
                  {STATUS_LABELS[status]} <span className="tabular-nums">{counts[status]}</span>
                </span>
              ),
            }))}
          />

          {visible.length === 0 ? (
            <p className="mt-6 text-sm text-content-secondary">
              {tab === 'new' ? 'Nothing waiting. New applications show up here.' : `No ${STATUS_LABELS[tab].toLowerCase()} applications yet.`}
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-1">
              {visible.map((item) => {
                const on = selected?.id === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        setCopied(false);
                      }}
                      aria-pressed={on}
                      className={cn(
                        'motion-focus flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition-colors',
                        on ? 'bg-bg-surface' : 'hover:bg-bg-hover'
                      )}
                    >
                      <Tile id={item.id} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-content-primary">{playlistDisplayName(item)}</span>
                        <span className="mt-0.5 block truncate text-sm text-content-secondary">
                          {applicationSummaryLine(item)}
                        </span>
                      </span>
                      <span className="self-start pt-1 text-xs tabular-nums text-content-tertiary">{shortAgo(item.createdAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selected ? (
          <Card className="flex flex-col p-6 lg:sticky lg:top-8 lg:self-start">
            <div className="flex items-center gap-4">
              <Tile id={selected.id} size="lg" />
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-content-primary">{playlistDisplayName(selected)}</h2>
                <a
                  href={selected.playlistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm text-brand hover:underline"
                >
                  {selected.platform ? `${CURATOR_APPLICATION_PLATFORM_LABELS[selected.platform]} · ` : ''}Open playlist
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </div>

            <dl className="mt-6">
              {(
                [
                  ['Followers', selected.followers.toLocaleString('en')],
                  [
                    'Genre',
                    isCuratorApplicationGenre(selected.genre)
                      ? CURATOR_APPLICATION_GENRE_LABELS[selected.genre]
                      : selected.genre,
                  ],
                  ['Country', selected.country],
                  ['Contact', selected.contact],
                  ['Applied', appliedLabel(selected.createdAt)],
                ] as Array<[string, string]>
              ).map(([term, value]) => (
                <div key={term}>
                  <Separator />
                  <div className="flex items-center justify-between gap-4 py-3.5 text-sm">
                    <dt className="text-content-secondary">{term}</dt>
                    <dd className="min-w-0 truncate text-right text-content-primary">{value}</dd>
                  </div>
                </div>
              ))}
              <Separator />
            </dl>

            {selected.note ? (
              <div className="mt-5">
                <p className="text-sm text-content-secondary">Note</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-content-primary">{selected.note}</p>
              </div>
            ) : null}

            {selected.status === 'new' ? (
              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  disabled={busy !== ''}
                  onClick={() => void answer(selected, 'approve')}
                  className={buttonVariants({ className: 'h-12 flex-1 rounded-xl text-base disabled:opacity-60' })}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {busy === 'approve' ? 'Approving…' : 'Approve'}
                </button>
                <button
                  type="button"
                  disabled={busy !== ''}
                  onClick={() => void answer(selected, 'decline')}
                  className={buttonVariants({
                    variant: 'outline',
                    className: 'h-12 rounded-xl px-5 text-base font-normal text-content-secondary disabled:opacity-60',
                  })}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  {busy === 'decline' ? 'Declining…' : 'Decline'}
                </button>
              </div>
            ) : selected.status === 'approved' ? (
              <div className="mt-8">
                <p className="text-sm text-content-secondary">
                  {selected.contactKind === 'whatsapp' ? 'Send this link on WhatsApp. It works once.' : 'Invite link. It works once.'}
                </p>
                {selected.inviteUrl ? (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-bg-elevated px-3 py-2">
                    <code className="min-w-0 flex-1 truncate font-mono text-xs text-content-primary">{selected.inviteUrl}</code>
                    <button
                      type="button"
                      onClick={() => void copyInvite(selected.inviteUrl as string)}
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-brand" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-content-tertiary">The invite is no longer there.</p>
                )}
              </div>
            ) : (
              <p className="mt-8 text-sm text-content-tertiary">Declined {selected.reviewedAt ? appliedLabel(selected.reviewedAt) : ''}.</p>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}

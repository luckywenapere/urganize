'use client';

import { recallLast, rememberLast } from '@/lib/last-seen';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Copy, Loader2, Plus, Users } from '@/components/icons';
import { authHeaders, readError } from '@/components/press-kits/press-kit-client';
import { TeamSheet } from '@/components/team/TeamSheet';
import { TeamAvatar } from '@/components/team/TeamAvatar';
import { PersonPanel } from '@/components/team/PersonPanel';
import { AccessPicker, accessBody, isAccessChoiceReady, type AccessChoice } from '@/components/team/AccessPicker';
import { isOnline } from '@/lib/presence';
import { teamPresenceLabel } from '@/lib/home/team-presence';
import {
  TEAM_COPY,
  TEAM_ROLE_LABEL,
  accessPill,
  dueLabel,
  onlineCount,
  teamHeaderLine,
  type TeamPageResponse,
  type TeamPerson,
} from '@/lib/team-page';

/**
 * The Team tab (issue #853, founder approved mocks docs/mocks/team-tab, round
 * 3): the team as centred cards on a computer and a list on a phone, each
 * person opening their tasks beside it. Everyone on the team sees it; managers
 * also get Invite, Remove and Change role or access. The Settings segment was
 * removed (founder, 2026-10-30): team name is in Settings → Artists & brand,
 * Leave is in Settings → Security & account, seats are in the header line.
 */
export default function TeamPageClient() {
  // The last copy seen in this page life paints at once (Nov 2, 2026, the
  // load-wait audit); the read below refreshes it. Memory only.
  const [data, setData] = useState<TeamPageResponse | null>(() => recallLast<TeamPageResponse>('team', 'mine'));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const response = await fetch('/api/team', { headers, cache: 'no-store' });
      if (!response.ok) {
        setLoadError(await readError(response, 'Could not load your team.'));
        return;
      }
      const next = (await response.json()) as TeamPageResponse;
      rememberLast('team', 'mine', next);
      setData(next);
      setLoadError(null);
      setNow(new Date());
    } catch {
      setLoadError('Could not load your team. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    void load();
    // "Online now" goes stale; a quiet refresh every two minutes keeps it true.
    const timer = window.setInterval(() => void load(), 120_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const people = useMemo(() => data?.people ?? [], [data]);

  // Home on a computer links here (#1182): ?person=<member id> opens that
  // person's tasks, ?invite=1 opens the invite form for someone who may
  // invite. Read once, when the team first lands, so closing stays closed.
  const params = useSearchParams();
  const linkedPerson = params.get('person');
  const linkedInvite = params.get('invite') === '1';
  const [linkHandled, setLinkHandled] = useState(false);
  if (data && !linkHandled) {
    setLinkHandled(true);
    if (linkedPerson && data.people.some((person) => person.memberId === linkedPerson)) setOpenId(linkedPerson);
    else if (linkedInvite && data.viewer.canManage && data.picker) setInviting(true);
  }
  const active = people.filter((person) => person.status === 'active');
  const waiting = people.filter((person) => person.status === 'invited');
  const open = people.find((person) => person.memberId === openId) ?? null;
  const editing = people.find((person) => person.memberId === editingId) ?? null;
  const removing = people.find((person) => person.memberId === removingId) ?? null;
  const seatsLeft = data?.seatLimit != null ? Math.max(0, data.seatLimit - data.seatsUsed) : null;
  const canManage = Boolean(data?.viewer.canManage);

  const header = useMemo(
    () =>
      data
        ? teamHeaderLine({ name: data.workspace.name, seatsUsed: data.seatsUsed, seatLimit: data.seatLimit, online: onlineCount(people, now) })
        : '',
    [data, people, now]
  );

  const remove = async (person: TeamPerson): Promise<string | null> => {
    const headers = await authHeaders();
    if (!headers) return 'Sign in again to remove them.';
    const response = await fetch(`/api/workspace/members/${encodeURIComponent(person.memberId)}`, { method: 'DELETE', headers });
    if (!response.ok) return readError(response, 'Could not remove them.');
    setRemovingId(null);
    setOpenId(null);
    await load();
    return null;
  };

  if (!data) {
    return (
      <div className="pb-10">
        <div className="pt-5 sm:pt-6" />
        <h1 className="font-display text-[32px] leading-[1.1] text-content-primary md:text-[26px]">{TEAM_COPY.title}</h1>
        {loadError ? (
          <div className="mt-6 rounded-2xl border border-dashed border-stroke-control p-6 text-center">
            <p className="text-sm text-content-secondary">{loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="motion-focus motion-press mt-3 inline-flex h-10 items-center rounded-xl border border-stroke-control px-4 text-sm font-semibold text-content-primary"
            >
              Try again
            </button>
          </div>
        ) : (
          <TeamSkeleton />
        )}
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="pt-5 sm:pt-6" />
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[32px] leading-[1.1] text-content-primary md:text-[26px]">{TEAM_COPY.title}</h1>
          <p className="mt-1 truncate text-[13px] text-content-secondary">{header}</p>
        </div>
        {/* Phone only: on a computer the "Invite someone" card in the grid is
            the one way in (founder call, 2026-10-30, two buttons for one job). */}
        {canManage ? (
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="motion-focus motion-press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-semibold text-content-inverse md:hidden"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {TEAM_COPY.invite}
          </button>
        ) : null}
      </div>

      <>
        {/* Computer: the team laid out as centred cards. */}
        <ul className="mt-4 hidden grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3.5 md:grid" aria-label="People on the team">
          {active.map((person) => (
            <li key={person.memberId}>
              <PersonCard person={person} now={now} onOpen={() => setOpenId(person.memberId)} />
            </li>
          ))}
          {waiting.map((person) => (
            <li key={person.memberId}>
              <WaitingCard person={person} canManage={canManage} onOpen={() => setOpenId(person.memberId)} />
            </li>
          ))}
          {canManage && seatsLeft !== 0 ? (
            <li>
              <button
                type="button"
                onClick={() => setInviting(true)}
                className="motion-focus motion-press flex h-full min-h-[262px] w-full flex-col items-center justify-center rounded-2xl border-[1.5px] border-dashed border-stroke-control text-center text-content-secondary"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full border-[1.5px] border-dashed border-stroke-control text-brand">
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="mt-2.5 text-sm font-semibold text-content-primary">{TEAM_COPY.inviteSomeone}</span>
                {seatsLeft !== null ? (
                  <span className="text-[12.5px]">{seatsLeft === 1 ? '1 seat left' : `${seatsLeft} seats left`}</span>
                ) : null}
              </button>
            </li>
          ) : null}
        </ul>

        {/* Phone: a list shows the whole team without scrolling. */}
        <ul className="mt-3 md:hidden" aria-label="People on the team">
          {active.map((person) => (
            <li key={person.memberId} className="border-t border-stroke-default first:border-t-0">
              <PersonRow person={person} now={now} onOpen={() => setOpenId(person.memberId)} />
            </li>
          ))}
        </ul>
        {waiting.length ? (
          <div className="md:hidden">
            <p className="mt-2 border-t border-stroke-default py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-content-tertiary">
              {TEAM_COPY.waiting} · {waiting.length}
            </p>
            <ul>
              {waiting.map((person) => (
                <li key={person.memberId}>
                  <button
                    type="button"
                    onClick={() => setOpenId(person.memberId)}
                    className="motion-focus flex w-full items-center gap-3 py-2.5 text-left"
                  >
                    <TeamAvatar initials={person.initials} avatarUrl={null} online={false} size="sm" pending />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-content-primary">{person.email}</span>
                      <span className="block text-xs text-content-secondary">{TEAM_ROLE_LABEL[person.role]} · invited</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {active.length <= 1 && !waiting.length ? (
          <div className="mt-6 rounded-2xl border border-dashed border-stroke-control p-6 text-center md:hidden">
            <Users className="mx-auto h-6 w-6 text-content-tertiary" aria-hidden="true" />
            <p className="mt-2 text-sm text-content-secondary">It is just you for now.</p>
          </div>
        ) : null}
      </>

      {open ? (
        <TeamSheet title={open.name} hideTitle onClose={() => setOpenId(null)}>
          <PersonPanel
            person={open}
            now={now}
            canManage={canManage}
            onChangeAccess={() => setEditingId(open.memberId)}
            onRemove={() => setRemovingId(open.memberId)}
          />
        </TeamSheet>
      ) : null}

      {inviting && data.picker ? (
        <TeamSheet title="Invite someone" variant="center" onClose={() => setInviting(false)}>
          <InviteForm
            picker={data.picker}
            seatsLeft={seatsLeft}
            onDone={() => {
              void load();
            }}
            onClose={() => setInviting(false)}
          />
        </TeamSheet>
      ) : null}

      {editing && data.picker ? (
        <TeamSheet title={`${editing.name}'s role and access`} variant="center" onClose={() => setEditingId(null)}>
          <ChangeAccessForm
            person={editing}
            picker={data.picker}
            onSaved={async () => {
              setEditingId(null);
              await load();
            }}
          />
        </TeamSheet>
      ) : null}

      {removing ? (
        <TeamSheet
          title={removing.status === 'invited' ? 'Cancel this invite?' : `Remove ${removing.name}?`}
          variant="center"
          onClose={() => setRemovingId(null)}
        >
          <RemoveConfirm person={removing} ownerName={data.workspace.ownerName} onConfirm={() => remove(removing)} onCancel={() => setRemovingId(null)} />
        </TeamSheet>
      ) : null}
    </div>
  );
}

function PersonCard({ person, now, onOpen }: { person: TeamPerson; now: Date; onOpen: () => void }) {
  const online = isOnline(person.lastSeenAt, now);
  const pill = person.isCurrentUser ? 'You' : person.role === 'owner' ? 'Owner' : accessPill(person.access);
  const next = person.summary.tasks[0] ?? null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="motion-focus motion-press relative flex h-full min-h-[262px] w-full flex-col items-center rounded-2xl border border-stroke-default bg-bg-surface p-4 text-center hover:border-stroke-control"
    >
      {/* The pill has its own row above the face. In the corner, a long one
          ("Babyboy Dorian only") ran across the centred face. It is cut short
          with its full text on hover when it still does not fit. */}
      <span className="-mt-1 flex h-6 w-full justify-end">
        {pill ? (
          <span
            title={pill}
            className={`max-w-full truncate rounded-full px-2 py-0.5 text-[11.5px] ${
              person.access.kind !== 'all' && !person.isCurrentUser && person.role !== 'owner'
                ? 'bg-brand-subtle font-semibold text-brand'
                : 'bg-bg-hover text-content-secondary'
            }`}
          >
            {pill}
          </span>
        ) : null}
      </span>
      <TeamAvatar initials={person.initials} avatarUrl={person.avatarUrl} online={online} size="lg" />
      <span className="mt-3 w-full truncate text-[15px] font-semibold text-content-primary">{person.name}</span>
      <span className="text-[12.5px] text-content-secondary">{TEAM_ROLE_LABEL[person.role]}</span>
      <span className={`mt-0.5 text-[12.5px] ${online ? 'font-medium text-brand' : 'text-content-secondary'}`}>
        {teamPresenceLabel(person.lastSeenAt, now)}
      </span>
      <span className="mt-3 flex w-full justify-center gap-[22px] border-t border-stroke-default pt-3">
        <Num value={person.summary.open} label="Open" />
        <Num value={person.summary.late} label="Late" danger={person.summary.late > 0} />
        <Num value={person.summary.doneThisWeek} label="Done 7d" />
      </span>
      <span className="mt-3 w-full text-[12.5px]">
        <span className="block text-[10.5px] uppercase tracking-[0.08em] text-content-tertiary">Next</span>
        {next ? (
          <span className={`mt-0.5 line-clamp-2 ${next.late ? 'text-status-error' : 'text-content-primary'}`}>
            {next.title}
            {next.dueDate ? ` · ${dueLabel(next.dueDate, now)}` : ''}
          </span>
        ) : (
          <span className="mt-0.5 block text-content-tertiary">{TEAM_COPY.nothingAssigned}</span>
        )}
      </span>
      {person.summary.open ? (
        <span className="mt-auto pt-2.5 text-[12.5px] text-content-secondary">
          See {person.summary.open === 1 ? '1 task' : `${person.summary.open} tasks`} ›
        </span>
      ) : null}
    </button>
  );
}

function WaitingCard({ person, canManage, onOpen }: { person: TeamPerson; canManage: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="motion-focus motion-press relative flex h-full min-h-[262px] w-full flex-col items-center rounded-2xl border-[1.5px] border-dashed border-stroke-control p-4 text-center"
    >
      <span className="absolute right-3 top-3 rounded-full bg-bg-hover px-2 py-0.5 text-[11.5px] text-content-secondary">Invited</span>
      {/* The same row a person's card keeps for its pill, so faces line up. */}
      <span className="-mt-1 block h-6 w-full" aria-hidden="true" />
      <TeamAvatar initials={person.initials} avatarUrl={null} online={false} size="lg" pending />
      <span className="mt-3 w-full truncate text-[15px] text-content-primary">{person.email}</span>
      <span className="text-[12.5px] text-content-secondary">{TEAM_ROLE_LABEL[person.role]}</span>
      <span className="mt-0.5 text-[12.5px] text-content-secondary">
        {person.invitedAt ? `Invited ${new Date(person.invitedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Invited'}
      </span>
      {canManage ? <span className="mt-auto pt-2.5 text-[12.5px] text-content-secondary">Manage invite ›</span> : null}
    </button>
  );
}

function PersonRow({ person, now, onOpen }: { person: TeamPerson; now: Date; onOpen: () => void }) {
  const online = isOnline(person.lastSeenAt, now);
  const pill = accessPill(person.access);
  return (
    <button type="button" onClick={onOpen} className="motion-focus flex w-full items-center gap-3 py-2.5 text-left">
      <TeamAvatar initials={person.initials} avatarUrl={person.avatarUrl} online={online} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-content-primary">
          {person.name}
          {person.isCurrentUser ? <span className="font-normal text-content-tertiary"> · you</span> : null}
        </span>
        <span className="block truncate text-xs text-content-secondary">
          {TEAM_ROLE_LABEL[person.role]} · {pill && person.role !== 'owner' ? pill : teamPresenceLabel(person.lastSeenAt, now)}
        </span>
      </span>
      <span className="shrink-0 text-right font-mono text-xs tabular-nums text-content-secondary">
        {person.summary.open} open
        {person.summary.late ? <span className="block text-status-error">{person.summary.late} late</span> : null}
      </span>
    </button>
  );
}

function Num({ value, label, danger = false }: { value: number; label: string; danger?: boolean }) {
  return (
    <span className="flex flex-col items-center">
      <span className={`font-mono text-base leading-tight tabular-nums ${danger ? 'text-status-error' : 'text-content-primary'}`}>{value}</span>
      <span className="text-[11.5px] text-content-tertiary">{label}</span>
    </span>
  );
}

function TeamSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mt-2 h-4 w-56 animate-pulse rounded bg-bg-hover" />
      <div className="mt-4 hidden grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3.5 md:grid">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="flex min-h-[262px] flex-col items-center rounded-2xl border border-stroke-default bg-bg-surface p-4">
            <span className="-mt-1 block h-6 w-full" />
            <span className="h-[52px] w-[52px] animate-pulse rounded-full bg-bg-hover" />
            <span className="mt-3 h-4 w-24 animate-pulse rounded bg-bg-hover" />
            <span className="mt-2 h-3 w-16 animate-pulse rounded bg-bg-hover" />
          </div>
        ))}
      </div>
      <ul className="mt-3 md:hidden">
        {[0, 1, 2].map((key) => (
          <li key={key} className="flex h-14 items-center gap-3">
            <span className="h-9 w-9 animate-pulse rounded-full bg-bg-hover" />
            <span className="h-4 w-32 animate-pulse rounded bg-bg-hover" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function InviteForm({
  picker,
  seatsLeft,
  onDone,
  onClose,
}: {
  picker: NonNullable<TeamPageResponse['picker']>;
  seatsLeft: number | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [choice, setChoice] = useState<AccessChoice>({ role: 'team-member', kind: 'all', artistId: '', releaseIds: [] });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ url: string | null; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ready = validEmail && isAccessChoiceReady(choice) && !sending;

  const send = async () => {
    setSending(true);
    setError(null);
    const headers = await authHeaders();
    if (!headers) {
      setSending(false);
      setError('Sign in again to invite.');
      return;
    }
    const access = accessBody(choice);
    const response = await fetch('/api/workspace/members/invite', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: email.trim(),
        role: choice.role,
        ...(access.kind === 'artist' ? { artistId: access.artistId } : {}),
        ...(access.kind === 'rollouts' ? { releaseIds: access.releaseIds } : {}),
      }),
    });
    setSending(false);
    if (!response.ok) {
      setError(await readError(response, 'Could not send the invite.'));
      return;
    }
    const body = (await response.json().catch(() => ({}))) as { inviteUrl?: string; emailSent?: boolean };
    setSent({ url: body.inviteUrl || null, emailSent: Boolean(body.emailSent) });
    onDone();
  };

  if (sent) {
    return (
      <div>
        <p className="text-sm text-content-primary">
          {sent.emailSent ? `Invite sent to ${email.trim()}.` : `${email.trim()} is invited.`} Send them the link on WhatsApp too, so it does not sit in their inbox.
        </p>
        {sent.url ? (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(sent.url as string);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
            className="motion-focus motion-press mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-stroke-control text-sm font-semibold text-content-primary"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copied ? 'Link copied' : 'Copy invite link'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="motion-focus motion-press mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand text-sm font-semibold text-content-inverse"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-2 block text-[13px] text-content-secondary" htmlFor="team-invite-email">
        Email
      </label>
      <input
        id="team-invite-email"
        type="email"
        inputMode="email"
        autoComplete="off"
        data-autofocus
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="motion-focus mb-4 h-11 w-full rounded-xl border border-stroke-control bg-bg-base px-3 text-sm text-content-primary"
      />
      <AccessPicker value={choice} onChange={setChoice} picker={picker} />
      {seatsLeft !== null ? (
        <p className="mt-4 text-[12.5px] text-content-secondary">
          {seatsLeft === 0
            ? 'Your plan has no free seats left.'
            : seatsLeft === 1
              ? 'Uses your last free seat.'
              : `Uses 1 of your ${seatsLeft} free seats.`}
        </p>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-[13px] text-status-error">{error}</p> : null}
      <button
        type="button"
        onClick={send}
        disabled={!ready}
        className="motion-focus motion-press mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-content-inverse disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Send invite
      </button>
    </div>
  );
}

function ChangeAccessForm({
  person,
  picker,
  onSaved,
}: {
  person: TeamPerson;
  picker: NonNullable<TeamPageResponse['picker']>;
  onSaved: () => Promise<void>;
}) {
  const [choice, setChoice] = useState<AccessChoice>(() => ({
    role: person.role === 'owner' ? 'manager' : person.role,
    kind: person.access.kind,
    artistId: person.access.kind === 'artist' ? person.access.artistId : '',
    releaseIds: person.access.kind === 'rollouts' ? person.access.releaseIds : [],
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const headers = await authHeaders();
    if (!headers) {
      setSaving(false);
      setError('Sign in again to save.');
      return;
    }
    const response = await fetch(`/api/team/members/${encodeURIComponent(person.memberId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ role: choice.role, access: accessBody(choice) }),
    });
    setSaving(false);
    if (!response.ok) {
      setError(await readError(response, 'Could not save that change.'));
      return;
    }
    await onSaved();
  };

  return (
    <div>
      <AccessPicker value={choice} onChange={setChoice} picker={picker} />
      {error ? <p role="alert" className="mt-3 text-[13px] text-status-error">{error}</p> : null}
      <button
        type="button"
        onClick={save}
        disabled={!isAccessChoiceReady(choice) || saving}
        className="motion-focus motion-press mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-content-inverse disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Save
      </button>
    </div>
  );
}

function RemoveConfirm({
  person,
  ownerName,
  onConfirm,
  onCancel,
}: {
  person: TeamPerson;
  ownerName: string;
  onConfirm: () => Promise<string | null>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <p className="text-sm text-content-secondary">
        {person.status === 'invited'
          ? 'Their invite link stops working and the seat is free again.'
          : `They lose access straight away. Their open tasks go back to ${ownerName}.`}
      </p>
      {error ? <p role="alert" className="mt-3 text-[13px] text-status-error">{error}</p> : null}
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="motion-focus motion-press inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-stroke-control text-sm font-semibold text-content-primary"
        >
          Keep them
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const failure = await onConfirm();
            setBusy(false);
            if (failure) setError(failure);
          }}
          className="motion-focus motion-press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-status-error text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {person.status === 'invited' ? 'Cancel invite' : 'Remove'}
        </button>
      </div>
    </div>
  );
}

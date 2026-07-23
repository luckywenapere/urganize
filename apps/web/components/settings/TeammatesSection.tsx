'use client';

import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { getRolePermissions } from '@/lib/role-permissions';
import { errorMessage } from '@/lib/errors';
import type { WorkspaceMember } from '@/types/auth';
import {
  SettingsTeamMembersSectionSkeleton,
} from '@/components/loading/SettingsPageSkeleton';
import { getAccessToken } from './getAccessToken';
import { panelClass } from './panelClass';

type TeammatesSectionProps = {
  teammates: WorkspaceMember[];
  isLoadingTeammates: boolean;
  onTeammatesChange: (next: WorkspaceMember[]) => void;
  onRefetch: () => void;
};

/**
 * Self-gates on manager role, mirroring the other role/flag-gated sections.
 * Owns its own invite/remove handlers (click-triggered, so each fetches its
 * own fresh access token per the parent's "click handlers stay as-is"
 * decision) -- only the initial teammates LIST is centrally loaded by the
 * parent shell, passed down here as a prop.
 */
export function TeammatesSection({
  teammates,
  isLoadingTeammates,
  onTeammatesChange,
  onRefetch,
}: TeammatesSectionProps) {
  const user = useAuthStore((state) => state.user);
  // getRolePermissions returns a fresh object each call -- select the
  // primitive role and memoize locally rather than inline in the selector
  // (a fresh object reference every render would defeat Zustand's equality
  // check on every unrelated store update).
  const rolePermissions = useMemo(() => getRolePermissions(user?.role), [user?.role]);

  // Distinct artists on the roster, derived from the releases already in the
  // store — the picker for ARTIST invites (an artist only sees their own
  // releases; founder decision, 2026-07-23).
  const releases = useReleaseStore((state) => state.releases);
  const rosterArtists = useMemo(() => {
    const byId = new Map<string, string>();
    for (const release of releases) {
      if (release.artistId && !byId.has(release.artistId)) {
        byId.set(release.artistId, release.artistName || 'Unnamed artist');
      }
    }
    return Array.from(byId, ([id, name]) => ({ id, name }));
  }, [releases]);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviteArtistId, setInviteArtistId] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [teammateMessage, setTeammateMessage] = useState('');
  const [teammateError, setTeammateError] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);

  // Artist invites need a concrete artist to scope to.
  const isArtistInvite = inviteRole === 'artist';
  const scopedArtistId = isArtistInvite ? inviteArtistId : '';

  if (!user) return null;
  // Read-only for non-managers (founder decision, 2026-07-23): every
  // teammate can SEE the team they belong to — the shared "we're on the
  // same roster" surface — but inviting and removing stay manager-only.
  const canManage = rolePermissions.role === 'manager';

  const handleCopyInviteLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can fail on insecure origins / denied permission. The
      // link is visible and selectable in the message below, so this is a
      // soft failure.
    }
  };

  const handleInviteTeammate = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setTeammateError('Enter a valid email.');
      return;
    }

    if (isArtistInvite && !scopedArtistId) {
      setTeammateError('Pick which artist this invite is for.');
      return;
    }

    setIsInviting(true);
    setTeammateError('');
    setTeammateMessage('');
    setInviteUrl(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/workspace/members/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          role: inviteRole,
          artistId: scopedArtistId || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        inviteUrl?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not invite teammate.');
      }

      setInviteEmail('');
      setInviteRole('viewer');
      if (payload.inviteUrl) {
        setInviteUrl(payload.inviteUrl);
        setTeammateMessage('Invite link created — share it with your teammate.');
      } else {
        setTeammateMessage('Already a member of this workspace.');
      }
      // The route can't return a full member row for someone who hasn't
      // signed up yet, so refetch the list from the parent instead of
      // hand-constructing a partial one.
      onRefetch();
    } catch (err) {
      setTeammateError(errorMessage(err, 'Could not invite teammate.'));
    } finally {
      setIsInviting(false);
    }
  };

  // Shareable invite link (founder request, 2026-07-23) — for when you
  // don't have the person's email. Reuses the same link display + Copy UI
  // the email invite already renders.
  const handleCreateInviteLink = async () => {
    if (isArtistInvite && !scopedArtistId) {
      setTeammateError('Pick which artist this invite link is for.');
      return;
    }
    setIsCreatingLink(true);
    setTeammateError('');
    setTeammateMessage('');
    setInviteUrl(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/workspace/invite-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ artistId: scopedArtistId || undefined }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        inviteUrl?: string;
        ttlDays?: number;
        error?: string;
      };
      if (!response.ok || !payload.inviteUrl) {
        throw new Error(payload.error || 'Could not create invite link.');
      }
      setInviteUrl(payload.inviteUrl);
      const scopedArtistName = scopedArtistId
        ? rosterArtists.find((artist) => artist.id === scopedArtistId)?.name
        : null;
      setTeammateMessage(
        scopedArtistName
          ? `Artist invite link created — whoever joins with it only sees ${scopedArtistName}'s releases. Valid for ${payload.ttlDays ?? 7} days.`
          : `Invite link created — anyone with it joins as a Team Member. Valid for ${payload.ttlDays ?? 7} days.`
      );
      try {
        await navigator.clipboard.writeText(payload.inviteUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        // Clipboard can fail on insecure origins — the link is shown below.
      }
    } catch (err) {
      setTeammateError(errorMessage(err, 'Could not create invite link.'));
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleRemoveTeammate = async (memberId: string) => {
    setTeammateError('');
    setTeammateMessage('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch(`/api/workspace/members/${memberId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not remove teammate.');
      onTeammatesChange(teammates.filter((m) => m.id !== memberId));
      setTeammateMessage('Teammate removed.');
    } catch (err) {
      setTeammateError(errorMessage(err, 'Could not remove teammate.'));
    }
  };

  return (
    <section id="teammates" className={`${panelClass} scroll-mt-24`}>
      <h2 className="mb-5 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Teammates
        {/* Team invites are Beta (founder call, 2026-07-23) — same pill as
            the other Beta-tagged surfaces (statuses, attachments, calendar). */}
        <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
          Beta
        </span>
      </h2>
      {canManage ? (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input
          value={inviteEmail}
          onChange={(event) => setInviteEmail(event.target.value)}
          placeholder="teammate@email.com"
          className="rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand sm:col-span-2"
        />
        <select
          value={inviteRole}
          onChange={(event) => setInviteRole(event.target.value)}
          className="rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
        >
          <option value="manager">Manager</option>
          <option value="artist">Artist</option>
          <option value="team-member">Team Member</option>
          <option value="viewer">Viewer</option>
        </select>
        {/* ARTIST invites scope visibility to one artist's releases —
            pick which artist this person is (founder decision, 2026-07-23). */}
        {isArtistInvite ? (
          <select
            value={inviteArtistId}
            onChange={(event) => setInviteArtistId(event.target.value)}
            aria-label="Which artist is this invite for?"
            className="rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand sm:col-span-2"
          >
            <option value="">Which artist?</option>
            {rosterArtists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          onClick={() => void handleInviteTeammate()}
          disabled={isInviting}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
        >
          {isInviting ? 'Inviting...' : 'Invite'}
        </button>
      </div>
      ) : null}

      {canManage ? (
        <div className="mt-2">
          {/* No email? Share a link instead — Linear-style. */}
          <button
            type="button"
            onClick={() => void handleCreateInviteLink()}
            disabled={isCreatingLink}
            className="motion-focus inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-secondary disabled:opacity-60"
          >
            <Copy className="h-3 w-3" aria-hidden="true" />
            {isCreatingLink
              ? 'Creating link…'
              : isArtistInvite
                ? 'Copy artist invite link'
                : 'Copy invite link'}
          </button>
        </div>
      ) : null}

      {teammateMessage && (
        <div className="mt-3 rounded-lg border border-status-info/35 bg-status-info/10 px-3 py-2 text-sm text-status-info">
          <p>{teammateMessage}</p>
          {inviteUrl && (
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={inviteUrl}
                onFocus={(event) => event.target.select()}
                className="min-w-0 flex-1 truncate rounded-lg border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-secondary"
              />
              <button
                type="button"
                onClick={() => void handleCopyInviteLink()}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-stroke-subtle bg-bg-surface px-2 py-1 text-xs text-content-primary hover:bg-bg-hover"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}
      {teammateError && (
        <p className="mt-3 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {teammateError}
        </p>
      )}

      {/* Skeleton only on the FIRST load — a background refetch with rows
          already on screen keeps them visible instead of flashing. */}
      {isLoadingTeammates && teammates.length === 0 ? (
        <SettingsTeamMembersSectionSkeleton />
      ) : teammates.length === 0 ? (
        <p className="mt-4 text-sm text-content-secondary">
          {canManage
            ? 'No teammates yet. Invite someone to get started.'
            : 'No teammates to show yet.'}
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {teammates.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2"
            >
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-content-primary">
                  {member.name || 'Unknown'}
                  {/* Pending invites finally announce themselves (founder
                      call, 2026-07-23) — this pill is the "did my invite
                      go through?" answer. It disappears on accept. */}
                  {member.status !== 'active' ? (
                    <span className="rounded-full bg-status-warning/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-status-warning">
                      Invited
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-content-secondary">{member.email || 'No email'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-stroke-subtle bg-bg-surface px-2 py-1 text-xs capitalize text-content-primary">
                  {(member.role || 'viewer').replace(/-/g, ' ')}
                </span>
                {canManage && member.userId !== user.id && (
                  <button
                    type="button"
                    onClick={() => void handleRemoveTeammate(member.id)}
                    className="text-xs text-status-error hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

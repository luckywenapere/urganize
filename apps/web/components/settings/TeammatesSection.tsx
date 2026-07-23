'use client';

import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
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

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [isInviting, setIsInviting] = useState(false);
  const [teammateMessage, setTeammateMessage] = useState('');
  const [teammateError, setTeammateError] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!user || rolePermissions.role !== 'manager') return null;

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
        body: JSON.stringify({ email, role: inviteRole }),
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
      <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">Teammates</h2>
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
        <button
          type="button"
          onClick={() => void handleInviteTeammate()}
          disabled={isInviting}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
        >
          {isInviting ? 'Inviting...' : 'Invite'}
        </button>
      </div>

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
        <p className="mt-4 text-sm text-content-secondary">No teammates yet. Invite someone to get started.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {teammates.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-content-primary">{member.name || 'Unknown'}</p>
                <p className="text-xs text-content-secondary">{member.email || 'No email'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-stroke-subtle bg-bg-surface px-2 py-1 text-xs capitalize text-content-primary">
                  {(member.role || 'viewer').replace(/-/g, ' ')}
                </span>
                {member.userId !== user.id && (
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

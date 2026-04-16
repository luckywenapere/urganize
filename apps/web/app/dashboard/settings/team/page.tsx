'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PaywallGate } from '@/components/billing/PaywallGate';
import { EmptyState } from '@/components/shared/EmptyState';
import { SectionCard } from '@/components/shared/SectionCard';
import { Toast } from '@/components/shared/Toast';
import { ONBOARDING_INVITE_SENT_EVENT } from '@/lib/onboarding';
import { WORKSPACE_MEMBER_ROLE_OPTIONS, type WorkspaceMember, type WorkspaceMemberRole } from '@/lib/tasks';
import { supabase } from '@/lib/supabase/client';

type TeamPayload = {
  workspace?: {
    id: string;
    name: string;
  };
  members?: WorkspaceMember[];
  error?: string;
};

type ToastState = {
  message: string;
  tone: 'success' | 'error';
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

export default function TeamSettingsPage() {
  const [workspaceName, setWorkspaceName] = useState('Workspace');
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceMemberRole>('member');
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [error, setError] = useState('');

  const loadMembers = async () => {
    setIsLoading(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch('/api/workspace/members', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as TeamPayload;
      if (!response.ok) {
        throw new Error(payload.error || 'Could not load team members.');
      }

      setWorkspaceName(payload.workspace?.name || 'Workspace');
      setMembers(Array.isArray(payload.members) ? payload.members : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load team members.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const inviteMember = async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch('/api/workspace/members/invite', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, role }),
      });

      const payload = (await response.json().catch(() => ({}))) as { inviteUrl?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not invite teammate.');
      }

      setEmail('');
      setRole('member');
      setToast({
        tone: 'success',
        message: payload.inviteUrl ? 'Invite created. Link copied to server logs for now.' : 'Invite created.',
      });
      window.dispatchEvent(
        new CustomEvent(ONBOARDING_INVITE_SENT_EVENT, {
          detail: {
            email,
            role,
          },
        })
      );
      await loadMembers();
    } catch (inviteError) {
      setToast({
        tone: 'error',
        message: inviteError instanceof Error ? inviteError.message : 'Could not invite teammate.',
      });
    }
  };

  const updateRole = async (memberId: string, nextRole: WorkspaceMemberRole) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch(`/api/workspace/members/${memberId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: nextRole }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not update teammate role.');
      }

      setToast({ tone: 'success', message: 'Role updated.' });
      await loadMembers();
    } catch (roleError) {
      setToast({
        tone: 'error',
        message: roleError instanceof Error ? roleError.message : 'Could not update teammate role.',
      });
    }
  };

  const removeMember = async (memberId: string) => {
    if (!window.confirm('Remove this teammate from the workspace?')) {
      return;
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch(`/api/workspace/members/${memberId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not remove teammate.');
      }

      setToast({ tone: 'success', message: 'Teammate removed.' });
      await loadMembers();
    } catch (removeError) {
      setToast({
        tone: 'error',
        message: removeError instanceof Error ? removeError.message : 'Could not remove teammate.',
      });
    }
  };

  return (
    <main className="min-h-screen bg-bg-base text-content-primary" data-ph-capture-attribute-section="tasks">
      <div className="mx-auto max-w-[1100px] px-4 pb-24 pt-16 sm:px-6 sm:py-10">
        <div className="mb-4">
          <Link href="/settings" className="inline-flex min-h-10 items-center text-sm text-content-secondary hover:text-content-primary">
            Back to settings
          </Link>
        </div>

        {toast ? <div className="mb-4"><Toast message={toast.message} tone={toast.tone} /></div> : null}
        {error ? <div className="mb-4"><Toast message={error} tone="error" /></div> : null}

        <SectionCard className="sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Team</p>
              <h1 className="mt-2 text-[clamp(2rem,4vw,3rem)] tracking-tight text-content-primary">
                {workspaceName}
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-content-secondary">
                Invite the people who need task visibility.
              </p>
            </div>
          </div>

          <div
            data-onboarding-target="team-invite-form"
            className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto]"
          >
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input h-12 rounded-[18px]"
                placeholder="teammate@example.com"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Role
              </span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as WorkspaceMemberRole)}
                className="input h-12 rounded-[18px]"
              >
                {WORKSPACE_MEMBER_ROLE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <PaywallGate>
                {({ requireAccess }) => (
                  <button
                    type="button"
                    onClick={() => void requireAccess(() => inviteMember())}
                    className="min-h-12 rounded-[18px] bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                  >
                    Invite teammate
                  </button>
                )}
              </PaywallGate>
            </div>
          </div>
        </SectionCard>

        <div className="mt-6">
          {isLoading ? (
            <SectionCard className="space-y-4 sm:p-7">
              <div className="h-4 w-28 rounded-full skeleton-shimmer" />
              <div className="h-10 w-2/5 rounded-[18px] skeleton-shimmer" />
              <div className="h-4 w-3/5 rounded-full skeleton-shimmer" />
            </SectionCard>
          ) : members.length === 0 ? (
            <EmptyState
              title="No teammates yet"
              description="Invite teammates so tasks can be assigned."
            />
          ) : (
            <SectionCard className="overflow-hidden px-0 py-0">
              <div className="grid gap-px bg-stroke-subtle">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="grid gap-4 bg-bg-surface px-5 py-4 md:grid-cols-[minmax(0,1fr)_180px_140px_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-content-primary">{member.name}</p>
                      <p className="mt-1 truncate text-sm text-content-secondary">{member.email}</p>
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                        Role
                      </span>
                      <select
                        value={member.role}
                        onChange={(event) => void updateRole(member.id, event.target.value as WorkspaceMemberRole)}
                        className="input h-11 rounded-[16px]"
                        disabled={member.role === 'owner'}
                      >
                        {WORKSPACE_MEMBER_ROLE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                        Status
                      </p>
                      <p className="rounded-[16px] border border-stroke-default bg-bg-elevated px-3 py-3 text-sm text-content-secondary">
                        {member.status}
                      </p>
                    </div>

                    <div className="flex items-end justify-start md:justify-end">
                      {member.role === 'owner' ? (
                        <span className="rounded-full border border-stroke-default px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                          Owner
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void removeMember(member.id)}
                          className="rounded-full border border-status-error/35 bg-status-error/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-status-error"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </main>
  );
}

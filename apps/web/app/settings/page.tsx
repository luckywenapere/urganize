'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { getRolePermissions } from '@/lib/role-permissions';
import { ThemeToggle } from '@urganize/ui';
import {
  SettingsPageSkeleton,
  SettingsTeamMembersSectionSkeleton,
} from '@/components/loading/SettingsPageSkeleton';
import { errorMessage } from "@/lib/errors";

type WorkspaceMember = {
  id: string;
  user_id: string;
  role: string;
  name: string;
  email: string;
};

const panelClass =
  'rounded-3xl border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.14)] backdrop-blur-sm sm:p-6';

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout, checkAuth, updateArtistName, isLoading: authLoading } = useAuthStore();

  const [name, setName] = useState('');
  const [artistProfileName, setArtistProfileName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [notificationsEmail, setNotificationsEmail] = useState(true);
  const [notificationsProduct, setNotificationsProduct] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Workspace teammates
  const [teammates, setTeammates] = useState<WorkspaceMember[]>([]);
  const [isLoadingTeammates, setIsLoadingTeammates] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('viewer');
  const [isInviting, setIsInviting] = useState(false);
  const [teammateMessage, setTeammateMessage] = useState('');
  const [teammateError, setTeammateError] = useState('');

  const rolePermissions = useMemo(() => getRolePermissions(user?.role), [user?.role]);
  const isManagerAccount = rolePermissions.role === 'manager';

  const getAccessToken = async (): Promise<string> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    setName(user.name || '');
    setArtistProfileName(String(user.artist_name || ''));
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user) return;

    const notificationsRaw = localStorage.getItem(`urganize.notifications.${user.id}`);
    if (notificationsRaw) {
      try {
        const parsed = JSON.parse(notificationsRaw);
        setNotificationsEmail(parsed.notificationsEmail ?? true);
        setNotificationsProduct(parsed.notificationsProduct ?? false);
      } catch {
        setNotificationsEmail(true);
        setNotificationsProduct(false);
      }
    }
  }, [user]);

  useEffect(() => {
    if (!user || !isManagerAccount) return;
    let cancelled = false;

    const loadTeammates = async () => {
      setIsLoadingTeammates(true);
      try {
        const token = await getAccessToken();
        if (!token) return;

        const response = await fetch('/api/workspace/members', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });

        const payload = (await response.json().catch(() => ({}))) as {
          members?: WorkspaceMember[];
          error?: string;
        };

        if (!cancelled && response.ok && Array.isArray(payload.members)) {
          setTeammates(payload.members);
        }
      } catch {
        // Non-blocking
      } finally {
        if (!cancelled) setIsLoadingTeammates(false);
      }
    };

    void loadTeammates();
    return () => { cancelled = true; };
  }, [user, isManagerAccount]);

  const clearFeedback = () => {
    setError('');
    setSuccess('');
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!name.trim()) {
      setError('Name cannot be empty');
      return;
    }

    clearFeedback();
    setIsSavingName(true);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw updateError;

      await checkAuth();
      setSuccess('Profile updated');
    } catch (err) {
      setError(errorMessage(err, 'Failed to update profile'));
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSaveArtistProfileName = async () => {
    if (!user || user.role !== 'artist') return;
    clearFeedback();
    const normalized = artistProfileName.trim();
    if (!normalized) {
      setError('Artist name cannot be empty');
      return;
    }

    setIsSavingName(true);
    try {
      await updateArtistName(normalized);
      await checkAuth();
      setSuccess('Artist name updated');
    } catch (err) {
      setError(errorMessage(err, 'Failed to update artist name'));
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSavePassword = async () => {
    clearFeedback();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSavingPassword(true);
    try {
      const { error: passwordError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (passwordError) throw passwordError;

      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password updated');
    } catch (err) {
      setError(errorMessage(err, 'Failed to update password'));
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!user) return;
    clearFeedback();
    setIsSavingNotifications(true);
    try {
      localStorage.setItem(
        `urganize.notifications.${user.id}`,
        JSON.stringify({ notificationsEmail, notificationsProduct })
      );
      setSuccess('Notification preferences saved');
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const handleDeleteNow = async () => {
    clearFeedback();
    if (!user) return;

    if (confirmationText.trim() !== 'DELETE') {
      setError('Type DELETE exactly to confirm');
      return;
    }

    setIsDeleting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Session expired. Please sign in again.');
      }

      const res = await fetch('/api/account/delete-now', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirmationText }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not delete account');

      await logout();
      router.push('/auth');
    } catch (err) {
      setError(errorMessage(err, 'Could not delete account'));
    } finally {
      setIsDeleting(false);
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
        member?: WorkspaceMember;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not invite teammate.');
      }
      if (payload.member) {
        setTeammates((current) => {
          const idx = current.findIndex((m) => m.user_id === payload.member?.user_id);
          if (idx === -1) return [...current, payload.member as WorkspaceMember];
          const next = [...current];
          next[idx] = payload.member as WorkspaceMember;
          return next;
        });
      }
      setInviteEmail('');
      setInviteRole('viewer');
      setTeammateMessage('Invite sent.');
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
      setTeammates((current) => current.filter((m) => m.id !== memberId));
      setTeammateMessage('Teammate removed.');
    } catch (err) {
      setTeammateError(errorMessage(err, 'Could not remove teammate.'));
    }
  };

  if (authLoading) {
    return <SettingsPageSkeleton />;
  }

  if (!user) return <SettingsPageSkeleton />;

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="relative mx-auto w-full max-w-5xl px-4 pb-8 pt-20 sm:px-6 sm:py-10">
        <div className="pointer-events-none absolute -right-16 -top-12 h-52 w-52 rounded-full bg-brand/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-status-info/12 blur-3xl" />
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl tracking-tight sm:text-4xl">Settings</h1>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-content-tertiary">Account and preferences</p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Link
              href="/dashboard"
              className="w-full rounded-full border border-stroke-default bg-bg-elevated px-4 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary sm:w-auto sm:py-2"
            >
              Dashboard
            </Link>
          </div>
        </div>

        {error && <p className="mb-5 rounded-lg border border-status-error/40 bg-status-error/10 px-4 py-3 text-sm text-status-error">{error}</p>}
        {success && <p className="mb-5 rounded-lg border border-brand/35 bg-brand-muted px-4 py-3 text-sm text-brand">{success}</p>}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className={panelClass}>
            <h2 className="mb-4 text-xl">Profile</h2>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm text-content-secondary">Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-content-secondary">Email</span>
                <input value={user.email} disabled className="w-full rounded-lg border border-stroke-subtle bg-bg-overlay px-3 py-2 text-content-secondary" />
              </label>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isSavingName}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
              >
                {isSavingName ? 'Saving...' : 'Save profile'}
              </button>
            </div>
          </section>

          <section className={panelClass}>
            <h2 className="mb-4 text-xl">Security</h2>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm text-content-secondary">New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-content-secondary">Confirm new password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                />
              </label>
              <button
                type="button"
                onClick={handleSavePassword}
                disabled={isSavingPassword}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
              >
                {isSavingPassword ? 'Updating...' : 'Update password'}
              </button>
            </div>
          </section>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className={panelClass}>
            <h2 className="mb-4 text-xl">Notifications</h2>
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-4 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2">
                <span className="text-sm text-content-primary">Release reminders by email</span>
                <input
                  type="checkbox"
                  checked={notificationsEmail}
                  onChange={(event) => setNotificationsEmail(event.target.checked)}
                  className="h-4 w-4"
                />
              </label>
              <label className="flex items-center justify-between gap-4 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2">
                <span className="text-sm text-content-primary">Product updates and launch notes</span>
                <input
                  type="checkbox"
                  checked={notificationsProduct}
                  onChange={(event) => setNotificationsProduct(event.target.checked)}
                  className="h-4 w-4"
                />
              </label>
              <button
                type="button"
                onClick={handleSaveNotifications}
                disabled={isSavingNotifications}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
              >
                {isSavingNotifications ? 'Saving...' : 'Save notifications'}
              </button>
            </div>
          </section>

          <section className={panelClass}>
            <h2 className="mb-4 text-xl">Appearance</h2>
            <div className="rounded-lg border border-stroke-subtle bg-bg-elevated p-4">
              <p className="text-sm text-content-secondary">Switch between dark and light mode.</p>
              <div className="mt-3">
                <ThemeToggle />
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className={panelClass}>
            <h2 className="mb-4 text-xl">Session</h2>
            <div className="rounded-lg border border-stroke-subtle bg-bg-elevated p-4">
              <p className="text-sm text-content-secondary">Signed in as {user.email}.</p>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  router.push('/auth');
                }}
                className="mt-4 rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-medium text-content-primary hover:bg-bg-hover"
              >
                Log out
              </button>
            </div>
          </section>

          {user.role === 'artist' && (
            <section className={panelClass}>
              <h2 className="mb-4 text-xl">Artist profile</h2>
              <p className="mb-3 text-sm text-content-secondary">
                This name is reused across the app.
              </p>
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-sm text-content-secondary">Artist name</span>
                  <input
                    value={artistProfileName}
                    onChange={(event) => setArtistProfileName(event.target.value)}
                    className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                    placeholder="e.g. Tems"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleSaveArtistProfileName}
                  disabled={isSavingName}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
                >
                  {isSavingName ? 'Saving...' : 'Save artist name'}
                </button>
              </div>
            </section>
          )}
        </div>

        {isManagerAccount && (
        <section className={`${panelClass} mt-6`}>
          <h2 className="mb-4 text-xl">Teammates</h2>
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
            <p className="mt-3 rounded-lg border border-status-info/35 bg-status-info/10 px-3 py-2 text-sm text-status-info">
              {teammateMessage}
            </p>
          )}
          {teammateError && (
            <p className="mt-3 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
              {teammateError}
            </p>
          )}

          {isLoadingTeammates ? (
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
                    <span className="rounded border border-stroke-subtle bg-bg-surface px-2 py-1 text-xs capitalize text-content-primary">
                      {(member.role || 'viewer').replace(/-/g, ' ')}
                    </span>
                    {member.user_id !== user.id && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTeammate(member.id)}
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
        )}

        <section className="mt-6 rounded-3xl border border-status-error/35 bg-status-error/10 p-6">
          <h2 className="mb-2 text-xl text-status-error">Delete account</h2>
          <p className="mb-4 text-sm text-content-secondary">
            This permanently deletes your account. This action cannot be undone.
          </p>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-content-secondary">Type DELETE</span>
              <input
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                className="w-full rounded-lg border border-status-error/35 bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-status-error"
              />
            </label>

            <button
              type="button"
              onClick={handleDeleteNow}
              disabled={isDeleting}
              className="rounded-lg bg-status-error px-4 py-2 text-sm font-semibold text-content-inverse hover:opacity-90 disabled:opacity-55"
            >
              {isDeleting ? 'Deleting...' : 'Delete account'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

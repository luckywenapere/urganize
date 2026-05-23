'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { getRolePermissions } from '@/lib/role-permissions';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { fetchUiDraft, saveUiDraft } from '@/lib/ui-drafts';
import { ThemeToggle } from '@urganize/ui';
import {
  SettingsPageSkeleton,
  SettingsTeamMembersSectionSkeleton,
} from '@/components/loading/SettingsPageSkeleton';
import { errorMessage } from "@/lib/errors";

type OrganizationInfo = {
  id: string;
  name: string;
  owner_id: string;
  created_at?: string;
  updated_at?: string;
};

type OrganizationMember = {
  id: string;
  user_id: string;
  role: 'manager' | 'artist' | 'team-member' | 'viewer';
  name: string;
  email: string;
  created_at?: string;
  updated_at?: string;
};

type SettingsUiState = {
  organizationName: string;
  newMemberEmail: string;
  newMemberRole: 'manager' | 'artist' | 'team-member' | 'viewer';
};

const panelClass =
  'rounded-3xl border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.14)] backdrop-blur-sm sm:p-6';
const SETTINGS_UI_STATE_VERSION = 1;
const SETTINGS_UI_STATE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SETTINGS_UI_STATE_SCOPE = 'settings-ui';

const isSettingsUiState = (value: unknown): value is SettingsUiState => {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<SettingsUiState>;
  return (
    typeof state.organizationName === 'string' &&
    typeof state.newMemberEmail === 'string' &&
    (state.newMemberRole === 'manager' ||
      state.newMemberRole === 'artist' ||
      state.newMemberRole === 'team-member' ||
      state.newMemberRole === 'viewer')
  );
};

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
  const [organization, setOrganization] = useState<OrganizationInfo | null>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [isSavingOrganization, setIsSavingOrganization] = useState(false);
  const [organizationMessage, setOrganizationMessage] = useState('');
  const [organizationError, setOrganizationError] = useState('');
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'manager' | 'artist' | 'team-member' | 'viewer'>('viewer');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [memberMessage, setMemberMessage] = useState('');
  const [memberError, setMemberError] = useState('');
  const rolePermissions = useMemo(() => getRolePermissions(user?.role), [user?.role]);
  const isManagerAccount = rolePermissions.role === 'manager';
  const settingsUiStateKey = user ? `urganize.settings.ui.v${SETTINGS_UI_STATE_VERSION}.${user.id}` : '';

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
    if (!settingsUiStateKey) return;
    let cancelled = false;

    const restore = async () => {
      const localDraft = readPersistedState<SettingsUiState>(
        settingsUiStateKey,
        SETTINGS_UI_STATE_VERSION,
        isSettingsUiState,
        SETTINGS_UI_STATE_MAX_AGE_MS
      );
      const remoteDraft = await fetchUiDraft<SettingsUiState>(SETTINGS_UI_STATE_SCOPE, settingsUiStateKey);
      const restored =
        localDraft || (remoteDraft.payload && isSettingsUiState(remoteDraft.payload) ? remoteDraft.payload : null);
      if (!restored || cancelled) return;

      setOrganizationName(restored.organizationName);
      setNewMemberEmail(restored.newMemberEmail);
      setNewMemberRole(restored.newMemberRole);
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [settingsUiStateKey]);

  useEffect(() => {
    if (!settingsUiStateKey) return;
    const draft: SettingsUiState = {
      organizationName,
      newMemberEmail,
      newMemberRole,
    };
    writePersistedState<SettingsUiState>(settingsUiStateKey, SETTINGS_UI_STATE_VERSION, draft);
    void saveUiDraft<SettingsUiState>(SETTINGS_UI_STATE_SCOPE, settingsUiStateKey, draft);
  }, [newMemberEmail, newMemberRole, organizationName, settingsUiStateKey]);

  useEffect(() => {
    if (!user) return;

    const loadSettingsData = async () => {
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
    };

    loadSettingsData();
  }, [user]);

  // Hoisted above the effects that call it so the static analyzer (and
  // react-hooks/immutability) don't see a forward-reference TDZ slot.
  const getAccessToken = async (): Promise<string> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadOrganization = async () => {
      setIsLoadingMembers(true);
      setOrganizationError('');
      setMemberError('');
      try {
        const token = await getAccessToken();
        if (!token) {
          setOrganizationError('Session expired. Please sign in again.');
          return;
        }

        const [orgRes, membersRes] = await Promise.all([
          fetch('/api/organization', {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          }),
          fetch('/api/organization/members', {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          }),
        ]);

        const orgPayload = (await orgRes.json().catch(() => ({}))) as {
          organization?: OrganizationInfo | null;
          error?: string;
        };
        const membersPayload = (await membersRes.json().catch(() => ({}))) as {
          members?: OrganizationMember[];
          error?: string;
        };

        if (!orgRes.ok) {
          setOrganizationError(orgPayload.error || 'Could not load organization.');
          return;
        }
        if (!membersRes.ok) {
          setMemberError(membersPayload.error || 'Could not load members.');
        }

        if (!cancelled) {
          setOrganization(orgPayload.organization || null);
          setOrganizationName(orgPayload.organization?.name || '');
          setMembers(Array.isArray(membersPayload.members) ? membersPayload.members : []);
        }
      } catch {
        if (!cancelled) {
          setOrganizationError('Could not load organization settings.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMembers(false);
        }
      }
    };

    loadOrganization();
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  const handleSaveOrganization = async () => {
    const name = organizationName.trim();
    if (!name) {
      setOrganizationError('Organization name is required.');
      return;
    }
    setIsSavingOrganization(true);
    setOrganizationError('');
    setOrganizationMessage('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/organization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        organization?: OrganizationInfo;
        status?: string;
        error?: string;
      };
      if (!response.ok || !payload.organization) {
        throw new Error(payload.error || 'Could not save organization.');
      }
      setOrganization(payload.organization);
      setOrganizationName(payload.organization.name || name);
      setOrganizationMessage(payload.status === 'created' ? 'Organization created.' : 'Organization updated.');
    } catch (err) {
      setOrganizationError(errorMessage(err, 'Could not save organization.'));
    } finally {
      setIsSavingOrganization(false);
    }
  };

  const handleAddMember = async () => {
    const email = newMemberEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setMemberError('Enter a valid email.');
      return;
    }

    setIsAddingMember(true);
    setMemberError('');
    setMemberMessage('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/organization/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          role: newMemberRole,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        member?: OrganizationMember;
        error?: string;
      };
      if (!response.ok || !payload.member) {
        throw new Error(payload.error || 'Could not add member.');
      }
      setMembers((current) => {
        const existingIndex = current.findIndex((member) => member.user_id === payload.member?.user_id);
        if (existingIndex === -1) return [...current, payload.member as OrganizationMember];
        const next = [...current];
        next[existingIndex] = payload.member as OrganizationMember;
        return next;
      });
      setNewMemberEmail('');
      setNewMemberRole('viewer');
      setMemberMessage('Member saved.');
    } catch (err) {
      setMemberError(errorMessage(err, 'Could not add member.'));
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleMemberRoleChange = async (memberId: string, role: OrganizationMember['role']) => {
    setMemberError('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/organization/members', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ memberId, role }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        member?: { role?: OrganizationMember['role'] };
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'Could not update member role.');
      setMembers((current) =>
        current.map((member) =>
          member.id === memberId ? { ...member, role: (payload.member?.role || role) as OrganizationMember['role'] } : member
        )
      );
    } catch (err) {
      setMemberError(errorMessage(err, 'Could not update role.'));
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setMemberError('');
    setMemberMessage('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch('/api/organization/members', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ memberId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not remove member.');
      setMembers((current) => current.filter((member) => member.id !== memberId));
      setMemberMessage('Member removed.');
    } catch (err) {
      setMemberError(errorMessage(err, 'Could not remove member.'));
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
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-content-tertiary">Account, billing, and workflow</p>
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
          {isManagerAccount && (
            <section className={panelClass}>
            <h2 className="mb-4 text-xl">Organization</h2>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm text-content-secondary">Organization name</span>
                <input
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  placeholder="e.g. The Label Group"
                  className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                />
              </label>
              <button
                type="button"
                onClick={handleSaveOrganization}
                disabled={isSavingOrganization}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
              >
                {isSavingOrganization ? 'Saving...' : organization ? 'Update organization' : 'Create organization'}
              </button>
              {organization && (
                <p className="text-xs text-content-tertiary">
                  Owner ID: {organization.owner_id}
                </p>
              )}
              {organizationMessage && (
                <p className="rounded-lg border border-status-info/35 bg-status-info/10 px-3 py-2 text-sm text-status-info">
                  {organizationMessage}
                </p>
              )}
              {organizationError && (
                <p className="rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                  {organizationError}
                </p>
              )}
            </div>
          </section>
          )}

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
            <section className={`${panelClass} mt-6`}>
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
        <section id="billing" className={`${panelClass} mt-6`}>
          <h2 className="mb-4 text-xl">Team members</h2>
          {!organization ? (
            <p className="text-sm text-content-secondary">Create your organization first.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <input
                  value={newMemberEmail}
                  onChange={(event) => setNewMemberEmail(event.target.value)}
                  placeholder="member@email.com"
                  className="rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand sm:col-span-2"
                />
                <select
                  value={newMemberRole}
                  onChange={(event) =>
                    setNewMemberRole(
                      ((event.target.value as OrganizationMember['role']) || 'viewer') as OrganizationMember['role']
                    )
                  }
                  className="rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                >
                  <option value="manager">Manager</option>
                  <option value="artist">Artist</option>
                  <option value="team-member">Team Member</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleAddMember()}
                  disabled={isAddingMember}
                  className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
                >
                  {isAddingMember ? 'Adding...' : 'Add member'}
                </button>
              </div>

              {memberMessage && (
                <p className="mt-3 rounded-lg border border-status-info/35 bg-status-info/10 px-3 py-2 text-sm text-status-info">
                  {memberMessage}
                </p>
              )}
              {memberError && (
                <p className="mt-3 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                  {memberError}
                </p>
              )}

              {isLoadingMembers ? (
                <SettingsTeamMembersSectionSkeleton />
              ) : members.length === 0 ? (
                <p className="mt-4 text-sm text-content-secondary">No team yet.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-content-primary">{member.name || 'Unknown'}</p>
                        <p className="text-xs text-content-secondary">{member.email || 'No email'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={member.role}
                          onChange={(event) =>
                            handleMemberRoleChange(
                              member.id,
                              ((event.target.value as OrganizationMember['role']) || 'viewer') as OrganizationMember['role']
                            )
                          }
                          className="rounded border border-stroke-subtle bg-bg-surface px-2 py-1 text-xs text-content-primary"
                        >
                          <option value="manager">Manager</option>
                          <option value="artist">Artist</option>
                          <option value="team-member">Team Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        {member.user_id !== user.id && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.id)}
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
            </>
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


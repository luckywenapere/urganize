'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { trackEvent } from '@/lib/analytics';
import {
  INDIVIDUAL_PLAN_OPTIONS,
  MIN_GROUP_TEAM_SIZE,
  MAX_GROUP_TEAM_SIZE,
  buildGroupPaymentMetadata,
  calculateGroupPlanPricing,
  clampTeamSize,
  type GroupBillingCycle,
  type GroupPaymentMode,
  type IndividualPlanId,
} from '@/lib/billing';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const PaystackButton = dynamic(
  () => import('@/components/PaystackButton').then((mod) => mod.PaystackButton),
  { ssr: false }
);

type SubscriptionInfo = {
  plan: string | null;
  status: string | null;
  amount: number | null;
  expires_at: string | null;
};

type PaymentVerifyResponse = {
  status?: string;
  error?: string;
  message?: string;
  plan?: string;
  amount?: number;
  trialing?: boolean;
  trial_ends_at?: string;
};

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

const panelClass =
  'rounded-3xl border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.14)] backdrop-blur-sm sm:p-6';

const parsePaymentMetadata = (paystackResponse: unknown): Record<string, unknown> => {
  if (!paystackResponse || typeof paystackResponse !== 'object') return {};
  const metadata = (paystackResponse as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== 'object') return {};
  return metadata as Record<string, unknown>;
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
  const [subscription, setSubscription] = useState<SubscriptionInfo>({
    plan: null,
    status: null,
    amount: null,
    expires_at: null,
  });

  const [billingMode, setBillingMode] = useState<'individual' | 'group'>('individual');
  const [selectedIndividualPlan, setSelectedIndividualPlan] = useState<IndividualPlanId>('monthly');
  const [groupBillingCycle, setGroupBillingCycle] = useState<GroupBillingCycle>('monthly');
  const [groupTeamSize, setGroupTeamSize] = useState(MIN_GROUP_TEAM_SIZE);
  const [groupPaymentMode, setGroupPaymentMode] = useState<GroupPaymentMode>('full');
  const [groupSeatsToPayNow, setGroupSeatsToPayNow] = useState(1);

  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [paymentCheckMessage, setPaymentCheckMessage] = useState('');
  const [paymentCheckError, setPaymentCheckError] = useState('');
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

      const [subscriptionResult, paymentResult] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('plan,status,amount,expires_at,updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('payments')
          .select('paystack_response')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (subscriptionResult.error) {
        setError(subscriptionResult.error.message);
        return;
      }

      if (subscriptionResult.data) {
        const plan = subscriptionResult.data.plan || null;
        setSubscription({
          plan,
          status: subscriptionResult.data.status || null,
          amount: subscriptionResult.data.amount || null,
          expires_at: subscriptionResult.data.expires_at || null,
        });

        if (plan === 'monthly' || plan === '8months' || plan === 'yearly') {
          setSelectedIndividualPlan(plan);
          setBillingMode('individual');
        }
        if (plan === 'group_monthly' || plan === 'group_yearly') {
          setBillingMode('group');
          setGroupBillingCycle(plan === 'group_yearly' ? 'yearly' : 'monthly');
        }
      }

      const metadata = parsePaymentMetadata(paymentResult.data?.paystack_response);
      const teamSize = clampTeamSize(metadata.team_size);
      const paymentMode = metadata.payment_mode === 'split' ? 'split' : 'full';
      const seatsPaidNow = Math.max(1, Math.min(teamSize, Number(metadata.seats_paid_now || 1)));

      if (teamSize) setGroupTeamSize(teamSize);
      if (paymentMode) setGroupPaymentMode(paymentMode);
      if (seatsPaidNow) setGroupSeatsToPayNow(seatsPaidNow);
      if (metadata.billing_cycle === 'yearly' || metadata.billing_cycle === 'monthly') {
        setGroupBillingCycle(metadata.billing_cycle);
      }
    };

    loadSettingsData();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const getAccessToken = async (): Promise<string> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token || '';
    };

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

  const individualPlanMeta = useMemo(
    () => INDIVIDUAL_PLAN_OPTIONS.find((option) => option.id === selectedIndividualPlan) || INDIVIDUAL_PLAN_OPTIONS[0],
    [selectedIndividualPlan]
  );

  const groupPricing = useMemo(
    () =>
      calculateGroupPlanPricing({
        billingCycle: groupBillingCycle,
        paymentMode: groupPaymentMode,
        teamSize: groupTeamSize,
        seatsPaidNow: groupSeatsToPayNow,
      }),
    [groupBillingCycle, groupPaymentMode, groupSeatsToPayNow, groupTeamSize]
  );

  const checkoutPlan = billingMode === 'individual' ? selectedIndividualPlan : groupBillingCycle === 'yearly' ? 'group_yearly' : 'group_monthly';
  const checkoutAmount = billingMode === 'individual' ? individualPlanMeta.amount : groupPricing.amountDueNow;
  const checkoutMetadata: Record<string, string | number | boolean> =
    billingMode === 'individual'
      ? {}
      : buildGroupPaymentMetadata({
          billingCycle: groupBillingCycle,
          paymentMode: groupPaymentMode,
          teamSize: groupPricing.teamSize,
          seatsPaidNow: groupPricing.seatsPaidNow,
        });

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
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile');
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
    } catch (err: any) {
      setError(err?.message || 'Failed to update artist name');
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
    } catch (err: any) {
      setError(err?.message || 'Failed to update password');
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
    } catch (err: any) {
      setError(err?.message || 'Could not delete account');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCheckPaymentStatus = async () => {
    const reference = paymentReference.trim();
    if (!reference) {
      setPaymentCheckError('Enter a payment reference to check.');
      setPaymentCheckMessage('');
      return;
    }

    setIsCheckingPayment(true);
    setPaymentCheckError('');
    setPaymentCheckMessage('');

    try {
      const response = await fetch(`/api/payments/verify?reference=${encodeURIComponent(reference)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as PaymentVerifyResponse;

      if (!response.ok || payload.status !== 'success') {
        setPaymentCheckError(payload.error || payload.message || 'Payment could not be verified.');
        return;
      }

      const planLabel = payload.plan ? String(payload.plan).replace('_', ' ') : 'unknown plan';
      const amountLabel =
        typeof payload.amount === 'number' ? `NGN ${payload.amount.toLocaleString()}` : 'amount unavailable';
      const trialLabel = payload.trialing
        ? ` Trial active until ${payload.trial_ends_at ? new Date(payload.trial_ends_at).toLocaleDateString() : 'renewal date'}.`
        : '';

      setPaymentCheckMessage(`Payment verified for ${planLabel} (${amountLabel}).${trialLabel}`);
      if (payload.trialing) {
        trackEvent('trial_started', {
          userId: user?.id || null,
          payload: {
            source: 'settings-payment-verify',
            reference,
            plan: payload.plan || null,
            trialEndsAt: payload.trial_ends_at || null,
          },
        });
      } else {
        trackEvent('trial_converted', {
          userId: user?.id || null,
          payload: {
            source: 'settings-payment-verify',
            reference,
            plan: payload.plan || null,
            amount: typeof payload.amount === 'number' ? payload.amount : null,
          },
        });
      }
      await checkAuth();
    } catch {
      setPaymentCheckError('Could not verify payment right now.');
    } finally {
      setIsCheckingPayment(false);
    }
  };

  const getAccessToken = async (): Promise<string> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || '';
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
    } catch (err: any) {
      setOrganizationError(err?.message || 'Could not save organization.');
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
    } catch (err: any) {
      setMemberError(err?.message || 'Could not add member.');
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
    } catch (err: any) {
      setMemberError(err?.message || 'Could not update role.');
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
    } catch (err: any) {
      setMemberError(err?.message || 'Could not remove member.');
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
          <p className="text-content-secondary">Loading settings...</p>
        </div>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10 relative">
        <div className="pointer-events-none absolute -right-16 -top-12 h-52 w-52 rounded-full bg-brand/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-status-info/12 blur-3xl" />
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl tracking-tight sm:text-4xl">Settings</h1>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-content-tertiary">Account, billing, and workflow preferences</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
            >
              Admin
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
            >
              Back to dashboard
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
              <p className="text-sm text-content-secondary">Switch between dark and light mode for your presentation style.</p>
              <div className="mt-3">
                <ThemeToggle />
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
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

          <section className={panelClass}>
            <h2 className="mb-4 text-xl">Session</h2>
            <div className="rounded-lg border border-stroke-subtle bg-bg-elevated p-4">
              <p className="text-sm text-content-secondary">Signed in as {user.email}. End your session on this device.</p>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  router.push('/auth');
                }}
                className="mt-4 rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-medium text-content-primary hover:bg-bg-hover"
              >
                Logout this device
              </button>
            </div>
          </section>

          {user.role === 'artist' && (
            <section className={`${panelClass} mt-6`}>
              <h2 className="mb-4 text-xl">Artist Profile</h2>
              <p className="mb-3 text-sm text-content-secondary">
                This is your canonical artist name. It is reused and locked in other parts of the app.
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

        <section className={`${panelClass} mt-6`}>
          <h2 className="mb-4 text-xl">Team Members</h2>
          {!organization ? (
            <p className="text-sm text-content-secondary">Create your organization first to manage team members.</p>
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
                  onClick={handleAddMember}
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
                <p className="mt-4 text-sm text-content-secondary">Loading team members...</p>
              ) : members.length === 0 ? (
                <p className="mt-4 text-sm text-content-secondary">No members yet.</p>
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

          <section className={`${panelClass} mt-6`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl">Billing</h2>
              <div className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs text-content-secondary">
              Current: {subscription.plan || 'No active plan'} {subscription.status ? `(${subscription.status})` : ''}
            </div>
          </div>

          <div className="mb-5 text-sm text-content-secondary">
            <p>Expires: {subscription.expires_at ? new Date(subscription.expires_at).toLocaleDateString() : 'N/A'}</p>
            {subscription.amount ? <p>Last amount: NGN {subscription.amount.toLocaleString()}</p> : null}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBillingMode('individual')}
              className={`rounded-full border px-3 py-1 text-sm ${
                billingMode === 'individual'
                  ? 'border-brand/50 bg-brand-muted text-content-primary'
                  : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover'
              }`}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => setBillingMode('group')}
              className={`rounded-full border px-3 py-1 text-sm ${
                billingMode === 'group'
                  ? 'border-brand/50 bg-brand-muted text-content-primary'
                  : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover'
              }`}
            >
              Group (5+ seats)
            </button>
          </div>

          {billingMode === 'individual' ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {INDIVIDUAL_PLAN_OPTIONS.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedIndividualPlan(plan.id)}
                  className={`rounded-lg border px-3 py-3 text-left ${
                    selectedIndividualPlan === plan.id
                      ? 'border-brand/40 bg-brand-muted'
                      : 'border-stroke-subtle bg-bg-elevated hover:border-stroke-default'
                  }`}
                >
                  <p className="text-sm font-semibold text-content-primary">{plan.label}</p>
                  <p className="mt-1 text-xs text-content-secondary">{plan.description}</p>
                  <p className="mt-2 text-sm text-content-primary">NGN {plan.amount.toLocaleString()}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border border-stroke-subtle bg-bg-elevated p-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setGroupBillingCycle('monthly')}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    groupBillingCycle === 'monthly'
                      ? 'border-brand/50 bg-brand-muted text-content-primary'
                      : 'border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setGroupBillingCycle('yearly')}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    groupBillingCycle === 'yearly'
                      ? 'border-brand/50 bg-brand-muted text-content-primary'
                      : 'border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover'
                  }`}
                >
                  Yearly
                </button>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm text-content-secondary">Team size ({MIN_GROUP_TEAM_SIZE}-{MAX_GROUP_TEAM_SIZE})</span>
                <input
                  type="number"
                  min={MIN_GROUP_TEAM_SIZE}
                  max={MAX_GROUP_TEAM_SIZE}
                  value={groupTeamSize}
                  onChange={(event) => setGroupTeamSize(clampTeamSize(event.target.value))}
                  className="w-full rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-content-primary outline-none focus:border-brand"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setGroupPaymentMode('full')}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    groupPaymentMode === 'full'
                      ? 'border-brand/50 bg-brand-muted text-content-primary'
                      : 'border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover'
                  }`}
                >
                  One payer (full)
                </button>
                <button
                  type="button"
                  onClick={() => setGroupPaymentMode('split')}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    groupPaymentMode === 'split'
                      ? 'border-brand/50 bg-brand-muted text-content-primary'
                      : 'border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover'
                  }`}
                >
                  Split contribution
                </button>
              </div>

              {groupPaymentMode === 'split' && (
                <label className="block">
                  <span className="mb-1 block text-sm text-content-secondary">Seats covered in this payment</span>
                  <input
                    type="number"
                    min={1}
                    max={groupPricing.teamSize}
                    value={groupSeatsToPayNow}
                    onChange={(event) => {
                      const parsed = Number(event.target.value || 1);
                      const clamped = Math.max(1, Math.min(groupPricing.teamSize, Math.round(parsed)));
                      setGroupSeatsToPayNow(clamped);
                    }}
                    className="w-full rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-content-primary outline-none focus:border-brand"
                  />
                </label>
              )}

              <div className="rounded-lg border border-stroke-default bg-bg-surface p-3 text-sm text-content-secondary">
                <p>Total team amount: <span className="font-semibold text-content-primary">NGN {groupPricing.totalAmount.toLocaleString()}</span></p>
                <p>Per seat: <span className="font-semibold text-content-primary">NGN {groupPricing.perSeatAmount.toLocaleString()}</span></p>
                <p>
                  Due now: <span className="font-semibold text-content-primary">NGN {groupPricing.amountDueNow.toLocaleString()}</span>
                  {groupPaymentMode === 'split' ? ` for ${groupPricing.seatsPaidNow} seat(s)` : ''}
                </p>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-content-secondary">
              Group pricing includes 5 seats. Extra seats are added automatically. Split mode lets each payer contribute seat-based amounts.
            </p>
            <PaystackButton
              email={user.email}
              amount={checkoutAmount}
              plan={checkoutPlan}
              metadata={checkoutMetadata}
              className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
            >
              Continue with {billingMode === 'individual' ? individualPlanMeta.label : `Group ${groupBillingCycle === 'yearly' ? 'Yearly' : 'Monthly'}`}
            </PaystackButton>
          </div>

          <div className="mt-6 rounded-xl border border-stroke-subtle bg-bg-elevated p-4">
            <p className="text-sm font-semibold text-content-primary">Check payment status</p>
            <p className="mt-1 text-xs text-content-secondary">
              Paste a Paystack reference to confirm if your payment was processed.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                placeholder="e.g. urganize_1740861234_ab12cd"
                className="w-full rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-content-primary outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={handleCheckPaymentStatus}
                disabled={isCheckingPayment}
                className="rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-primary hover:bg-bg-hover disabled:opacity-60"
              >
                {isCheckingPayment ? 'Checking...' : 'Check'}
              </button>
            </div>
            {paymentCheckMessage && (
              <p className="mt-3 rounded-lg border border-status-info/35 bg-status-info/10 px-3 py-2 text-sm text-status-info">
                {paymentCheckMessage}
              </p>
            )}
            {paymentCheckError && (
              <p className="mt-3 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                {paymentCheckError}
              </p>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-status-error/35 bg-status-error/10 p-6">
          <h2 className="mb-2 text-xl text-status-error">Delete Account</h2>
          <p className="mb-4 text-sm text-content-secondary">
            This permanently deletes your account immediately. This action cannot be undone.
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
              {isDeleting ? 'Deleting...' : 'Delete account now'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

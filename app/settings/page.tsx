'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
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

const panelClass = 'rounded-2xl border border-stroke-default bg-bg-surface p-5 sm:p-6';

const parsePaymentMetadata = (paystackResponse: unknown): Record<string, unknown> => {
  if (!paystackResponse || typeof paystackResponse !== 'object') return {};
  const metadata = (paystackResponse as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== 'object') return {};
  return metadata as Record<string, unknown>;
};

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout, checkAuth, isLoading: authLoading } = useAuthStore();

  const [name, setName] = useState('');
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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    setName(user.name || '');
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
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl tracking-tight sm:text-4xl">Settings</h1>
            <p className="mt-1 text-sm text-content-secondary">Account, billing, and workflow preferences.</p>
          </div>
          <Link href="/dashboard" className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary">
            Back to dashboard
          </Link>
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
        </section>

        <section className="mt-6 rounded-2xl border border-status-error/35 bg-status-error/10 p-6">
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

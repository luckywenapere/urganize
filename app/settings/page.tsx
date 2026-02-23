'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';

const PaystackButton = dynamic(
  () => import('@/components/PaystackButton').then((mod) => mod.PaystackButton),
  { ssr: false }
);

type PlanId = 'monthly' | '8months' | 'yearly';

type SubscriptionInfo = {
  plan: string | null;
  status: string | null;
  amount: number | null;
  expires_at: string | null;
};

const planOptions: Array<{ id: PlanId; label: string; amount: number; description: string }> = [
  { id: 'monthly', label: 'Monthly', amount: 8000, description: 'Discounted from NGN 17,000' },
  { id: '8months', label: '8 Months', amount: 54400, description: '15% off the NGN 8,000 monthly rate' },
  { id: 'yearly', label: 'Yearly', amount: 72000, description: '25% off the NGN 8,000 monthly rate' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout, checkAuth } = useAuthStore();

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
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('monthly');

  const [provider, setProvider] = useState<string>('email');
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [confirmationText, setConfirmationText] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteScheduledAt, setDeleteScheduledAt] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!user) {
      router.push('/auth');
      return;
    }

    setName(user.name || '');
    setConfirmationEmail(user.email || '');
  }, [router, user]);

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

      const { data: subscriptionRow } = await supabase
        .from('subscriptions')
        .select('plan,status,amount,expires_at,updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subscriptionRow) {
        setSubscription({
          plan: subscriptionRow.plan || null,
          status: subscriptionRow.status || null,
          amount: subscriptionRow.amount || null,
          expires_at: subscriptionRow.expires_at || null,
        });
        if (subscriptionRow.plan === 'monthly' || subscriptionRow.plan === '8months' || subscriptionRow.plan === 'yearly') {
          setSelectedPlan(subscriptionRow.plan);
        }
      }

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (authUser) {
        setProvider(authUser.app_metadata?.provider || 'email');
        setLastSignInAt(authUser.last_sign_in_at || null);
        const scheduled = authUser.user_metadata?.scheduled_deletion_at as string | undefined;
        if (scheduled) {
          setDeleteScheduledAt(scheduled);
        }
      }
    };

    loadSettingsData();
  }, [user]);

  const planMeta = useMemo(
    () => planOptions.find((option) => option.id === selectedPlan) || planOptions[0],
    [selectedPlan]
  );

  const isGoogleFreshlyReverified = useMemo(() => {
    if (provider !== 'google' || !lastSignInAt) return false;
    const last = new Date(lastSignInAt).getTime();
    return Date.now() - last <= 5 * 60 * 1000;
  }, [lastSignInAt, provider]);

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

  const handleGoogleReverify = async () => {
    clearFeedback();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/settings&reauth=1`,
      },
    });

    if (oauthError) {
      setError(oauthError.message || 'Failed to start Google re-verification');
    }
  };

  const handleScheduleDelete = async () => {
    clearFeedback();
    if (!user) return;

    if (confirmationEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      setError('Enter your exact account email to continue');
      return;
    }

    if (confirmationText.trim() !== 'DELETE') {
      setError('Type DELETE exactly to confirm');
      return;
    }

    if (provider === 'email' && currentPassword.length < 8) {
      setError('Current password is required');
      return;
    }

    if (provider === 'google' && !isGoogleFreshlyReverified) {
      setError('Re-verify your Google session first');
      return;
    }

    setIsDeleting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch('/api/account/schedule-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          confirmationEmail,
          confirmationText,
          currentPassword: provider === 'email' ? currentPassword : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Could not schedule account deletion');
      }

      setDeleteScheduledAt(data?.scheduled_deletion_at || null);
      await logout();
      router.push('/auth');
    } catch (err: any) {
      setError(err?.message || 'Could not schedule account deletion');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!user) return null;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl tracking-tight">Settings</h1>
          <Link href="/dashboard" className="text-sm text-white/70 hover:text-white">
            Back to dashboard
          </Link>
        </div>

        {error && <p className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
        {success && <p className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{success}</p>}

        <section className="mb-6 rounded-2xl border border-white/10 bg-[#02090d] p-6">
          <h2 className="mb-4 text-xl">Profile</h2>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-white/70">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 outline-none focus:border-white/30"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-white/70">Email</span>
              <input value={user.email} disabled className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white/70" />
            </label>
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={isSavingName}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-60"
            >
              {isSavingName ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-white/10 bg-[#02090d] p-6">
          <h2 className="mb-4 text-xl">Security</h2>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-white/70">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 outline-none focus:border-white/30"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-white/70">Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 outline-none focus:border-white/30"
              />
            </label>
            <button
              type="button"
              onClick={handleSavePassword}
              disabled={isSavingPassword}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-60"
            >
              {isSavingPassword ? 'Updating...' : 'Update password'}
            </button>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-white/10 bg-[#02090d] p-6">
          <h2 className="mb-4 text-xl">Notifications</h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <span className="text-sm text-white/85">Release reminders by email</span>
              <input
                type="checkbox"
                checked={notificationsEmail}
                onChange={(e) => setNotificationsEmail(e.target.checked)}
                className="h-4 w-4"
              />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <span className="text-sm text-white/85">Product updates and feature notices</span>
              <input
                type="checkbox"
                checked={notificationsProduct}
                onChange={(e) => setNotificationsProduct(e.target.checked)}
                className="h-4 w-4"
              />
            </label>
            <button
              type="button"
              onClick={handleSaveNotifications}
              disabled={isSavingNotifications}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-60"
            >
              {isSavingNotifications ? 'Saving...' : 'Save notifications'}
            </button>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-white/10 bg-[#02090d] p-6">
          <h2 className="mb-4 text-xl">Billing</h2>
          <div className="mb-4 space-y-1 text-sm text-white/75">
            <p>Current plan: {subscription.plan || 'No active plan'}</p>
            <p>Status: {subscription.status || 'inactive'}</p>
            <p>Expires: {subscription.expires_at ? new Date(subscription.expires_at).toLocaleDateString() : 'N/A'}</p>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            {planOptions.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={`rounded-lg border px-3 py-2 text-left ${
                  selectedPlan === plan.id
                    ? 'border-white/40 bg-white/10'
                    : 'border-white/10 bg-black/30 hover:border-white/25'
                }`}
              >
                <p className="text-sm font-medium text-white">{plan.label}</p>
                <p className="mt-1 text-xs text-white/60">{plan.description}</p>
                <p className="mt-2 text-sm text-white/85">NGN {plan.amount.toLocaleString()}</p>
              </button>
            ))}
          </div>

          <PaystackButton email={user.email} amount={planMeta.amount} plan={planMeta.id} className="rounded-lg bg-white px-5 py-2 text-sm font-medium text-black hover:bg-white/90">
            Continue with {planMeta.label}
          </PaystackButton>
        </section>

        <section className="rounded-2xl border border-red-500/35 bg-red-500/10 p-6">
          <h2 className="mb-2 text-xl text-red-300">Delete Account</h2>
          <p className="mb-4 text-sm text-red-100/80">
            This schedules your account for deletion in 30 days. Your account is immediately signed out. Recovery during that period is support-only via theurganization@gmail.com.
          </p>
          {deleteScheduledAt && (
            <p className="mb-4 text-sm text-red-200">
              Deletion already scheduled for {new Date(deleteScheduledAt).toLocaleString()}.
            </p>
          )}
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-red-100/80">Confirm your email</span>
              <input
                value={confirmationEmail}
                onChange={(e) => setConfirmationEmail(e.target.value)}
                className="w-full rounded-lg border border-red-300/40 bg-black/40 px-3 py-2 outline-none focus:border-red-200/70"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-red-100/80">Type DELETE</span>
              <input
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                className="w-full rounded-lg border border-red-300/40 bg-black/40 px-3 py-2 outline-none focus:border-red-200/70"
              />
            </label>

            {provider === 'email' ? (
              <label className="block">
                <span className="mb-1 block text-sm text-red-100/80">Current password</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-lg border border-red-300/40 bg-black/40 px-3 py-2 outline-none focus:border-red-200/70"
                />
              </label>
            ) : (
              <div className="rounded-lg border border-red-300/35 bg-black/30 p-3">
                <p className="mb-2 text-sm text-red-100/85">Provider: Google</p>
                <p className="mb-3 text-xs text-red-100/70">
                  Re-verify your Google session before confirming deletion.
                </p>
                <button
                  type="button"
                  onClick={handleGoogleReverify}
                  className="rounded-lg border border-red-200/50 px-3 py-2 text-sm text-red-100 hover:bg-red-400/15"
                >
                  Re-verify with Google
                </button>
                {isGoogleFreshlyReverified && (
                  <p className="mt-2 text-xs text-emerald-300">Google session verified.</p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleScheduleDelete}
              disabled={isDeleting || !!deleteScheduledAt}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-55"
            >
              {isDeleting ? 'Scheduling...' : 'Schedule account deletion'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

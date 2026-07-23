'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { errorMessage } from '@/lib/errors';
import { getAccessToken } from './getAccessToken';

export function DeleteAccountSection() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDeleteNow = async () => {
    setError('');
    if (confirmationText.trim() !== 'DELETE') {
      setError('Type DELETE exactly to confirm');
      return;
    }

    setIsDeleting(true);
    try {
      // Shared helper, not an inline duplicate -- this used to be the only
      // call site in the file that didn't use it.
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');

      const res = await fetch('/api/account/delete-now', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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

  // Danger zone: flat like every other section — the red left rule and red
  // kicker carry the warning; no filled box (Brand Bible: hairlines over
  // panels).
  return (
    <section className="relative border-l-2 border-status-error/50 py-9 pl-5">
      <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-status-error">Delete account</h2>
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
        {error && <p className="text-sm text-status-error">{error}</p>}
        <button
          type="button"
          onClick={() => void handleDeleteNow()}
          disabled={isDeleting}
          className="rounded-lg bg-status-error px-4 py-2 text-sm font-semibold text-content-inverse hover:opacity-90 disabled:opacity-55"
        >
          {isDeleting ? 'Deleting...' : 'Delete account'}
        </button>
      </div>
    </section>
  );
}

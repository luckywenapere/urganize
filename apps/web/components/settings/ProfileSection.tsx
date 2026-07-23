'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { errorMessage } from '@/lib/errors';
import { panelClass } from './panelClass';

/**
 * Calls the store's `updateProfileName` action, which patches `user`
 * directly from the update's returned row — no follow-up `checkAuth()`
 * needed (mirrors `updateArtistName`, already proven sufficient alone by
 * `components/ArtistNameGate.tsx`).
 */
export function ProfileSection() {
  const user = useAuthStore((state) => state.user);
  const updateProfileName = useAuthStore((state) => state.updateProfileName);

  const [name, setName] = useState(user?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!user) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name cannot be empty');
      setSuccess('');
      return;
    }
    setError('');
    setSuccess('');
    setIsSaving(true);
    try {
      await updateProfileName(name.trim());
      setSuccess('Profile updated');
    } catch (err) {
      setError(errorMessage(err, 'Failed to update profile'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={panelClass}>
      <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">Profile</h2>
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
          <input
            value={user.email}
            disabled
            className="w-full rounded-lg border border-stroke-subtle bg-bg-overlay px-3 py-2 text-content-secondary"
          />
        </label>
        {error && <p className="text-sm text-status-error">{error}</p>}
        {success && <p className="text-sm text-brand">{success}</p>}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </section>
  );
}

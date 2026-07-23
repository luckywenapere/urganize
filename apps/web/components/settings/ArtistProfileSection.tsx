'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { errorMessage } from '@/lib/errors';
import { panelClass } from './panelClass';

/** Self-gates on `user.role === 'artist'`, returns null otherwise — mirrors
 * how `components/releases/ContentCalendarSection.tsx` self-checks its own
 * flag rather than the parent wrapping it in JSX. */
export function ArtistProfileSection() {
  const user = useAuthStore((state) => state.user);
  const updateArtistName = useAuthStore((state) => state.updateArtistName);

  const [artistProfileName, setArtistProfileName] = useState(
    String(user?.artist_name || '')
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!user || user.role !== 'artist') return null;

  const handleSave = async () => {
    setError('');
    setSuccess('');
    const normalized = artistProfileName.trim();
    if (!normalized) {
      setError('Artist name cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      // updateArtistName already patches `user` from the update's returned
      // row (lib/auth-store.ts) -- no checkAuth() re-fetch needed, proven
      // sufficient in production by components/ArtistNameGate.tsx.
      await updateArtistName(normalized);
      setSuccess('Artist name updated');
    } catch (err) {
      setError(errorMessage(err, 'Failed to update artist name'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={panelClass}>
      <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">Artist profile</h2>
      <p className="mb-3 text-sm text-content-secondary">This name is reused across the app.</p>
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
        {error && <p className="text-sm text-status-error">{error}</p>}
        {success && <p className="text-sm text-brand">{success}</p>}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save artist name'}
        </button>
      </div>
    </section>
  );
}

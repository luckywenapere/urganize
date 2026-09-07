'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { errorMessage } from "@/lib/errors";

export function ArtistNameGate() {
  const user = useAuthStore((state) => state.user);
  const updateArtistName = useAuthStore((state) => state.updateArtistName);
  const logout = useAuthStore((state) => state.logout);

  const [artistName, setArtistName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const value = artistName.trim();
    if (!value) {
      setError('Artist name is required.');
      return;
    }

    setIsSaving(true);
    try {
      await updateArtistName(value);
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not save artist name.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-content-primary">
      {/* Gold-thread ray fan (NEXT_PUBLIC_FEATURE_TEXTILE). Replaces the
          blurred brand blobs below, which the same flag hides. Inert off. */}
      <div className="urg-ground-sunburst" aria-hidden="true" />
      <div className="urg-blob pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-brand/15 blur-3xl" />
      <div className="urg-blob pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-status-info/12 blur-3xl" />
      <div className="mx-auto flex min-h-screen w-full max-w-[620px] items-center px-6 py-12">
        <section className="w-full rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_20px_80px_-46px_rgb(var(--shadow-ink)/calc(0.62*var(--shadow-alpha-scale)))] backdrop-blur-xl sm:p-8">
          <p className="text-xs uppercase tracking-[0.15em] text-content-tertiary">Profile setup required</p>
          <h1 className="mt-2 text-[clamp(1.8rem,4.4vw,2.6rem)] tracking-tight">Add your artist name to continue</h1>
          <p className="mt-3 text-sm text-content-secondary">
            This is your account-level artist name. It will be reused across the app and can only be changed in Settings.
          </p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-content-secondary">Artist name</span>
              <input
                value={artistName}
                onChange={(event) => {
                  setArtistName(event.target.value);
                  if (error) setError('');
                }}
                placeholder="e.g. Tems"
                className="w-full rounded-xl border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
                autoFocus
                disabled={isSaving}
                required
              />
            </label>
            {error && (
              <p className="rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
              >
                {isSaving ? 'Saving...' : 'Save and continue'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                }}
                className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover"
              >
                Logout
              </button>
            </div>
            <p className="text-xs text-content-tertiary">
              Signed in as {user?.email || 'unknown account'}
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}

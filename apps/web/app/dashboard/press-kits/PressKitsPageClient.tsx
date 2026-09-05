'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Newspaper } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { authHeaders, readError } from '@/components/press-kits/press-kit-client';
import type { PressKit } from '@/types/press-kits';

// Same flag the API routes read. A direct link followed while the flag is off
// bounces to the catalog — the route has no server-side gate, since the flag is
// inlined at build time (the notes and shows precedent).
const PRESS_KITS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PRESS_KITS === 'true';

type Entry = { artistId: string; artistName: string; kit: PressKit | null };

const STATE_COPY: Record<PressKit['state'], string> = {
  incomplete: 'Not finished',
  ready: 'Ready',
  published: 'Live',
};

const stateClass = (state: PressKit['state']): string => {
  if (state === 'published') return 'border-brand/30 bg-brand/10 text-brand';
  if (state === 'ready') return 'border-stroke-strong bg-bg-elevated text-content-primary';
  return 'border-stroke-default bg-bg-surface text-content-tertiary';
};

export default function PressKitsPageClient() {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.isLoading);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    setError(null);
    try {
      const response = await fetch('/api/press-kits', { headers, cache: 'no-store' });
      if (!response.ok) {
        setError(await readError(response, 'Could not load press kits.'));
        return;
      }
      const body = await response.json();
      setEntries(Array.isArray(body.entries) ? body.entries : []);
    } catch {
      setError('Could not load press kits. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!PRESS_KITS_ENABLED) {
      router.replace('/dashboard');
      return;
    }
    void load();
  }, [load, router]);

  if (!PRESS_KITS_ENABLED) return null;

  const loading = authLoading || isLoading;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Press
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-content-primary">
          Press kits
        </h1>
        <p className="mt-1 text-sm text-content-secondary">
          One kit per artist, with one link that never changes. Press always see the current one.
        </p>
      </header>

      {error ? (
        <div className="mb-4 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="underline">
            Try again
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-[84px] animate-pulse rounded-xl border border-stroke-default bg-bg-surface"
            />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stroke-default p-8 text-center">
          <Newspaper className="mx-auto h-6 w-6 text-content-tertiary" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-content-primary">No artists yet</p>
          <p className="mt-1 text-sm text-content-secondary">
            Add an artist in Settings and their press kit starts here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.artistId}>
              <Link
                href={`/dashboard/press-kits/${entry.artistId}`}
                className="motion-focus flex items-center justify-between gap-3 rounded-xl border border-stroke-default bg-bg-surface p-4 transition-colors hover:border-stroke-strong"
              >
                <div className="min-w-0">
                  <h2 className="truncate font-display text-base font-semibold text-content-primary">
                    {entry.artistName}
                  </h2>
                  <p className="mt-1 truncate text-xs text-content-secondary">
                    {entry.kit ? `urganize.app/k/${entry.kit.slug}` : 'No kit yet'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      entry.kit
                        ? stateClass(entry.kit.state)
                        : 'border-stroke-default bg-bg-surface text-content-tertiary'
                    }`}
                  >
                    {entry.kit ? STATE_COPY[entry.kit.state] : 'Start one'}
                  </span>
                  <ArrowRight className="h-4 w-4 text-content-tertiary" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

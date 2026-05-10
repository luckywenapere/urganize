'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { DashboardPageSkeleton } from '@/components/loading/DashboardPageSkeleton';
import { SectionCard } from '@/components/shared/SectionCard';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';

type CreateReleaseResponse = {
  id?: string;
  releaseId?: string;
  redirectTo?: string;
  error?: string;
  details?: string;
  release?: {
    id?: string;
  };
  setupSql?: string;
  sql?: string;
  schemaSql?: string;
};

function NewReleasePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuthStore();
  const [title, setTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [setupSql, setSetupSql] = useState('');
  const [setupDetails, setSetupDetails] = useState('');
  const [copiedSetupSql, setCopiedSetupSql] = useState(false);
  const sourceParam = searchParams.get('source');
  const releaseSource = sourceParam === 'empty_state' ? 'empty_state' : 'dashboard';

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
    }
  }, [authLoading, router, user]);

  const handleCopySetupSql = async () => {
    if (!setupSql) return;
    try {
      await navigator.clipboard.writeText(setupSql);
      setCopiedSetupSql(true);
      window.setTimeout(() => setCopiedSetupSql(false), 2200);
    } catch {
      setError('Could not copy the setup SQL.');
    }
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!title.trim() || !artistName.trim()) {
      setError('Add a release title and artist name to continue.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSetupSql('');
    setSetupDetails('');

    try {
      const fallbackReleaseDate = new Date().toISOString().slice(0, 10);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token || '';
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch('/api/releases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          artistName: artistName.trim(),
          description: description.trim(),
          releaseDate: fallbackReleaseDate,
          source: releaseSource,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as CreateReleaseResponse;
      const returnedSql = payload.setupSql || payload.sql || payload.schemaSql || '';
      const targetReleaseId = payload.release?.id || payload.releaseId || payload.id || '';
      const redirectTarget = payload.redirectTo || (targetReleaseId ? `/dashboard/releases/${targetReleaseId}` : '');

      if (response.status === 501 || returnedSql) {
        setSetupSql(returnedSql);
        setSetupDetails(payload.details || payload.error || 'Release operations setup is required before you can create releases.');
        return;
      }



      if (!response.ok) {
        throw new Error(payload.error || 'Could not create release.');
      }

      if (!redirectTarget) {
        throw new Error('Release created, but no destination was returned.');
      }

      router.push(redirectTarget);
    } catch (submitError: any) {
      setError(submitError?.message || 'Could not create release.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return <DashboardPageSkeleton />;
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[880px] px-4 pb-10 pt-16 sm:px-6 sm:py-10">
        <div className="mb-4">
          <Link
            href="/dashboard"
            className="inline-flex min-h-10 items-center text-sm text-content-secondary hover:text-content-primary"
          >
            Back to dashboard
          </Link>
        </div>

        <SectionCard className="sm:p-7">
          <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">New Release</p>
          <h1 className="mt-2 text-[clamp(2.2rem,5vw,3.4rem)] tracking-tight text-content-primary">
            Start a release dashboard
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-content-secondary">
            Add the release title, artist name, and any helpful context. You can share the public credit link after
            the dashboard is created.
          </p>

          <form className="mt-8 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <div>
              <label htmlFor="release-title" className="text-sm font-medium text-content-primary">
                Release title
              </label>
              <input
                id="release-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-2xl border border-stroke-default bg-bg-surface px-4 py-3 text-sm text-content-primary outline-none transition focus:border-brand"
                placeholder="Midnight Drive"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="artist-name" className="text-sm font-medium text-content-primary">
                Artist name
              </label>
              <input
                id="artist-name"
                value={artistName}
                onChange={(event) => setArtistName(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-2xl border border-stroke-default bg-bg-surface px-4 py-3 text-sm text-content-primary outline-none transition focus:border-brand"
                placeholder="Nova"
              />
            </div>

            <div>
              <label htmlFor="release-description" className="text-sm font-medium text-content-primary">
                Description <span className="text-content-tertiary">(optional)</span>
              </label>
              <textarea
                id="release-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-2xl border border-stroke-default bg-bg-surface px-4 py-3 text-sm text-content-primary outline-none transition focus:border-brand"
                placeholder="Notes for this release workspace"
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-12 w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Creating release...' : 'Create Release'}
            </button>
              </form>
            </SectionCard>

            {setupSql ? (
              <SectionCard className="mt-6 sm:p-7">
                <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Setup Required</p>
                <h2 className="mt-2 text-2xl tracking-tight text-content-primary">Release operations tables are missing</h2>
                <p className="mt-3 text-sm text-content-secondary">
                  {setupDetails || 'Run this SQL once in Supabase, then come back and create the release again.'}
                </p>

                <div className="mt-5 rounded-[24px] border border-stroke-subtle bg-bg-elevated/80 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">SQL</p>
                  <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap text-xs leading-6 text-content-secondary">
                    {setupSql}
                  </pre>
                </div>

                <button
                  type="button"
                  onClick={() => void handleCopySetupSql()}
                  className="mt-5 min-h-11 rounded-2xl border border-stroke-default bg-bg-surface px-4 py-3 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                >
                  {copiedSetupSql ? 'SQL copied' : 'Copy SQL'}
                </button>
              </SectionCard>
            ) : null}
      </div>
    </main>
  );
}

export default function NewReleasePage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton />}>
      <NewReleasePageContent />
    </Suspense>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { SectionCard } from '@/components/shared/SectionCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';

type MetadataPayload = {
  release: {
    id: string;
    title: string;
    artistName: string;
  };
  readiness: {
    metadataComplete: boolean;
  };
  metadata: {
    primaryArtistName: string;
    releaseTitle: string;
    isrc: string;
    upc: string;
    genre: string;
    subgenre: string;
    labelName: string;
    language: string;
    producerCredits: Array<Record<string, unknown>>;
    writerCredits: Array<Record<string, unknown>>;
    featuredArtistCredits: Array<Record<string, unknown>>;
    mixingCredits: Array<Record<string, unknown>>;
    masteringCredits: Array<Record<string, unknown>>;
    allCredits: Array<Record<string, unknown>>;
  } | null;
  error?: string;
};

const renderCreditGroup = (title: string, entries: Array<Record<string, unknown>>) => (
  <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 p-4">
    <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">{title}</p>
    {entries.length === 0 ? (
      <p className="mt-3 text-sm text-content-secondary">No credits in this group yet.</p>
    ) : (
      <div className="mt-3 space-y-3">
        {entries.map((entry, index) => (
          <div key={`${title}-${index}`} className="rounded-[18px] border border-stroke-subtle bg-bg-surface px-4 py-3 text-sm text-content-secondary">
            <p className="font-medium text-content-primary">{String(entry.stageName || entry.legalName || 'Unnamed collaborator')}</p>
            <p className="mt-1">{String(entry.role || 'Role not set')}</p>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default function ReleaseMetadataPage() {
  const params = useParams<{ releaseId: string }>();
  const releaseId = Array.isArray(params?.releaseId) ? params.releaseId[0] : params?.releaseId || '';
  const { user, isLoading: authLoading } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [data, setData] = useState<MetadataPayload | null>(null);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!releaseId) return;
    setIsLoading(true);
    setError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/releases/${releaseId}/metadata`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as MetadataPayload;
      if (!response.ok) {
        throw new Error(payload.error || 'Could not load metadata.');
      }
      setData(payload);
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load metadata.');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [releaseId]);

  useEffect(() => {
    if (!authLoading && user && releaseId) {
      void loadData();
    }
  }, [authLoading, loadData, releaseId, user]);

  if ((!hasLoadedOnce && isLoading) || (!user && authLoading)) {
    return (
      <LoadingScreen
        variant="detail"
        eyebrow="Release Metadata"
        title="Loading structured metadata"
        description="Preparing the grouped credits and release summary."
      />
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1040px] px-4 pb-10 pt-20 sm:px-6 sm:py-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href={`/dashboard/releases/${releaseId}`} className="text-sm text-content-secondary hover:text-content-primary">
            Back to release
          </Link>
          <button
            type="button"
            disabled
            className="rounded-full border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-tertiary opacity-70"
          >
            Export metadata
          </button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {error}
          </div>
        ) : null}

        {data?.release ? (
          <div className="space-y-6">
            <SectionCard>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Structured metadata</p>
                  <h1 className="mt-2 text-[clamp(2.2rem,5vw,3.5rem)] tracking-tight text-content-primary">{data.release.title}</h1>
                  <p className="mt-3 text-sm text-content-secondary">{data.release.artistName}</p>
                </div>
                <StatusBadge
                  label={data.readiness.metadataComplete ? 'Metadata reviewed' : 'Review needed'}
                  tone={data.readiness.metadataComplete ? 'success' : 'warning'}
                />
              </div>
            </SectionCard>

            <SectionCard>
              {data.metadata ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 p-4 text-sm text-content-secondary">
                    <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Release summary</p>
                    <div className="mt-3 space-y-2">
                      <p><span className="font-medium text-content-primary">Title:</span> {data.metadata.releaseTitle}</p>
                      <p><span className="font-medium text-content-primary">Primary artist:</span> {data.metadata.primaryArtistName}</p>
                      <p><span className="font-medium text-content-primary">ISRC:</span> {data.metadata.isrc || '—'}</p>
                      <p><span className="font-medium text-content-primary">UPC:</span> {data.metadata.upc || '—'}</p>
                      <p><span className="font-medium text-content-primary">Genre:</span> {data.metadata.genre || '—'}</p>
                      <p><span className="font-medium text-content-primary">Language:</span> {data.metadata.language || '—'}</p>
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 p-4 text-sm text-content-secondary">
                    <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Credits summary</p>
                    <div className="mt-3 space-y-2">
                      <p><span className="font-medium text-content-primary">All credits:</span> {data.metadata.allCredits.length}</p>
                      <p><span className="font-medium text-content-primary">Producers:</span> {data.metadata.producerCredits.length}</p>
                      <p><span className="font-medium text-content-primary">Writers:</span> {data.metadata.writerCredits.length}</p>
                      <p><span className="font-medium text-content-primary">Featured artists:</span> {data.metadata.featuredArtistCredits.length}</p>
                      <p><span className="font-medium text-content-primary">Mixing:</span> {data.metadata.mixingCredits.length}</p>
                      <p><span className="font-medium text-content-primary">Mastering:</span> {data.metadata.masteringCredits.length}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No credits submitted yet"
                  description="Once collaborators submit credits, Urganize will group them here for review."
                />
              )}
            </SectionCard>

            {data.metadata ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {renderCreditGroup('Producer credits', data.metadata.producerCredits)}
                {renderCreditGroup('Writer credits', data.metadata.writerCredits)}
                {renderCreditGroup('Featured artist credits', data.metadata.featuredArtistCredits)}
                {renderCreditGroup('Mixing credits', data.metadata.mixingCredits)}
                {renderCreditGroup('Mastering credits', data.metadata.masteringCredits)}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}

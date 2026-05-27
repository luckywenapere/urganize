'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/errors';
import type { ReleaseMetadataSnapshot } from '@/lib/release-ops';

type ReleaseInfoPayload = {
  metadata: ReleaseMetadataSnapshot | null;
  error?: string;
};

type ReleaseInfoSectionProps = {
  releaseId: string;
};

export function ReleaseInfoSection({ releaseId }: ReleaseInfoSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<ReleaseInfoPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as ReleaseInfoPayload;
      if (!response.ok) {
        throw new Error(payload.error || 'Could not load release info.');
      }
      setData(payload);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Could not load release info.'));
    } finally {
      setIsLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    if (isOpen && !data && !isLoading && !error) {
      void loadData();
    }
  }, [data, error, isLoading, isOpen, loadData]);

  const metadata = data?.metadata;

  return (
    <section className="mt-8 border border-stroke-default bg-bg-surface">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-content-primary hover:bg-bg-hover"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Release Info</span>
        <ChevronDown
          className={`h-4 w-4 text-content-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen ? (
        <div className="border-t border-stroke-default p-4">
          {error ? (
            <div className="border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error">
              {error}
            </div>
          ) : isLoading || !data ? (
            <p className="text-sm text-content-secondary">Loading release info…</p>
          ) : metadata ? (
            <div className="space-y-1.5 text-sm text-content-secondary">
              <p><span className="font-medium text-content-primary">Title:</span> {metadata.releaseTitle || '—'}</p>
              <p><span className="font-medium text-content-primary">Primary artist:</span> {metadata.primaryArtistName || '—'}</p>
              <p><span className="font-medium text-content-primary">ISRC:</span> {metadata.isrc || '—'}</p>
              <p><span className="font-medium text-content-primary">UPC:</span> {metadata.upc || '—'}</p>
              <p><span className="font-medium text-content-primary">Genre:</span> {metadata.genre || '—'}</p>
              <p><span className="font-medium text-content-primary">Language:</span> {metadata.language || '—'}</p>
              <p><span className="font-medium text-content-primary">Label:</span> {metadata.labelName || '—'}</p>
              <p>
                <span className="font-medium text-content-primary">Explicit:</span>{' '}
                {metadata.explicit === null ? '—' : metadata.explicit ? 'Yes' : 'No'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-content-secondary">No release info captured yet.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

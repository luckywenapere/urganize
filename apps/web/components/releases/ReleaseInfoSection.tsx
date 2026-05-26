'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/errors';

type CreditEntry = Record<string, unknown>;

type ReleaseInfoPayload = {
  metadata: {
    primaryArtistName: string;
    releaseTitle: string;
    isrc: string;
    upc: string;
    genre: string;
    language: string;
    producerCredits: CreditEntry[];
    writerCredits: CreditEntry[];
    featuredArtistCredits: CreditEntry[];
    mixingCredits: CreditEntry[];
    masteringCredits: CreditEntry[];
    allCredits: CreditEntry[];
  } | null;
  error?: string;
};

type ReleaseInfoSectionProps = {
  releaseId: string;
};

function CreditGroup({ title, entries }: { title: string; entries: CreditEntry[] }) {
  return (
    <div className="border border-stroke-default bg-bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">{title}</p>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-content-secondary">No credits in this group yet.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {entries.map((entry, index) => (
            <div key={`${title}-${index}`} className="border border-stroke-subtle bg-bg-elevated/60 px-3 py-2 text-sm">
              <p className="font-medium text-content-primary">
                {String(entry.stageName || entry.legalName || 'Unnamed credit')}
              </p>
              <p className="mt-0.5 text-content-secondary">{String(entry.role || 'Role not set')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="border border-stroke-default bg-bg-surface p-4 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">Identifiers</p>
                  <div className="mt-2 space-y-1.5 text-content-secondary">
                    <p><span className="font-medium text-content-primary">Title:</span> {metadata.releaseTitle || '—'}</p>
                    <p><span className="font-medium text-content-primary">Primary artist:</span> {metadata.primaryArtistName || '—'}</p>
                    <p><span className="font-medium text-content-primary">ISRC:</span> {metadata.isrc || '—'}</p>
                    <p><span className="font-medium text-content-primary">UPC:</span> {metadata.upc || '—'}</p>
                    <p><span className="font-medium text-content-primary">Genre:</span> {metadata.genre || '—'}</p>
                    <p><span className="font-medium text-content-primary">Language:</span> {metadata.language || '—'}</p>
                  </div>
                </div>
                <div className="border border-stroke-default bg-bg-surface p-4 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">Credits summary</p>
                  <div className="mt-2 space-y-1.5 text-content-secondary">
                    <p><span className="font-medium text-content-primary">All credits:</span> {metadata.allCredits.length}</p>
                    <p><span className="font-medium text-content-primary">Producers:</span> {metadata.producerCredits.length}</p>
                    <p><span className="font-medium text-content-primary">Writers:</span> {metadata.writerCredits.length}</p>
                    <p><span className="font-medium text-content-primary">Featured artists:</span> {metadata.featuredArtistCredits.length}</p>
                    <p><span className="font-medium text-content-primary">Mixing:</span> {metadata.mixingCredits.length}</p>
                    <p><span className="font-medium text-content-primary">Mastering:</span> {metadata.masteringCredits.length}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <CreditGroup title="Producer credits" entries={metadata.producerCredits} />
                <CreditGroup title="Writer credits" entries={metadata.writerCredits} />
                <CreditGroup title="Featured artist credits" entries={metadata.featuredArtistCredits} />
                <CreditGroup title="Mixing credits" entries={metadata.mixingCredits} />
                <CreditGroup title="Mastering credits" entries={metadata.masteringCredits} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-content-secondary">No credits yet. Once credits are submitted, release info will show here for review.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

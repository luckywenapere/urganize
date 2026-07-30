'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, Newspaper } from 'lucide-react';
import type { ReleaseEpk } from '@/types/epk';
import { supabase } from '@/lib/supabase/client';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

// The EPK share-link manager (URG-196). Self-contained (the
// ContentCalendarSection pattern): takes releaseId, fetches its own data,
// renders its own loading/empty/error states. The kit itself is the public
// /epk/[token] page — this surface only creates, copies, and revokes the
// share link.
//
// Two variants (the ChappiConversation page/panel precedent):
// 'section' renders the full release-page section framing (header + mt-8);
// 'panel' renders bare content for the release side panel, whose shell
// provides its own header.
//
// NEXT_PUBLIC_ prefix so the value is inlined at build time for this client
// component. The API routes guard the same flag server-side (404 when off).
const EPK_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EPK === 'true';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

type EpkSectionProps = {
  releaseId: string;
  onToast?: (message: string, tone: 'success' | 'error' | 'warning') => void;
  variant?: 'section' | 'panel';
};

export function EpkSection({ releaseId, onToast, variant = 'section' }: EpkSectionProps) {
  const [epk, setEpk] = useState<ReleaseEpk | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Distinguishes "no kit yet" from "the load failed", the same split
  // ContentCalendarSection draws so a fetch failure never masquerades as the
  // warm empty invitation.
  const [loadError, setLoadError] = useState('');
  const [isMutating, setIsMutating] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = epk
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/epk/${epk.shareToken}`
    : '';

  const loadEpk = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const token = await getAccessToken();
      if (!token) {
        setLoadError('Session expired. Please sign in again.');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/epk`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as {
        epk?: ReleaseEpk | null;
        error?: string;
      };
      if (!res.ok) {
        setLoadError(data.error || 'Could not load press kit.');
        return;
      }
      setEpk(data.epk ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load press kit.');
    } finally {
      setIsLoading(false);
    }
  }, [releaseId]);

  useEffect(() => {
    if (!EPK_ENABLED) return;
    void loadEpk();
  }, [loadEpk]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleGenerate = async () => {
    if (isMutating) return;
    setIsMutating(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/epk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        epk?: ReleaseEpk;
        error?: string;
      };
      if (!res.ok || !data.epk?.shareToken) {
        onToast?.(data.error || 'Could not create press kit.', 'error');
        return;
      }
      setEpk(data.epk);
      onToast?.('Press kit link is live.', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not create press kit.', 'error');
    } finally {
      setIsMutating(false);
    }
  };

  const handleRevoke = async () => {
    if (isMutating) return;
    setIsMutating(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/epk`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        onToast?.(data.error || 'Could not revoke the link.', 'error');
        return;
      }
      setEpk(null);
      onToast?.('Press kit link revoked. Anyone holding it now sees nothing.', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not revoke the link.', 'error');
    } finally {
      setIsMutating(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      onToast?.('Could not copy — select the link and copy it manually.', 'warning');
    }
  };

  if (!EPK_ENABLED) return null;

  const body = (
    <>
      {isLoading ? (
        <div className="mt-4">
          <SkeletonBlock className="h-12 w-full" />
        </div>
      ) : loadError ? (
        <div className="mt-4 flex flex-col gap-3 border border-status-error/30 bg-status-error/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-status-error">Couldn&rsquo;t load the press kit.</p>
          <button
            type="button"
            onClick={() => void loadEpk()}
            className="inline-flex h-9 shrink-0 items-center self-start border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover sm:self-auto"
          >
            Retry
          </button>
        </div>
      ) : !epk ? (
        <div className="mt-4 border border-stroke-default bg-bg-surface p-6 text-center">
          <p className="text-sm text-content-secondary">
            Generate a press kit link to send to press, curators, and bookers.
          </p>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={isMutating}
            className="mt-3 inline-flex items-center gap-2 border border-brand/25 bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMutating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Newspaper className="h-3.5 w-3.5" />
                Generate press kit
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="mt-4 border border-stroke-default bg-bg-surface p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p
              className="min-w-0 flex-1 truncate font-mono text-xs text-content-secondary"
              title={shareUrl}
            >
              {shareUrl}
            </p>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex h-9 items-center gap-2 border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-primary hover:bg-bg-hover"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-brand" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy link
                  </>
                )}
              </button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-primary hover:bg-bg-hover"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View kit
              </a>
              <button
                type="button"
                onClick={() => void handleRevoke()}
                disabled={isMutating}
                className="inline-flex h-9 items-center border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-status-error disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isMutating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Revoke link'}
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-content-tertiary">
            Anyone with this link can view the kit. Revoking kills the link immediately;
            generating again creates a fresh one.
          </p>
        </div>
      )}
    </>
  );

  if (variant === 'panel') {
    return (
      <div>
        <p className="text-sm text-content-secondary">
          A shareable EPK assembled from this release&rsquo;s details and artwork — it stays in
          sync as the release changes.
        </p>
        {body}
      </div>
    );
  }

  return (
    <section className="mt-8">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Press kit
        </h2>
        <p className="mt-1 text-sm text-content-secondary">
          A shareable EPK assembled from this release&rsquo;s details and artwork — it stays in
          sync as the release changes.
        </p>
      </div>
      {body}
    </section>
  );
}

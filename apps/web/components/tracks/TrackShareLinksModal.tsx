'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@urganize/ui';
import { PaywallGate } from '@/components/billing/PaywallGate';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Toast } from '@/components/shared/Toast';
import { supabase } from '@/lib/supabase/client';
import {
  type ShareLink,
  type ShareLinkListResponse,
  type ShareLinkResponse,
  type Track,
  type TrackApiError,
} from '@/lib/tracks';

type TrackShareLinksModalProps = {
  track: Track;
  onClose: () => void;
};

type ToastState = {
  message: string;
  tone: 'success' | 'error';
};

function formatDate(value: string | null): string {
  if (!value) {
    return 'No expiry';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'No expiry';
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getTone(status: ShareLink['status']): 'neutral' | 'warning' | 'success' {
  if (status === 'active') {
    return 'success';
  }

  if (status === 'expired') {
    return 'warning';
  }

  return 'neutral';
}

export function TrackShareLinksModal({ track, onClose }: TrackShareLinksModalProps) {
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [label, setLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [lastCreatedUrl, setLastCreatedUrl] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token || '';
    if (!accessToken) {
      throw new Error('Session expired. Please sign in again.');
    }

    return accessToken;
  }, []);

  const loadShareLinks = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/tracks/${track.id}/share-links`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<
        ShareLinkListResponse & TrackApiError
      >;

      if (!response.ok) {
        throw new Error(payload.error || 'Could not load share links.');
      }

      setShareLinks(Array.isArray(payload.shareLinks) ? payload.shareLinks : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load share links.');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, track.id]);

  useEffect(() => {
    void loadShareLinks();
  }, [loadShareLinks]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const handleCreate = async () => {
    setIsCreating(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/tracks/${track.id}/share-links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          label,
          expiresAt: expiresAt || null,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<
        ShareLinkResponse & TrackApiError
      >;

      if (!response.ok || !payload.shareLink) {
        throw new Error(payload.error || 'Could not create share link.');
      }

      setShareLinks((current) => [payload.shareLink as ShareLink, ...current]);
      setLastCreatedUrl(String(payload.shareLink.shareUrl || ''));
      setLabel('');
      setExpiresAt('');
      setToast({ message: 'Share link created.', tone: 'success' });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create share link.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (shareLink: ShareLink) => {
    setRevokingId(shareLink.id);
    setError('');

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/share-links/${shareLink.id}/revoke`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<
        ShareLinkResponse & TrackApiError
      >;

      if (!response.ok || !payload.shareLink) {
        throw new Error(payload.error || 'Could not revoke share link.');
      }

      setShareLinks((current) =>
        current.map((entry) => (entry.id === shareLink.id ? (payload.shareLink as ShareLink) : entry))
      );
      setToast({ message: 'Share link revoked.', tone: 'success' });
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Could not revoke share link.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToast({ message: 'Share link copied.', tone: 'success' });
    } catch {
      setToast({ message: 'Could not copy the share link.', tone: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-[170]">
      <button
        type="button"
        aria-label="Close share links modal"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
      />

      <div className="relative flex min-h-screen items-center justify-center px-4 py-8">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="track-share-links-title"
          className="relative z-[1] w-full max-w-3xl rounded-[32px] border border-stroke-default bg-bg-surface/98 p-5 shadow-[0_28px_80px_-36px_rgba(0,0,0,0.72)] sm:p-7"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
                Private Sharing
              </p>
              <h2 id="track-share-links-title" className="mt-3 text-3xl text-content-primary">
                {track.title}
              </h2>
              <p className="mt-2 text-sm leading-7 text-content-secondary">
                Generate private listening links for A&Rs, managers, labels, and collaborators without making the track public.
              </p>
            </div>

            <button
              type="button"
              aria-label="Close share links modal"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-stroke-default bg-bg-elevated text-content-secondary transition hover:text-content-primary"
            >
              ×
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}
            {error ? (
              <p className="rounded-[20px] border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
                {error}
              </p>
            ) : null}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-[28px] border border-stroke-default bg-bg-elevated/70 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-content-primary">Existing links</h3>
                  <p className="mt-1 text-sm text-content-secondary">
                    Keep the full audit trail even after revoking a link.
                  </p>
                </div>
                <StatusBadge label={`${shareLinks.length} links`} size="sm" />
              </div>

              <div className="mt-4 space-y-3">
                {isLoading ? (
                  <div className="space-y-3 rounded-[22px] border border-stroke-subtle bg-bg-base/60 p-4">
                    <div className="h-4 w-24 rounded-full skeleton-shimmer" />
                    <div className="h-10 w-full rounded-[18px] skeleton-shimmer" />
                    <div className="h-4 w-2/3 rounded-full skeleton-shimmer" />
                  </div>
                ) : shareLinks.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-stroke-default bg-bg-base/60 p-4 text-sm text-content-secondary">
                    No share links yet. Create the first one.
                  </div>
                ) : (
                  shareLinks.map((shareLink) => (
                    <article
                      key={shareLink.id}
                      className={`rounded-[22px] border border-stroke-subtle bg-bg-base/60 p-4 ${
                        shareLink.status === 'revoked' ? 'opacity-75' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className={`truncate text-sm font-semibold text-content-primary ${
                                shareLink.status === 'revoked' ? 'line-through decoration-status-error/80' : ''
                              }`}
                            >
                              {shareLink.label || 'Unlabeled share link'}
                            </p>
                            <StatusBadge label={shareLink.status} tone={getTone(shareLink.status)} size="sm" />
                          </div>

                          <p className="mt-2 break-all text-xs text-content-secondary">
                            {shareLink.shareUrl}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.12em] text-content-tertiary">
                            <span>Created {formatDate(shareLink.createdAt)}</span>
                            <span>Plays {shareLink.playCount}</span>
                            <span>Expiry {formatDate(shareLink.expiresAt)}</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleCopy(shareLink.shareUrl)}
                          >
                            Copy
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={shareLink.status === 'revoked'}
                            onClick={() => void handleRevoke(shareLink)}
                            isLoading={revokingId === shareLink.id}
                          >
                            Revoke
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-stroke-default bg-bg-elevated/70 p-4 sm:p-5">
              <h3 className="text-lg font-semibold text-content-primary">Create share link</h3>
              <p className="mt-2 text-sm text-content-secondary">
                Add context so you know who received it.
              </p>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-content-primary">Label</span>
                  <input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Sent to A&R @ Sony"
                    className="input h-12 rounded-[18px]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-content-primary">Expiry date</span>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                    className="input h-12 rounded-[18px]"
                  />
                </label>

                <PaywallGate>
                  {({ requireAccess }) => (
                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      onClick={() => void requireAccess(() => handleCreate())}
                      isLoading={isCreating}
                    >
                      Create share link
                    </Button>
                  )}
                </PaywallGate>

                {lastCreatedUrl ? (
                  <div className="rounded-[22px] border border-brand/20 bg-brand-muted/40 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
                      Latest link
                    </p>
                    <p className="mt-2 break-all text-sm text-content-primary">{lastCreatedUrl}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-4"
                      onClick={() => void handleCopy(lastCreatedUrl)}
                    >
                      Copy link
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

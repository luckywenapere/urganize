'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ClipboardList, Copy, ExternalLink, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { MetadataFieldsSkeleton, ShareLinkCardSkeleton } from '@/components/loading/ReleaseSectionSkeletons';
import type { ReleaseMetadataSnapshot } from '@/lib/release-ops';
import {
  RELEASE_CREDIT_ROLE_LABELS,
  type ReleaseCreditLink,
  type ReleaseCreditSubmission,
} from '@/types/credits';

// The metadata hub (URG-108). Self-contained (the EpkSection pattern): takes
// releaseId, fetches its own data, renders its own loading/empty/error
// states. Hosted by ReleaseSceneOverlay as an overlay window over the
// workspace (2026-08-04 — it had its own /dashboard/releases/[releaseId]/metadata
// page until then; that route is a redirect stub now). Three sections: editable
// release-level distribution fields, the collaborator credits share link, and
// the submissions collected through it.
//
// NEXT_PUBLIC_ prefix so the value is inlined at build time for this client
// component. The API routes guard the same flag server-side (404 when off).
const METADATA_ENABLED = process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

type MetadataFormState = {
  isrc: string;
  upc: string;
  genre: string;
  subgenre: string;
  language: string;
  explicit: boolean;
  labelName: string;
  cLine: string;
  pLine: string;
};

const EMPTY_FORM: MetadataFormState = {
  isrc: '',
  upc: '',
  genre: '',
  subgenre: '',
  language: '',
  explicit: false,
  labelName: '',
  cLine: '',
  pLine: '',
};

function toFormState(metadata: ReleaseMetadataSnapshot | null): MetadataFormState {
  if (!metadata) return EMPTY_FORM;
  return {
    isrc: metadata.isrc,
    upc: metadata.upc,
    genre: metadata.genre,
    subgenre: metadata.subgenre,
    language: metadata.language,
    explicit: metadata.explicit === true,
    labelName: metadata.labelName,
    cLine: metadata.cLine,
    pLine: metadata.pLine,
  };
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(2)}%`;
}

type MetadataSectionProps = {
  releaseId: string;
  onToast?: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

export function MetadataSection({ releaseId, onToast }: MetadataSectionProps) {
  // --- Release-level fields -------------------------------------------------
  const [form, setForm] = useState<MetadataFormState>(EMPTY_FORM);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [metadataError, setMetadataError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // --- Credits share link ----------------------------------------------------
  const [link, setLink] = useState<ReleaseCreditLink | null>(null);
  const [isLoadingLink, setIsLoadingLink] = useState(true);
  const [linkError, setLinkError] = useState('');
  const [isMutatingLink, setIsMutatingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  // --- Submissions -------------------------------------------------------------
  const [submissions, setSubmissions] = useState<ReleaseCreditSubmission[]>([]);
  const [deletingId, setDeletingId] = useState('');

  const shareUrl = link
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/credits/${link.shareToken}`
    : '';

  const loadMetadata = useCallback(async () => {
    setIsLoadingMetadata(true);
    setMetadataError('');
    try {
      const token = await getAccessToken();
      if (!token) {
        setMetadataError('Session expired. Please sign in again.');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/metadata`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as {
        metadata?: ReleaseMetadataSnapshot | null;
        error?: string;
      };
      if (!res.ok) {
        setMetadataError(data.error || 'Could not load release metadata.');
        return;
      }
      setForm(toFormState(data.metadata ?? null));
    } catch (err) {
      setMetadataError(err instanceof Error ? err.message : 'Could not load release metadata.');
    } finally {
      setIsLoadingMetadata(false);
    }
  }, [releaseId]);

  const loadCredits = useCallback(async () => {
    setIsLoadingLink(true);
    setLinkError('');
    try {
      const token = await getAccessToken();
      if (!token) {
        setLinkError('Session expired. Please sign in again.');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/credits`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as {
        link?: ReleaseCreditLink | null;
        submissions?: ReleaseCreditSubmission[];
        error?: string;
      };
      if (!res.ok) {
        setLinkError(data.error || 'Could not load the credits link.');
        return;
      }
      setLink(data.link ?? null);
      setSubmissions(Array.isArray(data.submissions) ? data.submissions : []);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not load the credits link.');
    } finally {
      setIsLoadingLink(false);
    }
  }, [releaseId]);

  useEffect(() => {
    if (!METADATA_ENABLED) return;
    void loadMetadata();
    void loadCredits();
  }, [loadMetadata, loadCredits]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleSaveMetadata = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as {
        metadata?: ReleaseMetadataSnapshot;
        error?: string;
      };
      if (!res.ok) {
        onToast?.(data.error || 'Could not save metadata.', 'error');
        return;
      }
      setForm(toFormState(data.metadata ?? null));
      onToast?.('Metadata saved.', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not save metadata.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateLink = async () => {
    if (isMutatingLink) return;
    setIsMutatingLink(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/credits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { link?: ReleaseCreditLink; error?: string };
      if (!res.ok || !data.link?.shareToken) {
        onToast?.(data.error || 'Could not create the credits link.', 'error');
        return;
      }
      setLink(data.link);
      onToast?.('Credits link is live.', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not create the credits link.', 'error');
    } finally {
      setIsMutatingLink(false);
    }
  };

  const handleRegenerateLink = async () => {
    if (isMutatingLink) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Regenerate the credits link? The old link stops working immediately — anyone still holding it will see nothing.'
      );
      if (!confirmed) return;
    }
    setIsMutatingLink(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/credits`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { link?: ReleaseCreditLink; error?: string };
      if (!res.ok || !data.link?.shareToken) {
        onToast?.(data.error || 'Could not regenerate the credits link.', 'error');
        return;
      }
      setLink(data.link);
      onToast?.('Credits link regenerated. The old link no longer works.', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not regenerate the credits link.', 'error');
    } finally {
      setIsMutatingLink(false);
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

  const handleDeleteSubmission = async (submissionId: string, legalName: string) => {
    if (deletingId) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        `Remove ${legalName || 'this submission'}? They can resubmit through the same link.`
      );
      if (!confirmed) return;
    }
    setDeletingId(submissionId);
    try {
      const token = await getAccessToken();
      if (!token) {
        onToast?.('Session expired. Please sign in again.', 'error');
        return;
      }
      const res = await fetch(`/api/releases/${releaseId}/credits/submissions/${submissionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        onToast?.(data.error || 'Could not remove the submission.', 'error');
        return;
      }
      setSubmissions((current) => current.filter((item) => item.id !== submissionId));
      onToast?.('Submission removed.', 'success');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Could not remove the submission.', 'error');
    } finally {
      setDeletingId('');
    }
  };

  const totalSongwriterSplit = useMemo(
    () => submissions.reduce((sum, item) => sum + (item.songwriterSplit ?? 0), 0),
    [submissions]
  );
  const totalMasterSplit = useMemo(
    () => submissions.reduce((sum, item) => sum + (item.masterSplit ?? 0), 0),
    [submissions]
  );
  const hasAnySongwriterSplit = submissions.some((item) => item.songwriterSplit !== null);
  const hasAnyMasterSplit = submissions.some((item) => item.masterSplit !== null);

  if (!METADATA_ENABLED) return null;

  return (
    <div className="mt-8 space-y-8">
      {/* Release details */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Release details
        </h2>
        <p className="mt-1 text-sm text-content-secondary">
          The distribution metadata a DSP or aggregator asks for when this release ships.
        </p>

        {isLoadingMetadata ? (
          <MetadataFieldsSkeleton />
        ) : metadataError ? (
          <div className="mt-4 flex flex-col gap-3 border border-status-error/30 bg-status-error/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-status-error">{metadataError}</p>
            <button
              type="button"
              onClick={() => void loadMetadata()}
              className="inline-flex h-9 shrink-0 items-center self-start border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover sm:self-auto"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 border border-stroke-default bg-bg-surface p-4 sm:grid-cols-2">
            <Field label="ISRC" value={form.isrc} onChange={(v) => setForm((f) => ({ ...f, isrc: v }))} />
            <Field label="UPC" value={form.upc} onChange={(v) => setForm((f) => ({ ...f, upc: v }))} />
            <Field label="Genre" value={form.genre} onChange={(v) => setForm((f) => ({ ...f, genre: v }))} />
            <Field
              label="Subgenre"
              value={form.subgenre}
              onChange={(v) => setForm((f) => ({ ...f, subgenre: v }))}
            />
            <Field
              label="Language"
              value={form.language}
              onChange={(v) => setForm((f) => ({ ...f, language: v }))}
            />
            <Field
              label="Label name"
              value={form.labelName}
              onChange={(v) => setForm((f) => ({ ...f, labelName: v }))}
            />
            <Field
              label="℗ line (recording)"
              placeholder="℗ 2026 Some Label"
              value={form.pLine}
              onChange={(v) => setForm((f) => ({ ...f, pLine: v }))}
            />
            <Field
              label="© line (composition/artwork)"
              placeholder="© 2026 Some Label"
              value={form.cLine}
              onChange={(v) => setForm((f) => ({ ...f, cLine: v }))}
            />
            <label className="flex items-center gap-2 text-sm text-content-secondary sm:col-span-2">
              <input
                type="checkbox"
                checked={form.explicit}
                onChange={(event) => setForm((f) => ({ ...f, explicit: event.target.checked }))}
                className="h-4 w-4 accent-brand"
              />
              This release contains explicit content
            </label>
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() => void handleSaveMetadata()}
                disabled={isSaving}
                className="inline-flex h-9 items-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {isSaving ? 'Saving…' : 'Save details'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Credits share link */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Collaborator credits
        </h2>
        <p className="mt-1 text-sm text-content-secondary">
          Share one link with every collaborator — producers, co-writers, engineers — and their
          publishing details land below as they submit.
        </p>

        {isLoadingLink ? (
          <ShareLinkCardSkeleton />
        ) : linkError ? (
          <div className="mt-4 flex flex-col gap-3 border border-status-error/30 bg-status-error/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-status-error">{linkError}</p>
            <button
              type="button"
              onClick={() => void loadCredits()}
              className="inline-flex h-9 shrink-0 items-center self-start border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary hover:bg-bg-hover sm:self-auto"
            >
              Retry
            </button>
          </div>
        ) : !link ? (
          <div className="mt-4 border border-stroke-default bg-bg-surface p-6 text-center">
            <p className="text-sm text-content-secondary">
              Create a submission link to start collecting credits.
            </p>
            <button
              type="button"
              onClick={() => void handleCreateLink()}
              disabled={isMutatingLink}
              className="mt-3 inline-flex items-center gap-2 border border-brand/25 bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isMutatingLink ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <ClipboardList className="h-3.5 w-3.5" />
                  Create submission link
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="mt-4 border border-stroke-default bg-bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-content-secondary" title={shareUrl}>
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
                  Open form
                </a>
                <button
                  type="button"
                  onClick={() => void handleRegenerateLink()}
                  disabled={isMutatingLink}
                  className="inline-flex h-9 items-center gap-2 border border-stroke-default bg-bg-elevated px-3 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-status-warning disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isMutatingLink ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Regenerate
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-content-tertiary">
              Anyone with this link can submit credits — no account required. Regenerating kills the
              old link immediately; every submission already collected stays.
            </p>
          </div>
        )}
      </section>

      {/* Submissions */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Submissions {submissions.length > 0 ? `(${submissions.length})` : ''}
        </h2>

        {submissions.length === 0 ? (
          <p className="mt-4 text-sm text-content-secondary">
            {link
              ? 'Share the link above to start collecting credits.'
              : 'Create a link above, then share it to start collecting credits.'}
          </p>
        ) : (
          <>
            {(hasAnySongwriterSplit || hasAnyMasterSplit) && (
              <div className="mt-4 flex flex-col gap-2 border border-stroke-default bg-bg-surface p-4 text-sm sm:flex-row sm:items-center sm:gap-6">
                {hasAnySongwriterSplit && (
                  <p
                    className={
                      Math.round(totalSongwriterSplit * 100) / 100 === 100
                        ? 'text-content-secondary'
                        : 'text-status-warning'
                    }
                  >
                    Writer splits total {formatPercent(totalSongwriterSplit)}
                    {Math.round(totalSongwriterSplit * 100) / 100 !== 100 && totalSongwriterSplit <= 100
                      ? ` — ${formatPercent(100 - totalSongwriterSplit)} unclaimed`
                      : ''}
                  </p>
                )}
                {hasAnyMasterSplit && (
                  <p
                    className={
                      Math.round(totalMasterSplit * 100) / 100 === 100
                        ? 'text-content-secondary'
                        : 'text-status-warning'
                    }
                  >
                    Master splits total {formatPercent(totalMasterSplit)}
                    {Math.round(totalMasterSplit * 100) / 100 !== 100 && totalMasterSplit <= 100
                      ? ` — ${formatPercent(100 - totalMasterSplit)} unclaimed`
                      : ''}
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 space-y-3">
              {submissions.map((submission) => (
                <SubmissionCard
                  key={submission.id}
                  submission={submission}
                  isDeleting={deletingId === submission.id}
                  onDelete={() => void handleDeleteSubmission(submission.id, submission.legalName)}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-content-tertiary">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
      />
    </label>
  );
}

function SubmissionCard({
  submission,
  isDeleting,
  onDelete,
}: {
  submission: ReleaseCreditSubmission;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const submittedDate = submission.createdAt
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
        new Date(submission.createdAt)
      )
    : '';

  const contactLine = [submission.email, submission.phone].filter(Boolean).join(' · ');
  const publishingLine = [
    submission.proAffiliation && `PRO: ${submission.proAffiliation}`,
    submission.ipiNumber && `IPI: ${submission.ipiNumber}`,
    submission.publisherName && `Publisher: ${submission.publisherName}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const socialsLine = [
    submission.instagramHandle && `IG @${submission.instagramHandle.replace(/^@/, '')}`,
    submission.xHandle && `X @${submission.xHandle.replace(/^@/, '')}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="border border-stroke-default bg-bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-content-primary">
            {submission.legalName}
            {submission.stageName ? (
              <span className="font-normal text-content-tertiary"> · {submission.stageName}</span>
            ) : null}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {submission.roles.map((role) => (
              <span
                key={role}
                className="rounded-full border border-stroke-subtle bg-bg-elevated px-2 py-px text-[11px] text-content-secondary"
              >
                {RELEASE_CREDIT_ROLE_LABELS[role] || role}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="inline-flex h-8 shrink-0 items-center gap-1 border border-stroke-default bg-bg-elevated px-2 text-xs text-content-secondary hover:bg-bg-hover hover:text-status-error disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Remove
        </button>
      </div>

      {submission.contribution ? (
        <p className="mt-2 text-sm text-content-secondary">{submission.contribution}</p>
      ) : null}

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-content-tertiary sm:grid-cols-2">
        {(submission.songwriterSplit !== null || submission.masterSplit !== null) && (
          <div>
            {submission.songwriterSplit !== null ? (
              <span>Writer split: {formatPercent(submission.songwriterSplit)}</span>
            ) : null}
            {submission.songwriterSplit !== null && submission.masterSplit !== null ? ' · ' : ''}
            {submission.masterSplit !== null ? (
              <span>Master split: {formatPercent(submission.masterSplit)}</span>
            ) : null}
          </div>
        )}
        {publishingLine ? <div>{publishingLine}</div> : null}
        {contactLine ? <div>{contactLine}</div> : null}
        {socialsLine ? <div>{socialsLine}</div> : null}
      </dl>

      {submission.bio ? (
        <p className="mt-3 whitespace-pre-line text-xs text-content-tertiary">{submission.bio}</p>
      ) : null}

      {submittedDate ? (
        <p className="mt-3 text-[11px] uppercase tracking-[0.1em] text-content-tertiary">
          Submitted {submittedDate}
        </p>
      ) : null}
    </div>
  );
}

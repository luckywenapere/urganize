'use client';

import { useEffect, useMemo, useState } from 'react';
import { PaywallGate } from '@/components/billing/PaywallGate';
import { supabase } from '@/lib/supabase/client';
import {
  emptyContributorSubmissionInput,
  normalizeSubmissionInput,
  type ContributorSubmission,
  type ContributorSubmissionInput,
  type CreditCollectionLink,
  type CreditFinalization,
} from '@/lib/credits';
import { errorMessage } from "@/lib/errors";

type CreditsMetadataSectionProps = {
  planId: string;
};

type CreditsApiResponse = {
  credits?: {
    link: CreditCollectionLink | null;
    submissions: ContributorSubmission[];
    finalization: CreditFinalization | null;
  };
  error?: string;
  sql?: string;
};

const getAccessToken = async (): Promise<string> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
};

const toEditableSubmission = (submission: ContributorSubmission | null): ContributorSubmissionInput =>
  submission
    ? normalizeSubmissionInput(submission)
    : emptyContributorSubmissionInput();

export function CreditsMetadataSection({ planId }: CreditsMetadataSectionProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [isSavingSubmission, setIsSavingSubmission] = useState(false);
  const [isDeletingSubmission, setIsDeletingSubmission] = useState(false);
  const [isUpdatingFinalization, setIsUpdatingFinalization] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showResponses, setShowResponses] = useState(false);
  const [link, setLink] = useState<CreditCollectionLink | null>(null);
  const [submissions, setSubmissions] = useState<ContributorSubmission[]>([]);
  const [finalization, setFinalization] = useState<CreditFinalization | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<ContributorSubmission | null>(null);
  const [editableSubmission, setEditableSubmission] = useState<ContributorSubmissionInput>(emptyContributorSubmissionInput);

  const responseCount = submissions.length;
  const publicLink = useMemo(() => {
    if (!link || typeof window === 'undefined') return '';
    return `${window.location.origin}/credits/${link.token}`;
  }, [link]);

  const loadCredits = async () => {
    setIsLoading(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/plans/${planId}/credits`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as CreditsApiResponse;
      if (!response.ok || !payload.credits) {
        throw new Error(payload.error || 'Could not load credits and metadata.');
      }

      setLink(payload.credits.link);
      setSubmissions(payload.credits.submissions || []);
      setFinalization(payload.credits.finalization || null);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Could not load credits and metadata.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCredits();
    // loadCredits is a stable closure over planId via its own scope, so we
    // intentionally key only on planId. Adding loadCredits to deps would
    // re-fire on every render since the function identity changes each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const handleGenerateLink = async () => {
    setIsGeneratingLink(true);
    setError('');
    setSuccess('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/plans/${planId}/credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: 'generate-link' }),
      });

      const payload = (await response.json().catch(() => ({}))) as { link?: CreditCollectionLink; error?: string };
      if (!response.ok || !payload.link) {
        throw new Error(payload.error || 'Could not generate a credit collection link.');
      }

      setLink(payload.link);
      setSuccess('Credit collection link is active and ready to share.');
    } catch (generateError) {
      setError(errorMessage(generateError, 'Could not generate a credit collection link.'));
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (!publicLink) return;

    try {
      await navigator.clipboard.writeText(publicLink);
      setSuccess('Link copied. Send it to everyone involved in the release.');
    } catch {
      setError('Could not copy the link on this device.');
    }
  };

  const openSubmission = (submission: ContributorSubmission) => {
    setSelectedSubmission(submission);
    setEditableSubmission(toEditableSubmission(submission));
  };

  const saveSubmission = async () => {
    if (!selectedSubmission) return;
    setIsSavingSubmission(true);
    setError('');
    setSuccess('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(
        `/api/plans/${planId}/credits/submissions/${selectedSubmission.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(editableSubmission),
        }
      );

      const payload = (await response.json().catch(() => ({}))) as {
        submission?: ContributorSubmission;
        error?: string;
      };
      if (!response.ok || !payload.submission) {
        throw new Error(payload.error || 'Could not update submission.');
      }

      setSubmissions((current) =>
        current.map((submission) => (submission.id === payload.submission!.id ? payload.submission! : submission))
      );
      setSelectedSubmission(payload.submission);
      setEditableSubmission(toEditableSubmission(payload.submission));
      setSuccess('Submission updated.');
    } catch (saveError) {
      setError(errorMessage(saveError, 'Could not update submission.'));
    } finally {
      setIsSavingSubmission(false);
    }
  };

  const deleteSubmission = async () => {
    if (!selectedSubmission) return;
    const confirmed = window.confirm('Delete this contributor submission? This cannot be undone.');
    if (!confirmed) return;

    setIsDeletingSubmission(true);
    setError('');
    setSuccess('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(
        `/api/plans/${planId}/credits/submissions/${selectedSubmission.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not delete submission.');
      }

      setSubmissions((current) => current.filter((submission) => submission.id !== selectedSubmission.id));
      setSelectedSubmission(null);
      setEditableSubmission(emptyContributorSubmissionInput());
      setSuccess('Submission deleted.');
    } catch (deleteError) {
      setError(errorMessage(deleteError, 'Could not delete submission.'));
    } finally {
      setIsDeletingSubmission(false);
    }
  };

  const updateFinalization = async (action: 'finalize' | 'unlock') => {
    const confirmed = window.confirm(
      action === 'finalize'
        ? 'Finalize credits for this release? Public submissions will be locked.'
        : 'Unlock finalized credits? This will reopen submissions.'
    );
    if (!confirmed) return;

    setIsUpdatingFinalization(true);
    setError('');
    setSuccess('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/plans/${planId}/credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        finalization?: CreditFinalization;
        error?: string;
      };

      if (!response.ok || !payload.finalization) {
        throw new Error(payload.error || 'Could not update finalization state.');
      }

      setFinalization(payload.finalization);
      setSuccess(action === 'finalize' ? 'Credits finalized.' : 'Credits unlocked.');
    } catch (finalizeError) {
      setError(errorMessage(finalizeError, 'Could not update finalization state.'));
    } finally {
      setIsUpdatingFinalization(false);
    }
  };

  return (
    <section className="border-b border-stroke-default py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-content-primary">Credits &amp; Metadata</p>
          <h2 className="mt-2 text-2xl tracking-tight text-content-primary">
            Send one link. Collect every contributor&apos;s credits and metadata. Finalize your song credits in one place.
          </h2>
          <p className="mt-3 text-sm text-content-secondary">
            Generate a link and send it to everyone involved in this release. Track submissions and finalize your credits before distribution.
          </p>
        </div>
        <div className="rounded-[24px] border border-stroke-default bg-bg-surface/95 px-5 py-4 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
          <p className="text-xs uppercase tracking-[0.14em] text-content-tertiary">Status</p>
          <p className="mt-2 text-sm font-medium text-content-primary">
            {finalization?.isFinalized ? 'Credits Finalized' : link?.isActive ? 'Active Link' : 'No Link Yet'}
          </p>
          <p className="mt-1 text-sm text-content-secondary">{responseCount} responses collected</p>
        </div>
      </div>

      {error ? (
        <p className="mt-5 rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-5 rounded-2xl border border-brand/35 bg-brand-muted px-4 py-3 text-sm text-brand">
          {success}
        </p>
      ) : null}

      <div className="mt-6 rounded-[28px] border border-stroke-subtle bg-bg-surface/90 p-5">
        <PaywallGate>
          {({ requireAccess }) => (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void requireAccess(() => handleGenerateLink())}
                disabled={isGeneratingLink || isLoading}
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
              >
                {link ? (isGeneratingLink ? 'Regenerating...' : 'Regenerate Credit Collection Link') : isGeneratingLink ? 'Generating...' : 'Generate Credit Collection Link'}
              </button>
              <button
                type="button"
                onClick={() => void requireAccess(() => handleCopyLink())}
                disabled={!link}
                className="rounded-full border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-60"
              >
                Copy Link
              </button>
              <button
                type="button"
                onClick={() => setShowResponses((current) => !current)}
                className="rounded-full border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              >
                {showResponses ? 'Hide Responses' : 'View Responses'}
              </button>
              <button
                type="button"
                onClick={() => void requireAccess(() => updateFinalization(finalization?.isFinalized ? 'unlock' : 'finalize'))}
                disabled={isUpdatingFinalization || isLoading}
                className="rounded-full border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-60"
              >
                {finalization?.isFinalized ? 'Unlock Credits' : 'Finalize Credits'}
              </button>
            </div>
          )}
        </PaywallGate>

        {link ? (
          <div className="mt-5 rounded-[22px] border border-stroke-subtle bg-bg-elevated/85 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.14em] text-content-tertiary">Shareable link</p>
                <p className="mt-2 truncate text-sm text-content-primary">{publicLink || 'Preparing link...'}</p>
              </div>
              <span className="rounded-full border border-brand/20 bg-brand-muted px-3 py-1 text-xs text-content-primary">
                {link.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {showResponses ? (
        <div className="mt-6 overflow-hidden rounded-[28px] border border-stroke-default bg-bg-surface/95 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.35)]">
          {isLoading ? (
            <div className="px-5 py-6 text-sm text-content-secondary">Loading...</div>
          ) : submissions.length === 0 ? (
            <div className="px-5 py-6 text-sm text-content-secondary">
              No responses yet. Generate the link and share it.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-stroke-default text-sm">
                <thead className="bg-bg-elevated/80 text-left text-content-tertiary">
                  <tr>
                    <th className="px-4 py-3 font-medium">Contributor name</th>
                    <th className="px-4 py-3 font-medium">Credited name</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">PRO</th>
                    <th className="px-4 py-3 font-medium">IPI / CAE</th>
                    <th className="px-4 py-3 font-medium">Split %</th>
                    <th className="px-4 py-3 font-medium">Submission status</th>
                    <th className="px-4 py-3 font-medium">Submitted at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke-default bg-bg-surface/90">
                  {submissions.map((submission) => (
                    <tr
                      key={submission.id}
                      onClick={() => openSubmission(submission)}
                      className="cursor-pointer hover:bg-bg-hover/70"
                    >
                      <td className="px-4 py-3 text-content-primary">{submission.legalFullName || '—'}</td>
                      <td className="px-4 py-3 text-content-secondary">{submission.creditedName || '—'}</td>
                      <td className="px-4 py-3 text-content-secondary">{submission.roleType}</td>
                      <td className="px-4 py-3 text-content-secondary">{submission.email}</td>
                      <td className="px-4 py-3 text-content-secondary">{submission.proAffiliation || '—'}</td>
                      <td className="px-4 py-3 text-content-secondary">{submission.ipiCaeNumber || '—'}</td>
                      <td className="px-4 py-3 text-content-secondary">{submission.splitPercentage || '—'}</td>
                      <td className="px-4 py-3 text-content-secondary">{submission.submissionStatus}</td>
                      <td className="px-4 py-3 text-content-secondary">
                        {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {selectedSubmission ? (
        <div className="fixed inset-0 z-[150]">
          <button
            type="button"
            onClick={() => setSelectedSubmission(null)}
            className="absolute inset-0 z-0 bg-brand/25 backdrop-blur-[2px]"
          />
          <div className="relative z-10 ml-auto h-full w-full max-w-[680px] overflow-y-auto border-l border-stroke-default bg-bg-surface p-6 shadow-[0_24px_70px_rgba(0,0,0,0.3)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Submission detail</p>
                <h3 className="mt-2 text-2xl tracking-tight text-content-primary">
                  {selectedSubmission.creditedName || selectedSubmission.legalFullName || 'Contributor'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="rounded-full border border-stroke-default bg-bg-surface px-3 py-1 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['Legal full name', 'legalFullName'],
                  ['Credited name', 'creditedName'],
                  ['Email', 'email'],
                  ['Phone number', 'phoneNumber'],
                  ['Role type', 'roleType'],
                  ['PRO affiliation', 'proAffiliation'],
                  ['IPI / CAE number', 'ipiCaeNumber'],
                  ['Publisher name', 'publisherName'],
                  ['Split percentage', 'splitPercentage'],
                  ['Country', 'country'],
                  ['Social handle', 'socialHandle'],
                  ['Performing name if different', 'performingNameIfDifferent'],
                ] as Array<[string, keyof ContributorSubmissionInput]>
              ).map(([label, key]) => (
                <label key={key} className="block text-sm">
                  <span className="mb-1.5 block text-content-secondary">{label}</span>
                  {key === 'roleType' ? (
                    <select
                      value={editableSubmission[key]}
                      onChange={(event) =>
                        setEditableSubmission((current) => ({ ...current, [key]: event.target.value as ContributorSubmissionInput['roleType'] }))
                      }
                      className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
                    >
                      {['primary artist','featured artist','songwriter','composer','producer','mixing engineer','mastering engineer','instrumentalist','background vocalist','other'].map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={String(editableSubmission[key] || '')}
                      onChange={(event) => setEditableSubmission((current) => ({ ...current, [key]: event.target.value }))}
                      className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
                    />
                  )}
                </label>
              ))}
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1.5 block text-content-secondary">Contribution notes</span>
                <textarea
                  value={editableSubmission.contributionNotes}
                  onChange={(event) =>
                    setEditableSubmission((current) => ({ ...current, contributionNotes: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1.5 block text-content-secondary">Additional notes</span>
                <textarea
                  value={editableSubmission.additionalNotes}
                  onChange={(event) =>
                    setEditableSubmission((current) => ({ ...current, additionalNotes: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 text-sm text-content-primary sm:col-span-2">
                <input
                  type="checkbox"
                  checked={editableSubmission.isSplitConfirmed}
                  onChange={(event) =>
                    setEditableSubmission((current) => ({ ...current, isSplitConfirmed: event.target.checked }))
                  }
                />
                <span>Split confirmed</span>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void deleteSubmission()}
                disabled={isDeletingSubmission}
                className="rounded-full border border-status-error/25 bg-status-error/10 px-4 py-2 text-sm text-status-error hover:bg-status-error/15 disabled:opacity-60"
              >
                {isDeletingSubmission ? 'Deleting...' : 'Delete submission'}
              </button>
              <button
                type="button"
                onClick={() => void saveSubmission()}
                disabled={isSavingSubmission}
                className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
              >
                {isSavingSubmission ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

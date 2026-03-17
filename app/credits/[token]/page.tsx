'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import { CreditRequestHeader } from '@/components/credits/CreditRequestHeader';
import { ReleaseContextCard } from '@/components/credits/ReleaseContextCard';
import { PublicCreditForm } from '@/components/credits/PublicCreditForm';
import { SubmissionSuccessState } from '@/components/credits/SubmissionSuccessState';
import { ClaimProfilePrompt } from '@/components/credits/ClaimProfilePrompt';
import { InvalidTokenState } from '@/components/credits/InvalidTokenState';
import type { CreditSubmissionInput } from '@/lib/release-ops';

type CreditLookupPayload = {
  release?: {
    id: string;
    title: string;
    artistName: string;
    releaseDate: string | null;
  };
  collaboratorRequest?: {
    id: string;
    inviteName: string;
    requestedRole: string;
    status: string;
    submittedAt: string | null;
  };
  error?: string;
};

const emptyForm: CreditSubmissionInput = {
  legalName: '',
  stageName: '',
  role: '',
  email: '',
  phone: '',
  publishingInfo: '',
  splitPercentage: '',
  proAffiliation: '',
  ipiNumber: '',
  notes: '',
};

export default function PublicCreditSubmissionPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token || '';
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const [linkUnavailable, setLinkUnavailable] = useState(false);
  const [releaseTitle, setReleaseTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [requestedRole, setRequestedRole] = useState('');
  const [showClaimPrompt, setShowClaimPrompt] = useState(true);
  const [form, setForm] = useState<CreditSubmissionInput>(emptyForm);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setLookupError('');
      const response = await fetch(`/api/credits/${encodeURIComponent(token)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as CreditLookupPayload;
      if (cancelled) return;

      if (!response.ok || !payload.release || !payload.collaboratorRequest) {
        if (response.status === 404) {
          setLinkUnavailable(true);
          setLookupError(payload.error || 'This link is no longer valid');
        } else {
          setLinkUnavailable(false);
          setLookupError(payload.error || 'Something went wrong. Try again.');
        }
        setIsLoading(false);
        return;
      }

      setLinkUnavailable(false);
      setLookupError('');
      setReleaseTitle(payload.release.title);
      setArtistName(payload.release.artistName);
      setInviteName(payload.collaboratorRequest.inviteName);
      setRequestedRole(payload.collaboratorRequest.requestedRole);
      setForm((current) => ({ ...current, role: payload.collaboratorRequest?.requestedRole || current.role }));
      setIsLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const response = await fetch(`/api/credits/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (response.status === 404) {
        setLinkUnavailable(true);
        setSuccess(false);
        setSubmitError(payload.error || 'This link is no longer valid');
        return;
      }

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Something went wrong. Try again.');
      }

      setSuccess(true);
      setShowClaimPrompt(true);
    } catch (submitError: any) {
      setSubmitError(submitError?.message || 'Something went wrong. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto max-w-[720px] px-4 pb-8 pt-16 sm:px-6 sm:py-10">
          <div className="rounded-[30px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.35)]">
            <p className="text-sm text-content-secondary">Opening your credit form...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[720px] px-4 pb-10 pt-8 sm:px-6 sm:py-10">
        <div className="mb-5 flex justify-center sm:justify-start">
          <Logo size="lg" priority />
        </div>

        <div className="rounded-[34px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_22px_56px_-30px_rgba(0,0,0,0.42)] sm:p-8">
          {linkUnavailable ? (
            <InvalidTokenState
              title="This link is no longer valid"
              description="Something went wrong. Try again."
              hint="Ask the release team to send you a new link."
            />
          ) : lookupError ? (
            <InvalidTokenState
              title="Something went wrong. Try again."
              description={lookupError}
              hint="Please refresh this page and try again."
            />
          ) : success ? (
            <div className="space-y-4">
              <SubmissionSuccessState releaseTitle={releaseTitle} artistName={artistName} />
              {showClaimPrompt ? <ClaimProfilePrompt onSkip={() => setShowClaimPrompt(false)} /> : null}
            </div>
          ) : (
            <div className="space-y-5 sm:space-y-6">
              <CreditRequestHeader inviteName={inviteName} />
              <ReleaseContextCard
                releaseTitle={releaseTitle}
                artistName={artistName}
                requestedRole={requestedRole}
              />
              <PublicCreditForm
                form={form}
                error={submitError}
                isSubmitting={isSubmitting}
                onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
                onSubmit={handleSubmit}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

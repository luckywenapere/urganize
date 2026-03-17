'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import { CreditRequestHeader } from '@/components/credits/CreditRequestHeader';
import { PublicCreditForm } from '@/components/credits/PublicCreditForm';
import { SubmissionSuccessState } from '@/components/credits/SubmissionSuccessState';
import { ClaimProfilePrompt } from '@/components/credits/ClaimProfilePrompt';

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

type CreditFormState = {
  legalName: string;
  stageName: string;
  role: string;
  email: string;
  phone: string;
  publishingInfo: string;
  splitPercentage: string;
  proAffiliation: string;
  ipiNumber: string;
  notes: string;
};

const emptyForm: CreditFormState = {
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [releaseTitle, setReleaseTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [requestedRole, setRequestedRole] = useState('');
  const [form, setForm] = useState<CreditFormState>(emptyForm);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const response = await fetch(`/api/credits/${encodeURIComponent(token)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as CreditLookupPayload;
      if (cancelled) return;

      if (!response.ok || !payload.release || !payload.collaboratorRequest) {
        setError(payload.error || 'This submission link is unavailable.');
        setIsLoading(false);
        return;
      }

      setReleaseTitle(payload.release.title);
      setArtistName(payload.release.artistName);
      setRequestedRole(payload.collaboratorRequest.requestedRole);
      setForm((current) => ({ ...current, role: payload.collaboratorRequest?.requestedRole || current.role }));
      setIsLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

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

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'We could not save your credit details right now.');
      }

      setSuccess(true);
    } catch (submitError: any) {
      setError(submitError?.message || 'We could not save your credit details right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto max-w-3xl px-4 pb-8 pt-20 sm:px-6 sm:py-10">
          <p className="text-sm text-content-secondary">Loading credit submission form...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[760px] px-4 pb-10 pt-20 sm:px-6 sm:py-10">
        <div className="rounded-[32px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] sm:p-8">
          <Logo size="lg" priority />

          {success ? (
            <div className="mt-8 space-y-5">
              <SubmissionSuccessState releaseTitle={releaseTitle} />
              <ClaimProfilePrompt />
            </div>
          ) : (
            <div className="mt-8 space-y-6">
              <CreditRequestHeader
                releaseTitle={releaseTitle}
                artistName={artistName}
                requestedRole={requestedRole}
              />
              <PublicCreditForm
                form={form}
                error={error}
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import {
  CREDIT_ROLE_OPTIONS,
  emptyContributorSubmissionInput,
  normalizeSubmissionInput,
  roleEmphasis,
  roleNeedsPublishingDetails,
  type ContributorSubmission,
  type ContributorSubmissionInput,
} from '@/lib/credits';

type PublicCreditsPayload = {
  release?: {
    id: string;
    title: string;
    artistName: string;
    releaseDate: string | null;
  };
  link?: {
    id: string;
    isActive: boolean;
    expiresAt: string | null;
  };
  finalization?: {
    isFinalized: boolean;
    finalizedAt: string | null;
  };
  error?: string;
};

const stepTitles = ['Identity', 'Role', 'Credit details', 'Publishing / rights', 'Review and submit'] as const;

const getDraftKey = (token: string) => `urganize.creditCollectionDraft.${token}`;

export default function CreditCollectionPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token || '';

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [releaseTitle, setReleaseTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [releaseDate, setReleaseDate] = useState<string | null>(null);
  const [isFinalized, setIsFinalized] = useState(false);
  const [submissionId, setSubmissionId] = useState('');
  const [form, setForm] = useState<ContributorSubmissionInput>(emptyContributorSubmissionInput);

  const needsPublishing = roleNeedsPublishingDetails(form.roleType);
  const draftKey = useMemo(() => getDraftKey(token), [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const localDraft = window.localStorage.getItem(draftKey);
      if (localDraft) {
        try {
          const parsed = JSON.parse(localDraft) as {
            submission?: unknown;
            submissionId?: string;
            currentStep?: number;
          };
          if (!cancelled && parsed.submission) {
            setForm(normalizeSubmissionInput(parsed.submission));
            setSubmissionId(String(parsed.submissionId || ''));
            setCurrentStep(Math.max(0, Math.min(4, Number(parsed.currentStep || 0))));
          }
        } catch {}
      }

      const response = await fetch(`/api/credits/${encodeURIComponent(token)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as PublicCreditsPayload;
      if (cancelled) return;

      if (!response.ok) {
        setError(payload.error || 'This credit collection link is unavailable.');
        setIsLoading(false);
        return;
      }

      setReleaseTitle(payload.release?.title || 'Untitled release');
      setArtistName(payload.release?.artistName || 'Unknown artist');
      setReleaseDate(payload.release?.releaseDate || null);
      setIsFinalized(Boolean(payload.finalization?.isFinalized));
      setIsLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [draftKey, token]);

  useEffect(() => {
    if (!token || isLoading || success) return;
    window.localStorage.setItem(
      draftKey,
      JSON.stringify({
        submission: form,
        submissionId,
        currentStep,
      })
    );
  }, [currentStep, draftKey, form, isLoading, submissionId, success, token]);

  const validateCurrentStep = (): string => {
    if (currentStep === 0) {
      if (!form.legalFullName && !form.creditedName) {
        return 'Add your legal name or credited name to continue.';
      }
      if (!form.email) return 'Add your email address to continue.';
    }
    if (currentStep === 1 && !form.roleType) {
      return 'Choose the role that best matches your contribution.';
    }
    if (currentStep === 3 && needsPublishing && !form.splitPercentage) {
      return 'Split percentage is required for songwriter and composer roles.';
    }
    return '';
  };

  const moveStep = (direction: 1 | -1) => {
    const nextError = direction === 1 ? validateCurrentStep() : '';
    if (nextError) {
      setError(nextError);
      return;
    }
    setError('');
    setCurrentStep((current) => Math.max(0, Math.min(stepTitles.length - 1, current + direction)));
  };

  const handleSubmit = async () => {
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/credits/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          submissionId: submissionId || undefined,
          submission: form,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        submission?: ContributorSubmission;
        error?: string;
      };

      if (!response.ok || !payload.submission) {
        throw new Error(payload.error || 'We could not save your credit details right now.');
      }

      setSubmissionId(payload.submission.id);
      setSuccess('Thanks. Your credit details were submitted successfully.');
      window.localStorage.removeItem(draftKey);
    } catch (submitError: any) {
      setError(submitError?.message || 'We could not save your credit details right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <p className="text-sm text-content-secondary">Loading credits form...</p>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <div className="rounded-[32px] border border-stroke-default bg-bg-surface/95 p-8 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
            <Logo size="lg" priority />
            <p className="mt-6 text-xs uppercase tracking-[0.16em] text-content-tertiary">Credits submitted</p>
            <h1 className="mt-2 text-[clamp(2rem,4.5vw,3.2rem)] tracking-tight text-content-primary">Thank you for sending your details</h1>
            <p className="mt-4 text-sm text-content-secondary">
              The release team can now use your information to finalize the credits and metadata for <span className="font-medium text-content-primary">{releaseTitle}</span>.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="rounded-[32px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] sm:p-8">
          <Logo size="lg" priority />
          <div className="mt-8 grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="rounded-[28px] border border-stroke-subtle bg-bg-elevated/80 p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Credit Collection</p>
              <h1 className="mt-3 text-3xl tracking-tight text-content-primary">Help complete the credits for this song</h1>
              <p className="mt-4 text-sm text-content-secondary">
                Please fill in your details accurately so the release team can finalize metadata and credits. This should only take a few minutes.
              </p>
              <div className="mt-6 rounded-[22px] border border-stroke-subtle bg-bg-surface px-4 py-3">
                <p className="text-sm font-semibold text-content-primary">{releaseTitle}</p>
                <p className="mt-1 text-sm text-content-secondary">{artistName}</p>
                {releaseDate ? (
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-content-tertiary">
                    Release date {new Date(releaseDate).toLocaleDateString()}
                  </p>
                ) : null}
              </div>

              <div className="mt-6 space-y-2">
                {stepTitles.map((stepTitle, index) => {
                  const isActive = index === currentStep;
                  const isComplete = index < currentStep;
                  return (
                    <div
                      key={stepTitle}
                      className={`rounded-[18px] px-3 py-2 text-sm ${
                        isActive
                          ? 'bg-brand text-content-inverse'
                          : isComplete
                            ? 'bg-brand-muted text-content-primary'
                            : 'bg-transparent text-content-secondary'
                      }`}
                    >
                      <span className="font-medium">{index + 1}. {stepTitle}</span>
                    </div>
                  );
                })}
              </div>
            </aside>

            <section className="min-w-0">
              {isFinalized ? (
                <div className="rounded-[28px] border border-status-warning/30 bg-status-warning/10 p-6 text-sm text-content-secondary">
                  Credits have already been finalized for this release, so new submissions are closed.
                </div>
              ) : (
                <>
                  {error ? (
                    <p className="mb-5 rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
                      {error}
                    </p>
                  ) : null}

                  <div className="rounded-[28px] border border-stroke-subtle bg-bg-elevated/70 p-5 sm:p-6">
                    <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Step {currentStep + 1}</p>
                    <h2 className="mt-2 text-2xl tracking-tight text-content-primary">{stepTitles[currentStep]}</h2>
                    <p className="mt-2 text-sm text-content-secondary">{roleEmphasis(form.roleType)}</p>

                    {currentStep === 0 ? (
                      <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-content-secondary">Legal full name</span>
                          <input
                            value={form.legalFullName}
                            onChange={(event) => setForm((current) => ({ ...current, legalFullName: event.target.value }))}
                            className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-content-secondary">Credited name</span>
                          <input
                            value={form.creditedName}
                            onChange={(event) => setForm((current) => ({ ...current, creditedName: event.target.value }))}
                            className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-content-secondary">Email</span>
                          <input
                            type="email"
                            value={form.email}
                            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                            className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-content-secondary">Phone number (optional)</span>
                          <input
                            value={form.phoneNumber}
                            onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                            className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
                          />
                        </label>
                      </div>
                    ) : null}

                    {currentStep === 1 ? (
                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        {CREDIT_ROLE_OPTIONS.map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => setForm((current) => ({ ...current, roleType: role }))}
                            className={`rounded-[22px] border px-4 py-4 text-left text-sm transition ${
                              form.roleType === role
                                ? 'border-brand bg-brand text-content-inverse'
                                : 'border-stroke-subtle bg-bg-surface text-content-primary hover:bg-bg-hover'
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {currentStep === 2 ? (
                      <div className="mt-6 space-y-4">
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-content-secondary">Contribution notes</span>
                          <textarea
                            value={form.contributionNotes}
                            onChange={(event) => setForm((current) => ({ ...current, contributionNotes: event.target.value }))}
                            rows={4}
                            className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-content-secondary">Performing name if different</span>
                          <input
                            value={form.performingNameIfDifferent}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, performingNameIfDifferent: event.target.value }))
                            }
                            className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
                          />
                        </label>
                      </div>
                    ) : null}

                    {currentStep === 3 ? (
                      <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-content-secondary">PRO affiliation</span>
                          <input
                            value={form.proAffiliation}
                            onChange={(event) => setForm((current) => ({ ...current, proAffiliation: event.target.value }))}
                            className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-content-secondary">IPI / CAE number</span>
                          <input
                            value={form.ipiCaeNumber}
                            onChange={(event) => setForm((current) => ({ ...current, ipiCaeNumber: event.target.value }))}
                            className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-content-secondary">Publisher name</span>
                          <input
                            value={form.publisherName}
                            onChange={(event) => setForm((current) => ({ ...current, publisherName: event.target.value }))}
                            className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-content-secondary">
                            Split percentage{needsPublishing ? ' *' : ''}
                          </span>
                          <input
                            value={form.splitPercentage}
                            onChange={(event) => setForm((current) => ({ ...current, splitPercentage: event.target.value }))}
                            className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
                          />
                        </label>
                        <label className="flex items-center gap-3 rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 text-sm text-content-primary sm:col-span-2">
                          <input
                            type="checkbox"
                            checked={form.isSplitConfirmed}
                            onChange={(event) => setForm((current) => ({ ...current, isSplitConfirmed: event.target.checked }))}
                          />
                          <span>I confirm the split information shared here is accurate.</span>
                        </label>
                      </div>
                    ) : null}

                    {currentStep === 4 ? (
                      <div className="mt-6 space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block text-sm">
                            <span className="mb-1.5 block text-content-secondary">Country</span>
                            <input
                              value={form.country}
                              onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
                              className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1.5 block text-content-secondary">Social handle</span>
                            <input
                              value={form.socialHandle}
                              onChange={(event) => setForm((current) => ({ ...current, socialHandle: event.target.value }))}
                              className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
                            />
                          </label>
                        </div>
                        <label className="block text-sm">
                          <span className="mb-1.5 block text-content-secondary">Additional notes</span>
                          <textarea
                            value={form.additionalNotes}
                            onChange={(event) => setForm((current) => ({ ...current, additionalNotes: event.target.value }))}
                            rows={4}
                            className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
                          />
                        </label>

                        <div className="rounded-[24px] border border-stroke-subtle bg-bg-surface p-5">
                          <p className="text-sm font-semibold text-content-primary">Review</p>
                          <div className="mt-4 grid gap-3 text-sm text-content-secondary sm:grid-cols-2">
                            <p><span className="font-medium text-content-primary">Legal name:</span> {form.legalFullName || '—'}</p>
                            <p><span className="font-medium text-content-primary">Credited name:</span> {form.creditedName || '—'}</p>
                            <p><span className="font-medium text-content-primary">Email:</span> {form.email || '—'}</p>
                            <p><span className="font-medium text-content-primary">Role:</span> {form.roleType}</p>
                            <p><span className="font-medium text-content-primary">PRO:</span> {form.proAffiliation || '—'}</p>
                            <p><span className="font-medium text-content-primary">Split:</span> {form.splitPercentage || '—'}</p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => moveStep(-1)}
                      disabled={currentStep === 0 || isSubmitting}
                      className="rounded-full border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover disabled:opacity-60"
                    >
                      Back
                    </button>
                    <div className="flex items-center gap-3">
                      {currentStep < stepTitles.length - 1 ? (
                        <button
                          type="button"
                          onClick={() => moveStep(1)}
                          className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                        >
                          Continue
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleSubmit()}
                          disabled={isSubmitting}
                          className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
                        >
                          {isSubmitting ? 'Submitting...' : 'Submit credit details'}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

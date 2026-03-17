'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { CreditSubmissionInput } from '@/lib/release-ops';
import { validateCreditSubmissionFields } from '@/lib/release-ops';
import { OptionalDetailsSection } from './OptionalDetailsSection';

type PublicCreditFormProps = {
  form: CreditSubmissionInput;
  error: string;
  isSubmitting: boolean;
  onChange: (patch: Partial<CreditSubmissionInput>) => void;
  onSubmit: () => void;
};

export function PublicCreditForm({ form, error, isSubmitting, onChange, onSubmit }: PublicCreditFormProps) {
  const [showOptional, setShowOptional] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof CreditSubmissionInput, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const fieldErrors = useMemo(() => validateCreditSubmissionFields(form), [form]);
  const hasOptionalValues = Boolean(
    form.email ||
      form.phone ||
      form.publishingInfo ||
      form.splitPercentage ||
      form.proAffiliation ||
      form.ipiNumber ||
      form.notes
  );
  const hasOptionalErrors = Boolean(fieldErrors.email || fieldErrors.splitPercentage);
  const optionalVisible = showOptional || hasOptionalValues || hasOptionalErrors;

  const showErrorFor = (field: keyof CreditSubmissionInput) => Boolean((submitAttempted || touched[field]) && fieldErrors[field]);

  const handleBlur = (field: keyof CreditSubmissionInput) => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  const inputClassName = (field: keyof CreditSubmissionInput) =>
    `min-h-12 w-full rounded-[20px] border bg-bg-surface px-4 py-3 text-base text-content-primary outline-none transition placeholder:text-content-tertiary focus:border-brand ${
      showErrorFor(field)
        ? 'border-status-error/40 bg-status-error/5'
        : 'border-stroke-subtle'
    }`;

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setTouched({
      legalName: true,
      stageName: true,
      role: true,
      email: true,
      splitPercentage: true,
    });

    if (Object.keys(fieldErrors).length > 0) {
      return;
    }

    onSubmit();
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6">
      {error ? (
        <p className="rounded-[22px] border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm leading-6 text-status-error">
          {error}
        </p>
      ) : null}

      <div className="rounded-[28px] border border-stroke-subtle bg-bg-elevated/70 p-4 sm:p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-content-primary">Your credits</p>
            <p className="mt-2 text-sm text-content-secondary">Legal name and role are required.</p>
          </div>
          <span className="rounded-full border border-stroke-default bg-bg-surface px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-content-tertiary">
            3 quick fields
          </span>
        </div>

        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-2 block font-medium text-content-primary">Legal name</span>
            <input
              value={form.legalName}
              onChange={(event) => onChange({ legalName: event.target.value })}
              onBlur={() => handleBlur('legalName')}
              autoFocus
              autoComplete="name"
              required
              aria-invalid={showErrorFor('legalName')}
              placeholder="Your full legal name"
              className={inputClassName('legalName')}
            />
            {showErrorFor('legalName') ? (
              <span className="mt-2 block text-sm text-status-error">{fieldErrors.legalName}</span>
            ) : null}
          </label>

          <label className="block text-sm">
            <span className="mb-2 flex items-center justify-between gap-3">
              <span className="font-medium text-content-primary">Artist / stage name</span>
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-content-tertiary">Optional</span>
            </span>
            <input
              value={form.stageName}
              onChange={(event) => onChange({ stageName: event.target.value })}
              onBlur={() => handleBlur('stageName')}
              autoComplete="nickname"
              placeholder="If different from your legal name"
              className={inputClassName('stageName')}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-2 block font-medium text-content-primary">Role</span>
            <input
              value={form.role}
              onChange={(event) => onChange({ role: event.target.value })}
              onBlur={() => handleBlur('role')}
              autoComplete="organization-title"
              required
              aria-invalid={showErrorFor('role')}
              className={inputClassName('role')}
            />
            {showErrorFor('role') ? (
              <span className="mt-2 block text-sm text-status-error">{fieldErrors.role}</span>
            ) : null}
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="min-h-12 w-full rounded-[22px] bg-brand px-4 py-3 text-base font-semibold text-content-inverse shadow-[0_18px_36px_-24px_rgba(0,0,0,0.35)] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Submitting...' : 'Submit Credits'}
      </button>

      <OptionalDetailsSection
        open={optionalVisible}
        hasValues={hasOptionalValues}
        onToggle={() => setShowOptional((current) => !current)}
      >
        <label className="block text-sm">
          <span className="mb-2 block font-medium text-content-primary">Email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => onChange({ email: event.target.value })}
            onBlur={() => handleBlur('email')}
            className={inputClassName('email')}
          />
          {showErrorFor('email') ? (
            <span className="mt-2 block text-sm text-status-error">{fieldErrors.email}</span>
          ) : null}
        </label>

        <label className="block text-sm">
          <span className="mb-2 block font-medium text-content-primary">Phone</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(event) => onChange({ phone: event.target.value })}
            onBlur={() => handleBlur('phone')}
            className={inputClassName('phone')}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-2 block font-medium text-content-primary">Publishing info</span>
          <input
            value={form.publishingInfo}
            onChange={(event) => onChange({ publishingInfo: event.target.value })}
            onBlur={() => handleBlur('publishingInfo')}
            className={inputClassName('publishingInfo')}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-2 block font-medium text-content-primary">Split percentage</span>
          <input
            inputMode="decimal"
            value={form.splitPercentage}
            onChange={(event) => onChange({ splitPercentage: event.target.value })}
            onBlur={() => handleBlur('splitPercentage')}
            className={inputClassName('splitPercentage')}
          />
          {showErrorFor('splitPercentage') ? (
            <span className="mt-2 block text-sm text-status-error">{fieldErrors.splitPercentage}</span>
          ) : null}
        </label>

        <label className="block text-sm">
          <span className="mb-2 block font-medium text-content-primary">PRO affiliation</span>
          <input
            value={form.proAffiliation}
            onChange={(event) => onChange({ proAffiliation: event.target.value })}
            onBlur={() => handleBlur('proAffiliation')}
            className={inputClassName('proAffiliation')}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-2 block font-medium text-content-primary">IPI number</span>
          <input
            value={form.ipiNumber}
            onChange={(event) => onChange({ ipiNumber: event.target.value })}
            onBlur={() => handleBlur('ipiNumber')}
            className={inputClassName('ipiNumber')}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-2 block font-medium text-content-primary">Notes</span>
          <textarea
            value={form.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            onBlur={() => handleBlur('notes')}
            rows={4}
            className={`${inputClassName('notes')} resize-y`}
          />
        </label>
      </OptionalDetailsSection>
    </form>
  );
}

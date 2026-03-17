'use client';

import { FormEvent, useState } from 'react';

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

type PublicCreditFormProps = {
  form: CreditFormState;
  error: string;
  isSubmitting: boolean;
  onChange: (patch: Partial<CreditFormState>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function PublicCreditForm({ form, error, isSubmitting, onChange, onSubmit }: PublicCreditFormProps) {
  const [showOptional, setShowOptional] = useState(false);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <p className="rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1.5 block text-content-secondary">Legal name</span>
        <input
          value={form.legalName}
          onChange={(event) => onChange({ legalName: event.target.value })}
          className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-content-secondary">Stage name</span>
        <input
          value={form.stageName}
          onChange={(event) => onChange({ stageName: event.target.value })}
          className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-content-secondary">Role</span>
        <input
          value={form.role}
          onChange={(event) => onChange({ role: event.target.value })}
          className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
        />
      </label>

      <button
        type="button"
        onClick={() => setShowOptional((current) => !current)}
        className="rounded-full border border-stroke-default bg-bg-surface px-4 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
      >
        {showOptional ? 'Hide optional fields' : 'Add optional details'}
      </button>

      {showOptional ? (
        <div className="space-y-4 rounded-[24px] border border-stroke-subtle bg-bg-elevated/70 p-4">
          <label className="block text-sm">
            <span className="mb-1.5 block text-content-secondary">Email</span>
            <input
              value={form.email}
              onChange={(event) => onChange({ email: event.target.value })}
              className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-content-secondary">Phone</span>
            <input
              value={form.phone}
              onChange={(event) => onChange({ phone: event.target.value })}
              className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-content-secondary">Publishing info</span>
            <input
              value={form.publishingInfo}
              onChange={(event) => onChange({ publishingInfo: event.target.value })}
              className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-content-secondary">Split percentage</span>
            <input
              value={form.splitPercentage}
              onChange={(event) => onChange({ splitPercentage: event.target.value })}
              className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-content-secondary">PRO affiliation</span>
            <input
              value={form.proAffiliation}
              onChange={(event) => onChange({ proAffiliation: event.target.value })}
              className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-content-secondary">IPI number</span>
            <input
              value={form.ipiNumber}
              onChange={(event) => onChange({ ipiNumber: event.target.value })}
              className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-content-secondary">Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
              rows={4}
              className="w-full rounded-2xl border border-stroke-subtle bg-bg-surface px-4 py-3 outline-none focus:border-brand"
            />
          </label>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
      >
        {isSubmitting ? 'Submitting...' : 'Submit credits'}
      </button>
    </form>
  );
}

'use client';

import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import {
  RELEASE_CREDIT_ROLE_LABELS,
  RELEASE_CREDIT_ROLE_OPTIONS,
  type CreditSubmissionInput,
  type ReleaseCreditRole,
} from '@/types/credits';

// The public credit-submission form (URG-108). Client component rendered by
// the server page at app/credits/[token]/page.tsx, inside the same
// dark-locked .credits-island treatment the public EPK page uses. No auth —
// the unguessable token in the URL is the only access control, resolved
// server-side before this ever renders. Every field is re-validated by
// app/api/credits/[token]/route.ts; nothing here is a trust boundary.

const SURFACE = 'var(--credits-surface)';
const STROKE = 'var(--credits-border)';
const CREAM = 'var(--credits-text)';
const MUTED = 'var(--credits-text-muted)';
const FAINT = 'var(--credits-text-faint)';
const BRAND = 'var(--credits-accent)';

const EMPTY_INPUT: CreditSubmissionInput = {
  legalName: '',
  stageName: '',
  roles: [],
  contribution: '',
  email: '',
  phone: '',
  country: '',
  songwriterSplit: null,
  proAffiliation: '',
  ipiNumber: '',
  publisherName: '',
  publisherIpi: '',
  masterSplit: null,
  instagramHandle: '',
  xHandle: '',
  bio: '',
  confirmedAccurate: false,
};

function labelStyle(): CSSProperties {
  return { color: FAINT };
}

function inputStyle(): CSSProperties {
  return { backgroundColor: SURFACE, borderColor: STROKE, color: CREAM };
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: FAINT }}>
      {children}
    </h2>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="font-mono text-[11px] uppercase tracking-[0.1em]" style={labelStyle()}>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-1.5 w-full border px-3 py-2 text-sm outline-none"
        style={inputStyle()}
      />
    </label>
  );
}

function SplitField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="font-mono text-[11px] uppercase tracking-[0.1em]" style={labelStyle()}>
        {label}
      </span>
      <input
        type="number"
        min={0}
        max={100}
        step="0.01"
        value={value === null ? '' : value}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === '' ? null : Number(raw));
        }}
        placeholder="0–100"
        className="mt-1.5 w-full border px-3 py-2 text-sm outline-none"
        style={inputStyle()}
      />
    </label>
  );
}

function TextAreaField({
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
      <span className="font-mono text-[11px] uppercase tracking-[0.1em]" style={labelStyle()}>
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="mt-1.5 w-full resize-none border px-3 py-2 text-sm outline-none"
        style={inputStyle()}
      />
    </label>
  );
}

type CreditSubmissionFormProps = {
  token: string;
  releaseTitle: string;
};

export function CreditSubmissionForm({ token, releaseTitle }: CreditSubmissionFormProps) {
  const [input, setInput] = useState<CreditSubmissionInput>(EMPTY_INPUT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const toggleRole = (role: ReleaseCreditRole) => {
    setInput((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((item) => item !== role)
        : [...current.roles, role],
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (!input.legalName.trim()) return setError('Legal name is required.');
    if (input.roles.length === 0) return setError('Select at least one role.');
    if (!input.email.trim()) return setError('Email is required.');
    if (!input.confirmedAccurate) return setError('Please confirm this information is accurate.');

    setError('');
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/credits/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Could not submit. Please try again.');
        return;
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mt-10 border py-10 text-center" style={{ borderColor: STROKE }}>
        <p className="text-lg" style={{ color: CREAM }}>
          Sent to the team behind <span style={{ color: BRAND }}>{releaseTitle || 'this release'}</span>.
        </p>
        <p className="mt-2 text-sm" style={{ color: MUTED }}>
          Your credits have been recorded. You&rsquo;re done here.
        </p>
        <button
          type="button"
          onClick={() => {
            setInput(EMPTY_INPUT);
            setSubmitted(false);
          }}
          className="mt-6 border px-4 py-2 text-sm"
          style={{ borderColor: STROKE, color: CREAM }}
        >
          Submit another response
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-10">
      <section className="space-y-4">
        <SectionHeading>Who are you</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Legal name"
            required
            value={input.legalName}
            onChange={(v) => setInput((c) => ({ ...c, legalName: v }))}
          />
          <TextField
            label="Stage / professional name"
            value={input.stageName || ''}
            onChange={(v) => setInput((c) => ({ ...c, stageName: v }))}
          />
        </div>

        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.1em]" style={labelStyle()}>
            Role(s) on this release *
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {RELEASE_CREDIT_ROLE_OPTIONS.map((role) => (
              <label key={role} className="flex items-center gap-2 text-sm" style={{ color: CREAM }}>
                <input
                  type="checkbox"
                  checked={input.roles.includes(role)}
                  onChange={() => toggleRole(role)}
                  className="h-4 w-4"
                />
                {RELEASE_CREDIT_ROLE_LABELS[role]}
              </label>
            ))}
          </div>
        </div>

        <TextAreaField
          label="What did you contribute?"
          placeholder="e.g. Wrote the hook and second verse, produced the beat…"
          value={input.contribution || ''}
          onChange={(v) => setInput((c) => ({ ...c, contribution: v }))}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField
            label="Email"
            type="email"
            required
            value={input.email}
            onChange={(v) => setInput((c) => ({ ...c, email: v }))}
          />
          <TextField
            label="Phone"
            type="tel"
            value={input.phone || ''}
            onChange={(v) => setInput((c) => ({ ...c, phone: v }))}
          />
          <TextField
            label="Country"
            value={input.country || ''}
            onChange={(v) => setInput((c) => ({ ...c, country: v }))}
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>Publishing</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SplitField
            label="Songwriter split %"
            value={input.songwriterSplit ?? null}
            onChange={(v) => setInput((c) => ({ ...c, songwriterSplit: v }))}
          />
          <TextField
            label="PRO affiliation"
            placeholder="ASCAP, BMI, PRS, MCSN…"
            value={input.proAffiliation || ''}
            onChange={(v) => setInput((c) => ({ ...c, proAffiliation: v }))}
          />
          <TextField
            label="IPI / CAE number"
            value={input.ipiNumber || ''}
            onChange={(v) => setInput((c) => ({ ...c, ipiNumber: v }))}
          />
          <TextField
            label="Publisher name"
            placeholder="Or write SELF if self-published"
            value={input.publisherName || ''}
            onChange={(v) => setInput((c) => ({ ...c, publisherName: v }))}
          />
          <TextField
            label="Publisher IPI"
            value={input.publisherIpi || ''}
            onChange={(v) => setInput((c) => ({ ...c, publisherIpi: v }))}
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>Master</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SplitField
            label="Master / producer split %"
            value={input.masterSplit ?? null}
            onChange={(v) => setInput((c) => ({ ...c, masterSplit: v }))}
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>Socials &amp; bio</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Instagram handle"
            value={input.instagramHandle || ''}
            onChange={(v) => setInput((c) => ({ ...c, instagramHandle: v }))}
          />
          <TextField
            label="X handle"
            value={input.xHandle || ''}
            onChange={(v) => setInput((c) => ({ ...c, xHandle: v }))}
          />
        </div>
        <TextAreaField
          label="Short bio"
          value={input.bio || ''}
          onChange={(v) => setInput((c) => ({ ...c, bio: v }))}
        />
      </section>

      <section className="space-y-4 border-t pt-6" style={{ borderColor: STROKE }}>
        <label className="flex items-start gap-2 text-sm" style={{ color: CREAM }}>
          <input
            type="checkbox"
            checked={input.confirmedAccurate}
            onChange={(event) => setInput((c) => ({ ...c, confirmedAccurate: event.target.checked }))}
            className="mt-0.5 h-4 w-4"
          />
          I confirm this information is accurate.
        </label>

        {error ? (
          <p className="text-sm" style={{ color: '#f0847a' }}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: BRAND, color: '#06321f' }}
        >
          {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {isSubmitting ? 'Submitting…' : 'Submit credits'}
        </button>
      </section>
    </form>
  );
}

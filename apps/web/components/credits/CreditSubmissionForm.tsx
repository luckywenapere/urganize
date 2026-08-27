'use client';

import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { validateSubmissionSplits } from '@/lib/credit-submissions';
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
//
// Copy rewritten 2026-08-13 (founder feedback on the metadata surfaces: too
// much cognitive load, not clear enough "for a 5th grader"). The rule for
// anyone editing strings here: this form is filled in by producers, writers and
// engineers, NOT by distribution admins — so every industry term (PRO, IPI,
// split, master) is restated in ordinary words in a hint under its field, and
// each section says out loud when it can be skipped entirely. The field set,
// validation and submit flow are unchanged; only the words and the numbered
// section headings are.
//
// 2026-08-27 (founder spec, "Metadata Collection Link"): three changes worth
// knowing before editing this file.
//   - EVERY input is `text-lg`, which is 16px in THIS repo's Tailwind preset
//     (`packages/config/tailwind/preset.js` shifts the whole scale down, so
//     `text-base` is 14px and `text-sm` is 13px). Anything under 16px makes iOS
//     Safari zoom the page the instant a field is focused, and this form is
//     mostly opened from a WhatsApp link on a phone. Do not "tidy" these back
//     to text-sm.
//   - The split rules (required for writers and producers, one decimal place)
//     live in lib/credit-submissions.ts and are run by BOTH this form and the
//     submit route, so the two can never disagree about them.
//   - Submitting again with the same email UPDATES the earlier answer rather
//     than adding a second one, and the success panel says so.

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

/** One-line explanation under a field. The people filling this form in are
 * producers and writers, not distribution admins, so every industry term
 * (PRO, IPI, split) gets said again in ordinary words. */
function Hint({ children }: { children: ReactNode }) {
  return (
    <span className="mt-1.5 block text-xs leading-snug" style={{ color: MUTED }}>
      {children}
    </span>
  );
}

/** "Optional" said out loud, so silence never reads as "required". */
function SectionNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
      {children}
    </p>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  hint?: string;
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
        className="mt-1.5 w-full border px-3 py-2 text-lg outline-none"
        style={inputStyle()}
      />
      {hint ? <Hint>{hint}</Hint> : null}
    </label>
  );
}

function SplitField({
  label,
  value,
  onChange,
  required,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-mono text-[11px] uppercase tracking-[0.1em]" style={labelStyle()}>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type="number"
        min={0}
        max={100}
        // One decimal place, matching what the route accepts and what the
        // owner's totals display. The browser's own message names the two
        // nearest valid values, which is a clearer nudge than our own copy.
        step="0.1"
        value={value === null ? '' : value}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === '' ? null : Number(raw));
        }}
        placeholder="0 to 100"
        className="mt-1.5 w-full border px-3 py-2 text-lg outline-none"
        style={inputStyle()}
      />
      {hint ? <Hint>{hint}</Hint> : null}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
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
        className="mt-1.5 w-full resize-none border px-3 py-2 text-lg outline-none"
        style={inputStyle()}
      />
      {hint ? <Hint>{hint}</Hint> : null}
    </label>
  );
}

type CreditSubmissionFormProps = {
  token: string;
  releaseTitle: string;
  artistName?: string;
};

export function CreditSubmissionForm({
  token,
  releaseTitle,
  artistName,
}: CreditSubmissionFormProps) {
  const [input, setInput] = useState<CreditSubmissionInput>(EMPTY_INPUT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  /** True when the server replaced an earlier answer from the same email. */
  const [replacedEarlier, setReplacedEarlier] = useState(false);

  const toggleRole = (role: ReleaseCreditRole) => {
    setInput((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((item) => item !== role)
        : [...current.roles, role],
    }));
  };

  const splitRules = validateSubmissionSplits({
    roles: input.roles,
    songwriterSplit: input.songwriterSplit,
    masterSplit: input.masterSplit,
  });
  // Marks the section labels while they are typing; the blocking check happens
  // on submit so a half-filled form is never scolded mid-thought.
  const splitsRequired = {
    songwriter: input.roles.some((role) =>
      role === 'songwriter' || role === 'composer' || role === 'lyricist'
    ),
    master: input.roles.includes('producer'),
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    // Plain instructions, not field-name diagnostics: each one says what to do.
    if (!input.legalName.trim()) return setError('Add your legal name at the top.');
    if (input.roles.length === 0) return setError('Tick at least one thing you did on this song.');
    if (!input.email.trim()) return setError('Add your email so the team can reach you.');
    // Same rule the route enforces, same words — see lib/credit-submissions.ts.
    if (!splitRules.ok) return setError(splitRules.error);
    if (!input.confirmedAccurate) {
      return setError('Tick the box at the bottom to confirm your details are correct.');
    }

    setError('');
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/credits/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; updated?: boolean };
      if (!res.ok) {
        setError(data.error || 'Could not submit. Please try again.');
        return;
      }
      setReplacedEarlier(data.updated === true);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    const recipient = artistName?.trim() || releaseTitle?.trim() || 'the team';
    return (
      <div className="mt-10 border py-10 text-center" style={{ borderColor: STROKE }}>
        <p className="text-lg" style={{ color: CREAM }}>
          Done. Your details have been sent to <span style={{ color: BRAND }}>{recipient}</span>.
        </p>
        <p className="mt-2 text-sm" style={{ color: MUTED }}>
          {replacedEarlier
            ? 'You had sent your details before, so we replaced your earlier answer with this one.'
            : 'Nothing else to do. They will get in touch if anything is missing.'}
        </p>
        <button
          type="button"
          onClick={() => {
            setInput(EMPTY_INPUT);
            setSubmitted(false);
            setReplacedEarlier(false);
          }}
          className="mt-6 border px-4 py-2 text-sm"
          style={{ borderColor: STROKE, color: CREAM }}
        >
          Fill it in for someone else
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-10">
      <section className="space-y-4">
        <SectionHeading>1 · About you</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Legal name"
            required
            hint="Your real name, the way it appears on your ID. This is what goes on the paperwork."
            value={input.legalName}
            onChange={(v) => setInput((c) => ({ ...c, legalName: v }))}
          />
          <TextField
            label="Stage / professional name"
            hint="The name you are known by, if you have one."
            value={input.stageName || ''}
            onChange={(v) => setInput((c) => ({ ...c, stageName: v }))}
          />
        </div>

        <div>
          <span className="font-mono text-[11px] uppercase tracking-[0.1em]" style={labelStyle()}>
            What did you do on this song? *
          </span>
          <Hint>Tick everything that applies.</Hint>
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
          label="Tell them what you did"
          hint="A sentence is plenty."
          placeholder="e.g. Wrote the hook and second verse, produced the beat…"
          value={input.contribution || ''}
          onChange={(v) => setInput((c) => ({ ...c, contribution: v }))}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField
            label="Email"
            type="email"
            required
            // Says the resubmission rule out loud, which also guards the
            // footgun in "Fill it in for someone else": reusing your own email
            // there replaces your first answer instead of adding a second one.
            hint="So the team can reach you. Sending this form again with the same email replaces your earlier answer."
            value={input.email}
            onChange={(v) => setInput((c) => ({ ...c, email: v }))}
          />
          <TextField
            label="Phone"
            type="tel"
            hint="Optional."
            value={input.phone || ''}
            onChange={(v) => setInput((c) => ({ ...c, phone: v }))}
          />
          <TextField
            label="Country"
            hint="Where you live."
            value={input.country || ''}
            onChange={(v) => setInput((c) => ({ ...c, country: v }))}
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>2 · Your share of the writing</SectionHeading>
        <SectionNote>
          {splitsRequired.songwriter
            ? 'You picked a writing role, so the team needs your share. Give your best number. They can sort out the exact split with you later.'
            : 'Skip this whole part if you did not help write the song.'}
        </SectionNote>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SplitField
            label="Your writing share (%)"
            required={splitsRequired.songwriter}
            hint="How much of the writing is yours. Everyone's shares should add up to 100."
            value={input.songwriterSplit ?? null}
            onChange={(v) => setInput((c) => ({ ...c, songwriterSplit: v }))}
          />
          <TextField
            label="Royalty society (PRO)"
            hint="Who collects your songwriting royalties. Leave blank if you have not signed up with one."
            placeholder="ASCAP, BMI, PRS, MCSN…"
            value={input.proAffiliation || ''}
            onChange={(v) => setInput((c) => ({ ...c, proAffiliation: v }))}
          />
          <TextField
            label="Your society ID (IPI / CAE)"
            hint="The number that society gave you. It is on your account page there."
            value={input.ipiNumber || ''}
            onChange={(v) => setInput((c) => ({ ...c, ipiNumber: v }))}
          />
          <TextField
            label="Publisher name"
            hint="The company that looks after your songwriting. Write SELF if that is you."
            placeholder="Or write SELF if self-published"
            value={input.publisherName || ''}
            onChange={(v) => setInput((c) => ({ ...c, publisherName: v }))}
          />
          <TextField
            label="Publisher ID (IPI)"
            hint="Your publisher's number, if you know it."
            value={input.publisherIpi || ''}
            onChange={(v) => setInput((c) => ({ ...c, publisherIpi: v }))}
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>3 · Your share of the recording</SectionHeading>
        <SectionNote>
          {splitsRequired.master
            ? 'You picked producer, so the team needs your share of the recording.'
            : 'This is usually for producers. Skip it if it does not apply to you.'}
        </SectionNote>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SplitField
            label="Your recording share (%)"
            required={splitsRequired.master}
            hint="How much of the finished recording is yours. Also called the master share."
            value={input.masterSplit ?? null}
            onChange={(v) => setInput((c) => ({ ...c, masterSplit: v }))}
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>4 · Extras, all optional</SectionHeading>
        <SectionNote>
          Handy if the team writes a press kit or tags you in a post. Skip the whole thing if you
          would rather.
        </SectionNote>
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
          hint="A line or two about you, written the way you want to be introduced."
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
          Everything I entered above is true and correct.
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
          {isSubmitting ? 'Sending…' : 'Send my credits'}
        </button>
      </section>
    </form>
  );
}

'use client';

import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';
import { Loader2 } from '@/components/icons';
import {
  applyCreditPrefill,
  describeCreditPrefill,
  forgetCreditPrefill,
  hasCreditPrefill,
  loadCreditPrefill,
  saveCreditPrefill,
} from '@/lib/credit-prefill';
import {
  RELEASE_CREDIT_ROLE_LABELS,
  RELEASE_CREDIT_ROLE_OPTIONS,
  type CreditSubmissionInput,
  type ReleaseCreditRole,
} from '@/types/credits';
import { creditRoleChipShows } from '@/lib/public-pages-desktop';

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
//
// 2026-08-27, prefill: the form remembers a contributor's own details ON THEIR
// OWN DEVICE and fills them in next time. Never a server lookup — see the
// header of lib/credit-prefill.ts for why that would leak a co-writer's IPI to
// anyone holding the share link. Roles, both splits, "what you did" and the
// accuracy tick are deliberately never remembered; that list is the important
// part of the feature.
//
// 2026-10-27 (founder call): cut to what distribution and publishing need.
// Name, stage name, roles and email for everyone; PRO, IPI and publisher only
// for writers. Splits, phone, country, "what you did", socials and bio are off
// the form and are not sent, so the route leaves any earlier answers to them
// alone on a resubmit. The columns and the owner's views are unchanged.
//
// Same day, restyled to the founder's "sleek" mock: the field name lives in
// the placeholder (and in aria-label, since a placeholder is not a label),
// roles are chips, and the send button is full width. Fields keep a 3:1
// border (lib/field-border-guard.test.ts), so they can still be found.

const SURFACE = 'var(--credits-surface)';
const STROKE = 'var(--credits-border)';
const FIELD_STROKE = 'var(--credits-field-border)';
const CREAM = 'var(--credits-text)';
const MUTED = 'var(--credits-text-muted)';
const FAINT = 'var(--credits-text-faint)';
const BRAND = 'var(--credits-accent)';
/** Text on the green fill. */
const INK_TEXT = 'var(--credits-ground)';

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

function inputStyle(): CSSProperties {
  return { backgroundColor: SURFACE, borderColor: FIELD_STROKE, color: CREAM };
}

/** Quiet grey line above a group of fields; a plain label on a computer. */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-[color:var(--credits-text-faint)] lg:text-[13px] lg:font-semibold lg:text-[color:var(--credits-text)]">
      {children}
    </p>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required,
  autoComplete,
  desktopLabel,
  className = '',
}: {
  /** Shown as the placeholder and read out as the field's name. */
  label: string;
  /** The visible label above the field on a computer (#1232), when it differs. */
  desktopLabel?: ReactNode;
  className?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  /** What the browser may fill in. Left off for fields it has no name for. */
  autoComplete?: string;
}) {
  // A phone names the field in its placeholder; a computer puts the name
  // above the field, where it stays while you type (#1232).
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 hidden text-[13px] font-semibold lg:block" style={{ color: CREAM }}>
        {desktopLabel ?? label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        aria-label={label}
        required={required}
        autoComplete={autoComplete}
        className="h-12 w-full min-w-0 rounded-xl border px-3.5 text-lg outline-none lg:placeholder:text-transparent"
        style={inputStyle()}
      />
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
  /** Whose details this browser remembered, or '' when nothing was filled in.
   * Shown out loud: arriving at a public form that already knows your legal
   * name is unsettling if nothing says why, and on a shared studio machine the
   * person reading it may not be the person it remembers. */
  const [prefilledFor, setPrefilledFor] = useState('');
  const [showAllRoles, setShowAllRoles] = useState(false);

  // Pre-paint, once. This page is SERVER-RENDERED, so the empty form is on
  // screen the moment the HTML lands, and the server cannot know what is in the
  // visitor's browser storage — reading it in a plain useEffect would show the
  // blank fields for a frame and then fill them in. A layout effect commits
  // before the browser paints, which is the same window /onboarding uses to
  // restore a saved draft without flashing step 1. Reading during render
  // instead would be a hydration mismatch, so the setState here is unavoidable
  // and carries the documented react-hooks/set-state-in-effect warning.
  useIsomorphicLayoutEffect(() => {
    const stored = loadCreditPrefill();
    if (!hasCreditPrefill(stored) || !stored) return;
    setInput((current) => applyCreditPrefill(current, stored));
    setPrefilledFor(describeCreditPrefill(stored));
  }, []);

  const handleForgetPrefill = () => {
    forgetCreditPrefill();
    setInput(EMPTY_INPUT);
    setPrefilledFor('');
    setError('');
  };

  const toggleRole = (role: ReleaseCreditRole) => {
    setInput((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((item) => item !== role)
        : [...current.roles, role],
    }));
  };

  // The publishing questions only make sense for a writing credit.
  const isWriter = input.roles.some(
    (role) => role === 'songwriter' || role === 'composer' || role === 'lyricist'
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    // Plain instructions, not field-name diagnostics: each one says what to do.
    if (!input.legalName.trim()) return setError('Add your legal name.');
    if (input.roles.length === 0) return setError('Pick at least one thing you did on this song.');
    if (!input.email.trim()) return setError('Add your email so the team can reach you.');
    if (!input.confirmedAccurate) {
      return setError('Tick the box to confirm your details are correct.');
    }

    setError('');
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/credits/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only the fields on the form. Anything left out is kept as it was
        // on an earlier answer from the same email (see the route).
        body: JSON.stringify({
          legalName: input.legalName,
          stageName: input.stageName,
          roles: input.roles,
          email: input.email,
          proAffiliation: input.proAffiliation,
          ipiNumber: input.ipiNumber,
          publisherName: input.publisherName,
          publisherIpi: input.publisherIpi,
          confirmedAccurate: input.confirmedAccurate,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; updated?: boolean };
      if (!res.ok) {
        setError(data.error || 'Could not submit. Please try again.');
        return;
      }
      // Remember only after the server accepted it, so a rejected form never
      // leaves details behind on the device.
      saveCreditPrefill(input);
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
      <div className="mt-10">
        <p className="text-lg" style={{ color: CREAM }}>
          Done. Your details have been sent to <span style={{ color: BRAND }}>{recipient}</span>.
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: MUTED }}>
          {replacedEarlier
            ? 'You had sent your details before, so we replaced your earlier answer with this one.'
            : 'Nothing else to do. They will get in touch if anything is missing.'}
        </p>
        <button
          type="button"
          onClick={() => {
            // Blank form, and the notice goes with it: a DIFFERENT person is
            // about to type, so leaving "filled in for Ada" over an empty form
            // would be wrong twice over. Deliberately does NOT call
            // forgetCreditPrefill — those are the first person's own details on
            // their own device, and they may want them on the next release.
            setInput(EMPTY_INPUT);
            setPrefilledFor('');
            setSubmitted(false);
            setReplacedEarlier(false);
          }}
          className="mt-6 h-11 rounded-xl border px-5 text-sm"
          style={{ borderColor: FIELD_STROKE, color: CREAM }}
        >
          Fill it in for someone else
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8">
      {/* Said out loud, and undoable. Two reasons this is not optional polish:
          arriving at a PUBLIC form that already knows your legal name is
          unsettling if nothing explains it, and on a shared studio or cafe
          machine the person reading it may not be the person it remembers. */}
      {prefilledFor ? (
        <p className="mb-4 text-sm leading-relaxed" style={{ color: MUTED }}>
          Filled in from last time on this device, for{' '}
          <span style={{ color: CREAM }}>{prefilledFor}</span>.{' '}
          <button
            type="button"
            onClick={handleForgetPrefill}
            className="underline underline-offset-2"
            style={{ color: CREAM }}
          >
            Not you? Start fresh
          </button>
        </p>
      ) : null}

      <div className="grid gap-2.5 lg:grid-cols-2 lg:gap-x-3.5 lg:gap-y-4">
        <TextField
          label="Legal name"
          autoComplete="name"
          required
          value={input.legalName}
          onChange={(v) => setInput((c) => ({ ...c, legalName: v }))}
        />
        <TextField
          label="Stage name (optional)"
          desktopLabel={
            <>
              Stage name <span className="font-normal" style={{ color: FAINT }}>Optional</span>
            </>
          }
          value={input.stageName || ''}
          onChange={(v) => setInput((c) => ({ ...c, stageName: v }))}
        />
        <TextField
          label="Email"
          className="lg:col-span-2"
          autoComplete="email"
          type="email"
          required
          value={input.email}
          onChange={(v) => setInput((c) => ({ ...c, email: v }))}
        />
      </div>

      <fieldset className="mt-8">
        <legend>
          <GroupLabel>What did you do?</GroupLabel>
        </legend>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {/* Every role on a computer; the first few and "More" on a phone. */}
          {RELEASE_CREDIT_ROLE_OPTIONS.map((role) => {
            const on = input.roles.includes(role);
            const shows = creditRoleChipShows(role, { showAll: showAllRoles, picked: on });
            return (
              <button
                key={role}
                type="button"
                aria-pressed={on}
                onClick={() => toggleRole(role)}
                className={`min-h-9 rounded-full border px-3.5 text-sm ${shows === 'computer' ? 'hidden lg:inline-block' : ''}`}
                style={
                  on
                    ? { backgroundColor: BRAND, borderColor: BRAND, color: INK_TEXT }
                    : { backgroundColor: SURFACE, borderColor: FIELD_STROKE, color: CREAM }
                }
              >
                {RELEASE_CREDIT_ROLE_LABELS[role]}
              </button>
            );
          })}
          {!showAllRoles ? (
            <button
              type="button"
              onClick={() => setShowAllRoles(true)}
              className="min-h-9 rounded-full border px-3.5 text-sm lg:hidden"
              style={{ borderColor: STROKE, color: FAINT }}
            >
              More
            </button>
          ) : null}
        </div>
      </fieldset>

      {isWriter ? (
        <div className="mt-8">
          <GroupLabel>Publishing, all optional</GroupLabel>
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <TextField
              label="PRO (MCSN, PRS…)"
              value={input.proAffiliation || ''}
              onChange={(v) => setInput((c) => ({ ...c, proAffiliation: v }))}
            />
            <TextField
              label="Your IPI"
              value={input.ipiNumber || ''}
              onChange={(v) => setInput((c) => ({ ...c, ipiNumber: v }))}
            />
            <TextField
              label="Publisher or SELF"
              value={input.publisherName || ''}
              onChange={(v) => setInput((c) => ({ ...c, publisherName: v }))}
            />
            <TextField
              label="Publisher IPI"
              value={input.publisherIpi || ''}
              onChange={(v) => setInput((c) => ({ ...c, publisherIpi: v }))}
            />
          </div>
        </div>
      ) : null}

      <label className="mt-8 flex items-center gap-2.5 text-sm" style={{ color: MUTED }}>
        <input
          type="checkbox"
          checked={input.confirmedAccurate}
          onChange={(event) => setInput((c) => ({ ...c, confirmedAccurate: event.target.checked }))}
          className="h-4 w-4"
        />
        These details are correct
      </label>

      {error ? (
        <p className="mt-4 text-sm" style={{ color: 'var(--credits-danger)' }}>
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-medium disabled:cursor-not-allowed disabled:opacity-60"
        style={{ backgroundColor: BRAND, color: INK_TEXT }}
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isSubmitting ? 'Sending…' : 'Send my credits'}
      </button>
    </form>
  );
}

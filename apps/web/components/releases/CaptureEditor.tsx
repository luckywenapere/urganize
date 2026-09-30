'use client';

import { ImageIcon, Loader2 } from '@/components/icons';
import {
  CAPTURE_BUTTON_LABEL_MAX,
  CAPTURE_CONSENT_NOTE_MAX,
  CAPTURE_HEADLINE_MAX,
  CAPTURE_INCENTIVE_MAX,
  type CapturePageDraft,
} from '@/types/capture';
import { CAPTURE_HEADLINE_RECOMMENDED_MAX, FIELD_GUIDANCE } from '@/lib/capture-playbook';
import type { CaptureSaveState } from './useCaptureAutosave';

/**
 * The capture-page editor (2026-08-14).
 *
 * Presentational: it owns no state and no fetching. The draft, the debounce
 * and the save live in CaptureSection via useCaptureAutosave, so this file
 * stays a form and the checklist beside it grades the same object this edits.
 *
 * Every field carries its playbook guidance as a hint, taken from
 * FIELD_GUIDANCE rather than written here — so the advice in the editor and
 * the advice in capture-v0.1.md cannot drift apart. Two playbook rules that
 * the checklist deliberately cannot grade (G2 aspect ratio, G3 one image) are
 * said here instead, on the graphic row, which is the only place they can be
 * acted on.
 */

type CaptureEditorProps = {
  draft: CapturePageDraft;
  saveState: CaptureSaveState;
  /** True when the page will render an image — an explicitly chosen asset or
   * the release's cover art. Resolved server-side so this matches what a fan
   * actually sees. */
  hasGraphic: boolean;
  onChange: (patch: Partial<CapturePageDraft>) => void;
  /** Persist immediately (blur, toggle) rather than waiting out the debounce. */
  onBlur: () => void;
};

const inputClass =
  'w-full border border-stroke-default bg-bg-base px-3 py-2 text-sm text-content-primary outline-none placeholder:text-content-tertiary focus:border-brand/60';

function SaveIndicator({ state }: { state: CaptureSaveState }) {
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-content-tertiary">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Saving…
      </span>
    );
  }
  if (state === 'saved') {
    return <span className="text-xs text-brand">Saved</span>;
  }
  if (state === 'error') {
    // Stays until the next edit or a successful retry — a failed save must not
    // decay quietly into looking like a saved one.
    return <span role="alert" className="text-xs text-status-error">Couldn’t save. Keep typing to retry</span>;
  }
  if (state === 'dirty') {
    return <span className="text-xs text-content-tertiary">Unsaved</span>;
  }
  return null;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs leading-relaxed text-content-tertiary">{children}</p>;
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary"
    >
      {children}
    </label>
  );
}

export function CaptureEditor({
  draft,
  saveState,
  hasGraphic,
  onChange,
  onBlur,
}: CaptureEditorProps) {
  const headlineLength = draft.headline.trim().length;
  const headlineOverRecommended = headlineLength > CAPTURE_HEADLINE_RECOMMENDED_MAX;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 pb-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          The page
        </h3>
        <SaveIndicator state={saveState} />
      </div>

      <div className="space-y-5">
        {/* Graphic. Read-only in this version: the image is the release's cover
            art, so changing it means changing the artwork — which is the right
            place for it, since a capture page showing different art from the
            release would be the confusing outcome. The schema keeps
            graphic_asset_id so picking a promo image can land later, behind
            NEXT_PUBLIC_FEATURE_FILES (the assets API 404s when that flag is
            off, so a picker today would be a broken control). */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
            Graphic
          </span>
          <div className="mt-1.5 flex items-start gap-3 border border-stroke-default bg-bg-base px-3 py-2.5">
            <ImageIcon
              className={`mt-0.5 h-4 w-4 shrink-0 ${hasGraphic ? 'text-brand' : 'text-content-tertiary'}`}
              aria-hidden="true"
            />
            <p className="text-sm text-content-secondary">
              {hasGraphic
                ? 'Using this rollout’s cover art. Change the artwork to change the page.'
                : 'No artwork on this rollout yet. The page will show text only.'}
            </p>
          </div>
          <Hint>{FIELD_GUIDANCE.graphic}</Hint>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <FieldLabel htmlFor="capture-headline">Headline</FieldLabel>
            <span
              className={`font-mono text-[11px] ${
                headlineOverRecommended ? 'text-status-warning' : 'text-content-tertiary'
              }`}
            >
              {headlineLength}/{CAPTURE_HEADLINE_RECOMMENDED_MAX}
            </span>
          </div>
          <input
            id="capture-headline"
            type="text"
            value={draft.headline}
            maxLength={CAPTURE_HEADLINE_MAX}
            onChange={(event) => onChange({ headline: event.target.value })}
            onBlur={onBlur}
            placeholder="Hear it before Friday"
            className={`mt-1.5 ${inputClass}`}
          />
          <Hint>{FIELD_GUIDANCE.headline}</Hint>
        </div>

        <div>
          <FieldLabel htmlFor="capture-incentive">What they get</FieldLabel>
          <textarea
            id="capture-incentive"
            value={draft.incentive}
            rows={2}
            maxLength={CAPTURE_INCENTIVE_MAX}
            onChange={(event) => onChange({ incentive: event.target.value })}
            onBlur={onBlur}
            placeholder="The link, a day before anyone else."
            className={`mt-1.5 resize-none ${inputClass}`}
          />
          <Hint>{FIELD_GUIDANCE.incentive}</Hint>
        </div>

        <div>
          <FieldLabel htmlFor="capture-destination">The link they get</FieldLabel>
          <input
            id="capture-destination"
            type="url"
            inputMode="url"
            value={draft.destinationUrl}
            onChange={(event) => onChange({ destinationUrl: event.target.value })}
            onBlur={onBlur}
            placeholder="https://..."
            className={`mt-1.5 font-mono ${inputClass}`}
          />
          <Hint>{FIELD_GUIDANCE.destinationUrl}</Hint>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="capture-destination-label">Call that link…</FieldLabel>
            <input
              id="capture-destination-label"
              type="text"
              value={draft.destinationLabel}
              onChange={(event) => onChange({ destinationLabel: event.target.value })}
              onBlur={onBlur}
              placeholder="first listen"
              className={`mt-1.5 ${inputClass}`}
            />
            <Hint>{FIELD_GUIDANCE.destinationLabel}</Hint>
          </div>

          <div>
            <FieldLabel htmlFor="capture-button">Button</FieldLabel>
            <input
              id="capture-button"
              type="text"
              value={draft.buttonLabel}
              maxLength={CAPTURE_BUTTON_LABEL_MAX}
              onChange={(event) => onChange({ buttonLabel: event.target.value })}
              onBlur={onBlur}
              placeholder="Send me the link"
              className={`mt-1.5 ${inputClass}`}
            />
            <Hint>{FIELD_GUIDANCE.buttonLabel}</Hint>
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="capture-consent">Small print</FieldLabel>
          <textarea
            id="capture-consent"
            value={draft.consentNote}
            rows={2}
            maxLength={CAPTURE_CONSENT_NOTE_MAX}
            onChange={(event) => onChange({ consentNote: event.target.value })}
            onBlur={onBlur}
            placeholder="You’ll only hear from us about this release. Unsubscribe any time."
            className={`mt-1.5 resize-none ${inputClass}`}
          />
          <Hint>{FIELD_GUIDANCE.consentNote}</Hint>
        </div>

        {/* The two switches. Both flush immediately rather than riding the
            debounce: a toggle is a decision, and watching "Unsaved" sit there
            after flipping one reads as the switch not having worked. */}
        <div className="space-y-4 border-t border-stroke-subtle pt-5">
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="text-sm font-medium text-content-primary">Also ask for a name</span>
              <Hint>{FIELD_GUIDANCE.collectName}</Hint>
            </div>
            <input
              type="checkbox"
              checked={draft.collectName}
              onChange={(event) => {
                onChange({ collectName: event.target.checked });
                onBlur();
              }}
              aria-label="Also ask for a name"
              className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--color-brand))]"
            />
          </label>

          <label className="flex cursor-pointer items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="text-sm font-medium text-content-primary">Pause sign-ups</span>
              <Hint>
                The link keeps working and your sign-ups stay, but visitors are told the list is
                closed. This is the reversible way to take a page out of circulation.
              </Hint>
            </div>
            <input
              type="checkbox"
              checked={draft.isPaused}
              onChange={(event) => {
                onChange({ isPaused: event.target.checked });
                onBlur();
              }}
              aria-label="Pause sign-ups"
              className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--color-brand))]"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

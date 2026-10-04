'use client';

import { useState, useId } from 'react';
import { AlertCircle, ChevronDown } from '@/components/icons';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import {
  BRAND_COLORS_SETTINGS_ANCHOR,
  NO_BRAND_COLORS,
  SHARE_INK,
  SHARE_SPRING,
  describeBrandColorWarning,
  normalizeHexColor,
  resolveSharePalette,
  sameBrandColors,
  type BrandColors,
  type SharePalette,
} from '@/lib/social-share-colors';
import { panelClass } from './panelClass';
import { feedbackErrorClass, feedbackSuccessClass } from './feedback';
import type { WorkspaceArtist } from './WorkspaceArtistSection';
import { saveButtonVisible } from '@/lib/settings-dirty';
import { useReportDirty } from './useReportDirty';

type BrandColorsSectionProps = {
  artists: WorkspaceArtist[] | undefined;
  isLoading: boolean;
  savingId: string | null;
  message: string;
  error: string;
  onSave: (artistId: string, colors: BrandColors) => void;
};

/**
 * Brand colors for the share images (founder call, 2026-09-24): a background
 * and an accent per artist, used on the Instagram, WhatsApp, X and Snapchat
 * images and nowhere else.
 *
 * The preview is drawn from the SAME palette the image route uses
 * (resolveSharePalette), so what this shows is what gets posted, including the
 * text color the palette picks for contrast. Presentational like the artist
 * rows above it: the roster and the save come from useWorkspaceSettings, and
 * only the unsaved choice lives here.
 */
export function BrandColorsSection({
  artists,
  isLoading,
  savingId,
  message,
  error,
  onSave,
}: BrandColorsSectionProps) {
  // Closed by default: this is an occasional job, and Artists & brand is the long
  // section, so it opens calm. A deep link (the share sheet's "Change them") opens
  // it. The body stays mounted when closed, only hidden, so a color somebody is
  // still choosing is not thrown away by folding the section.
  const bodyId = useId();
  const [open, setOpen] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('section') === BRAND_COLORS_SETTINGS_ANCHOR
  );

  return (
    <section id={BRAND_COLORS_SETTINGS_ANCHOR} className={`${panelClass} scroll-mt-4`}>
      <h2>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="motion-focus flex min-h-11 w-full items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="block font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
              Brand colors
            </span>
            <span className="mt-1 block text-sm font-normal normal-case tracking-normal text-content-secondary">
              Colors for each artist&apos;s share images.
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className="mt-4">
      <p className="mb-4 text-sm text-content-secondary">
        The text turns light or dark by itself, so it stays easy to read.
      </p>

      {isLoading && artists === undefined ? (
        <div className="space-y-2">
          <SkeletonBlock className="h-32 w-full rounded-xl" />
        </div>
      ) : artists === undefined ? (
        <p className="text-sm text-content-secondary">Could not load your artists.</p>
      ) : artists.length === 0 ? (
        <p className="text-sm text-content-secondary">Add an artist above to give them colors.</p>
      ) : (
        <div className="space-y-3">
          {artists.map((artist) => (
            <BrandColorsRow
              key={artist.id}
              artist={artist}
              isSaving={savingId === artist.id}
              disabled={savingId !== null && savingId !== artist.id}
              onSave={onSave}
            />
          ))}
        </div>
      )}

      {message && <p role="status" className={`mt-3 ${feedbackSuccessClass}`}>{message}</p>}
      {error && <p role="alert" className={`mt-3 ${feedbackErrorClass}`}>{error}</p>}
      </div>
    </section>
  );
}

function BrandColorsRow({
  artist,
  isSaving,
  disabled,
  onSave,
}: {
  artist: WorkspaceArtist;
  isSaving: boolean;
  disabled: boolean;
  onSave: (artistId: string, colors: BrandColors) => void;
}) {
  const saved = artist.brandColors ?? NO_BRAND_COLORS;
  // Derived, never seeded by an effect (the artist rows' rule): `undefined`
  // means "not changed yet" and falls through to what is saved, so a background
  // refetch can never overwrite a color somebody is still choosing.
  const [draft, setDraft] = useState<BrandColors | undefined>(undefined);
  const current = draft ?? saved;
  const palette = resolveSharePalette(current);
  const warning = describeBrandColorWarning(current);
  const dirty = draft !== undefined && !sameBrandColors(draft, saved);
  useReportDirty(`brand-colors:${artist.id}`, dirty);
  const hasSaved = saved.background !== null || saved.accent !== null;

  const setSlot = (slot: keyof BrandColors, hex: string) => setDraft({ ...current, [slot]: hex });

  return (
    <div className="rounded-xl border border-stroke-subtle p-3 sm:flex sm:items-start sm:gap-4">
      <PosterPreview palette={palette} name={artist.name} />

      <div className="mt-3 min-w-0 flex-1 sm:mt-0">
        <p className="truncate text-sm font-semibold text-content-primary">{artist.name}</p>
        <p className="text-xs text-content-tertiary">
          {hasSaved || draft ? 'Their own colors' : 'Using Urganize colors'}
        </p>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
          <ColorField
            label="Background"
            artistName={artist.name}
            value={current.background ?? SHARE_INK}
            disabled={disabled || isSaving}
            onChange={(hex) => setSlot('background', hex)}
          />
          <ColorField
            label="Accent"
            artistName={artist.name}
            value={current.accent ?? SHARE_SPRING}
            disabled={disabled || isSaving}
            onChange={(hex) => setSlot('accent', hex)}
          />
        </div>

        {warning ? (
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-status-warning">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {warning}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {saveButtonVisible({ dirty, saving: isSaving }) ? (
            <button
              type="button"
              onClick={() => {
                onSave(artist.id, current);
                setDraft(undefined);
              }}
              disabled={disabled || isSaving || !dirty}
              className="shrink-0 whitespace-nowrap rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          ) : null}
          {hasSaved || draft ? (
            <button
              type="button"
              onClick={() => {
                // Saved colors reset on the server; an unsaved choice is just
                // dropped, since there is nothing to undo there.
                if (hasSaved) onSave(artist.id, NO_BRAND_COLORS);
                setDraft(undefined);
              }}
              disabled={disabled || isSaving}
              className="shrink-0 whitespace-nowrap rounded-lg border border-stroke-subtle px-3 py-2 text-sm font-semibold text-content-secondary hover:border-brand hover:text-content-primary disabled:opacity-50"
            >
              Use Urganize colors
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * A small copy of the share image: the eyebrow, the rule, the name and the
 * date line, in the colors the route will actually draw.
 */
function PosterPreview({ palette, name }: { palette: SharePalette; name: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-[132px] w-[106px] shrink-0 flex-col rounded-lg border border-stroke-subtle p-2.5"
      style={{ backgroundColor: palette.background }}
    >
      <p className="font-mono text-[7px] tracking-[0.14em]" style={{ color: palette.accentText }}>
        NEW SINGLE
      </p>
      <div className="mt-1 h-[2px] w-full" style={{ backgroundColor: palette.accent }} />
      <p
        className="mt-3 line-clamp-2 font-display text-[15px] font-semibold leading-tight"
        style={{ color: palette.text }}
      >
        {name}
      </p>
      <p className="mt-auto font-display text-[11px] font-semibold" style={{ color: palette.accentText }}>
        Out now
      </p>
      <p className="mt-0.5 font-mono text-[6px] tracking-[0.08em]" style={{ color: palette.textFaint }}>
        Made with Urganize
      </p>
    </div>
  );
}

/**
 * One color: the browser's own picker, plus a text field for the exact code
 * from a brand guide, because "close to our purple" is not a brand color.
 */
function ColorField({
  label,
  artistName,
  value,
  disabled,
  onChange,
}: {
  label: string;
  artistName: string;
  value: string;
  disabled: boolean;
  onChange: (hex: string) => void;
}) {
  // What is being typed, while it is being typed. null shows the saved value,
  // so a half-typed code never overwrites the swatch and blurring tidies it.
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? value;
  const hintId = useId();
  const invalid = text !== null && text.trim() !== '' && normalizeHexColor(text) === null;

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value.toLowerCase()}
        onChange={(event) => {
          const hex = normalizeHexColor(event.target.value);
          if (hex) {
            setText(null);
            onChange(hex);
          }
        }}
        disabled={disabled}
        aria-label={`${label} color for ${artistName}`}
        className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-stroke-default bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <label className="flex flex-col">
        <span className="text-xs font-medium text-content-secondary">{label}</span>
        <input
          type="text"
          value={shown}
          onChange={(event) => {
            setText(event.target.value);
            const hex = normalizeHexColor(event.target.value);
            if (hex) onChange(hex);
          }}
          onBlur={() => setText(null)}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={7}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? hintId : undefined}
          aria-label={`${label} color code for ${artistName}`}
          className="w-[5.5rem] rounded-md border border-stroke-control bg-bg-elevated px-2 py-1 font-mono text-xs uppercase text-content-primary outline-none focus:border-brand aria-[invalid=true]:border-status-error"
        />
        {invalid ? (
          <span role="alert" id={hintId} className="mt-1 text-xs text-status-error">
            Use a code like #1A2B3C.
          </span>
        ) : null}
      </label>
    </div>
  );
}

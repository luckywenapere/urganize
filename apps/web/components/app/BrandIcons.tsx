'use client';

// Hand-drawn brand icons (founder call, 2026-07-23): the topbar previously
// used stock lucide glyphs (grid, chat bubble, bell) — the same icons every
// app ships. These are drawn in the house voice instead, matching the
// HelpMenu's custom set: 24px viewBox, 1.8 stroke, round caps, currentColor.
// Music-coded shapes — a record crate for the catalog, a waveform bubble for
// Chappi, a live-signal mark for notifications — so the chrome reads as
// Urganize, not as "another SaaS".

type IconProps = { className?: string };

/** The catalog: two record sleeves in a crate, vinyl label showing. */
export function CatalogIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M8 7.5V6A1.5 1.5 0 0 1 9.5 4.5H18A1.5 1.5 0 0 1 19.5 6v8.5a1.5 1.5 0 0 1-1.5 1.5h-1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="4.5" y="7.5" width="12" height="12" rx="1.5" />
      <circle cx="10.5" cy="13.5" r="2.1" />
      <path d="M10.5 13.5h.01" strokeLinecap="round" />
    </svg>
  );
}

/** Chappi: a speech bubble carrying a waveform — talk, about music. */
export function ChappiIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M6.5 17.5 4.5 20V7A2.5 2.5 0 0 1 7 4.5h10A2.5 2.5 0 0 1 19.5 7v7a2.5 2.5 0 0 1-2.5 2.5H8l-1.5 1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 9.7v2.6M12 8.5v5M15 9.7v2.6" strokeLinecap="round" />
    </svg>
  );
}

/** Settings: mixing-desk faders — you tune Urganize like a board, not a
 * machine. Replaces the stock gear (2026-07-23, founder call: no shapes
 * every other app uses). */
export function GearIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6.5 4.5v15M12 4.5v15M17.5 4.5v15" strokeLinecap="round" />
      <circle cx="6.5" cy="9" r="2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15" r="2" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="7.5" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Sign out: eject — tape-deck language for "take me out of here". */
export function ExitIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5.5 18.5 13.5H5.5L12 5.5Z" strokeLinejoin="round" />
      <path d="M6 18h12" strokeLinecap="round" />
    </svg>
  );
}

/** Notifications: a live transmission — signal going out, not a doorbell. */
export function SignalIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="13" r="1.4" fill="currentColor" stroke="none" />
      <path d="M9.2 10.2a4 4 0 0 0 0 5.6M14.8 10.2a4 4 0 0 1 0 5.6" strokeLinecap="round" />
      <path d="M6.6 7.6a7.6 7.6 0 0 0 0 10.8M17.4 7.6a7.6 7.6 0 0 1 0 10.8" strokeLinecap="round" />
    </svg>
  );
}

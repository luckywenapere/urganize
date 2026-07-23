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

/** Settings: the same hand-drawn gear the help menu carries. */
export function GearIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z" />
      <path
        d="M19 12a7.8 7.8 0 0 0-.08-1.08l2.02-1.58-1.92-3.32-2.45.74a7.8 7.8 0 0 0-1.87-1.08L14.5 3h-5l-.2 2.68c-.67.25-1.3.61-1.87 1.08l-2.45-.74L3.06 9.34l2.02 1.58A7.8 7.8 0 0 0 5 12c0 .37.03.73.08 1.08l-2.02 1.58 1.92 3.32 2.45-.74c.57.47 1.2.83 1.87 1.08L9.5 21h5l.2-2.68c.67-.25 1.3-.61 1.87-1.08l2.45.74 1.92-3.32-2.02-1.58c.05-.35.08-.71.08-1.08Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Sign out: stepping out of the frame, drawn in-house. */
export function ExitIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M13.5 4.5H7A1.5 1.5 0 0 0 5.5 6v12A1.5 1.5 0 0 0 7 19.5h6.5" strokeLinecap="round" />
      <path d="M16 8.5 19.5 12 16 15.5M19.2 12H10" strokeLinecap="round" strokeLinejoin="round" />
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

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

/** Notes: a lyric sheet — two written lines and a quarter note. The words
 * and the music, on the back of an envelope. */
export function NotesIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5.5" y="3.5" width="13" height="17" rx="1.8" />
      <path d="M8.5 8.2h7M8.5 11.4h7" strokeLinecap="round" />
      <path d="M14.4 13.9v4" strokeLinecap="round" />
      <circle cx="13.1" cy="17.7" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Docs: a tour laminate — your crew pass to how everything works. */
export function DocsIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9.5 6.5 12 4.2l2.5 2.3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="6" y="6.5" width="12" height="13" rx="1.5" />
      <circle cx="12" cy="9.6" r="0.4" fill="currentColor" />
      <path d="M9 13.2h6M9 16.2h4" strokeLinecap="round" />
    </svg>
  );
}

/** Contact: a studio microphone — talk to us, on the record. */
export function ContactIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9.5" y="3.5" width="5" height="9.5" rx="2.5" />
      <path d="M6.8 11a5.2 5.2 0 0 0 10.4 0" strokeLinecap="round" />
      <path d="M12 16.4v3.1M9.3 19.5h5.4" strokeLinecap="round" />
    </svg>
  );
}

/** Report: a blown fuse on a patch cable — something in the chain is dead. */
export function ReportIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 12h3.2M16.8 12H20" strokeLinecap="round" />
      <rect x="7.2" y="8.4" width="9.6" height="7.2" rx="1.6" />
      <path d="M12 10.4v3.1" strokeLinecap="round" />
      <circle cx="12" cy="15.2" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Community: a speaker cab — the room the whole crowd gathers around. */
export function CommunityIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5.5" y="4.5" width="13" height="15" rx="1.5" />
      <circle cx="12" cy="13.8" r="2.9" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
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

/** Profile: a listener — head and shoulders under a headphone band. The
 * account trigger stopped showing initials (founder call, 2026-07-23);
 * this keeps the person shape music-coded like the rest of the set. */
export function ProfileIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="10" r="3.1" />
      <path d="M5.8 19.5a6.2 6.2 0 0 1 12.4 0" strokeLinecap="round" />
      <path d="M7.9 9.4a4.1 4.1 0 0 1 8.2 0" strokeLinecap="round" />
      <path d="M7.9 9.4v1.5M16.1 9.4v1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Rollout plan illustration (create-release chooser): a laminate checklist
 * — dated rows with the first tick already filled. */
export function PlanIllustration({ className = 'h-9 w-9' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.8" />
      <circle cx="8.3" cy="8.2" r="1" fill="currentColor" stroke="none" />
      <path d="M11.2 8.2h5.3" strokeLinecap="round" />
      <circle cx="8.3" cy="12" r="1" />
      <path d="M11.2 12h5.3" strokeLinecap="round" />
      <circle cx="8.3" cy="15.8" r="1" />
      <path d="M11.2 15.8h3.4" strokeLinecap="round" />
    </svg>
  );
}

/** Blank release illustration (create-release chooser): an empty sheet with
 * a plus — build it up yourself. */
export function BlankSheetIllustration({ className = 'h-9 w-9' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.8" />
      <path d="M12 9.2v5.6M9.2 12h5.6" strokeLinecap="round" />
    </svg>
  );
}

/** Guided tour: a dotted route from where you are to a marker — someone
 * walking you there, rather than a map you have to read. */
export function TourIcon({ className = 'h-4.5 w-4.5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="5.5" cy="18.5" r="1.6" fill="currentColor" stroke="none" />
      <path d="M5.5 18.5c5.2 0 3.4-6 9-6" strokeDasharray="2.4 3" strokeLinecap="round" />
      <path d="M16.5 4.5v9" strokeLinecap="round" />
      <path d="M16.5 5.5h4.2l-1.4 2 1.4 2h-4.2Z" strokeLinejoin="round" />
    </svg>
  );
}

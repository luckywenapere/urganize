'use client';

import { forwardRef, type ReactNode, type RefAttributes, type SVGProps } from 'react';

/**
 * The house icon set — Urganize's own glyphs, drawn in the Adinkra/Kuba voice
 * of the brand's textile reference rather than borrowed from a stock library.
 *
 * WHY THIS EXISTS. The founder's 2026-07-23 call already removed stock lucide
 * glyphs from the topbar for reading like "another SaaS" (see BrandIcons.tsx,
 * whose eleven music-coded marks this extends). This carries that same decision
 * across the rest of the chrome.
 *
 * WHAT MAKES A MARK BELONG. Three candidate directions were drawn and compared
 * at real icon size before any of this shipped. Two were rejected on evidence:
 *
 *   - "hand-cut" (deliberate wobble, squared terminals) was INVISIBLE at 24px.
 *     Irregularity that reads on a metre of cloth does not survive a 16px
 *     glyph. Do not reach for it again.
 *   - "house line" (lucide's forms at stroke 1.8) was indistinguishable from
 *     what it replaced. Correct weight, but no character.
 *
 * What survived is the carved-stamp voice, and it comes down to four rules:
 *
 *   1. CONTAIN IT. Where a concept has a natural vessel, cut a container
 *      around it — a diamond, a ring, an arch. That containment is the single
 *      strongest Adinkra signal and it is what makes `check` and `search` read
 *      as marks rather than as UI.
 *   2. NEST IT. Concentric repeats — a ring inside a ring, a square inside a
 *      square — echo the mudcloth panels directly.
 *   3. FOUR ELEMENTS MAX. The two glyphs that failed the comparison sheet
 *      (delete, notifications) failed by having five or six. At 16px anything
 *      more than four shapes turns to mud. This is a hard ceiling.
 *   4. SYMMETRY WHERE THE MEANING ALLOWS. Adinkra marks are stamps; stamps are
 *      symmetric. Break it only for directional glyphs (arrows, chevrons).
 *
 * STROKE. 1.6 on structural geometry, 1.8 on the interior gesture that carries
 * the meaning. That contrast is deliberate: the container recedes, the meaning
 * reads first. Round caps ONLY on interior gestures — structure is cut square.
 *
 * NOT DECORATION. These are controls. A close button that takes a beat to
 * recognise is a worse button however handsome the mark. Where legibility and
 * character conflict, legibility wins — which is why `x` and the chevrons are
 * nearly plain.
 *
 * PROPS are lucide-compatible on purpose (`size`, `strokeWidth`, `color`, plus
 * any SVG prop), so a call site swaps the import path and nothing else. See
 * ./index.ts for how the two sets are merged.
 */

export type HouseIconProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & {
  size?: string | number;
  /** Accepted for lucide parity. Structural stroke; interior marks scale with it. */
  strokeWidth?: string | number;
  color?: string;
};

/** Structural stroke — containers, frames, the parts that recede. */
const S = 1.6;
/** Interior gesture — the stroke that carries the meaning and reads first. */
const G = 1.8;

type HouseIcon = React.ForwardRefExoticComponent<
  Omit<HouseIconProps, 'ref'> & RefAttributes<SVGSVGElement>
>;

/**
 * Every mark is built through here, which is what makes a house icon a genuine
 * drop-in for a lucide one — not just at runtime but in the TYPE SYSTEM.
 *
 * That mattered immediately: `AdminHubClient` holds an array of
 * { label, icon } rows mixing both sets, and TypeScript infers that array's
 * icon type from the FIRST entry. A plain `(p: Props) => Element` function
 * and lucide's `ForwardRefExoticComponent` are not assignable to one another,
 * so the build failed on the first mixed array it met. Matching lucide's shape
 * exactly — forwardRef, ref on the svg — means the two sets can sit in the same
 * array, the same prop, the same map, and nothing has to know which is which.
 *
 * The children are static per icon, so they are captured once at module scope
 * rather than rebuilt per render.
 */
function icon(displayName: string, children: ReactNode): HouseIcon {
  const Component = forwardRef<SVGSVGElement, HouseIconProps>(function HouseIconInner(
    { size = 24, color = 'currentColor', strokeWidth, ...rest },
    ref
  ) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth ?? S}
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        {children}
      </svg>
    );
  });
  Component.displayName = displayName;
  return Component;
}

/* ---------------------------------------------------------------------------
   Structure & status
   ------------------------------------------------------------------------- */

/** Two concentric arcs with a gap — a spinning ring, not a segmented wheel.
 *  Used with `animate-spin` at 46 call sites, the most-seen glyph in the app,
 *  so it stays the simplest thing here: nothing to blur when it rotates. */
export const Loader2 = icon(
  'Loader2',
  <>
    <path d="M21 12a9 9 0 1 1-9-9" strokeLinecap="round" strokeWidth={G} />
  </>
);

/** Close. Deliberately near-plain: a dismiss control has to be read instantly.
 *  The only concession to the voice is the cut terminal (square, not round). */
export const X = icon(
  'X',
  <>
    <path d="M5.6 5.6 18.4 18.4M18.4 5.6 5.6 18.4" strokeWidth={G} strokeLinecap="square" />
  </>
);

/** Done. The diamond is the container rule at its clearest — this was the
 *  glyph that proved the direction on the comparison sheet. */
export const Check = icon(
  'Check',
  <>
    <path d="M12 3.4 20.6 12 12 20.6 3.4 12Z" />
    <path d="M8.3 12.1 10.9 14.8 15.8 9.4" strokeWidth={G} strokeLinecap="round" strokeLinejoin="round" />
  </>
);

/** Done, round. Nested rings instead of a diamond — the same idea in the
 *  circular register, so both read as one family. */
export const CheckCircle2 = icon(
  'CheckCircle2',
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M8.3 12.1 10.9 14.8 15.8 9.4" strokeWidth={G} strokeLinecap="round" strokeLinejoin="round" />
  </>
);

/** Add. A cross struck through a turned square — a stamped mark rather than
 *  a maths symbol. */
export const Plus = icon(
  'Plus',
  <>
    <path d="M12 4.2v15.6M4.2 12h15.6" strokeWidth={G} strokeLinecap="round" />
    <path d="M12 7.6 16.4 12 12 16.4 7.6 12Z" />
  </>
);

/** Something needs attention. Nested rings, then the bar and its point. */
export const AlertCircle = icon(
  'AlertCircle',
  <>
    <circle cx="12" cy="12" r="8.6" />
    <circle cx="12" cy="12" r="5.4" opacity={0.4} />
    <path d="M12 8.4v3.9" strokeWidth={G} strokeLinecap="round" />
    <path d="M12 15.5h.01" strokeWidth={G} strokeLinecap="round" />
  </>
);

/** Warning. The triangle is already an Adinkra form, so it needs only nesting. */
export const AlertTriangle = icon(
  'AlertTriangle',
  <>
    <path d="M12 3.6 21.4 19.8H2.6Z" strokeLinejoin="round" />
    <path d="M12 9v4.1" strokeWidth={G} strokeLinecap="round" />
    <path d="M12 16.5h.01" strokeWidth={G} strokeLinecap="round" />
  </>
);

/* ---------------------------------------------------------------------------
   Objects & actions
   ------------------------------------------------------------------------- */

/** Delete. The comparison sheet's version failed by carrying six shapes; this
 *  is the same idea cut to four — lid, rule, tapered body, one centre rib. */
export const Trash2 = icon(
  'Trash2',
  <>
    <path d="M9.4 6.2V4.4h5.2v1.8" />
    <path d="M3.9 6.2h16.2" strokeWidth={G} strokeLinecap="round" />
    <path d="M17.6 6.2 16.7 19.6H7.3L6.4 6.2Z" strokeLinejoin="round" />
    <path d="M12 9.9v6.1" strokeLinecap="round" opacity={0.55} />
  </>
);

/** Duplicate. Offset nested squares — rule 2 doing the work on its own. */
export const Copy = icon(
  'Copy',
  <>
    <rect x="8.4" y="8.4" width="11.2" height="11.2" strokeLinejoin="round" strokeWidth={G} />
    <path d="M15.6 8.4V5.9a1.5 1.5 0 0 0-1.5-1.5H5.9a1.5 1.5 0 0 0-1.5 1.5v8.2a1.5 1.5 0 0 0 1.5 1.5h2.5" strokeLinejoin="round" />
  </>
);

/** Take it down. The filled head is the one solid in the set — it makes the
 *  direction unmistakable at 16px, where an outlined arrowhead closes up. */
export const Download = icon(
  'Download',
  <>
    <path d="M12 3.6v10.8" strokeWidth={G} strokeLinecap="round" />
    <path d="M12 17.4 7.3 12.6h9.4Z" fill="currentColor" stroke="none" />
    <path d="M4.4 20.4h15.2" strokeLinecap="round" />
  </>
);

/** Send it up. The mirror of Download, so the pair reads as one gesture. */
export const Upload = icon(
  'Upload',
  <>
    <path d="M12 20.4V9.6" strokeWidth={G} strokeLinecap="round" />
    <path d="M12 6.6 16.7 11.4H7.3Z" fill="currentColor" stroke="none" />
    <path d="M4.4 3.6h15.2" strokeLinecap="round" />
  </>
);

/** Locked. A keyhole diamond rather than the usual dot — the container rule
 *  applied to the one interior detail the glyph has. */
export const Lock = icon(
  'Lock',
  <>
    <rect x="4.6" y="10.2" width="14.8" height="9.6" strokeLinejoin="round" />
    <path d="M7.9 10.2V7.8a4.1 4.1 0 0 1 8.2 0v2.4" strokeWidth={G} />
    <path d="M12 13.1 13.7 15 12 16.9 10.3 15Z" strokeLinejoin="round" />
  </>
);

/** Mail. Envelope as a cut rectangle with the fold as an open V. */
export const Mail = icon(
  'Mail',
  <>
    <rect x="3.4" y="5.4" width="17.2" height="13.2" strokeLinejoin="round" />
    <path d="m3.4 7.2 8.6 6.2 8.6-6.2" strokeWidth={G} strokeLinejoin="round" />
  </>
);

/** Dated. The band across the head is the calendar's own woven edge. */
export const CalendarDays = icon(
  'CalendarDays',
  <>
    <rect x="3.6" y="5.2" width="16.8" height="15.2" strokeLinejoin="round" />
    <path d="M3.6 9.6h16.8" strokeWidth={G} />
    <path d="M8 3.4v3.4M16 3.4v3.4" strokeLinecap="round" />
    <path d="M8.2 13.4h.01M12 13.4h.01M15.8 13.4h.01M8.2 16.8h.01M12 16.8h.01" strokeWidth={G} strokeLinecap="round" />
  </>
);

/** Talk. A cut bubble — squared shoulders, one tail. */
export const MessageCircle = icon(
  'MessageCircle',
  <>
    <path d="M4.4 18.4 4.4 6.6A2.2 2.2 0 0 1 6.6 4.4h10.8a2.2 2.2 0 0 1 2.2 2.2v7.4a2.2 2.2 0 0 1-2.2 2.2H7.6Z" strokeLinejoin="round" />
    <path d="M8.6 10.3h6.8" strokeWidth={G} strokeLinecap="round" />
    <path d="M8.6 13.2h4.2" strokeWidth={G} strokeLinecap="round" opacity={0.55} />
  </>
);

/** A list on a board. */
export const ClipboardList = icon(
  'ClipboardList',
  <>
    <rect x="4.6" y="5.4" width="14.8" height="15" strokeLinejoin="round" />
    <path d="M9 5.4V4.2a1.2 1.2 0 0 1 1.2-1.2h3.6A1.2 1.2 0 0 1 15 4.2v1.2Z" strokeLinejoin="round" />
    <path d="M8.4 11.4h7.2M8.4 15.2h4.8" strokeWidth={G} strokeLinecap="round" />
  </>
);

/** Leaves the app. Frame plus a stroke breaking out of its corner. */
export const ExternalLink = icon(
  'ExternalLink',
  <>
    <path d="M13.4 4.4H5.6A1.2 1.2 0 0 0 4.4 5.6v12.8a1.2 1.2 0 0 0 1.2 1.2h12.8a1.2 1.2 0 0 0 1.2-1.2v-7.8" strokeLinejoin="round" />
    <path d="M19.6 4.4h-5.2M19.6 4.4v5.2M19.6 4.4 11.8 12.2" strokeWidth={G} strokeLinecap="round" strokeLinejoin="round" />
  </>
);

/** Something arrived. The comparison sheet's version was cluttered; the ring
 *  lines are gone and the arch carries it, with two struck ticks for the ring. */
export const BellRing = icon(
  'BellRing',
  <>
    <path d="M7 16.2c0-5.2 0-8.8 5-8.8s5 3.6 5 8.8Z" strokeLinejoin="round" />
    <path d="M5.2 16.2h13.6" strokeWidth={G} strokeLinecap="round" />
    <path d="M10.4 19.2a1.9 1.9 0 0 0 3.2 0" strokeLinecap="round" />
    <path d="M3.4 8.4a5 5 0 0 1 1.8-3.6M20.6 8.4a5 5 0 0 0-1.8-3.6" strokeLinecap="round" />
  </>
);

/** Where things land. A tray: cut box, arch for the opening. */
export const Inbox = icon(
  'Inbox',
  <>
    <path d="M3.6 12.6V5.6a1.4 1.4 0 0 1 1.4-1.4h14a1.4 1.4 0 0 1 1.4 1.4v7" strokeLinejoin="round" />
    <path d="M3.6 12.6v5.8a1.4 1.4 0 0 0 1.4 1.4h14a1.4 1.4 0 0 0 1.4-1.4v-5.8" strokeLinejoin="round" />
    <path d="M3.6 12.6h4.6l1.5 2.6h4.6l1.5-2.6h4.6" strokeWidth={G} strokeLinejoin="round" />
  </>
);

/* ---------------------------------------------------------------------------
   Music & motion
   ------------------------------------------------------------------------- */

/** A note. */
export const Music = icon(
  'Music',
  <>
    <path d="M9 18V5.4l10-2v12.2" strokeWidth={G} strokeLinejoin="round" />
    <circle cx="6.4" cy="18" r="2.6" />
    <circle cx="16.4" cy="15.6" r="2.6" />
  </>
);

/** A list of them. */
export const ListMusic = icon(
  'ListMusic',
  <>
    <path d="M3.6 6.4h10.8M3.6 11h8.4M3.6 15.6h5.4" strokeWidth={G} strokeLinecap="round" />
    <path d="M17 18V7.4l3.4-.8V16" strokeLinejoin="round" />
    <circle cx="15.4" cy="18" r="1.8" />
  </>
);

/** Broadcast. Concentric arcs from a struck centre — this is the reference
 *  board's radiating sunburst in miniature, and the most literal mark here. */
export const Radio = icon(
  'Radio',
  <>
    <circle cx="12" cy="12" r="2.2" strokeWidth={G} />
    <path d="M8.4 8.4a5.1 5.1 0 0 0 0 7.2M15.6 15.6a5.1 5.1 0 0 0 0-7.2" strokeLinecap="round" />
    <path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 18.4a9 9 0 0 0 0-12.8" strokeLinecap="round" opacity={0.5} />
  </>
);

/** Again. An open ring with a cut head. */
export const RefreshCw = icon(
  'RefreshCw',
  <>
    <path d="M19.6 12a7.6 7.6 0 1 1-2.4-5.6" strokeLinecap="round" strokeWidth={G} />
    <path d="M19.8 4.2v4.4h-4.4" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

/** Back the other way. */
export const RotateCcw = icon(
  'RotateCcw',
  <>
    <path d="M4.4 12a7.6 7.6 0 1 0 2.4-5.6" strokeLinecap="round" strokeWidth={G} />
    <path d="M4.2 4.2v4.4h4.4" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

/* ---------------------------------------------------------------------------
   Direction. Legibility outranks character here — a chevron that reads as
   ornament stops working as a control.
   ------------------------------------------------------------------------- */

export const ArrowLeft = icon(
  'ArrowLeft',
  <>
    <path d="M19.4 12H4.6" strokeWidth={G} strokeLinecap="round" />
    <path d="M10.6 5.8 4.4 12l6.2 6.2" strokeWidth={G} strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const ChevronDown = icon(
  'ChevronDown',
  <>
    <path d="M5.4 8.8 12 15.4l6.6-6.6" strokeWidth={G} strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const ChevronRight = icon(
  'ChevronRight',
  <>
    <path d="M8.8 5.4 15.4 12l-6.6 6.6" strokeWidth={G} strokeLinecap="round" strokeLinejoin="round" />
  </>
);

/* ---------------------------------------------------------------------------
   People, AI, finding
   ------------------------------------------------------------------------- */

/** The team. Two figures reduced to arcs and rings — four elements exactly. */
export const Users = icon(
  'Users',
  <>
    <circle cx="9.2" cy="8.6" r="3.5" />
    <path d="M3.2 19.8a6 6 0 0 1 12 0" strokeWidth={G} strokeLinecap="round" />
    <circle cx="16.8" cy="9.6" r="2.5" />
    <path d="M15.4 14.6a5.4 5.4 0 0 1 5.4 5.2" strokeLinecap="round" />
  </>
);

/** Find. Nested rings in the lens — the sheet's clearest win after `check`. */
export const Search = icon(
  'Search',
  <>
    <circle cx="10.6" cy="10.6" r="7" />
    <circle cx="10.6" cy="10.6" r="3.4" opacity={0.5} />
    <path d="m20.4 20.4-4.6-4.6" strokeWidth={G} strokeLinecap="round" />
  </>
);

/** UrgAns and everything it touches. A struck four-point star with a second,
 *  smaller one — the gold-thread ray fan reduced to a mark. */
export const Sparkles = icon(
  'Sparkles',
  <>
    <path d="M10 3.4 11.7 8.3 16.6 10 11.7 11.7 10 16.6 8.3 11.7 3.4 10 8.3 8.3Z" strokeLinejoin="round" strokeWidth={G} />
    <path d="M17.4 14.2 18.3 16.7 20.8 17.6 18.3 18.5 17.4 21 16.5 18.5 14 17.6 16.5 16.7Z" strokeLinejoin="round" />
  </>
);

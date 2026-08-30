'use client';

import { useId } from 'react';
import {
  CHAPPI_COLORS,
  CHAPPI_MIN_SIZE,
  CHAPPI_VIEW_BOX,
  type ChappiPose,
} from './chappi-constants';

/**
 * Chappi — the mascot, and the face of UrgAns.
 *
 * Every path, transform, colour and weight below is copied from the Chappi
 * character model sheet (`chappi-model-sheet-v1.html`, Draft 01, Aug 2026).
 * Nothing here is a redraw and nothing is an approximation, so the
 * proportions that sheet states hold exactly:
 *
 *   H (hood width, the widest point) = 274 - 126 = 148
 *   body, crown to tip     1.70 H = 251.6  -> 338 - 86 = 252
 *   eye line from crown    58%            -> (232 - 86) / 252 = 0.579
 *   between eye centres    0.38 H = 56.2  -> 228 - 172 = 56
 *   eye width              0.23 H = 34.0  -> rx 17
 *   ear cup diameter       0.31 H = 45.9  -> r 23
 *   mouth width            0.31 H = 45.9  -> 223 - 177 = 46
 *   mouth stroke           0.054 H = 8.0  -> 8
 *   mouth line from crown  77%            -> 86 + 0.77 * 252 = 280
 *   hover gap, tip to shadow  0.23 H = 34 -> 372 - 338 = 34
 *   outline weight         0.047 H = 6.96 -> 7, uniform, never thick and thin
 *   smallest legible size  64 px wide     -> CHAPPI_MIN_SIZE
 *
 * Do not restyle him and do not add to his design. A seventh pose needs a
 * reason. If the sheet is revised, re-copy from it rather than nudging
 * numbers here.
 *
 * The body is identical in all six poses — only the eyes, the mouth and the
 * two hand TRANSFORMS move, which is why POSES below carries nothing else and
 * why there is one mitten rather than twelve hands. A pose that needed to
 * change the hood would not be a pose.
 */

const DEFAULT_SIZE = 96;

const INK = CHAPPI_COLORS.ink;
const CREAM = CHAPPI_COLORS.cream;
const SPRING = CHAPPI_COLORS.spring;

// ---------------------------------------------------------------------------
// The body. Shared by every pose, in the sheet's paint order.
// ---------------------------------------------------------------------------

/** Hood silhouette: crown, shoulders, tapered base. No legs — he hovers. */
const HOOD =
  'M200 86 C252 86, 274 126, 274 172 C274 224, 250 272, 218 314 C210 325, 204 333, 200 338 C196 333, 190 325, 182 314 C150 272, 126 224, 126 172 C126 126, 148 86, 200 86 Z';

/** The ink cap, whose widow's peak frames the eyes and keeps the face bright. */
const HOOD_CAP =
  'M126 172 C126 126, 148 86, 200 86 C252 86, 274 126, 274 172 C250 179, 224 189, 200 201 C176 189, 150 179, 126 172 Z';

/** Three spring marks on the cap. Energy only; nothing else on him is spring. */
const HIGHLIGHTS = ['M152 128 q20 -16 44 -13', 'M232 106 q24 8 30 28', 'M164 152 h24 l11 -13'] as const;

/**
 * One mitten, placed by transform. No arms: hands move anywhere, so a new
 * pose costs a transform instead of a redraw. Local box is about 48 x 52.
 */
const MITTEN =
  'M30 3 C42 5, 47 17, 45 30 C43 43, 33 51, 21 49 C11 47, 3 40, 2 30 C1 21, 4 13, 10 12 C15 11, 18 15, 18 20 C19 13, 22 2, 30 3 Z';

const EAR_CUPS = [126, 274] as const;
const EAR_CY = 158;
const EAR_R = 23;
const EAR_RING_R = 10;

const OUTLINE_WEIGHT = 7;
const MOUTH_WEIGHT = 8;

// ---------------------------------------------------------------------------
// The six poses.
// ---------------------------------------------------------------------------

type Eyes =
  /** Open: an ink ellipse per eye, with an optional cream catchlight. */
  | {
      kind: 'open';
      cx: readonly [number, number];
      cy: number;
      rx: number;
      ry: number;
      glint?: { cx: readonly [number, number]; cy: number; r: number };
    }
  /** Shut: one stroked arc per eye. Curving up reads happy, down reads asleep. */
  | { kind: 'shut'; d: readonly [string, string] };

type Mouth =
  | { kind: 'line'; d: string }
  /** An open mouth is a filled shape, not a thicker stroke. */
  | { kind: 'open'; d: string };

type PoseSpec = {
  eyes: Eyes;
  mouth: Mouth;
  /** SVG transforms for the two mittens, verbatim from the sheet. */
  hands: readonly [string, string];
};

/** The round eyes idle, pointing and carrying share. */
const openEyes = (cx: readonly [number, number], glintCx: readonly [number, number]): Eyes => ({
  kind: 'open',
  cx,
  cy: 232,
  rx: 17,
  ry: 21,
  glint: { cx: glintCx, cy: 224, r: 5.5 },
});

/** The sheet's `#mouth`: one stroke, the default smile. */
const SMILE = 'M177 279 Q200 301 223 279';

const POSES: Record<ChappiPose, PoseSpec> = {
  // Default. Corners, footers, avatars.
  idle: {
    eyes: openEyes([172, 228], [178, 234]),
    mouth: { kind: 'line', d: SMILE },
    hands: ['translate(76,250) rotate(-12)', 'translate(324,250) rotate(12) scale(-1,1)'],
  },
  // Next to a feature, a price, a date. The eyes track the raised hand, so
  // they sit 4 units right of idle.
  pointing: {
    eyes: openEyes([176, 232], [183, 239]),
    mouth: { kind: 'line', d: SMILE },
    hands: ['translate(92,268) rotate(-8)', 'translate(340,178) rotate(-28) scale(-1,1)'],
  },
  // Loading states. AI working on something.
  thinking: {
    eyes: { kind: 'open', cx: [172, 228], cy: 234, rx: 17, ry: 12 },
    mouth: { kind: 'line', d: 'M186 285 q14 -7 28 0' },
    hands: ['translate(80,264) rotate(-10)', 'translate(272,254) rotate(22) scale(-1,1)'],
  },
  // Release delivered. Milestone hit.
  celebrating: {
    eyes: { kind: 'shut', d: ['M155 238 q17 -24 34 0', 'M211 238 q17 -24 34 0'] },
    mouth: { kind: 'open', d: 'M177 274 Q200 270 223 274 Q219 305 200 305 Q181 305 177 274 Z' },
    hands: ['translate(70,148) rotate(-38)', 'translate(330,148) rotate(38) scale(-1,1)'],
  },
  // Holding a plan, a file, a card. The held object is drawn per graphic, not
  // here — the pose is the gap the hands leave.
  carrying: {
    eyes: openEyes([172, 228], [178, 234]),
    mouth: { kind: 'line', d: SMILE },
    hands: ['translate(112,300) rotate(-4)', 'translate(288,300) rotate(4) scale(-1,1)'],
  },
  // Empty states. Eyes and mouth both close.
  resting: {
    eyes: { kind: 'shut', d: ['M155 228 q17 20 34 0', 'M211 228 q17 20 34 0'] },
    mouth: { kind: 'line', d: 'M186 282 q14 9 28 0' },
    hands: ['translate(90,272) rotate(-6)', 'translate(310,272) rotate(6) scale(-1,1)'],
  },
};

/**
 * The float, and the whole of the animation budget — the sheet's `.float`,
 * verbatim: 5.2s, translateY only, 9 user units.
 *
 * It is applied to an inner `<g>` rather than the `<svg>`, which is both what
 * the sheet does and what makes `-9px` mean 9 user units, so the amplitude
 * scales with `size` instead of getting louder as he gets smaller. Nothing
 * here animates a filter: the shadow's blur is static and the shadow rides
 * along with him inside this group, exactly as it does in the sheet.
 *
 * The keyframes travel with the component rather than living in an app
 * stylesheet, so importing it into a new surface needs no CSS setup;
 * duplicate copies of an identical rule cost nothing, and at most one Chappi
 * belongs on a screen anyway.
 */
const FLOAT_CSS = `
.chappi-float{animation:chappi-float 5.2s ease-in-out infinite}
@keyframes chappi-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
@media (prefers-reduced-motion:reduce){.chappi-float{animation:none}}
`;

export type ChappiProps = {
  pose?: ChappiPose;
  /** Rendered WIDTH in pixels; height follows the sheet's box. Clamped up to 64. */
  size?: number;
  /** The gentle float. Static under prefers-reduced-motion regardless. */
  animate?: boolean;
  /**
   * Set this ONLY when he stands for assistant state, e.g. "UrgAns is
   * thinking". Left off he is decoration and is hidden from screen readers.
   */
  ariaLabel?: string;
  className?: string;
};

export function Chappi({
  pose = 'idle',
  size = DEFAULT_SIZE,
  animate = true,
  ariaLabel,
  className = '',
}: ChappiProps) {
  const width = Math.max(CHAPPI_MIN_SIZE, Math.round(size));
  const height = Math.round((width * CHAPPI_VIEW_BOX.height) / CHAPPI_VIEW_BOX.width);
  const { eyes, mouth, hands } = POSES[pose] ?? POSES.idle;
  const labelled = Boolean(ariaLabel);
  // Hoisted so the catchlights narrow inside the map below.
  const glint = eyes.kind === 'open' ? eyes.glint : undefined;
  // The shadow's blur is a real SVG filter, so it needs an id — and the id has
  // to be per instance. A shared literal would work until the FIRST instance
  // unmounted, at which point every later one would silently lose its blur and
  // harden into a black ellipse; two Chappis are in the DOM at once wherever
  // this repo splits mobile and desktop branches by CSS. This is the only
  // reason the component is a client component.
  const instanceId = useId();
  const softId = `${instanceId}-soft`;

  return (
    <svg
      // Both dimensions are set, so his box is reserved before a single path
      // paints and mounting him shifts nothing around it.
      width={width}
      height={height}
      viewBox={`${CHAPPI_VIEW_BOX.x} ${CHAPPI_VIEW_BOX.y} ${CHAPPI_VIEW_BOX.width} ${CHAPPI_VIEW_BOX.height}`}
      xmlns="http://www.w3.org/2000/svg"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? ariaLabel : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      // Carries pointing's raised hand, which reaches past every box the sheet
      // itself draws. See CHAPPI_VIEW_BOX.
      style={{ overflow: 'visible' }}
      className={`block shrink-0 ${className}`.trim()}
    >
      <style>{FLOAT_CSS}</style>
      <defs>
        <filter id={softId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <g className={animate ? 'chappi-float' : undefined}>
        {/* He hovers. One shadow ellipse drops him onto any surface. */}
        <ellipse cx="200" cy="372" rx="76" ry="13" fill="#000" opacity="0.45" filter={`url(#${softId})`} />

        {/* Hood: flat cream fill, uniform ink outline. No gradients anywhere —
            depth comes from the outline, not shading. */}
        <path d={HOOD} fill={CREAM} stroke={INK} strokeWidth={OUTLINE_WEIGHT} strokeLinejoin="round" />

        {/* Ink cap and its widow's peak. */}
        <path
          d={HOOD_CAP}
          fill={INK}
          stroke={INK}
          strokeWidth={OUTLINE_WEIGHT}
          strokeLinejoin="round"
        />
        <g fill="none" stroke={SPRING} strokeWidth={3.4} strokeLinecap="round">
          {HIGHLIGHTS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>

        {/* Ear cups. They read as headphones at a glance. */}
        {EAR_CUPS.map((cx) => (
          <circle
            key={`cup-${cx}`}
            cx={cx}
            cy={EAR_CY}
            r={EAR_R}
            fill={INK}
            stroke={INK}
            strokeWidth={OUTLINE_WEIGHT}
          />
        ))}
        {EAR_CUPS.map((cx) => (
          <circle
            key={`ring-${cx}`}
            cx={cx}
            cy={EAR_CY}
            r={EAR_RING_R}
            fill="none"
            stroke={SPRING}
            strokeWidth={4}
          />
        ))}

        {/* Face reads first. Eyes and mouth are always ink, never tinted and
            never outlined twice. */}
        {eyes.kind === 'open' ? (
          <>
            {eyes.cx.map((cx) => (
              <ellipse key={`eye-${cx}`} cx={cx} cy={eyes.cy} rx={eyes.rx} ry={eyes.ry} fill={INK} />
            ))}
            {glint
              ? glint.cx.map((cx) => (
                  <circle key={`glint-${cx}`} cx={cx} cy={glint.cy} r={glint.r} fill={CREAM} />
                ))
              : null}
          </>
        ) : (
          <g fill="none" stroke={INK} strokeWidth={MOUTH_WEIGHT} strokeLinecap="round">
            {eyes.d.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        )}

        {mouth.kind === 'line' ? (
          <path
            d={mouth.d}
            fill="none"
            stroke={INK}
            strokeWidth={MOUTH_WEIGHT}
            strokeLinecap="round"
          />
        ) : (
          <path d={mouth.d} fill={INK} />
        )}

        {/* Hands last, so they sit over the body. */}
        {hands.map((transform) => (
          <g key={transform} transform={transform}>
            <path
              d={MITTEN}
              fill={CREAM}
              stroke={INK}
              strokeWidth={6.5}
              strokeLinejoin="round"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * Chappi — the mascot, and the face of UrgAns.
 *
 * The geometry here is not a redraw. Every number was lifted out of the
 * Chappi character model sheet (Draft 01, Aug 2026) and is in that file's own
 * authoring coordinates on its 400x400 canvas, so the proportions the sheet
 * states hold exactly:
 *
 *   H (hood width, the widest point) = 274 - 126 = 148
 *   body, crown to tip  1.70 H = 251.6   -> 338 - 86 = 252
 *   ear cup diameter    0.31 H = 45.9    -> r 23
 *   outline weight      0.047 H = 6.96   -> 7, uniform, never thick and thin
 *   mouth stroke        0.054 H = 7.99   -> 8
 *   mouth line          77% of body      -> 86 + 0.77 * 252 = 280
 *
 * Do not restyle him and do not add to his design. A seventh pose needs a
 * reason. If the sheet is revised, re-derive these paths from it rather than
 * nudging numbers here.
 *
 * The body is identical in all six poses — only the eyes, the mouth and the
 * two hands move. That is why POSES below carries nothing else: a pose that
 * needed to change the hood would not be a pose.
 */

export const CHAPPI_POSES = [
  'idle',
  'pointing',
  'thinking',
  'celebrating',
  'carrying',
  'resting',
] as const;

export type ChappiPose = (typeof CHAPPI_POSES)[number];

/**
 * Fixed, never themed. Ink, cream and spring are the only colours that ever
 * touch him; forest is for the surface BEHIND him and never on him — which is
 * what CHAPPI_GLOW is for.
 */
export const CHAPPI_COLORS = {
  ink: '#0D120E',
  cream: '#F5F0E6',
  spring: '#7FD99A',
  forest: '#14643A',
} as const;

const INK = CHAPPI_COLORS.ink;
const CREAM = CHAPPI_COLORS.cream;
const SPRING = CHAPPI_COLORS.spring;

/**
 * The radial forest glow the sheet puts behind him on dark surfaces, so his
 * ink hood separates from the background. Goes on the CONTAINER as a
 * `background` — never on the character.
 */
export const CHAPPI_GLOW = `radial-gradient(circle at 50% 45%, ${CHAPPI_COLORS.forest} 0%, transparent 70%)`;

/** Below this he stops reading, so `size` is clamped up to it. */
export const CHAPPI_MIN_SIZE = 64;

const DEFAULT_SIZE = 96;

// ---------------------------------------------------------------------------
// The body. Shared by every pose, drawn in paint order.
// ---------------------------------------------------------------------------

/** Hood silhouette: crown, shoulders, tapered base. No legs. */
const HOOD =
  'M200 86C252 86 274 126 274 172C274 224 250 272 218 314C210 325 204 333 200 338C196 333 190 325 182 314C150 272 126 224 126 172C126 126 148 86 200 86Z';

/** The ink cap, whose widow's peak frames the eyes and keeps the face bright. */
const HOOD_CAP =
  'M126 172C126 126 148 86 200 86C252 86 274 126 274 172C250 179 224 189 200 201C176 189 150 179 126 172Z';

/** Three spring marks on the cap. */
const HIGHLIGHTS = [
  'M152 128C165.33 117.33 180 113 196 115',
  'M232 106C248 111.33 258 120.67 262 134',
  'M164 152L188 152L199 139',
] as const;

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
  /** An open mouth is a filled shape, not a thick stroke. */
  | { kind: 'open'; d: string };

type PoseSpec = {
  eyes: Eyes;
  mouth: Mouth;
  /** [left, right] as the viewer sees them. */
  hands: readonly [string, string];
};

/** The smile and the round eyes that idle, pointing and carrying share. */
const OPEN_EYES = (cx: readonly [number, number], glintCx: readonly [number, number]): Eyes => ({
  kind: 'open',
  cx,
  cy: 232,
  rx: 17,
  ry: 21,
  glint: { cx: glintCx, cy: 224, r: 5.5 },
});

const SMILE = 'M177 279C192.33 293.67 207.67 293.67 223 279';

const POSES: Record<ChappiPose, PoseSpec> = {
  // Default. Corners, footers, avatars. Hands rest either side of the body.
  idle: {
    eyes: OPEN_EYES([172, 228], [178, 234]),
    mouth: { kind: 'line', d: SMILE },
    hands: [
      'M105.97 246.7C118.12 246.16 125.51 256.86 126.25 269.99C127 283.12 118.88 293.02 106.73 293.56C96.53 293.69 87.25 288.5 84.19 278.93C81.34 270.33 82.62 261.88 88.28 259.66C92.96 257.64 96.73 260.93 97.76 265.82C97.29 258.77 97.93 247.38 105.97 246.7Z',
      'M294.03 246.7C281.88 246.16 274.49 256.86 273.75 269.99C273 283.12 281.12 293.02 293.27 293.56C303.47 293.69 312.75 288.5 315.81 278.93C318.66 270.33 317.38 261.88 311.72 259.66C307.04 257.64 303.27 260.93 302.23 265.82C302.71 258.77 302.06 247.38 294.03 246.7Z',
    ],
  },
  // Next to a feature, a price, a date. Eyes track the raised hand, so they
  // sit 4 units right of idle.
  pointing: {
    eyes: OPEN_EYES([176, 232], [183, 239]),
    mouth: { kind: 'line', d: SMILE },
    hands: [
      'M122.13 266.8C134.29 267.11 140.91 278.29 140.74 291.44C140.57 304.6 131.78 313.91 119.61 313.6C109.43 313.01 100.54 307.19 98.16 297.43C95.91 288.66 97.77 280.32 103.57 278.49C108.38 276.81 111.91 280.35 112.61 285.3C112.62 278.23 114.06 266.92 122.13 266.8Z',
      'M314.92 194.73C305.26 202.13 306.48 215.08 314.35 225.61C322.22 236.15 334.81 238.52 344.46 231.12C352.35 224.66 356.13 214.73 352.32 205.43C348.98 197.01 342.57 191.36 336.8 193.29C331.92 194.75 331.15 199.69 333.5 204.11C329.33 198.4 321.51 190.09 314.92 194.73Z',
    ],
  },
  // Loading states. Narrowed eyes, a level mouth, one hand up at the chin.
  thinking: {
    eyes: { kind: 'open', cx: [172, 228], cy: 234, rx: 17, ry: 12 },
    mouth: { kind: 'line', d: 'M186 285C195.33 280.33 204.67 280.33 214 285' },
    hands: [
      'M110.06 261.74C122.23 261.63 129.24 272.58 129.53 285.73C129.81 298.88 121.35 308.49 109.19 308.61C98.99 308.38 89.9 302.87 87.18 293.2C84.63 284.51 86.2 276.11 91.93 274.08C96.68 272.23 100.33 275.65 101.2 280.57C100.97 273.5 102.01 262.15 110.06 261.74Z',
      'M243.06 245.54C231.18 242.9 222.05 252.16 219.04 264.96C216.02 277.76 222.3 288.92 234.17 291.56C244.19 293.46 254.23 289.96 258.91 281.07C263.21 273.1 263.42 264.55 258.23 261.38C253.97 258.58 249.69 261.16 247.82 265.8C249.51 258.94 250.85 247.61 243.06 245.54Z',
    ],
  },
  // Release delivered. Both hands up, eyes shut upward, mouth open.
  celebrating: {
    eyes: {
      kind: 'shut',
      d: [
        'M155 238C166.33 222 177.67 222 189 238',
        'M211 238C222.33 222 233.67 222 245 238',
      ],
    },
    mouth: {
      kind: 'open',
      d: 'M177 274C192.33 271.33 207.67 271.33 223 274C220.33 294.67 212.67 305 200 305C187.33 305 179.67 294.67 177 274Z',
    },
    hands: [
      'M95.49 131.89C106.17 126.08 117.5 132.46 123.93 143.94C130.36 155.41 127.4 167.87 116.72 173.68C107.6 178.26 96.99 177.67 90.05 170.41C83.72 163.93 81.16 155.78 85.27 151.3C88.59 147.43 93.42 148.74 96.5 152.68C92.98 146.55 88.57 136.03 95.49 131.89Z',
      'M304.51 131.89C293.82 126.08 282.5 132.46 276.07 143.94C269.64 155.41 272.6 167.87 283.28 173.68C292.4 178.26 303.01 177.67 309.95 170.41C316.28 163.93 318.84 155.78 314.73 151.3C311.41 147.43 306.58 148.74 303.5 152.68C307.02 146.55 311.43 136.03 304.51 131.89Z',
    ],
  },
  // Holding a plan, a file, a card. Hands drop low and close in, leaving the
  // gap the held object goes in — the object is drawn per graphic, not here.
  carrying: {
    eyes: OPEN_EYES([172, 228], [178, 234]),
    mouth: { kind: 'line', d: SMILE },
    hands: [
      'M142.14 300.9C154.25 302.06 160.07 313.68 158.98 326.79C157.89 339.9 148.48 348.57 136.37 347.42C126.25 346.12 117.78 339.69 116.09 329.79C114.46 320.88 116.9 312.69 122.81 311.27C127.73 309.93 131 313.71 131.35 318.7C131.86 311.64 134.09 300.46 142.14 300.9Z',
      'M257.86 300.9C245.75 302.06 239.93 313.68 241.02 326.79C242.1 339.9 251.52 348.57 263.63 347.42C273.75 346.12 282.22 339.69 283.91 329.79C285.54 320.88 283.1 312.69 277.19 311.27C272.27 309.93 269 313.71 268.65 318.7C268.14 311.64 265.91 300.46 257.86 300.9Z',
    ],
  },
  // Empty states. Eyes and mouth both shut, hands tucked in.
  resting: {
    eyes: {
      kind: 'shut',
      d: [
        'M155 228C166.33 241.33 177.67 241.33 189 228',
        'M211 228C222.33 241.33 233.67 241.33 245 228',
      ],
    },
    mouth: { kind: 'line', d: 'M186 282C195.33 288 204.67 288 214 282' },
    hands: [
      'M120.15 271.85C132.29 272.58 138.52 283.99 137.89 297.13C137.26 310.27 128.15 319.27 116.01 318.54C105.85 317.59 97.16 311.47 95.12 301.63C93.19 292.78 95.34 284.51 101.2 282.89C106.07 281.37 109.47 285.04 109.99 290.01C110.25 282.94 112.09 271.69 120.15 271.85Z',
      'M279.85 271.85C267.71 272.58 261.48 283.99 262.11 297.13C262.74 310.27 271.85 319.27 283.99 318.54C294.15 317.59 302.83 311.47 304.87 301.63C306.81 292.78 304.66 284.51 298.8 282.89C293.93 281.37 290.53 285.04 290.01 290.01C289.74 282.94 287.91 271.69 279.85 271.85Z',
    ],
  },
};

/**
 * The float, and the whole of the animation budget.
 *
 * Transform only, per the sheet — nothing here animates a filter, and the
 * amplitude is a percentage of his own box so it scales with `size` instead
 * of getting louder as he gets smaller. The keyframes travel with the
 * component rather than living in an app stylesheet, so importing it into a
 * new surface needs no CSS setup; duplicate copies of an identical rule cost
 * nothing and at most one Chappi belongs on a screen anyway.
 */
const FLOAT_CSS = `
.chappi-float{animation:chappi-float 5s ease-in-out infinite}
@keyframes chappi-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3%)}}
@media (prefers-reduced-motion:reduce){.chappi-float{animation:none}}
`;

export type ChappiProps = {
  pose?: ChappiPose;
  /** Rendered width in pixels; his box is square. Clamped up to 64. */
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
  const box = Math.max(CHAPPI_MIN_SIZE, Math.round(size));
  const { eyes, mouth, hands } = POSES[pose] ?? POSES.idle;
  const labelled = Boolean(ariaLabel);
  // Hoisted so the catchlights narrow inside the map below.
  const glint = eyes.kind === 'open' ? eyes.glint : undefined;

  return (
    <svg
      // Width and height are both set, so his box is reserved before a single
      // path paints and mounting him shifts nothing around it.
      width={box}
      height={box}
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? ariaLabel : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      className={`${animate ? 'chappi-float ' : ''}block shrink-0 ${className}`.trim()}
    >
      <style>{FLOAT_CSS}</style>

      {/* Hood: flat cream fill, then the uniform ink outline over it. */}
      <path d={HOOD} fill={CREAM} />
      <path
        d={HOOD}
        fill="none"
        stroke={INK}
        strokeWidth={OUTLINE_WEIGHT}
        strokeLinejoin="round"
      />

      {/* Ink cap and its widow's peak. */}
      <path d={HOOD_CAP} fill={INK} />
      <path
        d={HOOD_CAP}
        fill="none"
        stroke={INK}
        strokeWidth={OUTLINE_WEIGHT}
        strokeLinejoin="round"
      />
      <g fill="none" stroke={SPRING} strokeWidth={3.4} strokeLinecap="round">
        {HIGHLIGHTS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      {/* Ear cups, then their spring rings. */}
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

      {/* Face. Always ink, never tinted and never outlined twice. */}
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
      {hands.map((d) => (
        <g key={d}>
          <path d={d} fill={CREAM} />
          <path d={d} fill="none" stroke={INK} strokeWidth={6.5} strokeLinejoin="round" />
        </g>
      ))}
    </svg>
  );
}

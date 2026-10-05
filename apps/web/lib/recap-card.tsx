import type { ReactElement } from 'react';
import {
  RECAP_EYEBROW,
  RECAP_NO_DATE_LABEL,
  RECAP_WATERMARK,
  type RecapCardSize,
  sanitizeRecapText,
  titleFontSize,
  truncateTitle,
} from './recap-copy';
import type { RecapStatLine } from './recap-stats';

// The recap poster. Rendered by satori (via next/og), so this JSX is limited to
// flex layout and inline styles: no CSS classes, no grid, no percentage-free
// shorthand. Every element that holds more than one child declares display flex
// explicitly, because satori requires it.
//
// Urganize Brand Bible (URG.001): cream ground, ink type, forest and spring as
// the only accents. Sharp corners, no shadows, no gradients, big type and a lot
// of air. This should read as a designed poster, not a stats dashboard.

const INK = '#0D120E';
const FOREST = '#14643A';
const SPRING = '#7FD99A';
const CREAM = '#F5F0E6';

const FRAUNCES = 'Young Serif';
const GROTESK = 'Space Grotesk';
const MONO = 'Space Mono';

export type RecapCardProps = {
  size: RecapCardSize;
  title: string;
  artistName: string;
  /** Formatted display date, or null when the release has no date set. */
  releaseDateLabel: string | null;
  stats: RecapStatLine[];
  highlight: string | null;
};

type Metrics = {
  pad: number;
  eyebrow: number;
  rule: number;
  artist: number;
  statValue: number;
  statLabel: number;
  statGap: number;
  highlight: number;
  watermark: number;
  blockGap: number;
};

const METRICS: Record<RecapCardSize, Metrics> = {
  story: {
    pad: 96,
    eyebrow: 28,
    rule: 6,
    artist: 44,
    statValue: 88,
    statLabel: 26,
    statGap: 44,
    highlight: 40,
    watermark: 24,
    blockGap: 72,
  },
  square: {
    pad: 72,
    eyebrow: 22,
    rule: 5,
    artist: 34,
    statValue: 60,
    statLabel: 20,
    statGap: 26,
    highlight: 30,
    watermark: 20,
    blockGap: 40,
  },
};

export const RECAP_CARD_DIMENSIONS: Record<RecapCardSize, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

function StatBlock({ stat, metrics, width }: { stat: RecapStatLine; metrics: Metrics; width?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        ...(width ? { width } : {}),
      }}
    >
      <div
        style={{
          fontFamily: FRAUNCES,
          fontWeight: 600,
          fontSize: metrics.statValue,
          lineHeight: 1,
          color: INK,
        }}
      >
        {stat.value}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: metrics.statLabel,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: FOREST,
          marginTop: Math.round(metrics.statLabel * 0.5),
        }}
      >
        {stat.label}
      </div>
    </div>
  );
}

export function renderRecapCard({
  size,
  title,
  artistName,
  releaseDateLabel,
  stats,
  highlight,
}: RecapCardProps): ReactElement {
  const metrics = METRICS[size];
  const { width, height } = RECAP_CARD_DIMENSIONS[size];

  const safeTitle = truncateTitle(sanitizeRecapText(title) || 'Untitled release');
  const safeArtist = sanitizeRecapText(artistName);
  const safeHighlight = highlight ? sanitizeRecapText(highlight) : '';

  // With nothing to count (a released date with no tasks on the release at
  // all), the card becomes an announcement poster rather than a stats sheet:
  // the title takes the space the numbers would have used, and the release day
  // is restated large so the composition has a second anchor. A recap must
  // never render an empty slot, a zero, or a canvas of dead space.
  const hasStats = stats.length > 0;

  // How much sits BELOW the headline decides how big the headline gets. The
  // story canvas is 1920px tall, and a release carrying one stat and no
  // highlight left its bottom half empty, which reads as a broken card rather
  // than a quiet one. Letting the headline take the space the missing content
  // would have used keeps every combination looking composed.
  //
  // Only short titles grow: a 60-character title is already filling the canvas
  // at its base size, and scaling it up would run it past three lines.
  const contentWeight = stats.length + (safeHighlight ? 1 : 0);
  const canGrowHeadline = safeTitle.length <= 24;
  const headlineScale = !canGrowHeadline
    ? 1
    : contentWeight === 0
      ? size === 'story'
        ? 1.7
        : 1.4
      : contentWeight <= 2
        ? size === 'story'
          ? 1.35
          : 1.15
        : 1;
  const headlineSize = Math.round(titleFontSize(safeTitle, size) * headlineScale);

  // Square is a much shorter canvas, so more than three stats go two-up rather
  // than squeezing the line height down.
  const twoColumn = size === 'square' && stats.length > 3;

  // The date anchor always carries a card with no stats. On the tall story
  // canvas it also fills the sparse cases; square is short enough that one or
  // two stats already sit comfortably.
  const showDateAnchor = size === 'story' ? contentWeight <= 2 : contentWeight === 0;

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: CREAM,
        padding: metrics.pad,
        fontFamily: GROTESK,
      }}
    >
      {/* Top: eyebrow row over a spring rule */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontFamily: MONO,
            fontSize: metrics.eyebrow,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: FOREST,
          }}
        >
          <span>{RECAP_EYEBROW}</span>
          <span>{releaseDateLabel ?? RECAP_NO_DATE_LABEL}</span>
        </div>
        <div
          style={{
            display: 'flex',
            height: metrics.rule,
            backgroundColor: SPRING,
            marginTop: Math.round(metrics.eyebrow * 0.8),
          }}
        />
      </div>

      {/* Middle: headline + artist, then the stats.
          Top-anchored under the rule rather than vertically centered. Centering
          split the leftover height into two large equal voids above and below,
          which read as a half-empty document; anchoring puts one deliberate gap
          under the rule and collects all remaining slack at the bottom, above
          the mark, where a poster wants it. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          paddingTop: Math.round(metrics.blockGap * 1.6),
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontFamily: FRAUNCES,
              fontWeight: 600,
              fontSize: headlineSize,
              lineHeight: 1.02,
              color: INK,
              // satori honors lineClamp; the copy layer has already hard capped
              // the string, so this only guards an unusually wide glyph run.
              display: 'block',
              lineClamp: 3,
            }}
          >
            {safeTitle}
          </div>
          {safeArtist ? (
            <div
              style={{
                fontFamily: GROTESK,
                fontWeight: 500,
                fontSize: metrics.artist,
                color: FOREST,
                marginTop: Math.round(metrics.artist * 0.6),
              }}
            >
              {safeArtist}
            </div>
          ) : null}
        </div>

        {hasStats ? (
          <div
            style={{
              display: 'flex',
              flexDirection: twoColumn ? 'row' : 'column',
              flexWrap: twoColumn ? 'wrap' : 'nowrap',
              marginTop: metrics.blockGap,
              // Fixed gaps, deliberately NOT flexGrow + space-between: letting
              // the column absorb the canvas's leftover height pushed related
              // stats so far apart they stopped reading as one block, and left
              // the last label touching the highlight. The slack belongs as one
              // quiet band above the mark instead.
              ...(twoColumn ? { rowGap: metrics.statGap } : { gap: metrics.statGap }),
            }}
          >
            {stats.map((stat) => (
              <StatBlock
                key={stat.key}
                stat={stat}
                metrics={metrics}
                width={twoColumn ? '50%' : undefined}
              />
            ))}
          </div>
        ) : null}

        {showDateAnchor ? (
          // Release day restated large, as a second anchor low in the
          // composition. It carries the whole announcement poster when there
          // are no stats at all, and on the tall story canvas it also rescues
          // the sparse case: one stat and no highlight otherwise leaves the
          // bottom half of 1920px empty. Repeating the date from the eyebrow is
          // deliberate, the way a printed poster restates its headline act.
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: metrics.blockGap,
            }}
          >
            <div
              style={{
                display: 'flex',
                width: Math.round(metrics.statValue * 1.4),
                height: metrics.rule,
                backgroundColor: SPRING,
                marginBottom: Math.round(metrics.statValue * 0.45),
              }}
            />
            <div
              style={{
                fontFamily: FRAUNCES,
                fontWeight: 600,
                fontSize: Math.round(metrics.statValue * 0.72),
                lineHeight: 1.1,
                color: FOREST,
              }}
            >
              {releaseDateLabel ? `Out ${releaseDateLabel}` : RECAP_NO_DATE_LABEL}
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom: optional highlight, then the mark */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {safeHighlight ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              marginBottom: metrics.blockGap,
            }}
          >
            <div
              style={{
                display: 'flex',
                width: Math.round(metrics.highlight),
                height: Math.round(metrics.highlight),
                backgroundColor: SPRING,
                marginRight: Math.round(metrics.highlight * 0.7),
                marginTop: Math.round(metrics.highlight * 0.25),
                flexShrink: 0,
              }}
            />
            <div
              style={{
                fontFamily: GROTESK,
                fontSize: metrics.highlight,
                lineHeight: 1.35,
                color: INK,
                display: 'block',
                lineClamp: 3,
              }}
            >
              {safeHighlight}
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            fontFamily: MONO,
            fontSize: metrics.watermark,
            letterSpacing: 2,
            color: INK,
          }}
        >
          {RECAP_WATERMARK}
        </div>
      </div>
    </div>
  );
}

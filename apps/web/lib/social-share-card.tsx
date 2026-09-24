import type { ReactElement } from 'react';
import { sanitizeRecapText } from './recap-copy';
import {
  SHARE_FORMAT_DIMENSIONS,
  SHARE_WATERMARK,
  shareAnchorSize,
  shareEyebrow,
  shareTimingAnchor,
  shareTimingEyebrow,
  shareTitleSize,
  stripEmoji,
  type ShareFormat,
  type ShareTiming,
} from './social-share';
import type { DbReleaseType } from '@/types/releases';

// The share posters: an Instagram post (1080x1350) and a WhatsApp status
// (1080x1920), each in two layouts, with the cover art or with type alone.
//
// Rendered by satori through next/og, so this is flex layout and inline styles
// only. Every element holding more than one child declares display flex, and a
// clamped text block declares display block, because satori requires both.
//
// Urganize Brand Bible (URG.001), screen mode: cream type on the ink ground,
// which is the bible's approved combination for social. Spring green is the one
// accent. Sharp corners, no shadows, no gradients. The recap card is the paper
// mode sibling (cream ground); a fan who sees both should read them as one
// family: same fonts, same catalog eyebrow, same quiet mark.

const INK = '#0D120E';
const SPRING = '#7FD99A';
const CREAM = '#F5F0E6';
const CREAM_MUTED = 'rgba(245, 240, 230, 0.66)';
const CREAM_FAINT = 'rgba(245, 240, 230, 0.44)';

const FRAUNCES = 'Fraunces';
const GROTESK = 'Space Grotesk';
const MONO = 'Space Mono';

export type ShareCardProps = {
  format: ShareFormat;
  releaseType: DbReleaseType;
  /** The display title, or null when the rollout has no real name yet. */
  title: string | null;
  artistName: string;
  timing: ShareTiming;
  extraLine: string;
  /** A data: URL, or null to draw the typographic poster. */
  coverArtDataUrl: string | null;
};

/** The page's own text, cleaned the way every dynamic poster string is. */
function clean(value: string): string {
  return sanitizeRecapText(stripEmoji(value));
}

type Metrics = {
  padTop: number;
  padBottom: number;
  padSide: number;
  eyebrow: number;
  eyebrowGap: number;
  rule: number;
  headlineGap: number;
  artist: number;
  extra: number;
  mark: number;
};

// The status canvas keeps its top 200px and bottom 220px clear of anything
// that matters: WhatsApp and Instagram both draw the progress bar, the name
// and the reply box over those bands. A post has no overlays, so it gets an
// even margin. Instagram's profile grid crops a 4:5 post to 3:4 from the
// centre, which takes about 34px off each side, well inside the side margin.
const METRICS: Record<ShareFormat, Metrics> = {
  post: {
    padTop: 88,
    padBottom: 88,
    padSide: 88,
    eyebrow: 26,
    eyebrowGap: 22,
    rule: 6,
    headlineGap: 120,
    artist: 46,
    extra: 36,
    mark: 22,
  },
  status: {
    padTop: 200,
    padBottom: 220,
    padSide: 96,
    eyebrow: 30,
    eyebrowGap: 26,
    rule: 7,
    headlineGap: 160,
    artist: 58,
    extra: 44,
    mark: 26,
  },
};

function EyebrowRow({
  left,
  right,
  size,
}: {
  left: string;
  right: string;
  size: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        fontFamily: MONO,
        fontSize: size,
        letterSpacing: Math.round(size * 0.18),
      }}
    >
      <span style={{ color: SPRING }}>{left}</span>
      <span style={{ color: CREAM_MUTED }}>{right}</span>
    </div>
  );
}

function Mark({ size, marginTop = 0 }: { size: number; marginTop?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: MONO,
        fontSize: size,
        letterSpacing: 2,
        color: CREAM_FAINT,
        marginTop,
      }}
    >
      {SHARE_WATERMARK}
    </div>
  );
}

function ExtraLine({ text, size, marginBottom }: { text: string; size: number; marginBottom: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom }}>
      <div
        style={{
          display: 'flex',
          width: Math.round(size * 0.78),
          height: Math.round(size * 0.78),
          backgroundColor: SPRING,
          marginRight: Math.round(size * 0.6),
          marginTop: Math.round(size * 0.24),
          flexShrink: 0,
        }}
      />
      <div
        style={{
          display: 'block',
          lineClamp: 2,
          fontFamily: GROTESK,
          fontSize: size,
          lineHeight: 1.3,
          color: CREAM,
        }}
      >
        {text}
      </div>
    </div>
  );
}

/**
 * The headline and the line under it. With no real title the artist becomes
 * the headline rather than printing our placeholder, and with neither there is
 * still something worth a poster: the eyebrow already says what kind of
 * release it is.
 */
function resolveHeadline(title: string | null, artistName: string): { headline: string; byline: string } {
  const safeTitle = title ? clean(title) : '';
  const safeArtist = clean(artistName);
  if (safeTitle) return { headline: safeTitle, byline: safeArtist };
  if (safeArtist) return { headline: safeArtist, byline: '' };
  return { headline: 'New music', byline: '' };
}

function TypographicPoster(props: ShareCardProps): ReactElement {
  const metrics = METRICS[props.format];
  const { width, height } = SHARE_FORMAT_DIMENSIONS[props.format];
  const { headline, byline } = resolveHeadline(props.title, props.artistName);
  const extra = clean(props.extraLine);
  // Little else on the poster: let a short headline take the room the byline
  // and the extra line would have used, still capped so its longest word fits.
  const sparse = !byline && !extra;
  const titleSize = shareTitleSize(headline, props.format, false, sparse ? 1.3 : 1);
  const anchor = shareTimingAnchor(props.timing);

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: INK,
        paddingTop: metrics.padTop,
        paddingBottom: metrics.padBottom,
        paddingLeft: metrics.padSide,
        paddingRight: metrics.padSide,
        fontFamily: GROTESK,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <EyebrowRow
          left={shareEyebrow(props.releaseType)}
          right={shareTimingEyebrow(props.timing)}
          size={metrics.eyebrow}
        />
        <div
          style={{
            display: 'flex',
            height: metrics.rule,
            backgroundColor: SPRING,
            marginTop: metrics.eyebrowGap,
          }}
        />
      </div>

      {/* Top-anchored under the rule, the recap's lesson: centring splits the
          slack into two voids and reads as half empty. All the leftover height
          collects in one quiet band above the date instead. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          paddingTop: metrics.headlineGap,
        }}
      >
        <div
          style={{
            display: 'block',
            lineClamp: props.format === 'status' ? 4 : 3,
            fontFamily: FRAUNCES,
            fontWeight: 600,
            fontSize: titleSize,
            wordBreak: 'break-word',
            lineHeight: 1.0,
            color: CREAM,
          }}
        >
          {headline}
        </div>
        {byline ? (
          <div
            style={{
              display: 'flex',
              fontFamily: GROTESK,
              fontWeight: 500,
              fontSize: metrics.artist,
              color: SPRING,
              marginTop: Math.round(metrics.artist * 0.6),
            }}
          >
            {byline}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {extra ? (
          <ExtraLine text={extra} size={metrics.extra} marginBottom={Math.round(metrics.extra * 1.25)} />
        ) : null}
        <div
          style={{
            display: 'flex',
            fontFamily: FRAUNCES,
            fontWeight: 600,
            fontSize: shareAnchorSize(anchor, props.format),
            lineHeight: 1.05,
            color: SPRING,
          }}
        >
          {anchor}
        </div>
        <Mark size={metrics.mark} marginTop={Math.round(metrics.mark * 1.6)} />
      </div>
    </div>
  );
}

/**
 * The Instagram post with cover art: the art full bleed across the top square,
 * which is exactly what the profile grid will show, and a band of type under
 * it. The extra line is left off both cover layouts on purpose. The art takes
 * that space, and the line is in the caption and the message either way.
 */
function CoverPost(props: ShareCardProps & { coverArtDataUrl: string }): ReactElement {
  const { width, height } = SHARE_FORMAT_DIMENSIONS.post;
  const { headline, byline } = resolveHeadline(props.title, props.artistName);
  const band = height - width;
  const titleSize = shareTitleSize(headline, 'post', true);

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: INK,
        fontFamily: GROTESK,
      }}
    >
      {/* satori draws a plain img; next/image does not exist inside an image response. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={props.coverArtDataUrl}
        width={width}
        height={width}
        alt=""
        style={{ width, height: width, objectFit: 'cover', flexShrink: 0 }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: band,
          paddingTop: 42,
          paddingBottom: 42,
          paddingLeft: 56,
          paddingRight: 56,
        }}
      >
        <EyebrowRow
          left={shareEyebrow(props.releaseType)}
          right={shareTimingEyebrow(props.timing)}
          size={22}
        />
        <div
          style={{
            display: 'block',
            lineClamp: 1,
            fontFamily: FRAUNCES,
            fontWeight: 600,
            fontSize: titleSize,
            wordBreak: 'break-word',
            lineHeight: 1.05,
            color: CREAM,
          }}
        >
          {headline}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div
            style={{
              display: 'flex',
              fontFamily: GROTESK,
              fontWeight: 500,
              fontSize: 30,
              color: SPRING,
            }}
          >
            {byline || ' '}
          </div>
          <Mark size={18} />
        </div>
      </div>
    </div>
  );
}

function CoverStatus(props: ShareCardProps & { coverArtDataUrl: string }): ReactElement {
  const metrics = METRICS.status;
  const { width, height } = SHARE_FORMAT_DIMENSIONS.status;
  const { headline, byline } = resolveHeadline(props.title, props.artistName);
  const artSize = width - metrics.padSide * 2;
  const titleSize = shareTitleSize(headline, 'status', true);

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: INK,
        paddingTop: metrics.padTop,
        paddingBottom: metrics.padBottom,
        paddingLeft: metrics.padSide,
        paddingRight: metrics.padSide,
        fontFamily: GROTESK,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <EyebrowRow
          left={shareEyebrow(props.releaseType)}
          right={shareTimingEyebrow(props.timing)}
          size={metrics.eyebrow}
        />
        <div
          style={{
            display: 'flex',
            height: metrics.rule,
            backgroundColor: SPRING,
            marginTop: metrics.eyebrowGap,
          }}
        />
      </div>

      {/* satori draws a plain img; next/image does not exist inside an image response. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={props.coverArtDataUrl}
        width={artSize}
        height={artSize}
        alt=""
        style={{ width: artSize, height: artSize, objectFit: 'cover', marginTop: 56, flexShrink: 0 }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, paddingTop: 48 }}>
        <div
          style={{
            display: 'block',
            lineClamp: 2,
            fontFamily: FRAUNCES,
            fontWeight: 600,
            fontSize: titleSize,
            wordBreak: 'break-word',
            lineHeight: 1.02,
            color: CREAM,
          }}
        >
          {headline}
        </div>
        {byline ? (
          <div
            style={{
              display: 'flex',
              fontFamily: GROTESK,
              fontWeight: 500,
              fontSize: 48,
              color: SPRING,
              marginTop: 16,
            }}
          >
            {byline}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontFamily: FRAUNCES,
            fontWeight: 600,
            fontSize: Math.min(84, shareAnchorSize(shareTimingAnchor(props.timing), 'status')),
            lineHeight: 1.05,
            color: SPRING,
          }}
        >
          {shareTimingAnchor(props.timing)}
        </div>
        <Mark size={metrics.mark} marginTop={26} />
      </div>
    </div>
  );
}

export function renderShareCard(props: ShareCardProps): ReactElement {
  if (props.coverArtDataUrl) {
    const withArt = { ...props, coverArtDataUrl: props.coverArtDataUrl };
    return props.format === 'post' ? CoverPost(withArt) : CoverStatus(withArt);
  }
  return TypographicPoster(props);
}

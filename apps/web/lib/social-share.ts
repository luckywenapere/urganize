import { isDefaultReleaseTitle, type DbReleaseType } from '@/types/releases';

/**
 * Share to socials: the words and the rules behind the things a manager or an
 * artist can send out about a rollout (founder request, 2026-09-23; X and
 * Snapchat added 2026-09-24).
 *
 *   1. An Instagram post: a 4:5 image plus a caption.
 *   2. A WhatsApp status: a 9:16 image plus a short caption. The same image
 *      works as an Instagram story.
 *   3. An X post: the same 4:5 image plus a post that fits in 280 characters
 *      and carries the link, because X makes links tappable.
 *   4. A Snapchat story: the same 9:16 image plus a line for the snap. The
 *      link goes on with Snapchat's own link sticker, not in the text.
 *   5. A message they can DM to anybody, with their own fan link in it.
 *
 * Pure and dependency free on purpose. The share sheet builds the captions in
 * the browser and the share-card route draws the images on the server, and
 * both read the SAME timing rule from here, so the caption and the image can
 * never disagree about whether a song is "out October 3" or "coming soon".
 *
 * Two audiences, two vocabularies. The sheet itself is in-app copy and says
 * "rollout". Everything built here is OUTWARD copy that fans read, so it says
 * "single", "EP" or "album" and never "rollout" or "workspace". A test holds
 * that across every combination of inputs rather than one example.
 *
 * No AI anywhere in it, deliberately: a caption is four facts in a fixed
 * sentence, and a model asked to write one would answer differently every time
 * and could not be tested. The captions are editable in the sheet, which is
 * where a person's own voice belongs.
 */

export { isSocialShareEnabled } from '@/lib/social-share-flag';

export type ShareVoice = 'artist' | 'team';
export type ShareDateMode = 'show' | 'secret';
export type ShareFormat = 'post' | 'status';

/**
 * 4:5 is the tallest feed post Instagram shows uncropped, so it takes the most
 * room on a phone. 9:16 is a full-screen status or story. Both are fixed by
 * where they get posted, so a transposed pair is a real defect; the render
 * test reads the dimensions back out of the PNG.
 */
export const SHARE_FORMAT_DIMENSIONS: Record<ShareFormat, { width: number; height: number }> = {
  post: { width: 1080, height: 1350 },
  status: { width: 1080, height: 1920 },
};

/** The "Anything to add?" field. One line on a poster, so it stays short. */
export const MAX_SHARE_LINE_CHARS = 80;

/** Longer than any pre-save or smart link a distributor hands out. */
export const MAX_FAN_LINK_CHARS = 500;

/**
 * A cover art file bigger than this is left off the image and the poster falls
 * back to type alone. The renderer decodes the whole file to draw it, and a
 * 3000px PNG master can run past 20 MiB; the typographic poster is a designed
 * layout of its own, not a broken one, so skipping is the safe direction.
 */
export const MAX_EMBEDDED_COVER_BYTES = 12 * 1024 * 1024;

export type ShareAnswers = {
  voice: ShareVoice;
  /** Only consulted while the release date is still in the future. */
  dateMode: ShareDateMode;
  /** Normalized by normalizeFanLink; '' when there is none. */
  fanLink: string;
  /** Normalized by normalizeShareLine; '' when there is none. */
  extraLine: string;
};

export type ShareReleaseFacts = {
  title: string;
  artistName: string;
  releaseType: DbReleaseType;
  /** YYYY-MM-DD, or null when no date has been set. */
  releaseDate: string | null;
};

export type ShareTiming =
  | { kind: 'upcoming'; label: string; shortLabel: string }
  | { kind: 'today' }
  | { kind: 'out' }
  | { kind: 'soon' };

/** The artist speaks for themselves; anyone else speaks about the artist. */
export function defaultShareVoice(role: string | null | undefined): ShareVoice {
  return role === 'artist' ? 'artist' : 'team';
}

// ── Links and lines ─────────────────────────────────────────────────────────

const FAN_LINK_ERROR = "That link doesn't look right. Paste the full link, starting with https://";

// A scheme is either "something://" or one of the schemes that carry no
// slashes. Matching a bare "word:" instead would read "example.com:8080" as a
// scheme called "example.com" and refuse a perfectly good link.
const SLASHED_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const BARE_SCHEME = /^(mailto|javascript|vbscript|data|tel|sms|file|blob|about):/i;

/**
 * Accept the link people actually paste. Adds the https:// a lot of links are
 * copied without, and refuses anything that is not a web page: a fan link is
 * pasted into a public message, so `javascript:` or `data:` must never survive
 * it. The value is kept as typed rather than as `URL.href`, which would add a
 * trailing slash nobody wrote.
 */
export function normalizeFanLink(
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { ok: true, value: '' };
  if (trimmed.length > MAX_FAN_LINK_CHARS || /\s/.test(trimmed)) {
    return { ok: false, error: FAN_LINK_ERROR };
  }

  const hasScheme = SLASHED_SCHEME.test(trimmed) || BARE_SCHEME.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: FAN_LINK_ERROR };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: FAN_LINK_ERROR };
  }
  // A real public link has a dot in its host. "lagos" or "localhost" is a
  // word somebody typed into the wrong field, not a page a fan can open.
  if (!url.hostname.includes('.')) {
    return { ok: false, error: FAN_LINK_ERROR };
  }
  return { ok: true, value: candidate };
}

/** One line, however it was typed: spaces and line breaks collapse. */
export function normalizeShareLine(raw: string): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Finish a user's line with a full stop when it ends on a word, so "Featuring
 * Tems" reads as a sentence next to ours. Anything that already ends in
 * punctuation or an emoji is left exactly as they wrote it.
 */
function finishSentence(line: string): string {
  return /[\p{L}\p{N}”’"')]$/u.test(line) ? `${line}.` : line;
}

// ── Dates ───────────────────────────────────────────────────────────────────

type Ymd = { year: number; month: number; day: number };

const YMD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseYmd(value: string | null | undefined): Ymd | null {
  const match = YMD_PATTERN.exec(String(value ?? ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Round trip through a UTC date so 2026-02-30 is refused rather than rolled
  // into March.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function compareYmd(first: Ymd, second: Ymd): number {
  return first.year - second.year || first.month - second.month || first.day - second.day;
}

/**
 * Today as YYYY-MM-DD in the viewer's own timezone. The sheet sends this to
 * the image route, because "is this out today" is a question about the day the
 * person sharing is living in, and the server only knows UTC.
 */
export function toLocalYmd(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The UTC fallback the route uses when the sheet sent no usable `today`. */
export function toUtcYmd(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function monthName(date: Ymd, style: 'long' | 'short'): string {
  // Formatted in UTC from a UTC date, so no timezone can move the day.
  return new Intl.DateTimeFormat('en-US', { month: style, timeZone: 'UTC' }).format(
    new Date(Date.UTC(date.year, date.month - 1, date.day))
  );
}

/**
 * Where the release is in time, from the point of view of the person sharing.
 *
 * A secret date only hides a date that has not arrived yet: once the song is
 * out, "coming soon" would be false, so today and past dates ignore the mode.
 * The year is spelled out only when it is not this year, which is what a
 * person writing the caption by hand would do.
 */
export function describeShareTiming(
  releaseDate: string | null | undefined,
  dateMode: ShareDateMode,
  todayYmd: string | null | undefined
): ShareTiming {
  const release = parseYmd(releaseDate);
  if (!release) return { kind: 'soon' };

  const today = parseYmd(todayYmd);
  if (today) {
    const order = compareYmd(release, today);
    if (order < 0) return { kind: 'out' };
    if (order === 0) return { kind: 'today' };
  }
  if (dateMode === 'secret') return { kind: 'soon' };

  const sameYear = today !== null && today.year === release.year;
  const long = monthName(release, 'long');
  const short = monthName(release, 'short').toUpperCase();
  return {
    kind: 'upcoming',
    label: sameYear ? `${long} ${release.day}` : `${long} ${release.day}, ${release.year}`,
    shortLabel: sameYear ? `${short} ${release.day}` : `${short} ${release.day} ${release.year}`,
  };
}

const isOut = (timing: ShareTiming): boolean => timing.kind === 'today' || timing.kind === 'out';

// ── The sentence every output is built from ─────────────────────────────────

export function releaseNoun(releaseType: DbReleaseType): 'single' | 'EP' | 'album' {
  if (releaseType === 'ep') return 'EP';
  if (releaseType === 'album') return 'album';
  return 'single';
}

// The server default for an untitled release, both before and after the
// 2026-09-09 rename, lives in isDefaultReleaseTitle (types/releases.ts) — one
// list, so the share sheet and the date card cannot disagree about what counts
// as "not named yet". Neither placeholder must ever reach a fan.

/** The title a fan should see, or null when there is no real one yet. */
export function shareDisplayTitle(title: string | null | undefined): string | null {
  if (isDefaultReleaseTitle(title)) return null;
  return String(title ?? '').trim();
}

/**
 * "My new single “Lagos Nights”" or "Dorian’s new single “Lagos Nights”".
 *
 * Always ’s, including after a name ending in s ("Tems’s"), which is the
 * founder's own example and the modern house style. Typographic quotes and
 * apostrophes throughout, because these are sentences somebody publishes.
 */
export function buildShareHeadline(facts: ShareReleaseFacts, voice: ShareVoice): string {
  const noun = releaseNoun(facts.releaseType);
  const title = shareDisplayTitle(facts.title);
  const artist = String(facts.artistName ?? '').trim();
  const subject =
    voice === 'artist'
      ? `My new ${noun}`
      : artist
        ? `${artist}’s new ${noun}`
        : `The new ${noun}`;
  return title ? `${subject} “${title}”` : subject;
}

function timingClause(timing: ShareTiming): string {
  switch (timing.kind) {
    case 'upcoming':
      return `is out ${timing.label}.`;
    case 'today':
      return 'is out today.';
    case 'out':
      return 'is out now.';
    default:
      return 'is coming soon.';
  }
}

function announcement(facts: ShareReleaseFacts, answers: ShareAnswers, todayYmd: string): {
  sentence: string;
  timing: ShareTiming;
} {
  const timing = describeShareTiming(facts.releaseDate, answers.dateMode, todayYmd);
  return { sentence: `${buildShareHeadline(facts, answers.voice)} ${timingClause(timing)}`, timing };
}

// Fixed phrases, named so the outward copy test can hold every one of them.
const IG_LINK_BEFORE = 'Pre-save link in bio.';
const IG_LINK_AFTER = 'Listen at the link in bio.';
const DM_GREETING = 'Hey!';
const DM_LINK_BEFORE = 'Pre-save it here';
const DM_LINK_AFTER = 'Listen here';

/**
 * The Instagram caption. Never carries the link itself: Instagram does not
 * make links in a caption tappable, so a pasted URL is dead text. It points to
 * the bio instead, which is the convention every artist's followers already
 * know, and the sheet tells the person to put the link there.
 */
export function buildInstagramCaption(
  facts: ShareReleaseFacts,
  answers: ShareAnswers,
  todayYmd: string
): string {
  const { sentence, timing } = announcement(facts, answers, todayYmd);
  const lines = [sentence];
  const extra = normalizeShareLine(answers.extraLine);
  if (extra) lines.push(finishSentence(extra));
  if (answers.fanLink) lines.push(isOut(timing) ? IG_LINK_AFTER : IG_LINK_BEFORE);
  return lines.join('\n');
}

/**
 * The WhatsApp status caption: shorter, because a status is glanced at, and
 * it carries the raw link, because WhatsApp does make a link in a status
 * tappable. The extra line is already on the image, so it is not repeated.
 */
export function buildStatusCaption(
  facts: ShareReleaseFacts,
  answers: ShareAnswers,
  todayYmd: string
): string {
  const { sentence } = announcement(facts, answers, todayYmd);
  return answers.fanLink ? `${sentence}\n${answers.fanLink}` : sentence;
}

/**
 * The message somebody can send to anybody by DM. Written as a person talks,
 * and the link sits on its own line so every chat app turns it into a preview.
 */
export function buildDmMessage(
  facts: ShareReleaseFacts,
  answers: ShareAnswers,
  todayYmd: string
): string {
  const { sentence, timing } = announcement(facts, answers, todayYmd);
  const extra = normalizeShareLine(answers.extraLine);
  const opening = `${DM_GREETING} ${sentence}${extra ? ` ${finishSentence(extra)}` : ''}`;
  if (!answers.fanLink) return opening;
  return `${opening}\n${isOut(timing) ? DM_LINK_AFTER : DM_LINK_BEFORE}: ${answers.fanLink}`;
}

// ── X ───────────────────────────────────────────────────────────────────────

/** A post longer than this is refused by X for an ordinary account. */
export const X_MAX_POST_WEIGHT = 280;

/** X shortens every link to a fixed 23 characters, however long it really is. */
export const X_LINK_WEIGHT = 23;

const X_LINK_PATTERN = /https?:\/\/\S+/gi;

// The code points X counts as ONE character. Everything outside these ranges
// (Chinese, Japanese and Korean script, emoji) counts as two. The same ranges
// X's own counting library uses.
const X_LIGHT_RANGES: Array<[number, number]> = [
  [0x0000, 0x10ff],
  [0x2000, 0x200d],
  [0x2010, 0x201f],
  [0x2032, 0x2037],
];

const isLightCodePoint = (codePoint: number): boolean =>
  X_LIGHT_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);

// Joiners and selectors inside a compound emoji add nothing a reader sees.
const EMOJI_GLUE = new Set([0x200d, 0xfe0e, 0xfe0f]);

/**
 * How long X thinks a post is. Links count 23 each, and a character outside
 * X's light ranges counts two. It counts a compound emoji (a family, a flag) a
 * little high, which only ever errs toward a post that fits.
 */
export function xPostWeight(text: string): number {
  let weight = 0;
  const withoutLinks = String(text ?? '').replace(X_LINK_PATTERN, () => {
    weight += X_LINK_WEIGHT;
    return '';
  });
  for (const character of withoutLinks) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (EMOJI_GLUE.has(codePoint)) continue;
    weight += isLightCodePoint(codePoint) ? 1 : 2;
  }
  return weight;
}

/**
 * The X post. Unlike Instagram, X opens a link in a post, so the link goes in,
 * on its own line with the same words the DM uses. When the whole thing would
 * run past 280 characters the extra line is the part that goes: it is the one
 * line the post can lose and still say everything, and the person can put it
 * back by editing.
 */
export function buildXPost(facts: ShareReleaseFacts, answers: ShareAnswers, todayYmd: string): string {
  const { sentence, timing } = announcement(facts, answers, todayYmd);
  const extra = normalizeShareLine(answers.extraLine);
  const linkLine = answers.fanLink
    ? `${isOut(timing) ? DM_LINK_AFTER : DM_LINK_BEFORE}: ${answers.fanLink}`
    : '';
  const full = [sentence, extra ? finishSentence(extra) : '', linkLine].filter(Boolean).join('\n');
  if (!extra || xPostWeight(full) <= X_MAX_POST_WEIGHT) return full;
  return [sentence, linkLine].filter(Boolean).join('\n');
}

/**
 * X's own "write a post" link, with the text already in the box. It opens the
 * app on a phone and x.com on a computer, and needs no account or approval on
 * our side, the same way the WhatsApp button works. It cannot carry an image,
 * which is why the sheet saves or shares the image separately.
 */
export function buildXIntentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}

// ── Snapchat ────────────────────────────────────────────────────────────────

/**
 * The words for a Snapchat story: the sentence, nothing else. Snapchat takes
 * no text from another app and a link typed onto a snap is dead text, so the
 * link is copied separately for Snapchat's link sticker, and the extra line is
 * already on the image.
 */
export function buildSnapchatCaption(
  facts: ShareReleaseFacts,
  answers: ShareAnswers,
  todayYmd: string
): string {
  return announcement(facts, answers, todayYmd).sentence;
}

// ── The image ───────────────────────────────────────────────────────────────

/** Top-left of the poster, in the catalog voice (Space Mono, uppercase). */
export function shareEyebrow(releaseType: DbReleaseType): string {
  return `NEW ${releaseNoun(releaseType).toUpperCase()}`;
}

/** Top-right of the poster: the timing, short. */
export function shareTimingEyebrow(timing: ShareTiming): string {
  switch (timing.kind) {
    case 'upcoming':
      return `OUT ${timing.shortLabel}`;
    case 'today':
      return 'OUT TODAY';
    case 'out':
      return 'OUT NOW';
    default:
      return 'COMING SOON';
  }
}

/**
 * The timing again, large, low on the poster. Restated on purpose, the way a
 * printed gig poster restates its date: the top line is read first, the anchor
 * is what is still legible as a thumbnail in a feed.
 */
export function shareTimingAnchor(timing: ShareTiming): string {
  switch (timing.kind) {
    case 'upcoming':
      return `Out ${timing.label}`;
    case 'today':
      return 'Out today';
    case 'out':
      return 'Out now';
    default:
      return 'Coming soon';
  }
}

/** The one mark of ours, on the images only (founder call, 2026-09-23). */
export const SHARE_WATERMARK = 'Made with Urganize';

// Emoji, the joiners and selectors that build compound ones, skin tones and
// flag halves. The poster fonts carry none of them, and satori draws a missing
// glyph as an empty box, so they come off the IMAGE only. Captions keep them:
// those are the person's own words in the person's own app.
const EMOJI_PATTERN =
  /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍︎️⃣]/gu;

export function stripEmoji(value: string): string {
  return String(value ?? '')
    .replace(EMOJI_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// The width type can use on each poster: the canvas less its side margins.
const TEXT_COLUMN: Record<ShareFormat, Record<'cover' | 'type', number>> = {
  post: { type: 904, cover: 968 },
  status: { type: 888, cover: 888 },
};

// A deliberately wide estimate of one character of Young Serif, as a
// share of the font size. Measured on the rendered posters it runs 0.43 to
// 0.48; 0.5 leaves a margin, so a line sized against it always fits.
const DISPLAY_CHAR_EM = 0.5;

/** The largest size at which `characters` of display type fit in `column`. */
function fitSize(characters: number, column: number): number {
  return Math.floor(column / (Math.max(1, characters) * DISPLAY_CHAR_EM));
}

const MIN_TITLE_SIZE = 48;

/**
 * Headline size on the poster. Steps down as the title grows so a long title
 * wraps into a few confident lines instead of a wall of text, and never goes
 * below a size that still reads as a thumbnail. With cover art the title sits
 * in a narrower band, so its steps are smaller.
 *
 * Two limits, and the second is the one that bites. The step is chosen from
 * the whole title's length, but a WORD cannot wrap, so the size is also capped
 * so the longest word fits across the column. Without that cap a one-word
 * title like "Unavailable" is exactly the case that runs off the edge.
 *
 * `boost` grows a short headline when the poster has little else on it (no
 * byline, no extra line). A tall story with a name and a date alone otherwise
 * leaves its middle empty, which reads as a broken card rather than a quiet
 * one: the recap card's lesson. The word cap still applies after the boost.
 */
export function shareTitleSize(
  title: string,
  format: ShareFormat,
  hasCover: boolean,
  boost = 1
): number {
  const clean = stripEmoji(title);
  const length = clean.length;
  const steps: Record<ShareFormat, Record<'cover' | 'type', [number, number, number, number, number]>> = {
    post: {
      type: [176, 156, 120, 94, 72],
      cover: [72, 64, 56, 50, 48],
    },
    status: {
      type: [232, 188, 144, 112, 88],
      cover: [100, 88, 76, 66, 60],
    },
  };
  const [xs, sm, md, lg, xl] = steps[format][hasCover ? 'cover' : 'type'];
  const step =
    length <= 10 ? xs : length <= 18 ? sm : length <= 28 ? md : length <= 40 ? lg : xl;

  const longestWord = clean.split(/\s+/).reduce((longest, word) => Math.max(longest, word.length), 0);
  const cap = fitSize(longestWord, TEXT_COLUMN[format][hasCover ? 'cover' : 'type']);

  return Math.max(MIN_TITLE_SIZE, Math.min(Math.round(step * boost), cap));
}

/**
 * The date line at the bottom of a typographic poster. It must stay on ONE
 * line: "Out October" over a lone "3" is the failure. So it is capped by its
 * own length, which is what shrinks the longest case ("Out September 30,
 * 2027") without touching the common short ones.
 */
export function shareAnchorSize(label: string, format: ShareFormat): number {
  const base = format === 'status' ? 120 : 92;
  return Math.min(base, fitSize(label.length, TEXT_COLUMN[format].type));
}

/**
 * Whether a cover art asset can go on the image. PNG and JPEG only, because
 * those are what the renderer decodes, and under the size cap. An unknown size
 * (the column defaults to 0) is allowed through: the route checks the real
 * byte count after downloading, so the cap still holds.
 */
export function isEmbeddableCoverArt(asset: {
  mimeType: string | null | undefined;
  fileSize: number | null | undefined;
}): boolean {
  const mime = String(asset.mimeType ?? '').toLowerCase();
  if (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/jpg') return false;
  const size = Number(asset.fileSize) || 0;
  return size <= MAX_EMBEDDED_COVER_BYTES;
}

// ── Files ───────────────────────────────────────────────────────────────────

const MAX_SLUG_CHARS = 40;

/** Where an image is going, which is what its file is named for. */
export type ShareImageChannel = 'instagram' | 'whatsapp' | 'x' | 'snapchat';

const FILE_SUFFIX: Record<ShareImageChannel, string> = {
  instagram: 'instagram-post',
  whatsapp: 'whatsapp-status',
  x: 'x-post',
  snapchat: 'snapchat-story',
};

/** The canvas each channel posts: X shares the post, Snapchat the status. */
export const SHARE_CHANNEL_FORMAT: Record<ShareImageChannel, ShareFormat> = {
  instagram: 'post',
  whatsapp: 'status',
  x: 'post',
  snapchat: 'status',
};

/**
 * The file a saved image lands under: named after the song and where it is
 * going, so somebody who saves several finds obvious files. The fallback is
 * the point, the recap's rule: a title that slugs away to nothing, or our own
 * placeholder, must not produce a file that looks broken.
 */
export function shareImageFileName(
  title: string,
  format: ShareFormat,
  channel: ShareImageChannel = format === 'post' ? 'instagram' : 'whatsapp'
): string {
  const display = shareDisplayTitle(title);
  const slug =
    (display ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SLUG_CHARS)
      .replace(/-+$/g, '') || 'new-music';
  return `${slug}-${FILE_SUFFIX[channel]}.png`;
}

// ── The request between the sheet and the image route ───────────────────────

export type ShareCardInput = {
  format: ShareFormat;
  dateMode: ShareDateMode;
  extraLine: string;
  /** The viewer's local day; null when missing or malformed. */
  todayYmd: string | null;
};

/**
 * The query string the sheet sends. The voice and the fan link are absent on
 * purpose: the poster does not say "my" or carry a link (a link on an image is
 * not tappable), so neither changes a pixel and neither needs to travel.
 */
export function buildShareCardSearch(input: {
  format: ShareFormat;
  dateMode: ShareDateMode;
  extraLine: string;
  todayYmd: string | null;
}): string {
  const params = new URLSearchParams({ format: input.format, date: input.dateMode });
  if (input.extraLine) params.set('line', input.extraLine);
  if (input.todayYmd) params.set('today', input.todayYmd);
  return params.toString();
}

export function parseShareCardQuery(
  params: URLSearchParams
): { ok: true; value: ShareCardInput } | { ok: false; error: string } {
  const format = params.get('format');
  if (format !== 'post' && format !== 'status') {
    return { ok: false, error: 'Pick an image to make: post or status.' };
  }

  const dateMode = params.get('date') ?? 'show';
  if (dateMode !== 'show' && dateMode !== 'secret') {
    return { ok: false, error: 'Say whether the date can be shown.' };
  }

  const extraLine = normalizeShareLine(params.get('line') ?? '');
  if (extraLine.length > MAX_SHARE_LINE_CHARS) {
    return { ok: false, error: `Keep the extra line to ${MAX_SHARE_LINE_CHARS} characters.` };
  }

  // A bad `today` is tolerated rather than refused: it only decides "out
  // today" against "out October 3", and the route falls back to UTC, which is
  // right for most of the day. Refusing would fail an image over a clock.
  const todayRaw = params.get('today');
  const todayYmd = todayRaw && parseYmd(todayRaw) ? todayRaw : null;

  return { ok: true, value: { format, dateMode, extraLine, todayYmd } };
}

/**
 * Every fixed string that reaches a fan, for the copy test. The generated
 * sentences are checked separately, across the whole input matrix.
 */
export const SHARE_OUTWARD_STATIC_STRINGS: string[] = [
  shareEyebrow('single'),
  shareEyebrow('ep'),
  shareEyebrow('album'),
  shareTimingEyebrow({ kind: 'today' }),
  shareTimingEyebrow({ kind: 'out' }),
  shareTimingEyebrow({ kind: 'soon' }),
  shareTimingAnchor({ kind: 'today' }),
  shareTimingAnchor({ kind: 'out' }),
  shareTimingAnchor({ kind: 'soon' }),
  SHARE_WATERMARK,
  IG_LINK_BEFORE,
  IG_LINK_AFTER,
  DM_GREETING,
  DM_LINK_BEFORE,
  DM_LINK_AFTER,
];

/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react';
import { swatchInk } from '@/lib/brief-board';
import { coverTitleSize, planPublicBoard, safeSwatches, type BoardCard } from '@/lib/public-pages-desktop';
import {
  formatBriefDay,
  lagosDay,
  referenceColor,
  referenceDisplayTitle,
  type PublicBriefPayload,
} from '@/lib/release-brief';

/**
 * The shared brief on a computer (#1232; approved mock
 * docs/mocks/public-pages-desktop, screen 1): the board the team sees, read
 * only, with every empty card left out. Dark-locked like the phone layout.
 * Signed image links expire, so these are plain imgs rather than next/image.
 */

const GROUND = '#0c0c0d';
const SURFACE = '#171719';
const BORDER = 'rgba(242,242,240,0.08)';
const DIVIDER = 'rgba(242,242,240,0.06)';
const TEXT = '#f2f2f0';
const MUTED = '#929291';
const FAINT = 'rgba(242,242,240,0.45)';
const ACCENT = '#7fd99a';
const HOVER = 'rgba(242,242,240,0.07)';

const SPAN: Record<BoardCard['span'], string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
};

const ROWS: Record<number, string> = { 1: 'row-span-1', 2: 'row-span-2' };

const TITLE_SIZE = {
  xl: 'text-[44px] leading-[1.02]',
  lg: 'text-[30px] leading-[1.08]',
  md: 'text-[22px] leading-[1.15]',
  sm: 'text-[17px] leading-[1.2]',
} as const;

export function BriefBoardDesktop({ brief }: { brief: PublicBriefPayload }) {
  const images = brief.references.filter((reference) => reference.kind === 'image');
  const links = brief.references.filter((reference) => reference.kind === 'link');
  const swatches = safeSwatches(brief.palette);
  const releaseDay = formatBriefDay(lagosDay(brief.releaseDate));
  const plan = planPublicBoard({
    headline: brief.headline,
    idea: brief.idea,
    feelsLike: brief.feelsLike,
    notThis: brief.notThis,
    palette: brief.palette,
    dates: brief.dates.length,
    links: links.length,
    images: images.length,
  });

  const cards: Record<BoardCard['key'], () => ReactNode> = {
    idea: () => (
      <>
        <Label>The idea</Label>
        {brief.headline.trim() ? (
          <p className="font-display text-[26px] leading-[1.2]" style={{ color: TEXT, textWrap: 'balance' }}>
            {brief.headline}
          </p>
        ) : null}
        {brief.idea.trim() ? (
          <p
            className={`whitespace-pre-line text-[15px] leading-[1.6] ${brief.headline.trim() ? 'mt-3' : ''}`}
            style={{ color: brief.headline.trim() ? MUTED : TEXT }}
          >
            {brief.idea}
          </p>
        ) : null}
      </>
    ),
    feels: () => (
      <>
        <Label>It feels</Label>
        {brief.feelsLike.length ? (
          <ul className="flex flex-wrap gap-2">
            {brief.feelsLike.map((word, index) => (
              <li key={`${word}-${index}`} className="rounded-full px-3 py-1 text-[14px]" style={{ background: HOVER, color: TEXT }}>
                {word.charAt(0).toUpperCase() + word.slice(1)}
              </li>
            ))}
          </ul>
        ) : null}
        {brief.notThis.length ? (
          <p className={`text-[13px] ${brief.feelsLike.length ? 'mt-3' : ''}`} style={{ color: MUTED }}>
            Not this: {brief.notThis.join(', ')}
          </p>
        ) : null}
      </>
    ),
    colours: () => (
      <>
        <Label>Colours</Label>
        <ul className="flex gap-2">
          {swatches.map((hex, index) => (
            <li key={`${hex}-${index}`} className="h-[52px] min-w-0 flex-1 rounded-[10px]" style={{ background: hex }} title={hex} />
          ))}
        </ul>
      </>
    ),
    dates: () => (
      <>
        <Label>Dates</Label>
        <ul>
          {brief.dates.map((row) => (
            <li
              key={row.id}
              className="flex min-h-9 items-center justify-between gap-3 border-t text-[14px] first:border-t-0"
              style={{ borderColor: DIVIDER }}
            >
              <span className={`min-w-0 truncate ${row.done ? 'line-through opacity-55' : ''}`} style={{ color: TEXT }}>
                {row.title}
              </span>
              <span
                className={`shrink-0 text-[13px] ${row.isRelease ? 'font-semibold' : ''}`}
                style={{ color: row.isRelease ? ACCENT : MUTED }}
              >
                {row.when ?? formatBriefDay(row.date)}
              </span>
            </li>
          ))}
        </ul>
      </>
    ),
    sound: () => (
      <>
        <Label>Sounds like</Label>
        <ul>
          {links.map((reference) => (
            <li
              key={reference.id}
              className="flex min-h-12 items-center gap-3 border-t first:border-t-0"
              style={{ borderColor: DIVIDER }}
            >
              <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-md" style={{ background: referenceColor(reference.url) }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium" style={{ color: TEXT }}>
                  {referenceDisplayTitle(reference)}
                </span>
                <span className="block truncate text-[12.5px]" style={{ color: MUTED }}>
                  {reference.source}
                </span>
              </span>
              <a
                href={reference.url}
                target="_blank"
                rel="noreferrer noopener nofollow"
                className="shrink-0 text-[13px] font-semibold hover:underline"
                style={{ color: ACCENT }}
              >
                Open
              </a>
            </li>
          ))}
        </ul>
      </>
    ),
    look: () => (
      <>
        <Label>The look</Label>
        <div className="grid grid-cols-4 gap-2">
          {images.map((reference) => (
            <a key={reference.id} href={reference.url} target="_blank" rel="noreferrer noopener nofollow" className="block">
              <img
                src={reference.url}
                alt={reference.title || 'Reference image'}
                loading="lazy"
                className="aspect-square w-full rounded-xl object-cover"
                style={{ background: SURFACE }}
              />
            </a>
          ))}
        </div>
      </>
    ),
  };

  return (
    <main className="min-h-dvh" style={{ background: GROUND, color: TEXT }}>
      <header className="flex h-16 items-center justify-between border-b px-10" style={{ borderColor: DIVIDER }}>
        <a href="https://urganize.app" className="font-display text-[20px]" style={{ color: ACCENT }}>
          Urganize
        </a>
        <div className="flex items-center gap-3 text-[13px]" style={{ color: MUTED }}>
          <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ background: HOVER }}>
            View only
          </span>
          {brief.sharedBy ? <span>Shared by {brief.sharedBy}</span> : null}
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1080px] px-10 pb-12 pt-8">
        <p className="text-[13px]" style={{ color: MUTED }}>
          {brief.artistName ? `${brief.artistName} · ` : ''}Brief
        </p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <h1 className="min-w-0 font-display text-[40px] leading-[1.15]" style={{ textWrap: 'balance' }}>
            {brief.title}
          </h1>
          {releaseDay ? (
            <span className="shrink-0 pb-1.5 text-[13px]" style={{ color: MUTED }}>
              Out {releaseDay}
            </span>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-4 gap-4">
          <Cover brief={brief} swatches={swatches} rows={plan.coverRows} releaseDay={releaseDay} />
          {plan.beside.map((card) => (
            <Card key={card.key} className={SPAN[card.span]}>
              {cards[card.key]()}
            </Card>
          ))}
          {plan.below.map((card, index) => (
            <Card key={card.key} className={`${SPAN[card.span]} ${index === 0 ? 'col-start-1' : ''}`}>
              {cards[card.key]()}
            </Card>
          ))}
        </div>
      </div>

      <footer className="border-t py-4 text-center text-[12px]" style={{ borderColor: DIVIDER, color: FAINT }}>
        Made with{' '}
        <a href="https://urganize.app" className="font-display" style={{ color: ACCENT }}>
          Urganize
        </a>
      </footer>
    </main>
  );
}

function Cover({
  brief,
  swatches,
  rows,
  releaseDay,
}: {
  brief: PublicBriefPayload;
  swatches: string[];
  rows: number;
  releaseDay: string | null;
}) {
  // No art: a flat tile in the rollout's darkest colour, never a gradient
  // placeholder, as the in-app cover card does.
  const flat = swatches.find((hex) => swatchInk(hex) === 'light') ?? '#1a1611';
  const title = coverTitleSize(brief.title);
  return (
    <section
      aria-label="Cover"
      className={`relative col-span-1 col-start-1 min-h-[340px] overflow-hidden rounded-2xl ${ROWS[rows] ?? 'row-span-2'}`}
      style={{ background: flat }}
    >
      {brief.coverUrl ? (
        <>
          <img src={brief.coverUrl} alt={`${brief.title} cover art`} className="absolute inset-0 h-full w-full object-cover" />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[62%]"
            style={{ background: 'linear-gradient(to top, rgba(28,16,9,.88), rgba(28,16,9,0))' }}
          />
        </>
      ) : null}
      <div className="absolute inset-x-[18px] bottom-[18px] text-[#f7ecd8]">
        {brief.artistName ? (
          <p className="truncate text-[11.5px] font-semibold uppercase tracking-[0.12em] opacity-85">{brief.artistName}</p>
        ) : null}
        <h2
          className={`mt-1 font-display tracking-[-0.02em] ${TITLE_SIZE[title.size]} ${
            title.breakable ? 'break-words' : '[overflow-wrap:normal] [word-break:keep-all]'
          }`}
          style={{ hyphens: 'none' }}
        >
          {brief.title}
        </h2>
        {releaseDay ? <p className="mt-2 text-[12.5px] opacity-85">Out {releaseDay}</p> : null}
      </div>
    </section>
  );
}

function Card({ className, children }: { className: string; children: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-2xl border p-5 ${className}`} style={{ background: SURFACE, borderColor: BORDER }}>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2.5 text-[13px] font-semibold" style={{ color: MUTED }}>
      {children}
    </h3>
  );
}

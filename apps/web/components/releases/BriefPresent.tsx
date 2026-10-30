/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from '@/components/icons';
import { briefCountdown } from '@/lib/brief-board';
import { presentKeyAction, presentSlides, stepSlide, type PresentSlide } from '@/lib/brief-present';
import { formatBriefDay, referenceDisplayTitle, type BriefPayload } from '@/lib/release-brief';

/**
 * Present (#897 phase 4): the brief as five screens for a room. Idea, Look,
 * Sound, Making, Dates; screens with nothing on them are skipped. Arrows,
 * space and a clicker's Page Up / Page Down move; Esc leaves. Always dark,
 * like a slide on a screen, whatever the app's theme.
 */

const TITLES: Record<PresentSlide, string> = {
  idea: 'The idea',
  look: 'Look',
  sound: 'Sound and links',
  making: 'What we’re making',
  dates: 'Key moments',
};

const LABEL = 'font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-white/55';

function IdeaSlide({ brief, idea }: { brief: BriefPayload; idea: string }) {
  const { board } = brief;
  const countdown = briefCountdown(board.releaseDate, board.today);
  return (
    <div className="grid h-full items-center gap-[4vw] md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="mx-auto aspect-square w-full max-w-[min(60vh,520px)] overflow-hidden rounded-2xl" style={{ background: board.feel.palette[1] ?? board.feel.palette[0] ?? '#2a2622' }}>
        {board.coverUrl ? <img src={board.coverUrl} alt="" className="h-full w-full object-cover" /> : null}
      </div>
      <div className="min-w-0">
        <p className={LABEL}>{board.artistName || 'Rollout'} · {board.title}</p>
        <h2 className="mt-4 font-display text-[clamp(32px,5.2vw,76px)] font-normal leading-[1.02]">
          {board.feel.headline || board.title}
        </h2>
        {idea ? <p className="mt-6 max-w-[46ch] whitespace-pre-line text-[clamp(16px,1.6vw,22px)] leading-relaxed text-white/80">{idea}</p> : null}
        {board.feel.feelsLike.length ? (
          <p className="mt-6 font-display text-[clamp(18px,2vw,28px)] text-white/90">{board.feel.feelsLike.join('. ')}.</p>
        ) : null}
        {countdown.kind !== 'none' ? (
          <p className="mt-8 font-mono text-[13px] uppercase tracking-[0.14em] text-white/60">
            {countdown.kind === 'before'
              ? `${countdown.days} days to release · ${formatBriefDay(board.releaseDate)}`
              : countdown.kind === 'today'
                ? 'Out today'
                : `Out ${countdown.days} days · ${formatBriefDay(board.releaseDate)}`}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LookSlide({ brief }: { brief: BriefPayload }) {
  const images = brief.references.filter((reference) => reference.kind === 'image' && reference.url).slice(0, 6);
  return (
    <div className="grid h-full w-full gap-3"
      style={{
        gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, images.length))}, minmax(0, 1fr))`,
        gridTemplateRows: images.length > 3 ? '1fr 1fr' : '1fr',
      }}>
      {images.map((image) => (
        <figure key={image.id} className="relative m-0 min-h-0 overflow-hidden rounded-xl bg-white/5">
          <img src={image.url} alt={image.title || ''} className="h-full w-full object-cover" />
          {image.title ? (
            <figcaption className="absolute inset-x-3 bottom-3">
              <span className="inline-block max-w-full truncate rounded-md bg-black/60 px-2.5 py-1 text-[15px] text-white">{image.title}</span>
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}

function SoundSlide({ brief }: { brief: BriefPayload }) {
  const links = brief.references.filter((reference) => reference.kind === 'link').slice(0, 8);
  return (
    <ul className="mx-auto grid w-full max-w-[1000px] gap-3 self-center">
      {links.map((link) => (
        <li key={link.id} className="flex items-baseline gap-4 border-b border-white/10 pb-3">
          <span className="w-[140px] shrink-0 font-mono text-[13px] uppercase tracking-[0.12em] text-white/50">{link.source}</span>
          <span className="min-w-0 flex-1 truncate text-[clamp(18px,2vw,28px)]">{referenceDisplayTitle(link)}</span>
        </li>
      ))}
    </ul>
  );
}

function MakingSlide({ brief }: { brief: BriefPayload }) {
  const pieces = (brief.board.pieces?.items ?? []).slice(0, 10);
  return (
    <ul className="mx-auto grid w-full max-w-[1100px] gap-x-12 self-center md:grid-cols-2">
      {pieces.map((piece) => (
        <li key={piece.id} className="flex items-center gap-4 border-b border-white/10 py-3.5">
          <span
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 rounded-full ${piece.state === 'done' ? 'bg-[#7fd99a]' : piece.state === 'late' ? 'bg-[#f0a39a]' : 'border-2 border-white/40'}`}
          />
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[clamp(17px,1.7vw,24px)] ${piece.state === 'done' ? 'text-white/45 line-through' : ''}`}>{piece.title}</span>
            {piece.spec ? <span className="block truncate text-[14px] text-white/50">{piece.spec}</span> : null}
          </span>
          <span className="shrink-0 text-right font-mono text-[13px] text-white/55">
            {piece.assigneeName ? <span className="block">{piece.assigneeName}</span> : null}
            {piece.state === 'done' ? 'Done' : piece.dueDate ? formatBriefDay(piece.dueDate) : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DatesSlide({ brief }: { brief: BriefPayload }) {
  const rows = brief.dates.slice(0, 9);
  return (
    <ol className="mx-auto grid w-full max-w-[900px] gap-1 self-center">
      {rows.map((row) => (
        <li key={row.id} className="flex items-baseline gap-6 border-b border-white/10 py-3">
          <span className={`w-[150px] shrink-0 font-mono text-[14px] ${row.isRelease ? 'text-[#e9a53c]' : 'text-white/55'}`}>
            {row.date ? formatBriefDay(row.date) : row.when ?? ''}
          </span>
          <span className={`min-w-0 flex-1 truncate text-[clamp(17px,1.8vw,26px)] ${row.done ? 'text-white/45 line-through' : ''} ${row.isRelease ? 'font-display' : ''}`}>
            {row.title}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function BriefPresent({ brief, idea, onClose }: { brief: BriefPayload; idea: string; onClose: () => void }) {
  const slides = presentSlides({
    images: brief.references.filter((reference) => reference.kind === 'image' && reference.url).length,
    links: brief.references.filter((reference) => reference.kind === 'link').length,
    pieces: brief.board.pieces?.items.length ?? 0,
    dates: brief.dates.length,
  });
  const [index, setIndex] = useState(0);
  const at = Math.min(index, slides.length - 1);
  const slide = slides[at];
  const root = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  const countRef = useRef(slides.length);
  useEffect(() => {
    closeRef.current = onClose;
    countRef.current = slides.length;
  });

  // Full screen where the browser allows it; leaving full screen leaves Present.
  useEffect(() => {
    const node = root.current;
    node?.requestFullscreen?.().catch(() => undefined);
    const onChange = () => {
      if (!document.fullscreenElement) closeRef.current();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  // Keys go to Present first (capture), so Esc here never also closes the brief.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = presentKeyAction(event.key);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === 'close') closeRef.current();
      else setIndex((current) => stepSlide(current, countRef.current, action));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={`Present the brief: ${TITLES[slide]}, ${at + 1} of ${slides.length}`}
      className="fixed inset-0 z-[200] flex flex-col bg-[#0c0c0d] text-[#f5f0e6]"
    >
      <div className="flex shrink-0 items-center justify-between px-[4vw] pt-6">
        <p className={LABEL}>{TITLES[slide]}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Stop presenting"
          className="motion-focus grid h-10 w-10 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 px-[4vw] py-[3vh]">
        <div key={slide} className="flex min-h-0 w-full">
          {slide === 'idea' ? <IdeaSlide brief={brief} idea={idea} /> : null}
          {slide === 'look' ? <LookSlide brief={brief} /> : null}
          {slide === 'sound' ? <SoundSlide brief={brief} /> : null}
          {slide === 'making' ? <MakingSlide brief={brief} /> : null}
          {slide === 'dates' ? <DatesSlide brief={brief} /> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-center gap-4 pb-6">
        <button
          type="button"
          onClick={() => setIndex((current) => stepSlide(current, slides.length, 'prev'))}
          disabled={at === 0}
          aria-label="Previous"
          className="motion-focus grid h-11 w-11 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-25"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="flex gap-2" aria-hidden="true">
          {slides.map((name, dot) => (
            <span key={name} className={`h-1.5 rounded-full transition-all ${dot === at ? 'w-6 bg-white' : 'w-1.5 bg-white/30'}`} />
          ))}
        </span>
        <button
          type="button"
          onClick={() => setIndex((current) => stepSlide(current, slides.length, 'next'))}
          disabled={at === slides.length - 1}
          aria-label="Next"
          className="motion-focus grid h-11 w-11 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-25"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body
  );
}

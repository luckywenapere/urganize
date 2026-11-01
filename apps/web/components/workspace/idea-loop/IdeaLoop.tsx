'use client';

import { Mic } from '@/components/icons';
import { Check, Count, Stage, Stream, type Act } from '@urganize/stageshow';
import './idea-loop.css';

// The idea card's short loop (#1011, part of #986): a voice note's waveform
// becomes one line of text, and that line splits into three plan rows. No
// cursor: the card's own mic sits right below, so the loop shows what pressing
// it gets you. Stage 320 x 188, scaled down to fit a narrower card on a phone.
//
// Never import this directly: IdeaCardLoop loads it lazily, so the kit stays
// out of the app's first load and is never downloaded under reduced motion.
// The colours are in idea-loop.css and follow the app's light/dark theme.
// Fictional data only (Kanmi Gold's Harmattan Gold, Northline Music).

const W = 320;
const H = 188;
const IDEA = 'Teaser on TikTok, then a live session';
const WORDS = IDEA.split(' ').length;
const ROWS = [
  { title: 'Film the teaser', date: 'Nov 4' },
  { title: 'Post the teaser on TikTok', date: 'Nov 6' },
  { title: 'Book the live session', date: 'Nov 14' },
];
const BARS = 26;

type S = { veil: boolean; text: boolean; tick: number; secs: number; words: number; rows: number };
const START: S = { veil: false, text: false, tick: 0, secs: 0, words: 0, rows: 0 };
const DONE: S = { veil: false, text: true, tick: 0, secs: 6, words: WORDS, rows: ROWS.length };

// The stage opens on the poster's frame (the finished plan), so the swap from
// the poster still is seamless, then fades to an empty note and plays. It ends
// on that same frame, so each loop starts where the last one stopped.
async function script(a: Act<S>) {
  await a.wait(1800);
  await a.set({ veil: true });
  await a.wait(320);
  await a.snap({ ...START, veil: true });
  await a.set({ veil: false });
  await a.wait(500);
  a.mark('talk');
  a.put({ secs: 6 });
  for (let t = 1; t <= 14; t++) {
    a.put({ tick: t });
    await a.wait(120);
  }
  a.mark('text');
  a.put({ tick: 0, text: true });
  await a.wait(220);
  for (let w = 1; w <= WORDS; w++) {
    a.put({ words: w });
    await a.wait(85);
  }
  await a.wait(500);
  a.mark('plan');
  for (let r = 1; r <= ROWS.length; r++) {
    a.put({ rows: r });
    await a.wait(260);
  }
  await a.wait(800);
}

/** A bar's height (0 to 1) at a tick: flat at rest, a speech-like shape while talking. */
function level(i: number, tick: number): number {
  if (tick === 0) return 0.18;
  const v = Math.abs(Math.sin(i * 1.7 + tick * 0.9) * Math.cos(i * 0.45 - tick * 0.6));
  return 0.22 + 0.78 * v;
}

export default function IdeaLoop() {
  return (
    <Stage width={W} height={H} initial={DONE} poster={DONE} script={script} play="loop" className="il">
      {(s) => (
        <div className="il-scene" data-veil={s.veil || undefined}>
          <div className="il-note" data-text={s.text || undefined}>
            <span className="il-mic">
              <Mic size={13} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className="il-body">
              <span className="il-wave">
                {Array.from({ length: BARS }, (_, i) => (
                  <span key={i} style={{ transform: `scaleY(${level(i, s.tick)})` }} />
                ))}
              </span>
              <Stream className="il-line" text={IDEA} count={s.words} />
            </span>
            <span className="il-time">
              0:0<Count value={s.secs} duration={1600} />
            </span>
          </div>
          <div className="il-slots">
            {ROWS.map((r) => (
              <span key={r.title} />
            ))}
          </div>
          <div className="il-rows">
            {ROWS.map((r, i) => (
              <div key={r.title} className="il-row" data-on={s.rows > i || undefined}>
                <span className="il-check">
                  <Check on={false} size={15} />
                </span>
                <span className="il-title">{r.title}</span>
                <span className="il-date">{r.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Stage>
  );
}

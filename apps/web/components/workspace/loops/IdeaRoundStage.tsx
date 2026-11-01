'use client';

import { Avatar, Bar, Collapse, Count, Facepile, Icon, Stage, States, type Act } from '@urganize/stageshow';
import './idea-round-loop.css';

// The idea round invite's loop (#1010, item 4 of #986). Three teammates each
// drop an idea into one stack, the owner taps "Close and write the brief", and
// the stack folds into one brief. Stage 320 x 212: the invite column's width
// on a phone; on a computer it shows at 1:1, centered.
//
// Never import this directly: IdeaRoundLoop loads it lazily, so the kit stays
// out of the app's first load and is never downloaded under reduced motion.
// The colours are in idea-round-loop.css and follow the app's light/dark theme.
// Fictional data only: the Northline Music demo team, Harmattan Gold.

const W = 320;
const H = 212;

type Phase = 'open' | 'closing' | 'brief';
type S = { veil: boolean; ideas: number; phase: Phase };

const initial: S = { veil: false, ideas: 0, phase: 'open' };
/** The still: every idea in, the round ready to close. */
const posterState: S = { veil: false, ideas: 3, phase: 'open' };

const PEOPLE = [
  { name: 'Ada', idea: 'Tease the hook on TikTok first' },
  { name: 'Tobi', idea: 'Lagos radio by week two' },
  { name: 'Zainab', idea: 'Small paid push, ₦50k max' },
];

async function script(a: Act<S>) {
  await a.wait(700);
  for (let i = 1; i <= PEOPLE.length; i += 1) {
    a.put({ ideas: i });
    await a.wait(i === PEOPLE.length ? 900 : 1000);
  }
  a.mark('close');
  await a.click({ at: 'close', x: 0.62, y: 0.55 });
  a.put({ phase: 'closing' });
  await a.wait(800);
  a.put({ phase: 'brief' });
  await a.move({ x: 262, y: 118 });
  await a.wait(2800);
  await a.set({ veil: true });
  await a.wait(320);
  await a.snap({ ideas: 0, phase: 'open' });
  await a.set({ veil: false });
}

export default function IdeaRoundStage({ still = false }: { still?: boolean }) {
  return (
    <Stage
      width={W}
      height={H}
      initial={still ? posterState : initial}
      poster={posterState}
      script={still ? undefined : script}
      play="loop"
      cursor={still ? undefined : { at: { x: 262, y: 118 }, ripple: true }}
      className="ir"
    >
      {(s) => {
        const brief = s.phase === 'brief';
        return (
          <div className="ir-scene" data-veil={s.veil || undefined}>
            <div className="ir-head">
              <span className="ir-faces">
                {PEOPLE.map((p, i) => (
                  <Avatar key={p.name} name={p.name} size={22} ring={s.ideas > i ? 'confirmed' : 'waiting'} />
                ))}
              </span>
              <span className="ir-count">
                <Count value={s.ideas} duration={420} /> of 3 ideas in
              </span>
            </div>

            <div className="ir-body">
              {/* The stack and the brief share one spot: the stack lifts away
                  as the brief settles in, so nothing below them moves. */}
              <div className="ir-stack" data-gone={brief || undefined}>
                {/* Newest on top: each idea lands on the stack and carries the
                    ones below it down. */}
                {[...PEOPLE].reverse().map((p) => {
                  const index = PEOPLE.indexOf(p);
                  return (
                    <Collapse key={p.name} open={s.ideas > index} reveal="drop">
                      <div className="ir-note">
                        <Avatar name={p.name} size={18} />
                        <span className="ir-note__text">{p.idea}</span>
                      </div>
                    </Collapse>
                  );
                })}
              </div>
              <div className="ir-brief" data-on={brief || undefined}>
                <div className="ir-brief__top">
                  <span className="ir-brief__kicker">Brief</span>
                  <Facepile names={PEOPLE.map((p) => p.name)} size={18} overlap={4} />
                </div>
                <span className="ir-brief__title">Harmattan Gold</span>
                <div className="ir-brief__lines">
                  <Bar w={210} h={6} r={3} tone={2} />
                  <Bar w={168} h={6} r={3} tone={2} />
                  <Bar w={190} h={6} r={3} tone={1} />
                </div>
              </div>
            </div>

            <span className="ir-private" data-gone={brief || undefined}>
              <Icon name="lock" size={12} filled />
              Only you see these
            </span>
            <span className="ir-button" data-target="close" data-cursor="pointer" data-done={brief || undefined}>
              <States
                value={s.phase}
                states={{
                  open: 'Close and write the brief',
                  closing: 'Closing the round…',
                  brief: 'Read the brief',
                }}
              />
            </span>
          </div>
        );
      }}
    </Stage>
  );
}

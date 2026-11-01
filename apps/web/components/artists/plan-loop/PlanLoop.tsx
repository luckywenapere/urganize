'use client';

import { Avatar, Bar, Check, Stage, type Act } from '@urganize/stageshow';
import './plan-loop.css';

// The first Artists page a new team sees (#1007, item 1 of #986, mock
// approved under #951; planned for Home, which now redirects here, #876).
// Beside "No artists yet." and Add artist, a short loop of what comes next: a
// release is typed into UrgAns and its plan fills in, grouped Before release / Release week /
// After release, each task with a due date and an owner. About 7 seconds, then
// it fades and starts again.
//
// Stage 440 x 300 beside the copy on a computer; a 358 x 300 scene below a
// 420px container, where it sits under the button. Never import this directly:
// PlanLoopDemo loads it lazily, so the kit stays out of the page's first load
// and is never downloaded under reduced motion. Colours are in plan-loop.css
// and follow the app's light/dark theme.
// Fictional data only: the Northline Music demo team.

const W = 440;
const H = 300;

const ASK = 'Afro single, out 14 March';

type Item =
  | { kind: 'head'; label: string; ghost: number }
  | { kind: 'task'; title: string; date: string; owner: string; ghost: number }
  | { kind: 'filler' };

const PLAN: Item[] = [
  { kind: 'head', label: 'Before release', ghost: 78 },
  { kind: 'task', title: 'Brief the cover art', date: '7 Feb', owner: 'Tobi', ghost: 120 },
  { kind: 'task', title: 'Send to the distributor', date: '14 Feb', owner: 'Ada', ghost: 140 },
  { kind: 'head', label: 'Release week', ghost: 70 },
  { kind: 'task', title: 'Post the release-day video', date: '14 Mar', owner: 'Kemi', ghost: 150 },
  { kind: 'head', label: 'After release', ghost: 66 },
  { kind: 'task', title: 'Share week one numbers', date: '21 Mar', owner: 'Ada', ghost: 130 },
  { kind: 'filler' },
];

type S = { veil: boolean; draft: string; sent: boolean; shown: number };
const initial: S = { veil: false, draft: '', sent: false, shown: 0 };
const poster: S = { veil: false, draft: ASK, sent: true, shown: PLAN.length };

async function script(a: Act<S>) {
  await a.wait(500);
  a.mark('type');
  await a.type('draft', ASK, { interval: 40 });
  await a.wait(250);
  a.mark('send');
  a.put({ sent: true });
  await a.wait(350);
  a.mark('plan');
  for (let i = 1; i <= PLAN.length; i++) {
    a.put({ shown: i });
    await a.wait(150);
  }
  await a.wait(2600);
  await a.set({ veil: true });
  await a.wait(320);
  await a.snap({ draft: '', sent: false, shown: 0 });
  await a.set({ veil: false });
}

/** Lucide arrow-up and check, as the app's own icon set. */
function SendGlyph({ done }: { done: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {done ? <path d="M20 6 9 17l-5-5" /> : <path d="m5 12 7-7 7 7M12 19V5" />}
    </svg>
  );
}

/** `still` renders the finished plan with no script (the posters are taken from it). */
export default function PlanLoop({ still }: { still?: boolean }) {
  return (
    <Stage
      width={W}
      height={H}
      compact={{ below: 420, width: 358, height: H }}
      initial={still ? poster : initial}
      poster={poster}
      script={still ? undefined : script}
      play="loop"
      className="mpl"
    >
      {(s) => (
        <div className="mpl-scene" data-veil={s.veil || undefined}>
          <div className="mpl-ask" data-sent={s.sent || undefined}>
            <span className="mpl-ask-who">UrgAns</span>
            <span className="mpl-ask-text">
              {s.draft ? (
                <>
                  {s.draft}
                  {!s.sent ? <span className="mpl-caret" /> : null}
                </>
              ) : (
                <span className="mpl-ask-ph">Your next release</span>
              )}
            </span>
            <span className="mpl-send" data-on={s.draft ? true : undefined}>
              <SendGlyph done={s.sent} />
            </span>
          </div>
          <div className="mpl-plan">
            {/* Every slot is laid out from the start: a faint outline of the
                plan waits under the box, and each row resolves in place, top
                to bottom, so nothing below it ever jumps. */}
            {PLAN.map((item, i) => {
              const on = i < s.shown;
              if (item.kind === 'head') {
                return (
                  <div key={i} className="mpl-slot mpl-slot--head" data-on={on || undefined}>
                    <span className="mpl-ghost">
                      <Bar w={item.ghost} h={6} r={3} tone={1} />
                    </span>
                    <span className="mpl-real mpl-head">{item.label}</span>
                  </div>
                );
              }
              return (
                <div key={i} className="mpl-slot mpl-row" data-on={on || undefined}>
                  <span className="mpl-check">
                    <Check on={false} size={16} />
                  </span>
                  {item.kind === 'task' ? (
                    <>
                      <span className="mpl-cell">
                        <span className="mpl-ghost">
                          <Bar w={item.ghost} h={7} r={3.5} tone={1} />
                        </span>
                        <span className="mpl-real mpl-title">{item.title}</span>
                      </span>
                      <span className="mpl-cell mpl-cell--date">
                        <span className="mpl-ghost">
                          <Bar w={34} h={6} r={3} tone={1} />
                        </span>
                        <span className="mpl-real mpl-date">{item.date}</span>
                      </span>
                      <span className="mpl-cell">
                        <Avatar plain size={20} className="mpl-ghost" />
                        <Avatar
                          name={item.owner}
                          size={20}
                          className={`mpl-real mpl-owner mpl-owner--${item.owner.toLowerCase()}`}
                        />
                      </span>
                    </>
                  ) : (
                    <>
                      <Bar w={130} h={7} r={3.5} tone={2} />
                      <Bar w={34} h={6} r={3} tone={1} />
                      <Avatar plain size={20} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Stage>
  );
}

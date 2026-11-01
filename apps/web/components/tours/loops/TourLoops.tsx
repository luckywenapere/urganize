'use client';

import { Avatar, Bar, Check, Collapse, Count, Segmented, Stage, States, type Act } from '@urganize/stageshow';
import type { TourLoopId } from '@/lib/tours';
import './tour-loops.css';

// The rollout tour's three short loops (#971, mock approved under #951). Each
// one is the action its step describes, done by a cursor in a small copy of
// the screen. Stage 320 x 184: the tour card's inner width on a computer. On a
// phone the card is narrower and the stage scales to fit; step 2 has its own
// phone scene below 312px, because the menu is a sheet there.
//
// Never import this directly: TourStepLoop loads it lazily, so the kit stays
// out of the app's first load and is never downloaded under reduced motion.
// The colours are in tour-loops.css and follow the app's light/dark theme.
// Fictional data only: the Northline Music demo team, Kanmi Gold, Harmattan Gold.

const W = 320;
const H = 184;

/** A stage that resets by fading through its own ground, then starts again. */
type Veiled = { veil: boolean };

/* ---------------------------------------------------------------- Step 1 */

type S1 = Veiled & { done: boolean; view: 0 | 1 };
const s1Initial: S1 = { veil: false, done: false, view: 0 };
const s1Poster: S1 = { veil: false, done: true, view: 0 };

async function s1Script(a: Act<S1>) {
  await a.wait(500);
  a.mark('tick');
  await a.click({ at: 'tick', x: 0.5, y: 0.5 });
  a.put({ done: true });
  await a.wait(1100);
  a.mark('timeline');
  await a.click({ at: 'seg-timeline', x: 0.8, y: 0.6 });
  a.put({ view: 1 });
  await a.wait(400);
  await a.move({ x: 296, y: 170 });
  await a.wait(1500);
  await a.set({ veil: true });
  await a.wait(320);
  await a.snap({ done: false, view: 0 });
  await a.set({ veil: false });
}

const ROWS = [
  { title: 'Lock the master file', date: 'Oct 3', done: true },
  { title: 'Brief designer on cover art', date: 'Nov 2', target: true },
  { title: 'Write song metadata', date: 'Nov 4' },
];

function ActivitiesLoop({ still }: { still?: boolean }) {
  return (
    <Stage
      width={W}
      height={H}
      initial={still ? s1Poster : s1Initial}
      poster={s1Poster}
      script={still ? undefined : s1Script}
      play="loop"
      cursor={still ? undefined : { at: { x: 290, y: 168 }, ripple: true }}
      className="tl"
    >
      {(s) => (
        <div className="tl-scene" data-veil={s.veil || undefined}>
          <div className="tl-head">
            <Segmented
              items={['List', 'Timeline']}
              value={s.view}
              targets={['seg-list', 'seg-timeline']}
              cursor="pointer"
              className="tl-seg"
            />
            <span className="tl-count">
              <Count value={s.done ? 11 : 10} duration={500} /> of 18 done
            </span>
          </div>
          <div className="tl-body">
            <div className="tl-pane" data-on={s.view === 0 || undefined}>
              {ROWS.map((r) => {
                const isDone = r.done || (r.target && s.done);
                return (
                  <div key={r.title} className="tl-row" data-done={isDone || undefined}>
                    <span
                      className="tl-check"
                      data-target={r.target ? 'tick' : undefined}
                      data-cursor={r.target ? 'pointer' : undefined}
                    >
                      <Check on={!!isDone} size={16} />
                    </span>
                    <span className="tl-title">{r.title}</span>
                    <span className="tl-date">{r.date}</span>
                  </div>
                );
              })}
              <div className="tl-row tl-row--filler">
                <span className="tl-check">
                  <Check on={false} size={16} />
                </span>
                <Bar w={120} h={7} r={3.5} tone={2} />
                <Bar w={30} h={6} r={3} tone={1} />
              </div>
            </div>
            <div className="tl-pane tl-cal" data-on={s.view === 1 || undefined}>
              <div className="tl-weeks">
                {['W7', 'W6', 'W5', 'W4'].map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <span className="tl-today" />
              {ROWS.map((r, i) => {
                const isDone = r.done || (r.target && s.done);
                return (
                  <div key={r.title} className="tl-crow">
                    <span className="tl-ctitle">{r.title}</span>
                    <span className="tl-dot" data-done={isDone || undefined} style={{ left: `${[6, 38, 52][i]}%` }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Stage>
  );
}

/* ---------------------------------------------------------------- Step 2 */

type Pane = 'plan' | 'cover' | 'details';
type S2 = Veiled & { pane: Pane; sheet: boolean };
const s2Initial: S2 = { veil: false, pane: 'plan', sheet: false };
const s2Poster: S2 = { veil: false, pane: 'cover', sheet: false };

async function s2Script(a: Act<S2>) {
  if (a.layout === 'compact') {
    // Phone: the menu is the three-line button; it opens a sheet.
    await a.wait(500);
    a.mark('open');
    await a.click({ at: 'menu-btn', x: 0.5, y: 0.5 });
    a.put({ sheet: true });
    await a.wait(700);
    a.mark('cover');
    await a.click({ at: 'm-cover', x: 0.7, y: 0.55 });
    a.put({ pane: 'cover', sheet: false });
    await a.move({ x: 280, y: 176 });
    await a.wait(1700);
  } else {
    await a.wait(500);
    a.mark('cover');
    await a.click({ at: 'm-cover', x: 0.78, y: 0.55 });
    a.put({ pane: 'cover' });
    await a.wait(1300);
    a.mark('details');
    await a.click({ at: 'm-details', x: 0.78, y: 0.55 });
    a.put({ pane: 'details' });
    await a.move({ x: 140, y: 176 });
    await a.wait(1400);
  }
  await a.set({ veil: true });
  await a.wait(320);
  await a.snap({ pane: 'plan', sheet: false });
  await a.set({ veil: false });
}

const MENU: { group: string; items: { key: string; label: string; target?: string; icon: string }[] }[] = [
  {
    group: 'Release',
    items: [
      { key: 'cover', label: 'Add cover art', target: 'm-cover', icon: 'image' },
      { key: 'details', label: 'Fill in details', target: 'm-details', icon: 'doc' },
      { key: 'distribute', label: 'Distribute now', icon: 'globe' },
    ],
  },
  {
    group: 'Promote',
    items: [
      { key: 'pitch', label: 'Pitch this!', icon: 'radio' },
      { key: 'share', label: 'Share to socials', icon: 'share' },
    ],
  },
];

/** Lucide paths, as the app's own icon set (components/icons wraps lucide). */
function Glyph({ name }: { name: string }) {
  const p = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="tl-glyph">
      {name === 'image' && (
        <g {...p}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </g>
      )}
      {name === 'doc' && (
        <g {...p}>
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="M9 12h6M9 16h6" />
        </g>
      )}
      {name === 'globe' && (
        <g {...p}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </g>
      )}
      {name === 'radio' && (
        <g {...p}>
          <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9C23 8.8 23 15.1 19.1 19" />
          <circle cx="12" cy="12" r="2" />
        </g>
      )}
      {name === 'share' && (
        <g {...p}>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
        </g>
      )}
      {name === 'menu' && (
        <g {...p} strokeWidth={2}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </g>
      )}
    </svg>
  );
}

function Cover({ size }: { size: number }) {
  return (
    <div className="tl-cover" style={{ width: size, height: size }}>
      <span className="tl-cover__t">Harmattan Gold</span>
      <span className="tl-cover__a">KANMI GOLD</span>
    </div>
  );
}

function PaneBody({ pane }: { pane: Pane }) {
  return (
    <div className="tl-panes">
      <div className="tl-p" data-on={pane === 'plan' || undefined}>
        <span className="tl-p__h">Work the plan</span>
        {[110, 84, 120, 96].map((w, i) => (
          <div key={i} className="tl-p__row">
            <Check on={i === 0} size={12} />
            <Bar w={w} h={6} r={3} tone={i === 0 ? 1 : 2} />
          </div>
        ))}
      </div>
      <div className="tl-p" data-on={pane === 'cover' || undefined}>
        <span className="tl-p__h">Cover art</span>
        <div className="tl-p__cover">
          <Cover size={72} />
          <span className="tl-p__meta">
            3000 x 3000
            <br />
            JPG, 2.1 MB
          </span>
        </div>
      </div>
      <div className="tl-p" data-on={pane === 'details' || undefined}>
        <span className="tl-p__h">Details</span>
        <div className="tl-kv">
          <span>Title</span>
          <b>Harmattan Gold</b>
        </div>
        <div className="tl-kv">
          <span>Genre</span>
          <b>Afrobeats</b>
        </div>
        <div className="tl-kv">
          <span>Release</span>
          <b>Nov 28</b>
        </div>
        <div className="tl-kv">
          <span>ISRC</span>
          <Bar w={64} h={6} r={3} tone={2} />
        </div>
      </div>
    </div>
  );
}

function MenuLoop({ still }: { still?: boolean }) {
  return (
    <Stage
      width={W}
      height={H}
      compact={{ below: 312, width: 302, height: 196 }}
      initial={still ? s2Poster : s2Initial}
      poster={s2Poster}
      script={still ? undefined : s2Script}
      play="loop"
      cursor={still ? undefined : { at: { wide: { x: 150, y: 172 }, compact: { x: 250, y: 180 } }, ripple: true }}
      className="tl"
    >
      {(s, _rect, layout) =>
        layout === 'compact' ? (
          <div className="tl-scene tl-phone" data-veil={s.veil || undefined}>
            <div className="tl-ph-head">
              <span className="tl-ph-back">‹</span>
              <span className="tl-ph-title">Harmattan Gold</span>
              <span className="tl-ph-n">10/18</span>
              <span className="tl-ph-menu" data-target="menu-btn" data-cursor="pointer">
                <Glyph name="menu" />
              </span>
            </div>
            <PaneBody pane={s.pane} />
            <div className="tl-sheet-scrim" data-on={s.sheet || undefined} />
            <div className="tl-sheet" data-on={s.sheet || undefined}>
              <span className="tl-grab" />
              {MENU[0].items.map((it) => (
                <div
                  key={it.key}
                  className="tl-mi"
                  data-target={it.target}
                  data-cursor={it.target ? 'pointer' : undefined}
                >
                  <Glyph name={it.icon} />
                  <span>{it.label}</span>
                </div>
              ))}
              <div className="tl-mi">
                <Glyph name="radio" />
                <span>Pitch this!</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="tl-scene tl-split" data-veil={s.veil || undefined}>
            <nav className="tl-menu">
              {MENU.map((g) => (
                <div key={g.group} className="tl-group">
                  <span className="tl-glabel">{g.group}</span>
                  {g.items.map((it) => (
                    <div
                      key={it.key}
                      className="tl-mi"
                      data-on={s.pane === it.key || undefined}
                      data-target={it.target}
                      data-cursor={it.target ? 'pointer' : undefined}
                    >
                      <Glyph name={it.icon} />
                      <span>{it.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </nav>
            <PaneBody pane={s.pane} />
          </div>
        )
      }
    </Stage>
  );
}

/* ---------------------------------------------------------------- Step 3 */

type S3 = Veiled & { email: string; focused: boolean; sending: boolean; added: boolean };
const s3Initial: S3 = { veil: false, email: '', focused: false, sending: false, added: false };
const s3Poster: S3 = { veil: false, email: '', focused: false, sending: false, added: true };

async function s3Script(a: Act<S3>) {
  await a.wait(400);
  a.mark('field');
  await a.click({ at: 'email', x: 0.4, y: 0.5 });
  a.put({ focused: true });
  await a.type('email', 'tolu@north.fm', { interval: 32 });
  await a.wait(200);
  a.mark('invite');
  await a.click({ at: 'invite', x: 0.75, y: 0.6 });
  a.put({ sending: true, focused: false });
  await a.wait(450);
  a.put({ added: true, sending: false, email: '' });
  await a.move({ x: 296, y: 30 });
  await a.wait(1800);
  await a.set({ veil: true });
  await a.wait(320);
  await a.snap({ added: false, email: '', focused: false });
  await a.set({ veil: false });
}

function TeamLoop({ still }: { still?: boolean }) {
  return (
    <Stage
      width={W}
      height={H}
      initial={still ? s3Poster : s3Initial}
      poster={s3Poster}
      script={still ? undefined : s3Script}
      play="loop"
      cursor={still ? undefined : { at: { x: 296, y: 30 }, ripple: true }}
      className="tl"
    >
      {(s) => (
        <div className="tl-scene tl-team" data-veil={s.veil || undefined}>
          <span className="tl-eyebrow">Teammates</span>
          <div className="tl-form">
            <div className="tl-input" data-focus={s.focused || undefined} data-target="email" data-cursor="ibeam">
              {s.email ? (
                <span className="tl-typed">{s.email}</span>
              ) : (
                <span className="tl-ph">teammate@email.com</span>
              )}
              {s.focused ? <span className="tl-caret" /> : null}
            </div>
            <span className="tl-btn" data-target="invite" data-cursor="pointer">
              <States value={s.sending ? 'busy' : 'idle'} states={{ idle: 'Invite', busy: 'Inviting...' }} />
            </span>
          </div>
          <div className="tl-members">
            <Collapse open={s.added} reveal="drop">
              <div className="tl-member">
                <Avatar name="Tolu" size={26} />
                <div className="tl-mtext">
                  <span className="tl-mname">
                    <span className="tl-email">tolu@north.fm</span> <em>Invited</em>
                  </span>
                </div>
                <span className="tl-role">Team member</span>
              </div>
            </Collapse>
            <div className="tl-member">
              <Avatar name="Dami Okafor" size={26} />
              <div className="tl-mtext">
                <span className="tl-mname">Dami Okafor</span>
              </div>
              <span className="tl-role">Manager</span>
            </div>
            <div className="tl-member tl-member--filler">
              <Avatar size={26} plain />
              <div className="tl-mtext">
                <Bar w={92} h={7} r={3.5} tone={2} />
              </div>
              <Bar w={56} h={16} r={7} tone={1} />
            </div>
          </div>
        </div>
      )}
    </Stage>
  );
}

const LOOPS = { activities: ActivitiesLoop, menu: MenuLoop, team: TeamLoop } as const;

/** One tour step's loop. `still` draws its poster frame, with no cursor or script. */
export default function TourLoop({ loop, still }: { loop: TourLoopId; still?: boolean }) {
  const Loop = LOOPS[loop];
  return <Loop still={still} />;
}

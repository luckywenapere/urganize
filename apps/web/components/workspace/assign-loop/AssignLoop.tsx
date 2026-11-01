'use client';

import { Avatar, Bar, Check, Stage, type Act, type Point } from '@urganize/stageshow';
import './assign-loop.css';

// The plan-ready dialog's "Assign activities to your team" loop (#1009, item 5
// of #986). A cursor drags an activity onto a teammate; the activity takes an
// owner chip, then the WhatsApp nudge that teammate gets shows up.
// The nudge is the reminder WhatsApp chasing sends the day before it is due
// (lib/whatsapp/chase-rules.ts), hence "Thu" for a Friday task. Stage
// 448 x 172: the dialog's inner width on a computer, the team beside the list.
// Below 400px (a phone) it is a 278 x 222 scene of its own: the team sits under
// the list, so the drag runs down instead of across.
//
// Never import this directly: AssignTeamLoop loads it lazily, so the kit stays
// out of the app's first load and is never downloaded under reduced motion.
// The colours are in assign-loop.css and follow the app's light/dark theme.
// Fictional data only: the Northline Music demo team.

const W = 448;
const H = 172;

type S = {
  veil: boolean;
  /** Where the carried card's top-left sits, while it is in the hand. */
  at: Point | null;
  over: boolean;
  dropped: boolean;
  assigned: boolean;
  ping: boolean;
};

const initial: S = { veil: false, at: null, over: false, dropped: false, assigned: false, ping: false };
const poster: S = { veil: false, at: null, over: false, dropped: false, assigned: true, ping: true };

const TASK = 'Book the cover shoot';

async function script(a: Act<S>) {
  await a.wait(600);
  const row = a.rect('task', { layout: true });
  // Take hold on the grip. What the hand carries is a short card (the grip
  // and the title, as drag images are), hanging to the right of the hand, so
  // the teammate's face and name stay in view under it.
  const grab = { x: row.x + 14, y: row.y + row.height / 2 };
  a.mark('pickup');
  await a.move(grab, { duration: 650 });
  await a.wait(150);
  const card = a.rect('tolu', { layout: true });
  const dest = { x: card.x + card.width * 0.8, y: card.y + card.height / 2 };
  // The held card is 34px tall; the hand holds it by its grip, mid-height.
  const off = { x: 14, y: 17 };
  a.mark('drag');
  await a.drag(
    dest,
    (p) => {
      const over =
        p.x >= card.x && p.x <= card.x + card.width && p.y >= card.y && p.y <= card.y + card.height;
      a.put({ at: { x: p.x - off.x, y: p.y - off.y }, over });
    },
    { duration: 1150 },
  );
  // Released over Tolu: the card goes into Tolu's card, the row takes its owner.
  a.mark('drop');
  a.put({ dropped: true });
  await a.wait(220);
  a.put({ at: null, assigned: true, over: false });
  await a.move('rest', { duration: 700 });
  await a.wait(250);
  a.mark('ping');
  await a.set({ ping: true });
  await a.wait(2600);
  await a.set({ veil: true });
  await a.wait(320);
  await a.snap({ at: null, over: false, dropped: false, assigned: false, ping: false });
  await a.set({ veil: false });
}

/** WhatsApp's speech-bubble mark, drawn small; the nudge is sent there. */
function WhatsAppGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-1 1.2-.4.2-.7.1a8.2 8.2 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.8.4 3.6 3.6 0 0 0-1.1 2.6 6.2 6.2 0 0 0 1.3 3.3 14 14 0 0 0 5.5 4.8c2 .9 2.8.9 3.8.8a3.3 3.3 0 0 0 2.1-1.5 2.7 2.7 0 0 0 .2-1.5c-.1-.1-.3-.2-.6-.4zM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4a9.8 9.8 0 1 1 8.3 4.6zm8.4-18.2A11.8 11.8 0 0 0 1.8 17.8L.1 24l6.4-1.7a11.8 11.8 0 0 0 5.6 1.4 11.8 11.8 0 0 0 8.3-20.1z"
      />
    </svg>
  );
}

function Grip() {
  return (
    <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true" className="al-grip">
      {[2, 6, 10].map((y) => (
        <g key={y}>
          <circle cx="2" cy={y} r="1.1" fill="currentColor" />
          <circle cx="6" cy={y} r="1.1" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

function OwnerChip({ on }: { on: boolean }) {
  return (
    <span className="al-chip" data-on={on || undefined}>
      <Avatar name="Tolu" size={16} />
      <span>Tolu · due Fri</span>
    </span>
  );
}

function TaskBody({ assigned }: { assigned: boolean }) {
  return (
    <>
      <Grip />
      <span className="al-title">{TASK}</span>
      <span className="al-meta">
        <span className="al-none" data-off={assigned || undefined}>
          <span className="al-empty" />
          No owner · due Fri
        </span>
        <OwnerChip on={assigned} />
      </span>
    </>
  );
}

export function AssignScene({ still }: { still?: boolean }) {
  return (
    <Stage
      width={W}
      height={H}
      compact={{ below: 400, width: 278, height: 222 }}
      initial={still ? poster : initial}
      poster={poster}
      script={still ? undefined : script}
      play="loop"
      cursor={still ? undefined : { at: 'rest', ripple: true }}
      className="al"
    >
      {(s, _rect, layout) => {
        const compact = layout === 'compact';
        return (
          <div className={`al-scene${compact ? ' al-scene--compact' : ''}`} data-veil={s.veil || undefined}>
            <div className="al-list">
              <span className="al-eyebrow">Activities</span>
              <div className="al-row al-row--filler">
                <Check on size={14} />
                <Bar w={compact ? 104 : 132} h={7} r={3.5} tone={2} />
                <span className="al-date">Oct 31</span>
              </div>
              <div
                className="al-row al-row--task"
                data-target="task"
                data-cursor="open"
                data-source={s.at ? true : undefined}
              >
                <TaskBody assigned={s.assigned} />
              </div>
              <div className="al-row al-row--filler">
                <Check on={false} size={14} />
                <Bar w={compact ? 86 : 112} h={7} r={3.5} tone={2} />
                <Bar w={30} h={6} r={3} tone={1} />
              </div>
              {/* Runs off the stage's foot, so the list never stops short. */}
              {compact ? null : (
                <div className="al-row al-row--filler">
                  <Check on={false} size={14} />
                  <Bar w={96} h={7} r={3.5} tone={2} />
                  <Bar w={30} h={6} r={3} tone={1} />
                </div>
              )}
            </div>

            <div className="al-team">
              {compact ? null : <span className="al-eyebrow">Team</span>}
              <div className="al-person" data-target="tolu" data-over={s.over || undefined}>
                <Avatar name="Tolu" size={26} />
                <span className="al-ptext">
                  <span className="al-pname">Tolu</span>
                  <span className="al-prole">Designer</span>
                </span>
              </div>
              <div className="al-person">
                <Avatar name="Ada Bello" size={26} />
                <span className="al-ptext">
                  <span className="al-pname">Ada</span>
                  <span className="al-prole">Artist</span>
                </span>
              </div>
              {compact ? null : (
                <div className="al-person al-person--filler">
                  <Avatar size={26} plain />
                  <Bar w={56} h={7} r={3.5} tone={2} />
                </div>
              )}
            </div>

            {/* The card in the hand rides the cursor exactly and goes into
                Tolu's card on release. */}
            <div
              className="al-held"
              data-show={s.at && !s.dropped ? true : undefined}
              data-dropped={s.at && s.dropped ? true : undefined}
              style={s.at ? { translate: `${s.at.x}px ${s.at.y}px` } : undefined}
            >
              <Grip />
              <span className="al-title">{TASK}</span>
            </div>

            <div className="al-ping" data-on={s.ping || undefined}>
              <span className="al-wa">
                <WhatsAppGlyph />
              </span>
              <span className="al-ping-text">
                <span className="al-ping-head">WhatsApp to Tolu · Thu</span>
                <span className="al-ping-body">Cover shoot is due tomorrow.</span>
              </span>
            </div>

            <span data-target="rest" className="al-rest" />
          </div>
        );
      }}
    </Stage>
  );
}

/** The loop. `still` draws its poster frame, with no cursor or script. */
export default function AssignLoop({ still }: { still?: boolean }) {
  return <AssignScene still={still} />;
}

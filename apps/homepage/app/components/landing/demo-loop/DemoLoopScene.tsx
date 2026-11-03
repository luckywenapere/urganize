'use client'

import { useEffect } from 'react'
import { ArrowUp, ChevronUp, Info, RotateCcw } from 'lucide-react'
import { Check, Collapse, Field, Stage, Stream, Text, Window, type Act } from '@urganize/stageshow'
import './demo-loop.css'

// The UrgAns demo loop (#956, item 5 of #951; founder approved the mock).
// Northline Music demo team, fictional artists. Beats: the empty UrgAns
// screen; a manager types a question and sends it; Thinking; the answer
// streams in and ends on an offer; the confirmation card drops in under it;
// the manager presses Assign, the button goes busy, then Assigned. The loop
// resets through New chat, the way the product clears a thread.
//
// Loaded only by DemoLoop.tsx, client side. Colours live in demo-loop.css and
// follow the site's theme toggle; `theme` only tells the kit which cursor and
// shadows to draw.

const Q = "What's still open on Golden Hour?"
const A =
  'Golden Hour by Kemi Vale goes out Friday 13 Nov. Two things are open: the cover art is with Dayo and due today, and the playlist pitch is due Friday with nobody on it. Want me to give the pitch to Ife?'
const WORDS = A.split(' ').length
const PROMPTS = ["What's late this week?", 'Plan a new single', 'Write a status update']

type S = {
  draft: string
  focused: boolean
  sent: boolean
  phase: 'idle' | 'thinking' | 'answer'
  words: number
  card: boolean
  confirm: 'idle' | 'busy' | 'done'
}

const initial: S = { draft: '', focused: false, sent: false, phase: 'idle', words: 0, card: false, confirm: 'idle' }
// The still (poster.ts, and what the kit shows under reduced motion): the
// whole exchange, the pitch assigned.
export const POSTER: S = { draft: '', focused: false, sent: true, phase: 'answer', words: WORDS, card: true, confirm: 'done' }

const REST = { wide: { x: 640, y: 250 }, compact: { x: 320, y: 250 } }

async function script(a: Act<S>) {
  await a.wait(900)
  await a.click({ at: 'composer', x: 0.45, y: 0.5 })
  a.put({ focused: true })
  await a.wait(250)
  await a.type('draft', Q, { interval: 36 })
  await a.wait(300)
  await a.click({ at: 'send', x: 0.5, y: 0.5 })
  a.put({ sent: true, draft: '', focused: false })
  void a.move({ wide: { x: 640, y: 300 }, compact: { x: 330, y: 330 } })
  await a.wait(450)
  a.put({ phase: 'thinking' })
  await a.wait(1000)
  a.put({ phase: 'answer' })
  for (let i = 1; i <= WORDS; i++) {
    a.put({ words: i })
    await a.wait(38)
  }
  await a.wait(350)
  a.put({ card: true })
  await a.wait(1300)
  await a.click({ at: 'assign', x: 0.6, y: 0.6 })
  a.put({ confirm: 'busy' })
  await a.wait(1000)
  a.put({ confirm: 'done' })
  await a.wait(2400)
  await a.click({ at: 'new-chat', x: 0.5, y: 0.5 })
  a.put({ sent: false, phase: 'idle', card: false })
  void a.move(REST)
  await a.wait(1400)
}

const COMPACT = { below: Infinity, width: 358, height: 580 }

type Props = {
  theme: 'light' | 'dark'
  /** The phone design. DemoLoop decides it with the same media query as the
   *  poster's <picture>, so the still and the loop always match. */
  compact: boolean
  /** Called once the stage has measured and painted its first frame. */
  onReady?: () => void
}

export default function DemoLoopScene({ theme, compact, onReady }: Props) {
  // Two frames: one for the stage to measure its box, one to paint at scale.
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => onReady?.())
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [onReady])

  return (
    <Stage
      width={720}
      height={440}
      compact={compact ? COMPACT : undefined}
      theme={theme}
      fill
      initial={initial}
      poster={POSTER}
      script={script}
      play="loop"
      cursor={{ at: REST, style: compact ? 'touch' : 'real', idle: false }}
      className="urg-demo"
    >
      {(s) => (
        <Window title="AI" className="urg-win">
          <div className="urg-body">
            <div className="urg-head" data-on={s.sent || undefined}>
              <span className="urg-new" data-target="new-chat" data-cursor="pointer">
                <RotateCcw size={12} strokeWidth={2} />
                New chat
              </span>
            </div>
            <div className="urg-thread">
              <Collapse open={!s.sent}>
                <div className="urg-hero">
                  <div className="urg-hero__title">What do you need?</div>
                  <Text className="urg-hero__sub">One thread for every rollout. Ask anything.</Text>
                  <div className="urg-prompts">
                    {PROMPTS.map((p) => (
                      <span key={p} className="urg-prompt">{p}</span>
                    ))}
                  </div>
                </div>
              </Collapse>
              <Collapse open={s.sent} reveal="drop" from="below">
                <div className="urg-q">
                  <span className="urg-q__bubble">{Q}</span>
                </div>
              </Collapse>
              <Collapse open={s.sent && s.phase === 'thinking'}>
                <div className="urg-thinking">Thinking…</div>
              </Collapse>
              <Collapse open={s.sent && s.phase === 'answer'}>
                <div className="urg-a">
                  <Stream className="urg-stream" text={A} count={s.words} />
                </div>
              </Collapse>
              <Collapse open={s.sent && s.card} reveal="drop" from="below">
                <div className="urg-card">
                  <div className="urg-card__top">
                    <Info className="urg-card__icon" size={16} strokeWidth={1.75} />
                    <div>
                      <div className="urg-card__title">Assign the playlist pitch to Ife</div>
                      <div className="urg-card__detail">Golden Hour · due Fri 6 Nov</div>
                    </div>
                  </div>
                  <div className="urg-card__actions">
                    <span className="urg-btn urg-btn--ghost" data-quiet={s.confirm !== 'idle' || undefined}>Cancel</span>
                    <span className="urg-btn urg-btn--primary" data-target="assign" data-cursor="pointer">
                      <span className="urg-layer" data-on={s.confirm === 'idle' || undefined}>Assign</span>
                      <span className="urg-layer" data-on={s.confirm === 'busy' || undefined}>
                        <Check on={false} pending size={14} />
                      </span>
                      <span className="urg-layer" data-on={s.confirm === 'done' || undefined}>
                        <Check on={s.confirm === 'done'} size={14} />
                        Assigned
                      </span>
                    </span>
                  </div>
                </div>
              </Collapse>
            </div>
            <Field
              className="urg-composer"
              value={s.draft}
              placeholder="Ask AI…"
              focused={s.focused}
              box={{ 'data-target': 'composer' }}
              leading={
                <span className="urg-scope">
                  All releases
                  <ChevronUp size={12} strokeWidth={2} />
                </span>
              }
              trailing={
                <span className="urg-send" data-target="send" data-cursor="pointer" data-ready={s.draft ? '' : undefined}>
                  <ArrowUp size={16} strokeWidth={2} />
                </span>
              }
            />
          </div>
        </Window>
      )}
    </Stage>
  )
}

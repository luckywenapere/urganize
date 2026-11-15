'use client'

import { useEffect } from 'react'
import { ArrowUp, Bell, ChevronLeft, ChevronRight, Circle, Plus, Search } from 'lucide-react'
import { Avatar, Collapse, Spinner, Stage, Window, type Act, type Layout } from '@urganize/stageshow'
import './hero-loop.css'

// Urganize homepage hero loop (#952, item 1 of #951; founder approved the
// mock). Fictional artists. Redrawn 2026-11-15 (#1325) to the app as it is
// now: Home over the forest wallpaper, with the greeting, the chat box, the
// Next drop and the artists list, and the Home and Ask Chappi tabs. One
// story: ask for a plan in the chat box, the plan appears, the tasks land on
// the team, then back to Home where the new rollout is in the artists list,
// and a soft fade resets the loop.
//
// Loaded only by HeroLoop.tsx, client side, after the poster still has
// painted. Colours live in hero-loop.css and follow the site's theme toggle;
// `theme` only tells the kit which cursor and shadows to draw.

type View = 'home' | 'plan'
type S = {
  view: View
  ask: string
  focus: boolean
  making: boolean
  shown: number // task rows revealed
  owners: number // task rows with an owner
  added: boolean
  dim: boolean
}

const initial: S = { view: 'home', ask: '', focus: false, making: false, shown: 0, owners: 0, added: false, dim: false }

type Person = { name: string; first: string }
const DAMI: Person = { name: 'Dami Okafor', first: 'Dami' }
const KANMI: Person = { name: 'Kanmi Gold', first: 'Kanmi' }
const TOBI: Person = { name: 'Tobi Ade', first: 'Tobi' }
const ADA: Person = { name: 'Ada Nwosu', first: 'Ada' }
const FEMI: Person = { name: 'Femi Bello', first: 'Femi' }

const TASKS: { title: string; due: string; who: Person }[] = [
  { title: 'Choose distributor', due: 'Nov 17', who: DAMI },
  { title: 'Lock the master file', due: 'Nov 18', who: KANMI },
  { title: 'Brief designer on cover art', due: 'Nov 19', who: TOBI },
  { title: 'Write song metadata', due: 'Nov 20', who: DAMI },
  { title: 'Begin playlist outreach', due: 'Nov 23', who: ADA },
  { title: 'Shoot teaser clips', due: 'Nov 25', who: FEMI },
]

// Home's artists list, soonest drop first, as the app draws it (#1305).
type Row = { artist: string; title: string; type: string; days: number; day: string; done: number; total: number; art: string }
const ROWS: Row[] = [
  { artist: 'Yaba Kid', title: 'Love Letters from Yaba', type: 'Single', days: 7, day: 'Sun 22 Nov', done: 14, total: 17, art: '#2b2a6b' },
  { artist: 'Temi Ivory', title: 'Ife Mi', type: 'Single', days: 28, day: 'Sun 13 Dec', done: 4, total: 13, art: '#1f5a6b' },
  { artist: 'Chi Velvet', title: 'Nkem', type: 'EP', days: 84, day: 'Sun 7 Feb', done: 3, total: 16, art: '#7a5a1c' },
  { artist: 'Nasir Sahara', title: 'Sannu Da Zuwa', type: 'Album', days: 140, day: 'Sun 4 Apr', done: 11, total: 18, art: '#8e2a2c' },
]
const NEW: Row = { artist: 'Kanmi Gold', title: 'Harmattan Gold', type: 'Single', days: 13, day: 'Sat 28 Nov', done: 0, total: 18, art: '#a8641a' }
const ASK = 'Plan Harmattan Gold for Kanmi Gold, out 28 Nov'

const REST = { wide: { x: 640, y: 420 }, compact: { x: 250, y: 430 } }

async function script(a: Act<S>) {
  const compact = a.layout === 'compact'
  await a.wait(700)

  // 1. Ask Chappi from Home
  a.mark('ask')
  await a.move({ at: 'ask', x: 0.35, y: 0.4 })
  await a.wait(150)
  await a.click()
  await a.set({ focus: true })
  await a.type('ask', ASK, { interval: 45 })
  await a.wait(350)

  // 2. Send: the plan is made
  a.mark('send')
  await a.move({ at: 'send', x: 0.5, y: 0.5 })
  await a.wait(150)
  await a.click()
  await a.set({ making: true, focus: false })
  await a.wait(1000)
  await a.set({ view: 'plan', making: false, ask: '' })
  a.move({ at: 'rest', x: compact ? 0.9 : 0.7, y: 0.4 })
  await a.wait(350)

  // 3. The plan appears, row by row
  a.mark('plan')
  for (let i = 1; i <= TASKS.length; i++) {
    await a.set({ shown: i })
    await a.wait(110)
  }
  await a.wait(500)

  // 4. Tasks land on the team
  a.mark('owners')
  for (let i = 1; i <= TASKS.length; i++) {
    await a.set({ owners: i })
    await a.wait(260)
  }
  await a.wait(2200)

  // 5. Back to Home: the new rollout is in the artists list
  a.mark('back')
  await a.move({ at: 'crumb', x: 0.5, y: 0.55 })
  await a.wait(150)
  await a.click()
  await a.set({ view: 'home' })
  await a.wait(250)
  await a.set({ added: true })
  await a.move(compact ? REST.compact : REST.wide)
  await a.wait(1800)

  // Reset with a soft fade
  await a.set({ dim: true })
  await a.wait(450)
  await a.snap({ ...initial, dim: true })
  await a.set({ dim: false })
  await a.wait(400)
}

function Cover({ color, title, size = 40 }: { color: string; title: string; size?: number }) {
  return (
    <span className="ug-cover" style={{ background: color, width: size, height: size }}>
      <span className="ug-cover__moon" />
      {size >= 40 && <span className="ug-cover__t">{title}</span>}
    </span>
  )
}

function Bar({ done, total }: { done: number; total: number }) {
  return (
    <span className="ug-bar"><span className="ug-bar__fill" style={{ width: `${(done / total) * 100}%` }} /></span>
  )
}

function ArtistRow({ r, compact }: { r: Row; compact: boolean }) {
  if (compact) {
    return (
      <div className="ug-arow">
        <Cover color={r.art} title={r.title} size={40} />
        <span className="ug-stack ug-arow__main">
          <span className="ug-strong">{r.title}</span>
          <span className="ug-muted">{r.artist}</span>
        </span>
        <span className="ug-drop"><b>{r.days}</b><span>days</span></span>
      </div>
    )
  }
  return (
    <div className="ug-arow">
      <span className="ug-arow__who">
        <Avatar name={r.artist} size={30} style={{ fontSize: 11 }} />
        <span className="ug-strong ug-name">{r.artist}</span>
      </span>
      <span className="ug-arow__what">
        <Cover color={r.art} title={r.title} size={34} />
        <span className="ug-stack">
          <span className="ug-strong">{r.title}</span>
          <span className="ug-muted">{r.type}</span>
        </span>
      </span>
      <span className="ug-drop"><b>{r.days}</b><span>days · {r.day}</span></span>
      <span className="ug-stack ug-arow__work">
        <Bar done={r.done} total={r.total} />
        <span className="ug-mono">{r.done} of {r.total} done</span>
      </span>
    </div>
  )
}

function ChatBox({ s }: { s: S }) {
  return (
    <div className="ug-ask" data-focus={s.focus || undefined}>
      <span className="ug-ask__field" data-target="ask" data-cursor="ibeam">
        {s.ask ? (
          <span className="ug-ask__text">{s.ask}{s.focus && <span className="ug-caret" />}</span>
        ) : (
          <span className="ug-ask__ph">What is slipping? Who is waiting on you? What comes next? Just ask.</span>
        )}
      </span>
      <span className="ug-ask__tools">
        <span className="ug-ask__plus"><Plus size={14} strokeWidth={1.8} /></span>
        <span className="ug-ask__about">About: Everything</span>
        <span className="ss-window__spacer" />
        <span className="ug-send" data-target="send" data-cursor="pointer" data-go={s.ask ? true : undefined}>
          {s.making ? <Spinner size={14} /> : <ArrowUp size={15} strokeWidth={2} />}
        </span>
      </span>
    </div>
  )
}

function HomeView({ s, compact }: { s: S; compact: boolean }) {
  const rows = (
    <div className="ug-artists">
      {!compact && (
        <div className="ug-arow ug-arow--head">
          <span>Artist</span><span>Next rollout</span><span>Drops</span><span>Tasks</span>
        </div>
      )}
      <ArtistRow r={ROWS[0]} compact={compact} />
      <Collapse open={s.added}>
        <div className="ug-new"><ArtistRow r={NEW} compact={compact} /></div>
      </Collapse>
      {ROWS.slice(1).map((r) => <ArtistRow key={r.title} r={r} compact={compact} />)}
    </div>
  )
  return (
    <div className="ug-view" data-show={s.view === 'home' || undefined}>
      <div className="ug-top">
        <div className="ug-top__chat">
          <p className="ug-hello">Sunday morning</p>
          <p className="ug-greet">Good morning, Dami.<br /><span>What is on your mind?</span></p>
          <ChatBox s={s} />
        </div>
        {!compact && (
          <div className="ug-next">
            <p className="ug-hello">Next drop</p>
            <span className="ug-next__row">
              <Cover color={ROWS[0].art} title={ROWS[0].title} size={44} />
              <span className="ug-stack">
                <span className="ug-strong">{ROWS[0].title}</span>
                <span className="ug-muted">{ROWS[0].artist} · Single</span>
              </span>
            </span>
            <span className="ug-next__count"><b>7</b><span>days to go<br />Sun 22 Nov</span></span>
            <Bar done={14} total={17} />
            <span className="ug-muted">14 of 17 done</span>
          </div>
        )}
      </div>
      <div className="ug-sec">Your artists</div>
      {rows}
    </div>
  )
}

function Owner({ who, on, compact }: { who: Person; on: boolean; compact: boolean }) {
  return (
    <span className="ug-owner" data-on={on || undefined}>
      <span className="ug-owner__none"><span className="ug-owner__ring" />{!compact && 'Unassigned'}</span>
      <span className="ug-owner__who">
        <Avatar name={who.name} size={22} style={{ fontSize: 10 }} />
        <span>{who.first}</span>
      </span>
    </span>
  )
}

function PlanView({ s, compact }: { s: S; compact: boolean }) {
  return (
    <div className="ug-view" data-show={s.view === 'plan' || undefined}>
      {compact ? (
        <div className="ug-mplan">
          <span className="ug-back" data-target="crumb" data-cursor="pointer"><ChevronLeft size={16} strokeWidth={1.8} />Home</span>
          <div className="ug-mplan__title">
            <Cover color={NEW.art} title={NEW.title} size={44} />
            <div className="ug-stack">
              <span className="ug-strong ug-big">Harmattan Gold</span>
              <span className="ug-muted">Kanmi Gold · Sat 28 Nov</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="ug-head">
          <span className="ug-crumbs">
            <span className="ug-crumb" data-target="crumb" data-cursor="pointer">Home</span>
            <ChevronRight size={15} strokeWidth={1.8} className="ug-icon" />
            <span className="ug-h">Harmattan Gold</span>
            <span className="ug-sep" />
            <span className="ug-muted">Kanmi Gold · Sat 28 Nov</span>
          </span>
          <span className="ug-muted">0 of 18 done</span>
        </div>
      )}
      <div className="ug-phases">
        <span className="ug-phase" data-now>Pre-release <span className="ug-now">NOW</span><span className="ug-mono">0/13</span></span>
        <span className="ug-phase">Release <span className="ug-mono">0/3</span></span>
        {!compact && <span className="ug-phase">Post-release <span className="ug-mono">0/2</span></span>}
      </div>
      <div className="ug-tasks">
        {TASKS.map((t, i) => (
          <Collapse key={t.title} open={s.shown > i} reveal="drop">
            <div className="ug-task" data-landed={s.owners === i + 1 || undefined}>
              <Circle size={16} strokeWidth={1.6} className="ug-icon" />
              {compact ? (
                <span className="ug-stack ug-task__main">
                  <span className="ug-task__t">{t.title}</span>
                  <span className="ug-mono ug-faint">{t.due}</span>
                </span>
              ) : (
                <>
                  <span className="ug-task__t ug-task__main">{t.title}</span>
                  <span className="ug-mono ug-faint ug-task__due">{t.due}</span>
                </>
              )}
              <Owner who={t.who} on={s.owners > i} compact={compact} />
            </div>
          </Collapse>
        ))}
      </div>
    </div>
  )
}

function Scene({ s, layout }: { s: S; layout: Layout }) {
  const compact = layout === 'compact'
  const body = (
    <div className="ug-app" data-dim={s.dim || undefined}>
      <div className="ug-main" data-target="rest">
        <HomeView s={s} compact={compact} />
        <PlanView s={s} compact={compact} />
      </div>
    </div>
  )
  if (compact) {
    return <div className="ug-phoneish ug-wall">{body}</div>
  }
  return (
    <Window url="team.urganize.app" urlShape="pill" className="ug-window" body={{ className: 'ug-body ug-wall', 'data-crop': true }}>
      <div className="ug-topbar">
        <span className="ug-word">Urganize<span className="ug-beta">BETA</span></span>
        <span className="ug-tabs">
          <span data-active>Home</span><span>Ask Chappi</span>
        </span>
        <span className="ug-tools">
          <span className="ug-round"><Search size={15} strokeWidth={1.7} /></span>
          <span className="ug-round"><Bell size={15} strokeWidth={1.7} /></span>
          <span className="ug-me">DO</span>
        </span>
      </div>
      {body}
    </Window>
  )
}

// The still is the loop's last frame: Home, with the new rollout in the
// artists list (#1325).
export const POSTER: S = { ...initial, view: 'home', added: true }

const COMPACT = { below: Infinity, width: 358, height: 540 }

type Props = {
  theme: 'light' | 'dark'
  /** The phone design. HeroLoop decides it with the same media query as the
   *  poster's <picture>, so the still and the loop always match. */
  compact: boolean
  /** Called once the stage has measured and painted its first frame. */
  onReady?: () => void
}

export default function HeroLoopDemo({ theme, compact, onReady }: Props) {
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
      width={1000}
      height={560}
      compact={compact ? COMPACT : undefined}
      theme={theme}
      fill
      fidelity="realistic"
      initial={initial}
      poster={POSTER}
      script={script}
      cursor={{ at: REST, style: compact ? 'touch' : 'real', idle: false }}
      className="ug-stage"
    >
      {(s, _rect, layout) => <Scene s={s} layout={layout} />}
    </Stage>
  )
}

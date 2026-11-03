'use client'

import { useEffect } from 'react'
import { Bell, CalendarClock, ChevronLeft, ChevronRight, Circle, Disc3, ListChecks, Mic, Plus, Search } from 'lucide-react'
import { Avatar, Collapse, Field, Popover, Spinner, Stage, States, Window, type Act, type Layout } from '@urganize/stageshow'
import './hero-loop.css'

// Urganize homepage hero loop (#952, item 1 of #951; founder approved the
// mock). Northline Music demo team, fictional artists. One story: add a release, the plan appears,
// tasks land on the team. Then back to Rollouts, where the new release now
// sits on top, and a soft fade resets the loop.
//
// Loaded only by HeroLoop.tsx, client side, after the poster still has
// painted. Colours live in hero-loop.css and follow the site's theme toggle;
// `theme` only tells the kit which cursor and shadows to draw.

type View = 'list' | 'plan'
type S = {
  view: View
  open: boolean
  title: string
  focus: boolean
  making: boolean
  shown: number // task rows revealed
  owners: number // task rows with an owner
  added: boolean
  dim: boolean
}

const initial: S = { view: 'list', open: false, title: '', focus: false, making: false, shown: 0, owners: 0, added: false, dim: false }

type Person = { name: string; first: string }
const DAMI: Person = { name: 'Dami Okafor', first: 'Dami' }
const KANMI: Person = { name: 'Kanmi Gold', first: 'Kanmi' }
const TOBI: Person = { name: 'Tobi Ade', first: 'Tobi' }
const ADA: Person = { name: 'Ada Nwosu', first: 'Ada' }
const FEMI: Person = { name: 'Femi Bello', first: 'Femi' }

const TASKS: { title: string; due: string; who: Person }[] = [
  { title: 'Choose distributor', due: 'Oct 3', who: DAMI },
  { title: 'Lock the master file', due: 'Oct 6', who: KANMI },
  { title: 'Brief designer on cover art', due: 'Oct 10', who: TOBI },
  { title: 'Write song metadata', due: 'Oct 14', who: DAMI },
  { title: 'Begin playlist outreach', due: 'Oct 24', who: ADA },
  { title: 'Shoot teaser clips', due: 'Nov 2', who: FEMI },
]

const ROLLOUTS = [
  { title: 'Love Letters from Yaba', artist: 'Yaba Kid', date: 'Nov 22, 2026', done: 14, total: 17, art: '#2b2a6b' },
  { title: 'Sannu Da Zuwa', artist: 'Nasir Sahara', date: 'Apr 4, 2027', done: 11, total: 18, art: '#8e2a2c' },
  { title: 'Nkem', artist: 'Chi Velvet', date: 'Feb 7, 2027', done: 3, total: 16, art: '#7a5a1c' },
  { title: 'Ife Mi', artist: 'Temi Ivory', date: 'Dec 13, 2026', done: 4, total: 13, art: '#1f5a6b' },
  { title: 'Owambe Weather', artist: 'Lagoon Theory', date: 'Oct 24, 2026', done: 17, total: 19, art: '#36561f' },
]
const NEW = { title: 'Harmattan Gold', artist: 'Kanmi Gold', date: 'Nov 28, 2026', done: 0, total: 18, art: '#a8641a' }

const REST = { wide: { x: 640, y: 420 }, compact: { x: 250, y: 430 } }

async function script(a: Act<S>) {
  const compact = a.layout === 'compact'
  await a.wait(700)

  // 1. Add rollout
  a.mark('add')
  await a.move({ at: 'add', x: 0.5, y: 0.55 })
  await a.wait(200)
  await a.click()
  await a.set({ open: true })
  await a.wait(450)

  // 2. Name the release
  a.mark('type')
  await a.move({ at: 'title', x: 0.3, y: 0.55 })
  await a.click()
  await a.set({ focus: true })
  await a.type('title', 'Harmattan Gold', { interval: 70 })
  await a.wait(350)

  // 3. Make the plan
  a.mark('make')
  await a.move({ at: 'make', x: 0.5, y: 0.55 })
  await a.wait(150)
  await a.click()
  await a.set({ making: true, focus: false })
  await a.wait(900)
  await a.set({ open: false })
  await a.wait(150)
  await a.set({ view: 'plan', making: false })
  a.move({ at: 'rest', x: compact ? 0.9 : 0.7, y: 0.4 })
  await a.wait(350)

  // 4. The plan appears, row by row
  a.mark('plan')
  for (let i = 1; i <= TASKS.length; i++) {
    await a.set({ shown: i })
    await a.wait(110)
  }
  await a.wait(500)

  // 5. Tasks land on the team
  a.mark('owners')
  for (let i = 1; i <= TASKS.length; i++) {
    await a.set({ owners: i })
    await a.wait(260)
  }
  await a.wait(2200)

  // 6. Back to Rollouts: the new release is on top
  a.mark('back')
  await a.move({ at: 'crumb', x: 0.5, y: 0.55 })
  await a.wait(150)
  await a.click()
  await a.set({ view: 'list' })
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

function Draft() {
  return <span className="ug-draft"><span className="ug-draft__dot" />Draft</span>
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <span className="ug-progress">
      <span className="ug-progress__track"><span className="ug-progress__fill" style={{ width: `${(done / total) * 100}%` }} /></span>
      <span className="ug-mono">{done}/{total}</span>
    </span>
  )
}

function RolloutRow({ r, compact }: { r: typeof NEW; compact: boolean }) {
  if (compact) {
    return (
      <div className="ug-card">
        <div className="ug-card__top">
          <Cover color={r.art} title={r.title} size={44} />
          <div className="ug-stack">
            <span className="ug-strong">{r.title}</span>
            <span className="ug-muted">{r.artist}</span>
          </div>
        </div>
        <div className="ug-card__meta">
          <Draft />
          <span className="ug-muted">{r.date}</span>
        </div>
        <Progress done={r.done} total={r.total} />
      </div>
    )
  }
  return (
    <div className="ug-trow">
      <span className="ug-trow__main">
        <Cover color={r.art} title={r.title} />
        <span className="ug-stack">
          <span className="ug-strong">{r.title}</span>
          <span className="ug-muted">{r.artist}</span>
        </span>
      </span>
      <span><Draft /></span>
      <span className="ug-date">{r.date}</span>
      <Progress done={r.done} total={r.total} />
    </div>
  )
}

function ListView({ s, compact }: { s: S; compact: boolean }) {
  return (
    <div className="ug-view" data-show={s.view === 'list' || undefined}>
      {compact ? (
        <div className="ug-mtop">
          <span className="ug-mtab">Artists</span>
          <span className="ug-mtab" data-active>Rollouts</span>
          <span className="ss-window__spacer" />
          <span className="ug-plus" data-target="add" data-cursor="pointer" data-open={s.open || undefined}><Plus size={18} strokeWidth={1.8} /></span>
        </div>
      ) : (
        <div className="ug-head">
          <span className="ug-h">Rollouts</span>
          <span className="ug-add" data-target="add" data-cursor="pointer" data-open={s.open || undefined}>
            <Plus size={14} strokeWidth={2} />Add rollout
          </span>
        </div>
      )}
      <div className="ug-table">
        {!compact && (
          <div className="ug-trow ug-trow--head">
            <span>Rollout</span><span>Status</span><span>Release date</span><span>Progress</span>
          </div>
        )}
        <Collapse open={s.added}>
          <div className="ug-new"><RolloutRow r={NEW} compact={compact} /></div>
        </Collapse>
        {ROLLOUTS.map((r) => <RolloutRow key={r.title} r={r} compact={compact} />)}
      </div>
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
          <span className="ug-back" data-target="crumb" data-cursor="pointer"><ChevronLeft size={16} strokeWidth={1.8} />Rollouts</span>
          <div className="ug-mplan__title">
            <Cover color={NEW.art} title={NEW.title} size={44} />
            <div className="ug-stack">
              <span className="ug-strong ug-big">Harmattan Gold</span>
              <span className="ug-muted">Kanmi Gold · Nov 28</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="ug-head">
          <span className="ug-crumbs">
            <span className="ug-crumb" data-target="crumb" data-cursor="pointer">Rollouts</span>
            <ChevronRight size={15} strokeWidth={1.8} className="ug-icon" />
            <span className="ug-h">Harmattan Gold</span>
            <span className="ug-sep" />
            <span className="ug-muted">Kanmi Gold</span>
            <Draft />
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

function Sidebar({ s }: { s: S }) {
  const plan = s.view === 'plan'
  return (
    <div className="ug-side">
      <div className="ug-nav"><Mic size={16} strokeWidth={1.6} />Artists</div>
      <div className="ug-nav" data-active={!plan || undefined}><Disc3 size={16} strokeWidth={1.6} />Rollouts</div>
      <Collapse open={plan}>
        <div className="ug-side__sec">Plan</div>
        <div className="ug-nav ug-nav--sub"><CalendarClock size={15} strokeWidth={1.6} />See the timeline</div>
        <div className="ug-nav ug-nav--sub" data-active><ListChecks size={15} strokeWidth={1.6} />Work the plan</div>
      </Collapse>
    </div>
  )
}

function NewRollout({ s, compact }: { s: S; compact: boolean }) {
  return (
    <Popover show={s.open} origin="top right" className="ug-pop" data-compact={compact || undefined}>
      <div className="ug-pop__h">New rollout</div>
      <Field label="Release title" value={s.title} placeholder="What is it called?" focused={s.focus} box={{ 'data-target': 'title', 'data-cursor': 'ibeam' }} />
      <div className="ug-pop__pair">
        <Field label="Artist" value="Kanmi Gold" />
        <Field label="Release date" value="Nov 28, 2026" />
      </div>
      <span className="ug-make" data-target="make" data-cursor="pointer" data-busy={s.making || undefined}>
        <States
          value={s.making ? 'busy' : 'idle'}
          states={{
            idle: <span>Make the plan</span>,
            busy: <span className="ug-make__busy"><Spinner size={14} />Making the plan</span>,
          }}
        />
      </span>
    </Popover>
  )
}

function Scene({ s, layout }: { s: S; layout: Layout }) {
  const compact = layout === 'compact'
  const body = (
    <div className="ug-app" data-dim={s.dim || undefined}>
      <div className="ug-main" data-target="rest">
        <ListView s={s} compact={compact} />
        <PlanView s={s} compact={compact} />
      </div>
      <NewRollout s={s} compact={compact} />
    </div>
  )
  if (compact) {
    return <div className="ug-phoneish">{body}</div>
  }
  return (
    <Window url="team.urganize.app" urlShape="pill" className="ug-window" body={{ className: 'ug-body', 'data-crop': true }}>
      <div className="ug-topbar">
        <span className="ug-word">Urganize<span className="ug-beta">BETA</span></span>
        <span className="ug-tabs">
          <span>Home</span><span>AI</span><span data-active>Artists</span><span>Relationships</span><span>Opportunities</span>
        </span>
        <span className="ug-tools">
          <span className="ug-round"><Search size={15} strokeWidth={1.7} /></span>
          <span className="ug-round"><Bell size={15} strokeWidth={1.7} /></span>
        </span>
      </div>
      <div className="ug-split">
        <Sidebar s={s} />
        {body}
      </div>
    </Window>
  )
}

// One past the last row, so every task is owned and none wears the brief
// "just landed" highlight in the still.
export const POSTER: S = { ...initial, view: 'plan', shown: TASKS.length, owners: TASKS.length + 1 }

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

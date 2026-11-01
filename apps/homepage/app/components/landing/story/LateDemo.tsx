'use client'

import { Check as Tick, Flag } from 'lucide-react'
import { Bar, Collapse, Stage, Tooltip, type Act, type Layout, type Theme } from '@urganize/stageshow'
import './story.css'
import './late.css'

// Story step 3, "Catch the delay before it kills the drop." The rollout's
// timeline, weeks counting down to release day. Today moves on past an
// activity nobody finished; it turns red and says Overdue beside its name.
// Its marker is dragged to a later day that still lands before release, and
// it is back on plan. Plays once.
//
// Positions are in weeks before release day (r), so both layouts place
// every mark the same way: x = (weeks - r) * column.
//
// Real strings: the heading, the axis, four activity names, the Overdue tag
// and the new date while dragging. The last row is filler.

type S = { today: number; late: boolean; r: number; dragging: boolean }

const DUE = 2.25
const MOVED = 1
const initial: S = { today: 2.45, late: false, r: DUE, dragging: false }
const poster: S = { today: 1.75, late: true, r: DUE, dragging: false }

const GEO: Record<Layout, { weeks: number; col: number }> = {
  wide: { weeks: 4, col: 50 },
  compact: { weeks: 3, col: 30 },
}

// Release day is Fri 27 Nov 2026; a mark r weeks before it falls on this day
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dateAt(r: number) {
  const back = Math.round(r * 7)
  return `${DAYS[(((5 - back) % 7) + 7) % 7]} ${27 - back} Nov`
}

async function script(a: Act<S>) {
  const { weeks, col } = GEO[a.layout]
  await a.wait(700)

  // 1. Time passes: today glides on past the activity's due day
  a.mark('time')
  await a.set({ today: 1.75 })
  await a.wait(700)
  a.mark('late')
  await a.set({ late: true })
  await a.wait(1500)

  // 2. Its marker is dragged to a later day, still before release
  a.mark('drag')
  const grid = a.rect('grid')
  const dot = a.rect('pitch')
  const y = dot.y + dot.height / 2
  await a.move({ at: 'pitch', x: 0.5, y: 0.5 })
  await a.wait(200)
  await a.drag(
    { x: grid.x + (weeks - MOVED) * col, y },
    (p) => {
      const r = Math.max(MOVED, Math.min(DUE, weeks - (p.x - grid.x) / col))
      a.put({ dragging: true, r })
    },
    { duration: 1200 },
  )
  await a.set({ dragging: false, r: MOVED, late: false })
  a.move({ at: 'rest', x: 0.5, y: 0.5 }, { duration: 900 })
  a.mark('fixed')
  await a.wait(2600)
}

type Item = { name: string; r: Partial<Record<Layout, number>> & { wide: number }; kind: 'done' | 'todo' | 'release' }
const ROWS: Item[] = [
  { name: 'Brief designer on cover art', r: { wide: 3.6, compact: 2.85 }, kind: 'done' },
  { name: 'Write song metadata', r: { wide: 2.9, compact: 2.6 }, kind: 'done' },
  // The pitch row is drawn from state, between these
  { name: 'Upload to distributor', r: { wide: 0.45 }, kind: 'todo' },
  { name: 'Release day', r: { wide: 0 }, kind: 'release' },
]

export default function LateDemo({ theme }: { theme: Theme }) {
  return (
    <Stage<S>
      width={560}
      height={380}
      compact={{ below: 520, width: 358, height: 380 }}
      initial={initial}
      poster={poster}
      script={script}
      theme={theme}
      play="once"
      cursor={{ at: { wide: { x: 480, y: 340 }, compact: { x: 300, y: 350 } } }}
      className="urg ul"
    >
      {(s, rect, layout) => {
        const { weeks, col } = GEO[layout]
        const x = (r: number) => (weeks - r) * col
        const grid = rect('grid')
        const pitchAt = { x: grid.x + x(s.r) - 6, y: grid.y + 2 * 32 + 10, width: 12, height: 12 }
        const row = (item: Item) => (
          <div key={item.name} className="ul-row">
            <span className="ul-label">
              {item.kind === 'release' && <Flag size={13} strokeWidth={1.75} className="ul-flag" />}
              <span className="ul-name">{item.name}</span>
            </span>
            <span className="ul-lane">
              <Mark kind={item.kind} left={x(item.r[layout] ?? item.r.wide)} />
            </span>
          </div>
        )
        return (
          <>
            <div className="ul-rest" data-target="rest" />
            <div className="ul-card">
              <div className="ul-heading urg-serif">Timeline for Harmattan Gold</div>
              <div className="ul-body" style={{ ['--col' as string]: `${col}px`, ['--weeks' as string]: weeks }}>
                <div className="ul-row ul-row--axis">
                  <span className="ul-label" />
                  <span className="ul-lane ul-axis">
                    {Array.from({ length: weeks }, (_, i) => (
                      <span key={i} className="ul-week urg-caps" style={{ left: i * col }}>
                        W{weeks - i}
                      </span>
                    ))}
                    <span className="ul-week ul-week--release urg-caps" style={{ left: x(0) }}>
                      Release
                    </span>
                  </span>
                </div>

                <div className="ul-rows">
                  <div className="ul-grid" data-target="grid">
                    {Array.from({ length: weeks }, (_, i) => (
                      <span key={i} className="ul-rule" style={{ left: i * col }} />
                    ))}
                    <span className="ul-release" style={{ left: x(0) }} />
                    <span className="ul-today" style={{ left: x(s.today) }}>
                      <span className="ul-today__pill urg-caps">Today</span>
                    </span>
                  </div>

                  {ROWS.slice(0, 2).map(row)}
                  <div className="ul-row" data-late={s.late || undefined}>
                    <span className="ul-label">
                      <span className="ul-name">Pitch to curators</span>
                      <Collapse open={s.late} className="ul-tagwrap">
                        <span className="ul-tag">Overdue</span>
                      </Collapse>
                    </span>
                    <span className="ul-lane">
                      <span
                        className="ul-pitch"
                        data-target="pitch"
                        data-cursor="open"
                        data-late={s.late || undefined}
                        data-dragging={s.dragging || undefined}
                        style={{ left: x(s.r) }}
                      />
                    </span>
                  </div>
                  {ROWS.slice(2).map(row)}
                  <div className="ul-row">
                    <span className="ul-label">
                      <Bar w={112} h={7} tone={2} />
                    </span>
                    <span className="ul-lane">
                      <Mark kind="todo" left={x(-0.4)} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <Tooltip show={s.dragging} at={pitchAt} side="above" gap={10} className="ul-tip">
              {dateAt(s.r)}
            </Tooltip>
          </>
        )
      }}
    </Stage>
  )
}

function Mark({ kind, left }: { kind: Item['kind']; left: number }) {
  if (kind === 'done') {
    return (
      <span className="ul-done" style={{ left }}>
        <Tick size={9} strokeWidth={3} />
      </span>
    )
  }
  if (kind === 'release') return <span className="ul-diamond" style={{ left }} />
  return <span className="urg-ring ul-dot" style={{ left }} />
}

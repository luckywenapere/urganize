'use client'

import { CalendarDays } from 'lucide-react'
import { Avatar, Bar, Collapse, Count, Spinner, Stage, States, type Act, type Theme } from '@urganize/stageshow'
import './story.css'
import './plan.css'

// Story step 1, "Stop planning releases in your head." One rollout card.
// It opens as a new rollout with its release day filled in; Make the plan is
// pressed, the form folds away and the plan arrives week by week down to
// release day, the activity count rolling as the weeks land. Plays once.
//
// Real strings: the release, the artist, the release day, the button, the
// week labels and five activity titles. Owners are avatars; the rows past
// release day are filler.

type S = { busy: boolean; built: boolean; weeks: number; count: number }

const initial: S = { busy: false, built: false, weeks: 0, count: 0 }
const poster: S = { busy: false, built: true, weeks: 4, count: 18 }

type Week = { label: string; release?: boolean; rows: { title: string; who: string }[] }

const WEEKS: Week[] = [
  { label: 'W8 · 2 Oct', rows: [{ title: 'Choose distributor', who: 'Dami Okafor' }, { title: 'Lock the master file', who: 'Ife Bassey' }] },
  { label: 'W6 · 16 Oct', rows: [{ title: 'Brief designer on cover art', who: 'Tolu Ade' }] },
  { label: 'W3 · 6 Nov', rows: [{ title: 'Pitch to curators', who: 'Ife Bassey' }] },
  { label: 'Release · 27 Nov', release: true, rows: [{ title: 'Post the release', who: 'Tolu Ade' }] },
]
// Running total as each week lands; the last one is the whole plan
const COUNTS = [5, 9, 14, 18]

async function script(a: Act<S>) {
  await a.wait(800)
  a.mark('press')
  await a.move({ at: 'make', x: 0.78, y: 0.6 })
  await a.wait(150)
  await a.click()
  await a.set({ busy: true })
  // Off the card while the plan builds
  a.move({ at: 'rest', x: 0.5, y: 0.5 }, { duration: 700 })
  await a.wait(900)
  a.mark('plan')
  await a.set({ built: true })
  await a.wait(260)
  for (let i = 0; i < WEEKS.length; i++) {
    await a.set({ weeks: i + 1, count: COUNTS[i] })
    await a.wait(420)
  }
  await a.set({ busy: false })
  a.mark('done')
  await a.wait(2400)
}

export default function PlanDemo({ theme }: { theme: Theme }) {
  return (
    <Stage<S>
      width={560}
      height={400}
      compact={{ below: 520, width: 358, height: 430 }}
      initial={initial}
      poster={poster}
      script={script}
      theme={theme}
      play="once"
      cursor={{ at: { wide: { x: 470, y: 360 }, compact: { x: 300, y: 380 } } }}
      className="urg up"
    >
      {(s) => (
        <>
          <div className="up-rest" data-target="rest" />
          <div className="up-card">
            <div className="up-head">
              <div className="up-head__text">
                <div className="up-title urg-serif">Harmattan Gold</div>
                <div className="up-sub">Kanmi Gold · Single</div>
              </div>
              <div className="up-count" data-on={s.built || undefined}>
                <Count value={s.count} duration={500} className="up-count__n" />
                <span>activities</span>
              </div>
            </div>

            <Collapse open={!s.built}>
              <div className="up-form">
                <div className="up-form__label urg-caps">Release day</div>
                <div className="up-form__row">
                  <span className="up-date">
                    <CalendarDays size={15} strokeWidth={1.75} />
                    Fri 27 Nov
                  </span>
                  <span className="up-make" data-target="make" data-cursor="pointer" data-busy={s.busy || undefined}>
                    <States
                      value={s.busy ? 'busy' : 'idle'}
                      states={{
                        idle: <span>Make the plan</span>,
                        busy: (
                          <span className="up-make__busy">
                            <Spinner size={13} />
                            Planning
                          </span>
                        ),
                      }}
                    />
                  </span>
                </div>
              </div>
            </Collapse>

            <div className="up-weeks">
              {/* The weeks are there from the first frame as placeholder
                  rows at their real geometry, and resolve top to bottom */}
              {WEEKS.map((w, i) => (
                <div key={w.label} className="up-week" data-on={s.weeks > i || undefined}>
                  <div className="up-week__label urg-caps up-swap" data-release={w.release || undefined}>
                    <Bar w={64} h={6} tone={2} className="up-swap__bar" />
                    <span className="up-swap__real">{w.label}</span>
                  </div>
                  {w.rows.map((r, j) => (
                    <div key={r.title} className="up-row">
                      <span className="up-swap up-swap--mark">
                        <span className="urg-ring up-swap__bar up-ring--blank" />
                        <span className="up-swap__real">{w.release ? <span className="up-diamond" /> : <span className="urg-ring" />}</span>
                      </span>
                      <span className="up-row__title up-swap">
                        <Bar w={[132, 110, 168, 120, 104][(i + j) % 5]} h={7} tone={2} className="up-swap__bar" />
                        <span className="up-swap__real">{r.title}</span>
                      </span>
                      <span className="up-swap">
                        <Avatar plain size={22} className="up-swap__bar" />
                        <Avatar name={r.who} size={22} className="up-swap__real" />
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Stage>
  )
}

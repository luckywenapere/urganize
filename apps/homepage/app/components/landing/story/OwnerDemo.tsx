'use client'

import { CalendarDays, Check as Tick, ChevronDown, CircleDot, Layers, UserRound, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar, Bar, Menu, Popover, Stage, States, type Act, type Rect, type Theme } from '@urganize/stageshow'
import './story.css'
import './owner.css'

// Story step 2, "Everyone can see who's holding the ball." One activity,
// open, as the app shows it. It has no owner and no date; the owner field
// opens a list of the team and Ife is picked, then the date field opens the
// week and Friday is picked. Both fields now say it. Plays once.
//
// Real strings: the activity, its rollout, the four field values, the three
// people and the week. The description under the fields is filler.

type S = { ownerMenu: boolean; owner: boolean; dateMenu: boolean; date: boolean; hover: number | undefined }

const initial: S = { ownerMenu: false, owner: false, dateMenu: false, date: false, hover: undefined }
const poster: S = { ...initial, owner: true, date: true }

const TEAM = ['Dami Okafor', 'Ife Bassey', 'Tolu Ade']
const PICK = 1
const DAYS = [
  { d: 'M', n: 9 },
  { d: 'T', n: 10 },
  { d: 'W', n: 11 },
  { d: 'T', n: 12 },
  { d: 'F', n: 13 },
  { d: 'S', n: 14 },
  { d: 'S', n: 15 },
]
const DAY = 4

async function script(a: Act<S>) {
  await a.wait(800)

  // 1. The owner field opens the team
  a.mark('owner')
  await a.click({ at: 'owner', x: 0.42, y: 0.55 })
  await a.set({ ownerMenu: true })
  await a.wait(500)
  await a.move({ at: `who-${PICK}`, x: 0.8, y: 0.55 })
  await a.set({ hover: PICK })
  await a.wait(250)
  await a.click()
  await a.set({ owner: true })
  await a.wait(120)
  await a.set({ ownerMenu: false })
  await a.wait(600)

  // 2. The date field opens the week; Friday
  a.mark('date')
  await a.click({ at: 'date', x: 0.42, y: 0.55 })
  await a.set({ dateMenu: true, hover: undefined })
  await a.wait(500)
  await a.move({ at: `day-${DAY}`, x: 0.82, y: 0.92 })
  await a.wait(200)
  await a.click()
  await a.set({ date: true })
  await a.wait(260)
  await a.set({ dateMenu: false })
  a.move({ at: 'rest', x: 0.5, y: 0.5 }, { duration: 800 })
  a.mark('done')
  await a.wait(2600)
}

const MENU_W = 228

export default function OwnerDemo({ theme }: { theme: Theme }) {
  return (
    <Stage<S>
      width={560}
      height={400}
      compact={{ below: 520, width: 358, height: 420 }}
      initial={initial}
      poster={poster}
      script={script}
      theme={theme}
      play="once"
      cursor={{ at: { wide: { x: 480, y: 330 }, compact: { x: 300, y: 380 } } }}
      className="urg uo"
    >
      {(s, rect) => {
        const owner = rect('owner')
        const date = rect('date')
        return (
          <>
            <div className="uo-rest" data-target="rest" />
            <div className="uo-card">
              <span className="uo-close">
                <X size={16} strokeWidth={1.75} />
              </span>
              <div className="uo-titlerow">
                <span className="uo-mark">
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                    <path d="M8 2.5 13.5 8 8 13.5 2.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d="M8 5.5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <div className="uo-title urg-serif">Lock the master file</div>
                  <div className="uo-sub">To do · Harmattan Gold</div>
                </div>
              </div>

              <div className="uo-fields">
                <Field icon={<CircleDot size={16} strokeWidth={1.75} />}>To do</Field>
                <Field icon={<UserRound size={16} strokeWidth={1.75} />} target="owner" open={s.ownerMenu}>
                  <span className="uo-value">
                    <span className="uo-who" data-on={s.owner || undefined}>
                      <Avatar name="Ife Bassey" size={22} />
                    </span>
                    <States align="start" value={s.owner ? 'on' : 'off'} states={{ off: <span className="uo-empty">Add an owner</span>, on: <span>Ife Bassey</span> }} />
                  </span>
                  <ChevronDown size={15} strokeWidth={1.75} className="uo-chev" />
                </Field>
                <Field icon={<CalendarDays size={16} strokeWidth={1.75} />} target="date" open={s.dateMenu}>
                  <States align="start" value={s.date ? 'on' : 'off'} states={{ off: <span className="uo-empty">Add a date</span>, on: <span>Fri 13 Nov</span> }} />
                  <ChevronDown size={15} strokeWidth={1.75} className="uo-chev" />
                </Field>
                <Field icon={<Layers size={16} strokeWidth={1.75} />}>Pre-release</Field>
              </div>

              <div className="uo-desc">
                <Bar w={240} h={7} tone={2} />
                <Bar w={200} h={7} tone={2} />
                <Bar w={140} h={7} tone={2} />
                <span className="uo-desc__gap" />
                <Bar w={230} h={7} tone={2} />
                <Bar w={180} h={7} tone={2} />
                <Bar w={210} h={7} tone={2} />
                <Bar w={120} h={7} tone={2} />
              </div>
            </div>

            <Popover show={s.ownerMenu} origin="top left" className="uo-pop" style={below(owner, MENU_W)}>
              <Menu
                value={s.hover}
                items={TEAM.map((name) => (
                  <span className="uo-person" key={name}>
                    <Avatar name={name} size={22} />
                    <span className="uo-person__name">{name}</span>
                    <span className="uo-person__tick">{s.owner && name === TEAM[PICK] && <Tick size={14} strokeWidth={2.25} />}</span>
                  </span>
                ))}
                targets={TEAM.map((_, i) => `who-${i}`)}
              />
            </Popover>

            <Popover show={s.dateMenu} origin="top left" className="uo-pop uo-week" style={below(date, 262)}>
              <div className="uo-week__head">November</div>
              <div className="uo-week__days">
                {DAYS.map((day, i) => (
                  <span key={day.n} className="uo-day" data-target={`day-${i}`} data-cursor="pointer" data-on={(s.date && i === DAY) || undefined}>
                    <span className="uo-day__d">{day.d}</span>
                    <span className="uo-day__n">{day.n}</span>
                  </span>
                ))}
              </div>
            </Popover>
          </>
        )
      }}
    </Stage>
  )
}

function Field({ icon, target, open, children }: { icon: ReactNode; target?: string; open?: boolean; children: ReactNode }) {
  return (
    <div className="uo-field">
      <span className="uo-field__icon">{icon}</span>
      <span className="uo-field__value" data-target={target} data-cursor={target ? 'pointer' : undefined} data-open={open || undefined} data-control={target ? true : undefined}>
        {children}
      </span>
    </div>
  )
}

/** A menu 6px under its field, from the field's left edge */
function below(r: Rect, width: number) {
  return { left: r.x - 6, top: r.y + r.height + 6, width }
}

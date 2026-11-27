/**
 * What adding a project gets you (#1008, mock approved Nov 1, 2026): a
 * rollout, its plan with three tasks, and a teammate on one of them. Drawn
 * under "What are you working on?" on the first project screen.
 *
 * Fixed example content only: every name is made up and none of it is the
 * team's data. Faces are flat initials tiles. Tokens only, so it follows the
 * theme. The computer version shows from lg up, where the left column is
 * 380 to 420 wide; under md the phone card takes its place, and between the
 * two the column is too narrow for either, so it shows nothing.
 */

import { icons } from './OnboardingFrame';

const TITLE = 'Love Letters from Yaba';
const LINE = 'Kanmi Gold · Single · out Dec 12';
const TASKS = [
  { name: 'Lock the final mix', due: 'Nov 4' },
  { name: 'Shoot the cover photo', due: 'Nov 8' },
  { name: 'Pitch to playlists', due: 'Nov 21', who: 'AN' },
];
const LABEL = 'Example: a rollout, its plan with three tasks, and a teammate on one of them';

const EYEBROW = 'font-mono text-[10.5px] uppercase tracking-[0.06em] text-content-tertiary';
const SURFACE = 'border border-stroke-control/30 bg-bg-surface';
const CARD = `rounded-2xl ${SURFACE}`;
const DISC = 'grid shrink-0 place-items-center bg-brand-subtle text-brand';

function Face({ initials, size }: { initials: string; size: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-brand text-[9px] font-semibold text-content-inverse"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

function TaskRows({ compact }: { compact?: boolean }) {
  return (
    <>
      {TASKS.map((task) => (
        <div
          key={task.name}
          className={`flex items-center gap-2.5 border-t border-stroke-control/20 ${compact ? 'min-h-[38px] px-3' : 'min-h-11 px-3.5'} ${
            task.who ? 'bg-brand-subtle' : ''
          }`}
        >
          <span className="h-4 w-4 shrink-0 rounded-[5px] border-[1.5px] border-stroke-control" />
          <span className={`min-w-0 flex-1 truncate text-content-primary ${compact ? 'text-[13px]' : 'text-[13.5px]'}`}>
            {task.name}
          </span>
          <span className="font-mono text-[11px] text-content-tertiary">{task.due}</span>
          {task.who ? <Face initials={task.who} size={24} /> : compact ? null : <span className="w-6 shrink-0" />}
        </div>
      ))}
    </>
  );
}

/** A small hand-drawn arrow, sized to its own corner of the still. */
function Arrow({ className, line, head }: { className: string; line: string; head: string }) {
  return (
    <svg
      aria-hidden="true"
      width="60"
      height="82"
      viewBox="0 0 60 82"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`pointer-events-none absolute text-stroke-control ${className}`}
    >
      <path d={line} />
      <path d={head} />
    </svg>
  );
}

const PULSE = 'animate-pulse rounded-full bg-bg-hover';

function TaskRowsSkeleton({ compact }: { compact?: boolean }) {
  return (
    <>
      {TASKS.map((task) => (
        <div
          key={task.name}
          className={`flex items-center gap-2.5 border-t border-stroke-control/20 ${compact ? 'min-h-[38px] px-3' : 'min-h-11 px-3.5'}`}
        >
          <span className="h-4 w-4 shrink-0 rounded-[5px] border-[1.5px] border-stroke-control" />
          <span className={`h-2.5 w-32 ${PULSE}`} />
          <span className={`ml-auto h-2.5 w-9 ${PULSE}`} />
        </div>
      ))}
    </>
  );
}

/**
 * The still while the screen loads (#1412): the same boxes at the same sizes
 * as FirstProjectStill at each width, so nothing moves when it arrives. When
 * the still changes, change this with it.
 */
export function FirstProjectStillSkeleton() {
  return (
    <>
      <div aria-hidden="true" className="relative mt-8 hidden h-[352px] w-full max-w-[420px] lg:block">
        <span className={`absolute left-0 top-[3px] h-2.5 w-20 ${PULSE}`} />
        <div className={`absolute left-0 top-[26px] flex w-[250px] items-center gap-[11px] px-3 py-2.5 ${CARD}`}>
          <span className="h-[38px] w-[38px] shrink-0 animate-pulse rounded-[9px] bg-bg-hover" />
          <span className="min-w-0 flex-1">
            <span className={`block h-3 w-36 ${PULSE}`} />
            <span className={`mt-2 block h-2.5 w-40 ${PULSE}`} />
          </span>
        </div>
        <div className={`absolute left-[52px] right-0 top-[120px] overflow-hidden ${CARD}`}>
          <div className="flex h-[34px] items-center px-3.5">
            <span className={`h-2.5 w-9 ${PULSE}`} />
          </div>
          <TaskRowsSkeleton />
        </div>
        <span className={`absolute right-12 top-[314px] h-9 w-[220px] rounded-full ${SURFACE}`} />
      </div>
      <div aria-hidden="true" className="mt-[18px] md:hidden">
        <div className="flex h-[15.75px] items-center">
          <span className={`h-2.5 w-20 ${PULSE}`} />
        </div>
        <div className={`mt-1.5 overflow-hidden ${CARD}`}>
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-bg-hover" />
            <span className="min-w-0 flex-1">
              <span className="flex h-[18.75px] items-center">
                <span className={`h-3 w-40 max-w-full ${PULSE}`} />
              </span>
              <span className="flex h-4 items-center">
                <span className={`h-2.5 w-44 max-w-full ${PULSE}`} />
              </span>
            </span>
          </div>
          <TaskRowsSkeleton compact />
        </div>
      </div>
    </>
  );
}

export function FirstProjectStill() {
  return (
    <>
      {/* Computer: three objects joined by arrows. Up to 420 wide; the left
          column is about 380 at 1024 and 420 on wider screens. Each arrow is pinned
          to its own side, so the still can narrow without them drifting. */}
      <div role="img" aria-label={LABEL} className="relative mt-8 hidden h-[352px] w-full max-w-[420px] lg:block">
        <p className={`absolute left-0 top-0 ${EYEBROW}`}>For example</p>
        <div className={`absolute left-0 top-[26px] flex w-max items-center gap-[11px] px-3 py-2.5 ${CARD}`}>
          <span className={`h-[38px] w-[38px] rounded-[9px] ${DISC}`}>{icons.disc}</span>
          <span>
            <span className="block whitespace-nowrap font-display text-base leading-tight text-content-primary">{TITLE}</span>
            <span className="block whitespace-nowrap text-[12.5px] text-content-secondary">{LINE}</span>
          </span>
        </div>
        {/* The rollout into its plan, then the teammate up to their task. */}
        <Arrow className="left-0 top-[66px]" line="M24 22 C 24 52, 28 72, 46 74" head="M40 69 L 47 74 L 40 79" />
        <Arrow className="right-0 top-[270px]" line="M14 60 C 32 60, 38 42, 37 20" head="M32 26 L 37 19 L 42 26" />
        <div className={`absolute left-[52px] right-0 top-[120px] overflow-hidden shadow-sm ${CARD}`}>
          <p className={`px-3.5 pb-2 pt-2.5 ${EYEBROW}`}>Plan</p>
          <TaskRows />
        </div>
        <div
          className={`absolute right-12 top-[314px] flex items-center gap-2 whitespace-nowrap rounded-full py-[5px] pl-[5px] pr-3 text-[12.5px] text-content-primary shadow-sm ${SURFACE}`}
        >
          <Face initials="AN" size={26} />
          Ada Nwosu <span className="text-content-secondary">· sees it on Home</span>
        </div>
      </div>

      {/* Phone: one card, the rollout as its header. Short, so the form stays high. */}
      <div role="img" aria-label={LABEL} className="mt-[18px] md:hidden">
        <p className={EYEBROW}>For example</p>
        <div className={`mt-1.5 overflow-hidden ${CARD}`}>
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <span className={`h-8 w-8 rounded-lg ${DISC}`}>{icons.disc}</span>
            <span className="min-w-0">
              <span className="block truncate font-display text-[15px] leading-tight text-content-primary">{TITLE}</span>
              <span className="block truncate text-xs text-content-secondary">{LINE}</span>
            </span>
          </div>
          <TaskRows compact />
        </div>
      </div>
    </>
  );
}

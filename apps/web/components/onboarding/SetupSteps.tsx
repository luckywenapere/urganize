// The three steps a new team goes through on a computer (#1229, part of
// #1175; mock docs/mocks/signin-onboarding-desktop): Account, Plan, First
// artist. Shown at the top of Create account, Choose a plan and the first
// artist screen so the length of the journey is known before it starts.
// Presentational only, no state, so the static sign-up page stays static.

const STEPS = ['Account', 'Plan', 'First artist'] as const;

export type SetupStep = 1 | 2 | 3;

export function SetupSteps({ current, className = '' }: { current: SetupStep; className?: string }) {
  return (
    <ol aria-label="Getting started" className={`flex items-center gap-2 text-[13px] text-content-tertiary ${className}`}>
      {STEPS.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const on = step === current;
        return (
          <li key={label} className="flex items-center gap-2" aria-current={on ? 'step' : undefined}>
            {index > 0 ? <span aria-hidden="true" className="h-px w-6 bg-stroke-control" /> : null}
            <span className={`flex items-center gap-2 ${on ? 'font-semibold text-content-primary' : ''}`}>
              <span
                aria-hidden="true"
                className={`grid h-[22px] w-[22px] place-items-center rounded-full text-[11px] font-semibold ${
                  done
                    ? 'bg-brand text-content-inverse'
                    : on
                      ? 'bg-content-primary text-bg-base'
                      : 'bg-bg-hover text-content-secondary'
                }`}
              >
                {done ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  step
                )}
              </span>
              {label}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

import "./plan-picture.css";

// The small picture at the top of each pricing card (#963, mock approved under
// #951): the same shot of Urganize on every plan, your rollouts list and a card
// with your team and your AI credits, where only the plan's numbers change.
// Shared since #1053 by /pricing on the marketing site and the sign-in page in
// the app, so the two pages can never draw a plan differently.
//
// Drawn in markup rather than shipped as a screenshot, on purpose: every
// number in it is passed in from the tier's `limits` and `urgansMonthlyCredits`
// in @urganize/pricing by the caller, so it cannot show a seat count, a rollout count or a
// credit allowance the price list (and the product) does not. A WebP would
// freeze today's numbers into a file the next reprice forgets.
//
// No runtime JS: it scales to the card with container query units (see
// `.plan-shot` in globals.css), and it follows the site's light/dark toggle
// through the same `data-marketing-theme` attribute as the product shots.
// aria-hidden because it repeats the feature list right below it.

// The fictional Northline Music roster, as on the rest of the site's stills.
const ROLLOUTS = [
  { initials: "KG", color: "#2f8f83", title: "Harmattan Gold", artist: "Kanmi Gold", done: 10 },
  { initials: "HM", color: "#3a7fae", title: "Moonlit", artist: "Hadiza Moon", done: 6 },
  { initials: "LT", color: "#b8673a", title: "Low Tide", artist: "Lagoon Theory", done: 3 },
  { initials: "TI", color: "#b0456a", title: "Ivory Nights", artist: "Temi Ivory", done: 14 },
  { initials: "CV", color: "#6b7d3a", title: "Velvet Hour", artist: "Chi Velvet", done: 2 },
] as const;
const TASKS_PER_ROLLOUT = 18;

const PEOPLE = [
  { initials: "DO", color: "#7a5c3e" },
  { initials: "IB", color: "#3f6f8f" },
  { initials: "SA", color: "#8a4f6e" },
  { initials: "ZM", color: "#4f7a5a" },
  { initials: "TE", color: "#9a6a2e" },
] as const;

export type PlanPictureProps = {
  /** Rollouts at a time; null is no limit. */
  activeReleases: number | null;
  /** People on the team; null is no limit. */
  seats: number | null;
  /** AI credits a month. */
  monthlyCredits: number;
};

export function PlanPicture({ activeReleases, seats, monthlyCredits }: PlanPictureProps) {
  const limits = { activeReleases, seats };
  const unlimitedRollouts = limits.activeReleases === null;
  const rollouts = ROLLOUTS.slice(0, limits.activeReleases ?? ROLLOUTS.length);
  // More rollouts than the picture holds: let the list run past the edge.
  const listRunsOn = unlimitedRollouts || (limits.activeReleases ?? 0) > ROLLOUTS.length;
  // One rollout leaves room to open it to its next tasks.
  const showTasks = rollouts.length === 1;
  const people = PEOPLE.slice(0, limits.seats ?? PEOPLE.length);
  const peopleLine =
    limits.seats === null
      ? "Your whole team"
      : `${limits.seats} ${limits.seats === 1 ? "person" : "people"}`;

  return (
    <div className="plan-shot" aria-hidden="true">
      <div className="plan-shot__stage">
        <div className="plan-shot__panel">
          <div className="plan-shot__head">
            <b>Rollouts</b>
            <span>{unlimitedRollouts ? "No limit" : `${limits.activeReleases} at a time`}</span>
          </div>
          <div className={`plan-shot__list${listRunsOn ? " plan-shot__list--more" : ""}`}>
            {rollouts.map((r) => (
              <div key={r.initials} className="plan-shot__row">
                <span className="plan-shot__avatar" style={{ background: r.color }}>
                  {r.initials}
                </span>
                <span className="plan-shot__who">
                  <b>{r.title}</b>
                  <i>{r.artist}</i>
                </span>
                <span className="plan-shot__bar">
                  <span style={{ width: `${(r.done / TASKS_PER_ROLLOUT) * 100}%` }} />
                </span>
              </div>
            ))}
            {showTasks ? (
              <div className="plan-shot__tasks">
                <span className="plan-shot__task plan-shot__task--done">Cover art brief</span>
                <span className="plan-shot__task">Song metadata</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="plan-shot__card">
          <div className="plan-shot__team">
            <span className="plan-shot__pile">
              {people.map((p) => (
                <span key={p.initials} style={{ background: p.color }}>
                  {p.initials}
                </span>
              ))}
            </span>
            <b>{peopleLine}</b>
          </div>
          <div className="plan-shot__credits">
            <small>AI credits</small>
            <span>
              <strong>{monthlyCredits.toLocaleString("en-US")}</strong>
              <span>a month</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

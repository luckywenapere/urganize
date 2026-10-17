// Thresholds and windows for the Home tab, spec defaults (see the plan's
// section 7, "Open decisions"). Kept in one file so every number Home reads
// has exactly one definition, and so a later founder call changing a window
// is a one-line edit rather than a hunt through several modules.

/** A release counts as "in flight" for up to this many days after its date,
 * even with no open tasks left — the spec's default. */
export const IN_FLIGHT_GRACE_DAYS = 7;

/** A release with no date at all only counts as in flight while it still has
 * open (non-done, non-cancelled) tasks. Below this it is neither in flight
 * nor past — it simply does not appear in a state that requires one. */
export const UNDATED_IN_FLIGHT_REQUIRES_OPEN_TASKS = true;

/** A roster artist with nothing dated within this window reads as a "gap"
 * (label state). Not consulted by step 2 (Label states ship in step 5) but
 * declared here so the whole set of windows lives in one place. */
export const LABEL_ROSTER_GAP_DAYS = 90;

/** "Due this week" window, matching the catalog's own week bucket. */
export const DUE_THIS_WEEK_DAYS = 7;

/** "A release this week or next", counted from today: a release dated today
 * through this many days ahead makes Chappi Speaks talk about THAT release
 * instead of the day-of-the-week line. 13 = today plus the next thirteen days,
 * i.e. this week and the coming one. */
export const CHAPPI_SPEAKS_RELEASE_WINDOW_DAYS = 13;

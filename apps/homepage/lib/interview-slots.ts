// Shared date logic for the artist interview booking form (app/interview)
// and its API route (app/api/interview). Server-only computation — the
// client just renders whatever the GET response says is available, so the
// "what counts as a valid slot" rule lives in exactly one place.

// WAT, UTC+1, no DST — fixed all year, which is why stepping by UTC days
// below never needs offset math: adding 24h to any instant always lands on
// the next calendar day in a fixed-offset zone.
const TIMEZONE = "Africa/Lagos";

export const SLOT_TIME_LABEL = "6:00 PM WAT";

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayLabelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const weekdayNameFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  weekday: "short",
});

// en-CA formats as YYYY-MM-DD, which is exactly the ISO date shape we store.
const toIsoDate = (date: Date): string => isoDateFormatter.format(date);

const isWeekday = (date: Date): boolean => {
  const weekday = weekdayNameFormatter.format(date);
  return weekday !== "Sat" && weekday !== "Sun";
};

export type InterviewSlotOption = {
  date: string; // YYYY-MM-DD
  label: string; // "Mon, Aug 3"
};

/**
 * The bookable window: the next `count` weekdays, starting TOMORROW (not
 * today — an interview needs at least a day's notice, and starting from
 * tomorrow sidesteps "is it past 6pm yet" entirely). Walks day by day from
 * now rather than assuming a fixed calendar span, so the result is always
 * exactly `count` real weekdays regardless of where the current week falls.
 */
export function getUpcomingWeekdaySlots(count = 10): InterviewSlotOption[] {
  const slots: InterviewSlotOption[] = [];
  const cursor = new Date();
  cursor.setUTCDate(cursor.getUTCDate() + 1);

  // Guard bounds the loop well above what count=10 could ever need (10
  // weekdays never spans more than 14 calendar days) — a correctness
  // backstop, not a real limit.
  for (let guard = 0; guard < count * 4 && slots.length < count; guard += 1) {
    if (isWeekday(cursor)) {
      slots.push({ date: toIsoDate(cursor), label: dayLabelFormatter.format(cursor) });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return slots;
}

export function isBookableSlotDate(candidate: string, count = 10): boolean {
  return getUpcomingWeekdaySlots(count).some((slot) => slot.date === candidate);
}

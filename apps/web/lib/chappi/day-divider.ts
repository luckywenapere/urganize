// Day lines in the one Assistant chat (#1207): "Today", "Yesterday",
// "Tue 10 Nov". Pure; reads the device's own clock and time zone, because
// "today" is a question about the person's day.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function localDayKey(at: Date): string {
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
}

/** The label for the day a message was written on. Empty for a bad time. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return '';
  if (localDayKey(at) === localDayKey(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (localDayKey(at) === localDayKey(yesterday)) return 'Yesterday';
  const base = `${WEEKDAYS[at.getDay()]} ${at.getDate()} ${MONTHS[at.getMonth()]}`;
  return at.getFullYear() === now.getFullYear() ? base : `${base} ${at.getFullYear()}`;
}

/**
 * For each message, the day line to draw above it, or null. A line is drawn
 * above the first message of each new day. Messages with no time (older than
 * #1207) never start a line, and never end one either.
 */
export function dayLinesFor(messages: ReadonlyArray<{ at?: string }>, now: Date = new Date()): (string | null)[] {
  let lastKey: string | null = null;
  return messages.map((message) => {
    if (!message.at) return null;
    const at = new Date(message.at);
    if (!Number.isFinite(at.getTime())) return null;
    const key = localDayKey(at);
    if (key === lastKey) return null;
    lastKey = key;
    return dayLabel(message.at, now);
  });
}

// One question a day at the end of the morning brief (#1314, Oyin, 15 Nov
// 2026; mock docs/mocks/brief-daily-question). From the second brief on, the
// brief may end with one short question answered in one tap. The answer is
// kept on the person's profile (profiles.brief_prefs) and the next morning's
// brief follows it, with a line saying so.
//
// Rules (from the approved mock):
// - At most one question a day, and none on the first brief.
// - Every answer changes something the person sees the next morning.
// - Skipped (no answer, or "Not now") means no question the next day. Two
//   skips in a row and the questions wait a week.
// - Every answer is listed in Settings, where it can be cleared, and one
//   switch turns the questions off.
// - The questions and what each answer does are written here, in code. AI
//   never writes a question.
//
// This module is pure and client-safe. The cron picks the question
// (pickBriefQuestion), the answer route applies the tap (applyBriefAnswer) and
// the brief builder reads the answers (lib/chappi/morning-brief.ts).

export const BRIEF_QUESTION_IDS = ['top', 'artist', 'horizon', 'watch'] as const;
export type BriefQuestionId = (typeof BRIEF_QUESTION_IDS)[number];

export type BriefTop = 'late' | 'releases' | 'team';
export type BriefHorizon = 'week' | 'today';

/** The id of the "not now" tap. Never a real choice id. */
export const BRIEF_SKIP = 'skip';
/** The words of the "not now" tap, as the person's turn in the chat. The card
 *  reads a skipped question by these words, so both sides use this constant. */
export const BRIEF_SKIP_LABEL = 'Not now';
/** The id of the "all the same" / "no one" choice. */
export const BRIEF_NONE = 'none';

/** How many people or artists a question offers at most, plus the "none" choice. */
const MAX_PEOPLE_CHOICES = 3;
/** Two skips in a row pause the questions for this many days. */
export const BRIEF_PAUSE_DAYS = 7;

export type BriefChoice = { id: string; label: string };

export type BriefQuestion = {
  id: BriefQuestionId;
  text: string;
  choices: BriefChoice[];
};

/** What the person has told the brief. Every field is optional. `at` is the
 *  Lagos day the answer was given, YYYY-MM-DD. */
export type BriefPrefs = {
  top?: { value: BriefTop; at: string };
  /** An artist id, or BRIEF_NONE for "all the same". Good for one month. */
  artist?: { value: string; name: string; month: string; at: string };
  horizon?: { value: BriefHorizon; at: string };
  /** A teammate's user id, or BRIEF_NONE for "no one". */
  watch?: { value: string; name: string; at: string };
  /** The last question asked, and what came of it. `choice` is the id tapped
   *  (or BRIEF_SKIP), so a second tab can be told what was already chosen. */
  asked?: { id: BriefQuestionId; date: string; outcome?: 'answered' | 'skipped'; choice?: string };
  /** Skips in a row. */
  skips?: number;
  /** No questions before this Lagos day. */
  pausedUntil?: string;
  /** The Settings switch. */
  questionsOff?: boolean;
  /** Bumped on every save. A save only lands on the version it read, so the
   *  8am job, a tap and Settings never undo each other (#1314 review). */
  rev?: number;
};

export type BriefPerson = { id: string; name: string };

export type PickContext = {
  /** Today's Lagos day, YYYY-MM-DD. */
  today: string;
  /** Whether this person has had a brief on an earlier day. */
  hadEarlierBrief: boolean;
  artists: readonly BriefPerson[];
  teammates: readonly BriefPerson[];
};

// ── Days ──────────────────────────────────────────────────────────────────

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_NAME = 60;

export function addDays(day: string, count: number): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  return new Date(at + count * 86_400_000).toISOString().slice(0, 10);
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').replace(/—/g, ',').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// ── Reading stored prefs ──────────────────────────────────────────────────

function isDay(value: unknown): value is string {
  return typeof value === 'string' && DAY_RE.test(value);
}

/** Reads profiles.brief_prefs. Anything that is not a valid answer is dropped. */
export function sanitizeBriefPrefs(raw: unknown): BriefPrefs {
  const prefs: BriefPrefs = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return prefs;
  const value = raw as Record<string, unknown>;
  const field = (key: string) => {
    const entry = value[key];
    return entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>) : null;
  };

  const top = field('top');
  if (top && (top.value === 'late' || top.value === 'releases' || top.value === 'team') && isDay(top.at)) {
    prefs.top = { value: top.value, at: top.at };
  }
  const artist = field('artist');
  if (
    artist &&
    typeof artist.value === 'string' &&
    ID_RE.test(artist.value) &&
    typeof artist.name === 'string' &&
    typeof artist.month === 'string' &&
    /^\d{4}-\d{2}$/.test(artist.month) &&
    isDay(artist.at)
  ) {
    prefs.artist = { value: artist.value, name: clip(artist.name, MAX_NAME), month: artist.month, at: artist.at };
  }
  const horizon = field('horizon');
  if (horizon && (horizon.value === 'week' || horizon.value === 'today') && isDay(horizon.at)) {
    prefs.horizon = { value: horizon.value, at: horizon.at };
  }
  const watch = field('watch');
  if (watch && typeof watch.value === 'string' && ID_RE.test(watch.value) && typeof watch.name === 'string' && isDay(watch.at)) {
    prefs.watch = { value: watch.value, name: clip(watch.name, MAX_NAME), at: watch.at };
  }
  const asked = field('asked');
  if (asked && (BRIEF_QUESTION_IDS as readonly unknown[]).includes(asked.id) && isDay(asked.date)) {
    prefs.asked = { id: asked.id as BriefQuestionId, date: asked.date };
    if (asked.outcome === 'answered' || asked.outcome === 'skipped') prefs.asked.outcome = asked.outcome;
    if (typeof asked.choice === 'string' && ID_RE.test(asked.choice)) prefs.asked.choice = asked.choice;
  }
  if (typeof value.skips === 'number' && Number.isInteger(value.skips) && value.skips > 0 && value.skips < 100) {
    prefs.skips = value.skips;
  }
  if (isDay(value.pausedUntil)) prefs.pausedUntil = value.pausedUntil;
  if (value.questionsOff === true) prefs.questionsOff = true;
  if (typeof value.rev === 'number' && Number.isInteger(value.rev) && value.rev > 0) prefs.rev = value.rev;
  return prefs;
}

// ── Asking ────────────────────────────────────────────────────────────────

/** Counts a skip, pausing for a week on the second in a row. */
function withSkip(prefs: BriefPrefs, today: string): BriefPrefs {
  const skips = (prefs.skips ?? 0) + 1;
  if (skips >= 2) {
    const next: BriefPrefs = { ...prefs, pausedUntil: addDays(today, BRIEF_PAUSE_DAYS) };
    delete next.skips;
    return next;
  }
  return { ...prefs, skips };
}

function peopleChoices(people: readonly BriefPerson[], noneLabel: string): BriefChoice[] {
  const seen = new Set<string>();
  const choices: BriefChoice[] = [];
  for (const person of people) {
    if (!ID_RE.test(person.id) || seen.has(person.id) || !person.name.trim()) continue;
    seen.add(person.id);
    choices.push({ id: person.id, label: clip(person.name, 40) });
    if (choices.length >= MAX_PEOPLE_CHOICES) break;
  }
  return [...choices, { id: BRIEF_NONE, label: noneLabel }];
}

/** The question for `id`, or null when it does not fit this person. */
export function buildBriefQuestion(id: BriefQuestionId, ctx: Pick<PickContext, 'artists' | 'teammates'>): BriefQuestion | null {
  switch (id) {
    case 'top':
      return {
        id,
        text: 'What do you want at the top each morning?',
        choices: [
          { id: 'late', label: "What's late" },
          { id: 'releases', label: 'Release days' },
          { id: 'team', label: 'What the team did' },
        ],
      };
    case 'artist': {
      if (ctx.artists.length < 2) return null;
      const choices = peopleChoices(ctx.artists, ctx.artists.length === 2 ? 'Both the same' : 'All the same');
      return choices.length >= 3 ? { id, text: 'Which artist matters most this month?', choices } : null;
    }
    case 'horizon':
      return {
        id,
        text: 'Want work due later this week in here too, or only today?',
        choices: [
          { id: 'week', label: 'This week too' },
          { id: 'today', label: 'Only today' },
        ],
      };
    case 'watch': {
      if (ctx.teammates.length < 1) return null;
      const choices = peopleChoices(ctx.teammates, 'No one');
      return choices.length >= 2 ? { id, text: 'Who on the team should I keep an eye on for you?', choices } : null;
    }
  }
}

/** Whether `id` still wants an answer. The artist question comes back each month. */
function isOpen(id: BriefQuestionId, prefs: BriefPrefs, today: string): boolean {
  switch (id) {
    case 'top':
      return !prefs.top;
    case 'artist':
      return !prefs.artist || prefs.artist.month !== monthOf(today);
    case 'horizon':
      return !prefs.horizon;
    case 'watch':
      return !prefs.watch;
  }
}

/**
 * Today's question, if any, and the prefs to save with it. Pure: the caller
 * saves `prefs` only once the brief is written.
 */
export function pickBriefQuestion(stored: BriefPrefs, ctx: PickContext): { question: BriefQuestion | null; prefs: BriefPrefs } {
  const { today } = ctx;
  let prefs: BriefPrefs = { ...stored };

  // Yesterday's (or an older) question that got no tap counts as skipped.
  if (prefs.asked && prefs.asked.date < today && !prefs.asked.outcome) {
    prefs = withSkip({ ...prefs, asked: { ...prefs.asked, outcome: 'skipped' } }, today);
  }
  // Already asked today (a run that failed after saving it): offer the same
  // question again if it is still open, never a second one.
  if (prefs.asked?.date === today) {
    const again = prefs.asked.outcome ? null : buildBriefQuestion(prefs.asked.id, ctx);
    return { question: again, prefs: stored };
  }
  if (prefs.questionsOff || !ctx.hadEarlierBrief) return { question: null, prefs };
  if (prefs.pausedUntil && today < prefs.pausedUntil) return { question: null, prefs };
  // Skipped yesterday: a quiet day.
  if (prefs.asked?.outcome === 'skipped' && prefs.asked.date === addDays(today, -1)) return { question: null, prefs };

  for (const id of BRIEF_QUESTION_IDS) {
    if (!isOpen(id, prefs, today)) continue;
    const question = buildBriefQuestion(id, ctx);
    if (!question) continue;
    const next: BriefPrefs = { ...prefs, asked: { id, date: today } };
    if (next.pausedUntil && next.pausedUntil <= today) delete next.pausedUntil;
    return { question, prefs: next };
  }
  return { question: null, prefs };
}

// ── Answering ─────────────────────────────────────────────────────────────

const SETTINGS_NOTE = ' You can change this in Settings.';

export type BriefAnswerResult =
  /** `already`: the question was answered before (another tab or device);
   *  `prefs` is unchanged and label/ack describe the saved answer. */
  | { ok: true; prefs: BriefPrefs; label: string; ack: string; already?: boolean }
  | { ok: false; error: string; closed?: boolean };

/**
 * Applies a tap on today's question. `question` is the one stored with the
 * brief on the server, never one the browser sent, so a choice id is only
 * accepted when that question offered it.
 */
export function applyBriefAnswer(
  stored: BriefPrefs,
  question: BriefQuestion,
  choiceId: string,
  today: string
): BriefAnswerResult {
  if (!stored.asked || stored.asked.id !== question.id || stored.asked.date !== today) {
    return { ok: false, error: 'This question has closed.', closed: true };
  }
  if (stored.asked.outcome) {
    // Answered already, on another tab or device: say what was chosen, so this
    // chat can show it too. Nothing changes.
    const saved = stored.asked.choice;
    if (!saved) return { ok: false, error: 'You already answered this one.', closed: true };
    const replay = applyBriefAnswer({ ...stored, asked: { id: stored.asked.id, date: stored.asked.date } }, question, saved, today);
    return replay.ok ? { ...replay, prefs: stored, already: true } : { ok: false, error: 'You already answered this one.', closed: true };
  }

  if (choiceId === BRIEF_SKIP) {
    const prefs = withSkip({ ...stored, asked: { ...stored.asked, outcome: 'skipped', choice: BRIEF_SKIP } }, today);
    return { ok: true, prefs, label: BRIEF_SKIP_LABEL, ack: "Okay. I won't ask anything tomorrow." };
  }
  const choice = question.choices.find((entry) => entry.id === choiceId);
  if (!choice) return { ok: false, error: 'That is not one of the answers.' };

  const prefs: BriefPrefs = { ...stored, asked: { ...stored.asked, outcome: 'answered', choice: choice.id } };
  delete prefs.skips;
  let ack: string;
  switch (question.id) {
    case 'top': {
      const value = choice.id as BriefTop;
      prefs.top = { value, at: today };
      ack =
        value === 'late'
          ? 'Got it. From tomorrow, late work goes at the top of your brief.'
          : value === 'releases'
            ? 'Got it. From tomorrow, release days go at the top of your brief.'
            : 'Got it. From tomorrow, what your team finished goes at the top of your brief.';
      break;
    }
    case 'artist':
      prefs.artist = { value: choice.id, name: choice.label, month: monthOf(today), at: today };
      ack =
        choice.id === BRIEF_NONE
          ? 'Got it. I will treat your artists the same this month.'
          : `Got it. ${choice.label}'s work comes first in your brief this month.`;
      break;
    case 'horizon': {
      const value = choice.id as BriefHorizon;
      prefs.horizon = { value, at: today };
      ack =
        value === 'week'
          ? 'Got it. Your brief will show work due this week too.'
          : "Got it. Your brief will only show what's late or due today.";
      break;
    }
    case 'watch':
      prefs.watch = { value: choice.id, name: choice.label, at: today };
      ack =
        choice.id === BRIEF_NONE
          ? "Got it. I won't single anyone out."
          : `Got it. Each morning I will tell you when ${firstName(choice.label)} has late work.`;
      break;
  }
  return { ok: true, prefs, label: choice.label, ack: ack + SETTINGS_NOTE };
}

// ── What the brief does with the answers ──────────────────────────────────

export type BriefSectionKey = 'needs' | 'waiting' | 'changed' | 'upcoming';

/** The order of the brief's parts. */
export function briefSectionOrder(prefs: BriefPrefs): BriefSectionKey[] {
  switch (prefs.top?.value) {
    case 'releases':
      return ['upcoming', 'needs', 'waiting', 'changed'];
    case 'team':
      return ['changed', 'needs', 'waiting', 'upcoming'];
    default:
      return ['needs', 'waiting', 'changed', 'upcoming'];
  }
}

/** The artist to put first this month, or null. */
export function focusArtist(prefs: BriefPrefs, today: string): { id: string; name: string } | null {
  const artist = prefs.artist;
  if (!artist || artist.value === BRIEF_NONE || artist.month !== monthOf(today)) return null;
  return { id: artist.value, name: artist.name };
}

/** The teammate to watch, or null. */
export function watchedTeammate(prefs: BriefPrefs): { id: string; name: string } | null {
  const watch = prefs.watch;
  return watch && watch.value !== BRIEF_NONE ? { id: watch.value, name: watch.name } : null;
}

/** The small line under the opening that says why the brief looks this way. */
export function briefBecauseLine(prefs: BriefPrefs, today: string): string | null {
  const parts: string[] = [];
  if (prefs.top) {
    parts.push(
      prefs.top.value === 'late' ? 'Late work first' : prefs.top.value === 'releases' ? 'Release days first' : 'Team news first'
    );
  }
  const artist = focusArtist(prefs, today);
  if (artist) parts.push(`${artist.name} first`);
  if (prefs.horizon?.value === 'today') parts.push("Only today's work");
  if (prefs.horizon?.value === 'week') parts.push("This week's work too");
  const watch = watchedTeammate(prefs);
  if (watch) parts.push(`Watching ${firstName(watch.name)}`);
  if (parts.length === 0) return null;
  return clip(parts.length === 1 ? `${parts[0]}, like you asked` : parts.join(' · '), 120);
}

// ── Settings ──────────────────────────────────────────────────────────────

export type BriefAnswerLine = { key: BriefQuestionId; label: string; value: string; at: string };

const TOP_LABELS: Record<BriefTop, string> = { late: "What's late", releases: 'Release days', team: 'What the team did' };

/** The answers as Settings lists them. */
export function briefAnswerLines(prefs: BriefPrefs, today: string): BriefAnswerLine[] {
  const lines: BriefAnswerLine[] = [];
  if (prefs.top) lines.push({ key: 'top', label: 'At the top', value: TOP_LABELS[prefs.top.value], at: prefs.top.at });
  if (prefs.artist && prefs.artist.month === monthOf(today)) {
    lines.push({
      key: 'artist',
      label: 'Focus artist this month',
      value: prefs.artist.value === BRIEF_NONE ? 'All the same' : prefs.artist.name,
      at: prefs.artist.at,
    });
  }
  if (prefs.horizon) {
    lines.push({
      key: 'horizon',
      label: 'How far ahead',
      value: prefs.horizon.value === 'week' ? 'This week too' : 'Only today',
      at: prefs.horizon.at,
    });
  }
  if (prefs.watch) {
    lines.push({
      key: 'watch',
      label: 'Keep an eye on',
      value: prefs.watch.value === BRIEF_NONE ? 'No one' : prefs.watch.name,
      at: prefs.watch.at,
    });
  }
  return lines;
}

/** Clears one answer (it may be asked again later), or all of them. */
export function clearBriefAnswer(prefs: BriefPrefs, key: BriefQuestionId | 'all'): BriefPrefs {
  const next: BriefPrefs = { ...prefs };
  if (key === 'all') {
    delete next.top;
    delete next.artist;
    delete next.horizon;
    delete next.watch;
  } else {
    delete next[key];
  }
  return next;
}

/** Reads a stored question back. Null when it is not one. */
export function sanitizeBriefQuestion(raw: unknown): BriefQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, text, choices } = raw as Record<string, unknown>;
  if (!(BRIEF_QUESTION_IDS as readonly unknown[]).includes(id)) return null;
  if (typeof text !== 'string' || !text.trim() || !Array.isArray(choices)) return null;
  const clean: BriefChoice[] = [];
  for (const entry of choices) {
    if (!entry || typeof entry !== 'object') continue;
    const choice = entry as Record<string, unknown>;
    if (typeof choice.id !== 'string' || !ID_RE.test(choice.id) || choice.id === BRIEF_SKIP) continue;
    if (typeof choice.label !== 'string' || !choice.label.trim()) continue;
    clean.push({ id: choice.id, label: clip(choice.label, 40) });
    if (clean.length >= MAX_PEOPLE_CHOICES + 1) break;
  }
  if (clean.length < 2) return null;
  return { id: id as BriefQuestionId, text: clip(text, 120), choices: clean };
}

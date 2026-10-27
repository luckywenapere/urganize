import { isRelationshipsFlagOn } from '@/lib/paused-features';
// Vouch, slice 1 (2026-10-24, founder approved the mock).
//
// Three things a team gets on top of My People:
//  1. "Who's doing it" on an activity: one person from the team's people, or
//     nobody. Written to tasks.assigned_person_id (who did the work), which is
//     separate from assigned_to_user_id (the team member who owns it).
//  2. "Worked together" on the person page, DERIVED from those activities.
//     Nobody types it.
//  3. A vouch: when one activity with a person on it is marked done, the team
//     is asked "How was {first name} on this?" and picks one skill. One vouch
//     per team per skill; a repeat only updates the note.
//
// Private to the team for now. Showing vouches in public waits for the claim
// flow (a later slice). Pure helpers only; reads and writes are in
// lib/vouches-server.ts.

/** Needs its own flag AND the relationships pages (which need the workspace
 *  flag too). Ships ON: only the exact string 'false' turns it off (founder
 *  rule: new flags ship enabled). */
export const isVouchesFlagOn = (): boolean => process.env.NEXT_PUBLIC_FEATURE_VOUCHES !== 'false';

export const isVouchesEnabled = (): boolean =>
  isVouchesFlagOn() &&
  isRelationshipsFlagOn() &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

export const MAX_VOUCH_NOTE = 140;
export const MAX_SKILL = 40;

/** Always offered, whatever the activity was. */
export const STANDING_SKILLS = ['On time', 'Easy to work with'] as const;

/**
 * Skills suggested by what the activity was. Activities carry no skill field,
 * so the title is the signal: the first rule whose words appear wins. Kept as
 * data so a rule is one line to add.
 */
const SKILL_RULES: Array<{ skill: string; words: RegExp }> = [
  { skill: 'Cover art', words: /\b(cover|artwork|art ?work)\b/i },
  { skill: 'Design', words: /\b(design|graphic|graphics|flyer|poster|visuals?)\b/i },
  { skill: 'Mixing', words: /\bmix(ing|ed)?\b/i },
  { skill: 'Mastering', words: /\bmaster(ing|ed)?\b/i },
  { skill: 'Video', words: /\b(video|shoot|filming|visualizer|visualiser)\b/i },
  { skill: 'Photos', words: /\b(photo|photos|photoshoot|press shots?)\b/i },
  { skill: 'Press', words: /\b(press|pr|interview|media|blog|journalist)\b/i },
  { skill: 'Playlist pitching', words: /\b(playlist|playlists|pitch|pitching|curator|curators)\b/i },
  { skill: 'Radio', words: /\b(radio|dj|djs)\b/i },
  { skill: 'Content', words: /\b(content|social|tiktok|instagram|reels?|teaser|snippet)\b/i },
  { skill: 'Marketing', words: /\b(marketing|promo|promotion|ads|campaign|influencers?)\b/i },
  { skill: 'Distribution', words: /\b(distribut\w*|metadata|isrc|upc|dsps?)\b/i },
  { skill: 'Events', words: /\b(event|show|party|listening|gig|concert)\b/i },
  { skill: 'Production', words: /\b(produce|producer|production|beat|instrumental)\b/i },
  { skill: 'Recording', words: /\b(record|recording|vocals?|studio)\b/i },
  { skill: 'Songwriting', words: /\b(lyrics?|songwrit\w*|topline|write the song)\b/i },
];

/** One skill from the activity, or none. */
export function skillFromActivity(input: { title: string; taskType?: string | null }): string | null {
  const title = input.title || '';
  for (const rule of SKILL_RULES) if (rule.words.test(title)) return rule.skill;
  if (input.taskType === 'event_milestone') return 'Events';
  return null;
}

/**
 * The chips on the vouch sheet: one from the activity (falling back to the
 * person's role on this team), then "On time" and "Easy to work with".
 */
export function suggestSkills(input: { title: string; taskType?: string | null; role?: string | null }): string[] {
  const fromActivity = skillFromActivity(input);
  const role = (input.role || '').trim();
  const first = fromActivity ?? (role ? capitalise(role).slice(0, MAX_SKILL) : null);
  const chips = first ? [first, ...STANDING_SKILLS] : [...STANDING_SKILLS];
  const seen = new Set<string>();
  return chips.filter((chip) => {
    const key = chip.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const capitalise = (value: string): string => (value ? value[0].toUpperCase() + value.slice(1) : value);

/** "Tobi Ade" is "Tobi". Falls back to the whole label. */
export function firstName(label: string): string {
  const first = (label || '').trim().split(/\s+/)[0] || '';
  return first || (label || '').trim();
}

/** "Oct 2026" for an ISO date, in UTC so a row never lands in the month before. */
export function monthLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

type Parsed<T> = { error: string } | { value: T };

const record = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Body of PUT /api/relationships/assignments/[taskId]: a person id, or null for nobody. */
export function parseAssignment(body: unknown): Parsed<{ personId: string | null }> {
  const input = record(body);
  if (!('personId' in input)) return { error: 'Pick a person, or nobody.' };
  const raw = input.personId;
  if (raw === null || raw === '') return { value: { personId: null } };
  if (typeof raw !== 'string' || !UUID_SHAPE.test(raw)) return { error: 'Pick a person, or nobody.' };
  return { value: { personId: raw.toLowerCase() } };
}

export type VouchInput = { skill: string; note: string | null; taskId: string | null };

/** Body of POST /api/relationships/[personId]/vouches. */
export function parseVouch(body: unknown): Parsed<VouchInput> {
  const input = record(body);
  const skill = typeof input.skill === 'string' ? input.skill.trim().replace(/\s+/g, ' ') : '';
  if (!skill) return { error: 'Pick one.' };
  if (skill.length > MAX_SKILL) return { error: `Keep it under ${MAX_SKILL} characters.` };

  let note: string | null = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== 'string') return { error: 'The note has to be text.' };
    const value = input.note.trim().replace(/\s+/g, ' ');
    if (value.length > MAX_VOUCH_NOTE) return { error: `Keep it under ${MAX_VOUCH_NOTE} characters.` };
    note = value || null;
  }

  let taskId: string | null = null;
  if (input.taskId !== undefined && input.taskId !== null && input.taskId !== '') {
    if (typeof input.taskId !== 'string' || !UUID_SHAPE.test(input.taskId)) return { error: 'That activity was not found.' };
    taskId = input.taskId.toLowerCase();
  }

  return { value: { skill, note, taskId } };
}

export type WorkedTogetherRow = {
  taskId: string;
  releaseId: string | null;
  artistName: string;
  releaseTitle: string;
  activity: string;
  /** The date the row's month is read from: done, else due, else added. */
  when: string | null;
};

/** "Artist — Rollout · Activity · Oct 2026", leaving out any empty part. */
export function workedTogetherLine(row: WorkedTogetherRow): string {
  const head = [row.artistName.trim(), row.releaseTitle.trim()].filter(Boolean).join(' — ');
  return [head, row.activity.trim(), monthLabel(row.when)].filter(Boolean).join(' · ');
}

/** How many rollouts the rows span. Activities outside a rollout count as none. */
export function countRollouts(rows: Array<Pick<WorkedTogetherRow, 'releaseId'>>): number {
  return new Set(rows.map((row) => row.releaseId).filter((id): id is string => Boolean(id))).size;
}

export type VouchView = {
  id: string;
  skill: string;
  note: string | null;
  /** The teammate who vouched, as the team knows them. */
  byName: string;
  createdAt: string;
  updatedAt: string;
};

/** Skills in the order the page shows them: most recent vouch first, once each. */
export function vouchSkills(vouches: Array<Pick<VouchView, 'skill'>>): string[] {
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const vouch of vouches) {
    const key = vouch.skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push(vouch.skill);
  }
  return skills;
}

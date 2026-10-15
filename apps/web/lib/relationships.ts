import { normalizeEmail, normalizePhone } from './person-identity';

// A team's private layer on a person (Relationships, Phase 2): what they call
// them, the job they do for this team, notes, tags, when they last spoke and
// anything they logged about fees. Validation only; the reads and writes are in
// lib/relationships-server.ts.
//
// Sparse edits follow the rule the credits and curator routes learned the hard
// way: ABSENT means "leave it alone" and an explicit null means "clear it".
// Treating absent as null would wipe a team's notes the moment somebody
// changed a tag.

export const MAX_LABEL = 80;
export const MAX_ROLE = 40;
export const MAX_COMPANY = 60;
export const MAX_INTERACTION = 200;
export const MAX_NOTES = 4000;
export const MAX_RATE_NOTE = 200;
export const MAX_TAGS = 12;
export const MAX_TAG = 30;

export const RELATIONSHIP_SOURCES = ['manual', 'task_credit', 'pitch', 'dj_pack', 'credit_submission'] as const;
export type RelationshipSource = (typeof RELATIONSHIP_SOURCES)[number];

export type RelationshipCreate = {
  label: string;
  role: string;
  /** Optional so the other seeders (claim sweep, task credits) need not name it. */
  company?: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  notes: string;
  rateNote: string | null;
  lastContactAt: string | null;
};

export type RelationshipPatch = Partial<{
  label: string;
  role: string;
  company: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  notes: string;
  rateNote: string | null;
  lastContactAt: string | null;
}>;

type Parsed<T> = { error: string } | { value: T };

const record = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

function parseLabel(raw: unknown): Parsed<string> {
  if (typeof raw !== 'string' || !raw.trim()) return { error: 'Add a name.' };
  const value = raw.trim();
  if (value.length > MAX_LABEL) return { error: `Keep the name under ${MAX_LABEL} characters.` };
  return { value };
}

function parseRole(raw: unknown): Parsed<string> {
  if (raw === undefined || raw === null) return { value: '' };
  if (typeof raw !== 'string') return { error: 'The role has to be text.' };
  const value = raw.trim();
  if (value.length > MAX_ROLE) return { error: `Keep the role under ${MAX_ROLE} characters.` };
  return { value };
}

function parseCompany(raw: unknown): Parsed<string> {
  if (raw === undefined || raw === null) return { value: '' };
  if (typeof raw !== 'string') return { error: 'The company has to be text.' };
  const value = raw.trim();
  if (value.length > MAX_COMPANY) return { error: `Keep the company under ${MAX_COMPANY} characters.` };
  return { value };
}

/** One line for the interaction log ("Sent EP link"). */
export function parseInteraction(body: unknown): Parsed<{ body: string }> {
  const raw = record(body).body;
  if (typeof raw !== 'string' || !raw.trim()) return { error: 'Write what happened.' };
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length > MAX_INTERACTION) return { error: `Keep it under ${MAX_INTERACTION} characters.` };
  return { value: { body: value } };
}

function parseTags(raw: unknown): Parsed<string[]> {
  if (raw === undefined || raw === null) return { value: [] };
  if (!Array.isArray(raw)) return { error: 'Tags have to be a list.' };
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') return { error: 'Each tag has to be text.' };
    const tag = item.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    if (tag.length > MAX_TAG) return { error: `Keep each tag under ${MAX_TAG} characters.` };
    seen.add(tag);
    tags.push(tag);
  }
  if (tags.length > MAX_TAGS) return { error: `Use at most ${MAX_TAGS} tags.` };
  return { value: tags };
}

function parseNotes(raw: unknown): Parsed<string> {
  if (raw === undefined || raw === null) return { value: '' };
  if (typeof raw !== 'string') return { error: 'Notes have to be text.' };
  if (raw.length > MAX_NOTES) return { error: `Keep notes under ${MAX_NOTES} characters.` };
  return { value: raw };
}

function parseRateNote(raw: unknown): Parsed<string | null> {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== 'string') return { error: 'The fee note has to be text.' };
  const value = raw.trim();
  if (value.length > MAX_RATE_NOTE) return { error: `Keep the fee note under ${MAX_RATE_NOTE} characters.` };
  return { value: value || null };
}

/** A date or timestamp as an ISO instant, or null for nothing. A date-only value
 *  is read as UTC midnight so it never lands on the day before. */
function parseWhen(raw: unknown): Parsed<string | null> {
  if (raw === undefined || raw === null || raw === '') return { value: null };
  if (typeof raw !== 'string') return { error: 'Use a real date for last contact.' };
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw.trim());
  const parsed = new Date(dateOnly ? `${raw.trim()}T00:00:00Z` : raw);
  if (Number.isNaN(parsed.getTime())) return { error: 'Use a real date for last contact.' };
  return { value: parsed.toISOString() };
}

export function parseRelationshipCreate(body: unknown): Parsed<RelationshipCreate> {
  const input = record(body);

  const label = parseLabel(input.label);
  if ('error' in label) return label;
  const role = parseRole(input.role);
  if ('error' in role) return role;
  const company = parseCompany(input.company);
  if ('error' in company) return company;
  const tags = parseTags(input.tags);
  if ('error' in tags) return tags;
  const notes = parseNotes(input.notes);
  if ('error' in notes) return notes;
  const rateNote = parseRateNote(input.rateNote);
  if ('error' in rateNote) return rateNote;
  const lastContactAt = parseWhen(input.lastContactAt);
  if ('error' in lastContactAt) return lastContactAt;

  // A value somebody TYPED but we cannot use is an error. Silently dropping it
  // would leave a contact the team believes is findable by that address and is
  // not.
  let email: string | null = null;
  if (input.email !== undefined && input.email !== null && input.email !== '') {
    email = normalizeEmail(input.email);
    if (!email) return { error: 'That email does not look right.' };
  }
  let phone: string | null = null;
  if (input.phone !== undefined && input.phone !== null && input.phone !== '') {
    phone = normalizePhone(input.phone);
    if (!phone) return { error: 'That phone number does not look right.' };
  }

  return {
    value: {
      label: label.value,
      role: role.value,
      company: company.value,
      email,
      phone,
      tags: tags.value,
      notes: notes.value,
      rateNote: rateNote.value,
      lastContactAt: lastContactAt.value,
    },
  };
}

export function parseRelationshipPatch(body: unknown): Parsed<RelationshipPatch> {
  const input = record(body);
  const patch: RelationshipPatch = {};

  if ('label' in input) {
    const label = parseLabel(input.label);
    if ('error' in label) return label;
    patch.label = label.value;
  }
  if ('role' in input) {
    const role = parseRole(input.role);
    if ('error' in role) return role;
    patch.role = role.value;
  }
  if ('company' in input) {
    const company = parseCompany(input.company);
    if ('error' in company) return company;
    patch.company = company.value;
  }
  // The team's own copy of how to reach them. Empty clears it; a typed value
  // that cannot be read is an error, never silently dropped.
  if ('email' in input) {
    if (input.email === null || input.email === '') patch.email = null;
    else {
      const email = normalizeEmail(input.email);
      if (!email) return { error: 'That email does not look right.' };
      patch.email = email;
    }
  }
  if ('phone' in input) {
    if (input.phone === null || input.phone === '') patch.phone = null;
    else {
      const phone = normalizePhone(input.phone);
      if (!phone) return { error: 'That phone number does not look right.' };
      patch.phone = phone;
    }
  }
  if ('tags' in input) {
    const tags = parseTags(input.tags);
    if ('error' in tags) return tags;
    patch.tags = tags.value;
  }
  if ('notes' in input) {
    const notes = parseNotes(input.notes);
    if ('error' in notes) return notes;
    patch.notes = notes.value;
  }
  if ('rateNote' in input) {
    const rateNote = parseRateNote(input.rateNote);
    if ('error' in rateNote) return rateNote;
    patch.rateNote = rateNote.value;
  }
  if ('lastContactAt' in input) {
    const when = parseWhen(input.lastContactAt);
    if ('error' in when) return when;
    patch.lastContactAt = when.value;
  }

  if (Object.keys(patch).length === 0) return { error: 'Nothing to save.' };
  return { value: patch };
}

/** A pair of people in a fixed order, so (a, b) and (b, a) are one pair. The
 *  database stores it that way (person_a < person_b) and compares uuids the way
 *  a lowercase string does. */
export function orderPair(a: string, b: string): [string, string] {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? [x, y] : [y, x];
}

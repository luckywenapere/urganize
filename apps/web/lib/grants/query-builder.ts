// What may leave the building when the grant finder searches.
//
// A search goes to an outside vendor, so a query may describe a KIND of artist
// and never a person. The rule is enforced by shape, not by care: every fact is
// matched against a fixed list of words, so a name, an email, a release title or
// a sentence typed by a user simply cannot match and is dropped. There is no
// free text anywhere in this file's output.
//
// Pure. No network, no clock, no environment.

export const GRANT_FACT_KEYS = ['genre', 'country', 'stage', 'need', 'year'] as const;
export type GrantFactKey = (typeof GRANT_FACT_KEYS)[number];

export const GRANT_GENRES = [
  'afrobeats',
  'afropop',
  'afro fusion',
  'amapiano',
  'hip hop',
  'rap',
  'rnb',
  'soul',
  'pop',
  'rock',
  'alternative',
  'electronic',
  'dancehall',
  'reggae',
  'highlife',
  'fuji',
  'juju',
  'gospel',
  'jazz',
  'folk',
  'classical',
] as const;

export const GRANT_COUNTRIES = [
  'nigeria',
  'ghana',
  'kenya',
  'south africa',
  'uganda',
  'tanzania',
  'rwanda',
  'senegal',
  'cameroon',
  'ethiopia',
  'egypt',
  'morocco',
  'zimbabwe',
  'africa',
  'united kingdom',
  'united states',
  'canada',
  'europe',
] as const;

export const GRANT_STAGES = ['emerging', 'independent', 'early career', 'mid career', 'established'] as const;

export const GRANT_NEEDS = [
  'recording',
  'touring',
  'travel',
  'video',
  'marketing',
  'distribution',
  'equipment',
  'training',
  'mentorship',
  'showcase',
  'festival',
] as const;

export type GrantGenre = (typeof GRANT_GENRES)[number];
export type GrantCountry = (typeof GRANT_COUNTRIES)[number];
export type GrantStage = (typeof GRANT_STAGES)[number];
export type GrantNeed = (typeof GRANT_NEEDS)[number];

export type GrantFacts = {
  genre?: GrantGenre;
  country?: GrantCountry;
  stage?: GrantStage;
  need?: GrantNeed;
  year?: number;
};

export const GRANT_MIN_YEAR = 2024;
export const GRANT_MAX_YEAR = 2040;
export const DEFAULT_GRANT_QUERIES = 4;
export const MAX_GRANT_QUERIES = 6;
export const MAX_GRANT_QUERY_LENGTH = 160;

function pick<T extends string>(vocabulary: readonly T[], value: unknown): T | undefined {
  if (typeof value !== 'string') return undefined;
  const wanted = value.trim().toLowerCase();
  return vocabulary.find((word) => word === wanted);
}

/**
 * The only way a caller's data becomes search facts. Anything not in the fixed
 * vocabularies is dropped, whatever key it arrives under.
 */
export function readGrantFacts(input: unknown): GrantFacts {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const facts: GrantFacts = {};

  const genre = pick(GRANT_GENRES, source.genre);
  if (genre) facts.genre = genre;
  const country = pick(GRANT_COUNTRIES, source.country);
  if (country) facts.country = country;
  const stage = pick(GRANT_STAGES, source.stage);
  if (stage) facts.stage = stage;
  const need = pick(GRANT_NEEDS, source.need);
  if (need) facts.need = need;

  const year = source.year;
  if (typeof year === 'number' && Number.isInteger(year) && year >= GRANT_MIN_YEAR && year <= GRANT_MAX_YEAR) {
    facts.year = year;
  }
  return facts;
}

function titleCase(words: string): string {
  return words
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

export type BuiltGrantQueries = { facts: GrantFacts; queries: string[] };

/**
 * A few different ways of asking the same question about the same KIND of
 * artist. Every query carries the genre, the country and the year when there
 * are any, so each one stands on its own.
 */
export function buildGrantQueries(input: unknown, opts: { max?: number } = {}): BuiltGrantQueries | { error: string } {
  const facts = readGrantFacts(input);
  if (!facts.genre && !facts.country) return { error: 'Add a genre or a country.' };

  const requested = typeof opts.max === 'number' && Number.isFinite(opts.max) ? Math.floor(opts.max) : DEFAULT_GRANT_QUERIES;
  const max = Math.min(MAX_GRANT_QUERIES, Math.max(1, requested));

  const kind = facts.genre
    ? `${facts.stage ? `${facts.stage} ` : ''}${facts.genre} artists`
    : facts.stage
      ? `${facts.stage} music artists`
      : 'music artists';
  const place = facts.country ? ` in ${titleCase(facts.country)}` : '';
  const need = facts.need ? ` to fund ${facts.need}` : '';
  const year = facts.year ? ` ${facts.year}` : '';

  const templates = [
    `music grants${place} for ${kind}${need}${year}`,
    `open call funding${place} for ${kind}${year}`,
    `${kind} fellowship or residency${place}${year}`,
    `music fund applications open${place} for ${kind}${year}`,
    `arts council and foundation support${place} for ${kind}${need}${year}`,
    `sponsorship and showcase funding${place} for ${kind}${year}`,
  ];

  const seen = new Set<string>();
  const queries: string[] = [];
  for (const template of templates) {
    const query = template.replace(/\s+/g, ' ').trim();
    if (!query || query.length > MAX_GRANT_QUERY_LENGTH || seen.has(query)) continue;
    seen.add(query);
    queries.push(query);
    if (queries.length >= max) break;
  }
  return { facts, queries };
}

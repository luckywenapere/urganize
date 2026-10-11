// Turns the curated programmes into the seed migration's SQL. The migration file
// is generated, never hand-edited: programmes-seed.test.ts fails when the two
// drift. Regenerate with `GRANT_SEED_WRITE=1 pnpm exec vitest run lib/grants/programmes-seed.test.ts`.
//
// Pure. No network, no clock.

import type { GrantProgramme } from './programmes';

function text(value: string | null): string {
  return value === null ? 'null' : `'${value.replace(/'/g, "''")}'`;
}

function array(values: readonly string[]): string {
  return values.length === 0 ? "'{}'::text[]" : `array[${values.map((value) => text(value)).join(', ')}]::text[]`;
}

function num(value: number | null): string {
  return value === null ? 'null' : String(value);
}

function date(value: string | null): string {
  return value === null ? 'null' : `date '${value}'`;
}

const COLUMNS = [
  'slug', 'funder', 'programme', 'url', 'kind', 'countries', 'applicant_types', 'needs', 'genres', 'stages',
  'amount_min', 'amount_max', 'currency', 'status', 'opens_on', 'deadline_on', 'last_closed_on', 'recurring',
  'summary', 'eligibility', 'source_url', 'checked_on', 'active',
] as const;

function values(p: GrantProgramme): string {
  return [
    text(p.slug), text(p.funder), text(p.programme), text(p.url), text(p.kind), array(p.countries),
    array(p.applicantTypes), array(p.needs), array(p.genres), array(p.stages), num(p.amountMin), num(p.amountMax),
    text(p.currency), text(p.status), date(p.opensOn), date(p.deadlineOn), date(p.lastClosedOn), String(p.recurring),
    text(p.summary), text(p.eligibility), text(p.sourceUrl), date(p.checkedOn), String(p.active),
  ].join(', ');
}

export function programmesSeedSql(programmes: readonly GrantProgramme[]): string {
  const header = [
    '-- Grant programmes seed (2026-10-11): the curated funder list, checked by hand.',
    '--',
    '-- GENERATED from apps/web/lib/grants/programmes-seed.ts by programmes-seed-sql.ts.',
    '-- Do not edit by hand; change the TS and regenerate (see that file).',
    '--',
    '-- Re-runnable: each row upserts on slug, so running it again refreshes the',
    '-- curated facts without touching suggestions already made.',
    '--',
    '-- ROLLBACK (manual): delete from public.grant_programmes where slug in (...these slugs...);',
    '',
  ].join('\n');
  const updates = COLUMNS.filter((column) => column !== 'slug').map((column) => `  ${column} = excluded.${column}`);
  const body = [
    `insert into public.grant_programmes (${COLUMNS.join(', ')})`,
    'values',
    programmes.map((p) => `  (${values(p)})`).join(',\n'),
    'on conflict (slug) do update set',
    updates.join(',\n') + ';',
    '',
  ].join('\n');
  return `${header}\n${body}`;
}

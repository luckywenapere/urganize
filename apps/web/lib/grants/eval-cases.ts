// The 20 cases the grant evaluation runs, in the plan's four groups (section 7).
//
// The plan's draft queries are sentences; the pipeline only ever builds queries from
// allowlisted facts, so each case is the closest set of facts to one of those
// sentences. The sentence is kept as `intent`, so a person scoring a case knows what
// a good result looks like. Replace these with the cases the founder would run.

import type { GrantFacts } from './query-builder';

export type GrantEvalGroup = 'nigeria' | 'africa' | 'abroad' | 'stage_need';

export type GrantEvalCase = { id: string; group: GrantEvalGroup; intent: string; facts: GrantFacts };

const YEAR = 2027;

export const GRANT_EVAL_CASES: readonly GrantEvalCase[] = [
  { id: 'ng-independent', group: 'nigeria', intent: 'funding for Nigerian independent artists', facts: { country: 'nigeria', stage: 'independent', year: YEAR } },
  { id: 'ng-afrobeats-recording', group: 'nigeria', intent: 'grants for Afrobeats recording costs', facts: { genre: 'afrobeats', country: 'nigeria', need: 'recording', year: YEAR } },
  { id: 'ng-video', group: 'nigeria', intent: 'grants for music video production in Nigeria', facts: { country: 'nigeria', need: 'video', year: YEAR } },
  { id: 'ng-training', group: 'nigeria', intent: 'music business accelerator in Lagos', facts: { country: 'nigeria', need: 'training', year: YEAR } },
  { id: 'ng-equipment', group: 'nigeria', intent: 'equipment grants for Nigerian producers', facts: { country: 'nigeria', need: 'equipment', year: YEAR } },
  { id: 'ng-touring', group: 'nigeria', intent: 'funding to tour from Nigeria', facts: { country: 'nigeria', need: 'touring', year: YEAR } },
  { id: 'ng-emerging-afropop', group: 'nigeria', intent: 'support for an emerging Nigerian Afropop artist', facts: { genre: 'afropop', country: 'nigeria', stage: 'emerging', year: YEAR } },
  { id: 'ng-early-career', group: 'nigeria', intent: 'music grants open to young Nigerians', facts: { country: 'nigeria', stage: 'early career', year: YEAR } },
  { id: 'af-pan-african', group: 'africa', intent: 'pan-African music funding', facts: { country: 'africa', year: YEAR } },
  { id: 'af-showcase', group: 'africa', intent: 'grants for African artists to attend showcases', facts: { country: 'africa', need: 'showcase', year: YEAR } },
  { id: 'af-distribution', group: 'africa', intent: 'African music export programmes', facts: { country: 'africa', need: 'distribution', year: YEAR } },
  { id: 'af-ghana-highlife', group: 'africa', intent: 'creative funds for West African highlife acts', facts: { genre: 'highlife', country: 'ghana', year: YEAR } },
  { id: 'ab-us', group: 'abroad', intent: 'international music grants that accept African applicants', facts: { genre: 'afrobeats', country: 'united states', year: YEAR } },
  { id: 'ab-uk', group: 'abroad', intent: 'UK music funding open to non-UK artists', facts: { genre: 'afrobeats', country: 'united kingdom', year: YEAR } },
  { id: 'ab-europe', group: 'abroad', intent: 'European cultural funds open to African musicians', facts: { country: 'europe', need: 'festival', year: YEAR } },
  { id: 'ab-travel', group: 'abroad', intent: 'music residency funding with travel covered', facts: { country: 'africa', need: 'travel', year: YEAR } },
  { id: 'sn-first-release', group: 'stage_need', intent: 'first EP funding for an emerging artist', facts: { country: 'nigeria', stage: 'emerging', need: 'recording', year: YEAR } },
  { id: 'sn-mentorship', group: 'stage_need', intent: 'mentorship and business support for an early career artist', facts: { country: 'nigeria', stage: 'early career', need: 'mentorship', year: YEAR } },
  { id: 'sn-marketing', group: 'stage_need', intent: 'marketing budget grant for an independent release', facts: { country: 'nigeria', stage: 'independent', need: 'marketing', year: YEAR } },
  { id: 'sn-gospel', group: 'stage_need', intent: 'funding for an independent gospel act', facts: { genre: 'gospel', country: 'nigeria', stage: 'independent', year: YEAR } },
];

// After the AI files something on a project, it offers the next jobs as chips
// (2026-11-04, #1074, mock screen 6 approved). The jobs come from
// lib/project-suggestions.ts, so the AI never invents one, and a tap adds them
// with no model involved. Pure and client-safe.

export type ProjectOfferJob = { title: string; description: string };

export type ProjectOffer = { recordId: string; recordTitle: string; jobs: ProjectOfferJob[] };

export type ProjectOfferChoice = { key: 'all' | 'first' | 'none'; label: string; jobs: ProjectOfferJob[] };

const MAX_JOBS = 2;
const CHIP_MAX = 30;

export function buildProjectOffer(input: {
  recordId: string;
  recordTitle: string;
  suggestions: readonly ProjectOfferJob[];
}): ProjectOffer | null {
  const jobs = input.suggestions.slice(0, MAX_JOBS).map((job) => ({ title: job.title, description: job.description }));
  if (jobs.length === 0) return null;
  return { recordId: input.recordId, recordTitle: input.recordTitle, jobs };
}

export function projectOfferQuestion(offer: ProjectOffer): string {
  if (offer.jobs.length === 1) {
    return `One thing usually follows at this stage: ${offer.jobs[0].title}. Add it to the project?`;
  }
  return `Two things usually follow at this stage: ${offer.jobs[0].title}, and ${offer.jobs[1].title}. Add them to the project?`;
}

function chipLabel(text: string): string {
  return text.length <= CHIP_MAX ? text : `${text.slice(0, CHIP_MAX - 1).trimEnd()}…`;
}

export function projectOfferChoices(offer: ProjectOffer): ProjectOfferChoice[] {
  if (offer.jobs.length === 1) {
    return [
      { key: 'all', label: 'Yes, add it', jobs: offer.jobs },
      { key: 'none', label: 'Not now', jobs: [] },
    ];
  }
  return [
    { key: 'all', label: 'Yes, add both', jobs: offer.jobs },
    { key: 'first', label: chipLabel(`Just ${offer.jobs[0].title}`), jobs: [offer.jobs[0]] },
    { key: 'none', label: 'Not now', jobs: [] },
  ];
}

export function projectOfferDoneLine(added: number): string {
  if (added >= 2) return "Done. Both are on the project, no day yet. Say when and I'll date them.";
  return "Done. It's on the project, no day yet. Say when and I'll date it.";
}

import { describe, expect, it } from 'vitest';
import { buildProjectOffer, projectOfferChoices, projectOfferDoneLine, projectOfferQuestion } from './project-offer';

const ID = '11111111-1111-4111-8111-111111111111';
const job = (title: string) => ({ title, description: '' });

describe('buildProjectOffer', () => {
  it('offers at most two jobs, from the list it was given', () => {
    const offer = buildProjectOffer({ recordId: ID, recordTitle: 'Wahala', suggestions: [job('A'), job('B'), job('C')] });
    expect(offer?.jobs.map((j) => j.title)).toEqual(['A', 'B']);
  });
  it('nothing to offer means no card', () => {
    expect(buildProjectOffer({ recordId: ID, recordTitle: 'Wahala', suggestions: [] })).toBeNull();
  });
});

describe('the words and the chips (mock screen 6)', () => {
  const two = buildProjectOffer({ recordId: ID, recordTitle: 'Wahala', suggestions: [job('Book sessions'), job('Artwork')] })!;
  const one = buildProjectOffer({ recordId: ID, recordTitle: 'Wahala', suggestions: [job('Mix')] })!;
  it('asks about both, or about the one', () => {
    expect(projectOfferQuestion(two)).toBe('Two things usually follow at this stage: Book sessions, and Artwork. Add them to the project?');
    expect(projectOfferQuestion(one)).toBe('One thing usually follows at this stage: Mix. Add it to the project?');
  });
  it('two jobs: add both, just the first, or not now', () => {
    expect(projectOfferChoices(two).map((c) => c.label)).toEqual(['Yes, add both', 'Just Book sessions', 'Not now']);
    expect(projectOfferChoices(two).map((c) => c.jobs.length)).toEqual([2, 1, 0]);
  });
  it('one job: add it, or not now', () => {
    expect(projectOfferChoices(one).map((c) => c.label)).toEqual(['Yes, add it', 'Not now']);
  });
  it('a long first title is cut on the chip, never on the task', () => {
    const long = buildProjectOffer({
      recordId: ID,
      recordTitle: 'W',
      suggestions: [job('Final video (MP4) delivered to everyone'), job('B')],
    })!;
    const just = projectOfferChoices(long)[1];
    expect(just.label.length).toBeLessThanOrEqual(30);
    expect(just.jobs[0].title).toBe('Final video (MP4) delivered to everyone');
  });
  it('the done line says what landed', () => {
    expect(projectOfferDoneLine(2)).toBe("Done. Both are on the project, no day yet. Say when and I'll date them.");
    expect(projectOfferDoneLine(1)).toBe("Done. It's on the project, no day yet. Say when and I'll date it.");
  });
});

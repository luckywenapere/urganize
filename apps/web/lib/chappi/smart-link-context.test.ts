import { describe, expect, it } from 'vitest';
import { formatSmartLinksSection, smartLinkLine, type SmartLinkPromptFacts } from './smart-link-context';

const TODAY = '2026-10-29';

function facts(over: Partial<SmartLinkPromptFacts> = {}): SmartLinkPromptFacts {
  return {
    title: 'Wahala Free',
    releaseDate: '2026-11-20',
    hasCode: true,
    isTest: false,
    isArchived: false,
    link: { url: 'https://altlink.co/wahala-free', status: 'scheduled', presaves: 14 },
    shareTask: 'open',
    ...over,
  };
}

describe('smartLinkLine', () => {
  it('says nothing before the rollout has a UPC or ISRC (Altlink refuses a code-less link)', () => {
    expect(smartLinkLine(facts({ hasCode: false, link: null }), TODAY)).toBeNull();
  });

  it('gives the URL, the pre-save count and that it is not shared yet', () => {
    const line = smartLinkLine(facts(), TODAY);
    expect(line).toContain('https://altlink.co/wahala-free');
    expect(line).toContain('14 pre-saves');
    expect(line).toContain('not shared yet');
  });

  it('reads as shared once the smart link activity is done', () => {
    const line = smartLinkLine(facts({ shareTask: 'done' }), TODAY);
    expect(line).toContain('shared');
    expect(line).not.toContain('not shared yet');
  });

  it('reads as live, not pre-save, once release day comes', () => {
    const line = smartLinkLine(facts({ releaseDate: TODAY, link: { url: 'https://altlink.co/x', status: 'scheduled', presaves: 3 } }), TODAY);
    expect(line).toContain('live');
    expect(line).not.toContain('not shared yet');
  });

  it('says it is being made while Altlink is still working', () => {
    expect(smartLinkLine(facts({ link: { url: null, status: 'pending', presaves: 0 } }), TODAY)).toContain('being made');
  });

  it('points at the Smart link tab when the codes are in but no link exists yet', () => {
    const line = smartLinkLine(facts({ link: null }), TODAY);
    expect(line).toContain('Smart link tab');
    expect(line).not.toContain('https://');
  });

  it('stays quiet for a past release with no link, a test rollout and an archived one', () => {
    expect(smartLinkLine(facts({ link: null, releaseDate: '2026-10-01' }), TODAY)).toBeNull();
    expect(smartLinkLine(facts({ isTest: true }), TODAY)).toBeNull();
    expect(smartLinkLine(facts({ isArchived: true }), TODAY)).toBeNull();
  });

  it('never says pre-save link', () => {
    for (const f of [facts(), facts({ link: null }), facts({ shareTask: 'done' })]) {
      expect(smartLinkLine(f, TODAY) ?? '').not.toMatch(/pre-?save link/i);
    }
  });
});

describe('formatSmartLinksSection', () => {
  it('is empty when no rollout can have a link, so UrgAns never offers one', () => {
    expect(formatSmartLinksSection([facts({ hasCode: false, link: null })], TODAY)).toBe('');
  });

  it('lists only the rollouts that can have a link', () => {
    const text = formatSmartLinksSection(
      [facts(), facts({ title: 'No Code Yet', hasCode: false, link: null })],
      TODAY
    );
    expect(text).toMatch(/^Smart links/);
    expect(text).toContain('Wahala Free');
    expect(text).not.toContain('No Code Yet');
  });
});

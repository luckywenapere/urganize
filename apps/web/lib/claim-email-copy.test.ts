import { describe, expect, it } from 'vitest';
import {
  AUTO_EMAIL_HINT,
  autoEmailStatusLine,
  CLAIM_EMAIL_COPY,
  claimEmailContent,
  creditSentence,
  creditedBy,
  emailAgainLabel,
  joinWords,
  possessive,
  roleWords,
} from './claim-email-copy';

const facts = {
  recipientName: 'Ada Obi',
  artistName: 'Wizkid',
  releaseTitle: 'Morayo',
  roles: ['producer', 'songwriter'],
};

function allText(content: ReturnType<typeof claimEmailContent>): string {
  return [content.subject, content.preview, content.greeting, ...content.lead, content.value, content.button, ...content.after, content.footnote].join('\n');
}

describe('the sentence that names the credit', () => {
  it('names the artist, the role and the release', () => {
    expect(creditSentence(facts)).toBe("Wizkid's team credited you as producer and songwriter on Morayo.");
  });

  it('an artist name ending in s takes just the apostrophe', () => {
    expect(possessive('Tems')).toBe("Tems'");
    expect(possessive('Wizkid')).toBe("Wizkid's");
    expect(possessive('  ')).toBe('');
  });

  it('with no artist it says a team', () => {
    expect(creditedBy('')).toBe('A team');
    expect(creditSentence({ ...facts, artistName: '' })).toBe('A team credited you as producer and songwriter on Morayo.');
  });

  it('leaves the role out rather than saying "other" or an unknown id', () => {
    expect(creditSentence({ ...facts, roles: ['other'] })).toBe("Wizkid's team credited you on Morayo.");
    expect(creditSentence({ ...facts, roles: ['nonsense'] })).toBe("Wizkid's team credited you on Morayo.");
    expect(creditSentence({ ...facts, roles: [] })).toBe("Wizkid's team credited you on Morayo.");
  });

  it('lists roles once each, lower case, with no Oxford comma', () => {
    expect(roleWords(['mixing_engineer', 'producer', 'producer', 'featured_artist'])).toBe(
      'mixing engineer, producer and featured artist'
    );
    expect(joinWords(['a', 'b', 'c'])).toBe('a, b and c');
    expect(joinWords(['a'])).toBe('a');
    expect(joinWords([])).toBe('');
  });

  it('falls back to "a rollout" when the title is missing', () => {
    expect(creditSentence({ ...facts, releaseTitle: ' ' })).toBe(
      "Wizkid's team credited you as producer and songwriter on a rollout."
    );
  });
});

describe('the first email', () => {
  const content = claimEmailContent('invite', facts);

  it('opens with the credit and the page being ready', () => {
    expect(content.subject).toBe("Wizkid's team credited you on Morayo");
    expect(content.greeting).toBe('Hey Ada,');
    expect(content.lead).toEqual([
      "Wizkid's team credited you as producer and songwriter on Morayo.",
      'Your page is ready.',
    ]);
  });

  it('has one clear button and says what the page does for them', () => {
    expect(content.button).toBe('Claim your page');
    expect(content.value).toContain('the work you have delivered');
    expect(content.value).toContain('next job');
  });

  it('says why they got it and how to take the page down', () => {
    expect(content.footnote).toContain("Wizkid's team put this email on the credits for Morayo");
    expect(content.footnote).toContain('Request removal');
  });

  it('has a plain subject with no artist', () => {
    expect(claimEmailContent('invite', { ...facts, artistName: '' }).subject).toBe('You were credited on Morayo');
  });

  it('greets plainly with no name', () => {
    expect(claimEmailContent('invite', { ...facts, recipientName: ' ' }).greeting).toBe('Hey,');
  });
});

describe('the reminder', () => {
  const content = claimEmailContent('reminder', facts);

  it('says it is still waiting, that the link is new and that it is the only one', () => {
    expect(content.subject).toBe('Your page for Morayo is still waiting');
    expect(content.lead).toContain(CLAIM_EMAIL_COPY.stillWaiting);
    expect(content.after).toEqual([CLAIM_EMAIL_COPY.freshLink, CLAIM_EMAIL_COPY.onlyReminder]);
    expect(content.button).toBe('Claim your page');
  });
});

describe('house rules for every sentence', () => {
  const samples = [
    allText(claimEmailContent('invite', facts)),
    allText(claimEmailContent('reminder', facts)),
    allText(claimEmailContent('invite', { recipientName: '', artistName: '', releaseTitle: '', roles: [] })),
    AUTO_EMAIL_HINT,
    autoEmailStatusLine({ name: 'Ada Obi', invitedOn: '3 Oct', remindedOn: '10 Oct' }),
  ];

  it('no em or en dashes', () => {
    for (const sample of samples) expect(sample).not.toMatch(/[\u2013\u2014]/);
  });

  it('never "workspace", "ship" or "users"', () => {
    for (const sample of samples) expect(sample).not.toMatch(/\b(workspace|ship|shipped|users)\b/i);
  });

  it('short sentences a fifth grader reads in one go', () => {
    for (const sample of samples) {
      for (const sentence of sample.split(/(?<=[.?!])\s+|\n/)) {
        expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(24);
      }
    }
  });
});

describe('what the owner reads', () => {
  it('says the email went out and when, then the reminder', () => {
    expect(autoEmailStatusLine({ name: 'Ada Obi', invitedOn: '3 Oct', remindedOn: null })).toBe(
      'We emailed Ada their link on 3 Oct'
    );
    expect(autoEmailStatusLine({ name: 'Ada Obi', invitedOn: '3 Oct', remindedOn: '10 Oct' })).toBe(
      'We emailed Ada their link on 3 Oct and reminded them on 10 Oct'
    );
  });

  it('tells them they do not need to send it, and labels their own button as a second email', () => {
    expect(AUTO_EMAIL_HINT).toContain('No need to send it yourself');
    expect(emailAgainLabel('Ada Obi')).toBe('Email Ada again');
  });
});

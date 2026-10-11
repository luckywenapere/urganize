import { describe, expect, it } from 'vitest';
import { verifyExtraction } from './verify';

// The rule this file holds: a field survives only if the PAGE TEXT holds it.
// The model proposes, the code checks. Whatever the model says that the page
// does not say is blanked, and the link and the read date never come from the
// model at all.

const TODAY = '2026-10-11';
const READ_ON = '2026-10-11';

const PAGE_TEXT = `
Music Futures Fund 2027
Run by the Example Arts Foundation.
Grants of up to $25,000 for emerging artists in Nigeria.
Applications close on 30 November 2026.
Who can apply: Artists based in Nigeria with at least one public release.
You must be 18 or older at the time of application.
`;

const page = (text = PAGE_TEXT, over: Partial<{ url: string; title: string }> = {}) => ({
  url: 'https://example.org/grants/music-futures',
  title: 'Music Futures Fund 2027',
  text,
  ...over,
});

const honest = {
  isGrant: true,
  title: 'Music Futures Fund 2027',
  funder: 'Example Arts Foundation',
  deadline: '2026-11-30',
  amount: 25_000,
  currency: 'USD',
  eligibility: ['Artists based in Nigeria with at least one public release.', 'You must be 18 or older at the time of application.'],
};

function run(fields: Record<string, unknown>, text = PAGE_TEXT, pageOver: Partial<{ url: string; title: string }> = {}) {
  return verifyExtraction({ page: page(text, pageOver), fields: fields as never, readOn: READ_ON, today: TODAY });
}

function grantOf(result: ReturnType<typeof run>) {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.grant;
}

describe('an honest extraction', () => {
  it('keeps what the page holds and attaches the link and the read date itself', () => {
    const grant = grantOf(run(honest));
    expect(grant.title).toBe('Music Futures Fund 2027');
    expect(grant.funder).toBe('Example Arts Foundation');
    expect(grant.link).toBe('https://example.org/grants/music-futures');
    expect(grant.readOn).toBe(READ_ON);
    expect(grant.status).toBe('open');
    expect(grant.deadline).toBe('2026-11-30');
    expect(grant.amount).toBe(25_000);
    expect(grant.currency).toBe('USD');
    expect(grant.eligibility).toEqual(honest.eligibility);
    expect(grant.blanked).toEqual([]);
    expect(grant.rolling).toBe(false);
    expect(grant.lastClosedOn).toBeNull();
    expect(grant.figureNote).toBeNull();
  });

  it('treats a deadline of today as still open', () => {
    const grant = grantOf(run({ ...honest, deadline: '2026-10-11' }, 'Music Futures Fund. Apply by 11 October 2026. Grants of up to $25,000.'));
    expect(grant.status).toBe('open');
    expect(grant.deadline).toBe('2026-10-11');
  });
});

describe('the link and the read date are never the model\'s', () => {
  it('uses the fetched page url even when the model supplies another', () => {
    const grant = grantOf(run({ ...honest, link: 'https://evil.test/steal', url: 'https://evil.test', readOn: '2020-01-01' }));
    expect(grant.link).toBe('https://example.org/grants/music-futures');
    expect(grant.readOn).toBe(READ_ON);
  });

  it('drops a fragment from the link', () => {
    const grant = grantOf(run(honest, PAGE_TEXT, { url: 'https://example.org/grants/music-futures#apply' }));
    expect(grant.link).toBe('https://example.org/grants/music-futures');
  });

  it('strips credentials from the link', () => {
    const grant = grantOf(run(honest, PAGE_TEXT, { url: 'https://user:secret@example.org/grants/music-futures' }));
    expect(grant.link).toBe('https://example.org/grants/music-futures');
  });

  it('refuses a page with no usable link', () => {
    for (const url of ['', 'not a url', 'javascript:alert(1)', 'ftp://example.org/file', 'data:text/html,hi']) {
      expect(run(honest, PAGE_TEXT, { url })).toEqual({ ok: false, reason: 'no_link' });
    }
  });
});

describe('title and kind of page', () => {
  it('refuses a page the model says is not a grant', () => {
    expect(run({ ...honest, isGrant: false })).toEqual({ ok: false, reason: 'not_a_grant' });
  });

  it('falls back to the page title when the model title is not on the page', () => {
    const grant = grantOf(run({ ...honest, title: 'Totally Made Up Prize' }));
    expect(grant.title).toBe('Music Futures Fund 2027');
  });

  it('refuses a grant with no title anywhere', () => {
    expect(run({ ...honest, title: null }, PAGE_TEXT, { title: '' })).toEqual({ ok: false, reason: 'no_title' });
    expect(run({ ...honest, title: '   ' }, PAGE_TEXT, { title: '  ' })).toEqual({ ok: false, reason: 'no_title' });
  });
});

describe('funder', () => {
  it('blanks a funder the page never names', () => {
    const grant = grantOf(run({ ...honest, funder: 'Imaginary Trust' }));
    expect(grant.funder).toBeNull();
    expect(grant.blanked).toContain('funder');
  });

  it('matches the funder without caring about case or spacing', () => {
    const grant = grantOf(run({ ...honest, funder: '  example   ARTS foundation ' }));
    // The page's own wording comes back, not the model's.
    expect(grant.funder).toBe('Example Arts Foundation');
    expect(grant.blanked).not.toContain('funder');
  });

  it('does not match a funder name that only sits inside a longer word', () => {
    const grant = grantOf(run({ ...honest, funder: 'Arts' }, 'Music Futures Fund. Run by Smarts Collective. Grants of up to $25,000.'));
    expect(grant.funder).toBeNull();
    expect(grant.blanked).toContain('funder');
  });

  it('keeps no funder and blanks nothing when the model names none', () => {
    const grant = grantOf(run({ ...honest, funder: null }));
    expect(grant.funder).toBeNull();
    expect(grant.blanked).not.toContain('funder');
  });
});

describe('deadline', () => {
  it('blanks a deadline the page does not hold', () => {
    const grant = grantOf(run({ ...honest, deadline: '2026-12-25' }));
    expect(grant.deadline).toBeNull();
    expect(grant.blanked).toContain('deadline');
    expect(grant.status).toBe('unknown');
  });

  it('blanks a date that is not on the calendar', () => {
    const grant = grantOf(run({ ...honest, deadline: '2026-02-30' }));
    expect(grant.deadline).toBeNull();
    expect(grant.blanked).toContain('deadline');
  });

  it('never keeps a deadline that has passed: it becomes a closed round', () => {
    const text = 'Music Futures Fund. Applications closed on 12 March 2025. Grants of up to $25,000.';
    const grant = grantOf(run({ ...honest, deadline: '2025-03-12' }, text));
    expect(grant.deadline).toBeNull();
    expect(grant.status).toBe('closed');
    expect(grant.lastClosedOn).toBe('2025-03-12');
  });

  it('treats a page that says it is closed as closed even with a future date on it', () => {
    const text = 'Music Futures Fund. Applications are closed. The next call is expected by 30 November 2027. Grants of up to $25,000.';
    const grant = grantOf(run({ ...honest, deadline: '2027-11-30' }, text));
    expect(grant.status).toBe('closed');
    expect(grant.deadline).toBeNull();
  });

  it('ignores a closed date the model claims that the page does not hold', () => {
    const grant = grantOf(run({ ...honest, lastClosedOn: '2024-05-05' }));
    expect(grant.lastClosedOn).toBeNull();
  });

  it('keeps a closing date the model names when the page holds it and it is not in the future', () => {
    const text = 'Music Futures Fund. Applications are closed. The last round ended on 12 March 2025. Grants of up to $25,000.';
    const grant = grantOf(run({ ...honest, deadline: null, lastClosedOn: '2025-03-12' }, text));
    expect(grant.status).toBe('closed');
    expect(grant.lastClosedOn).toBe('2025-03-12');
  });

  it('ignores a closing date that is still ahead', () => {
    const text = 'Music Futures Fund. Applications are closed. See the update of 30 November 2027. Grants of up to $25,000.';
    const grant = grantOf(run({ ...honest, deadline: null, lastClosedOn: '2027-11-30' }, text));
    expect(grant.status).toBe('closed');
    expect(grant.lastClosedOn).toBeNull();
    expect(grant.blanked).toContain('lastClosedOn');
  });

  it('lets a page that says it is closed beat a page that also says rolling', () => {
    const text = 'Music Futures Fund. Applications are closed. They used to be reviewed on a rolling basis. Grants of up to $25,000.';
    const grant = grantOf(run({ ...honest, deadline: null }, text));
    expect(grant.status).toBe('closed');
    expect(grant.rolling).toBe(false);
  });

  it('blanks a deadline that is not written as a calendar date', () => {
    const grant = grantOf(run({ ...honest, deadline: '30 November 2026' }));
    expect(grant.deadline).toBeNull();
    expect(grant.blanked).toContain('deadline');
  });

  it('calls a rolling page open with no deadline', () => {
    const text = 'Music Futures Fund. Applications are reviewed on a rolling basis. Grants of up to $25,000.';
    const grant = grantOf(run({ ...honest, deadline: null }, text));
    expect(grant.status).toBe('open');
    expect(grant.rolling).toBe(true);
    expect(grant.deadline).toBeNull();
  });

  it('does not take the model\'s word that a round is rolling', () => {
    const grant = grantOf(run({ ...honest, deadline: null, rolling: true }, 'Music Futures Fund. Grants of up to $25,000.'));
    expect(grant.rolling).toBe(false);
    expect(grant.status).toBe('unknown');
  });

  it('is unknown, not open, when the page says nothing about dates', () => {
    const grant = grantOf(run({ ...honest, deadline: null }, 'Music Futures Fund. Grants of up to $25,000.'));
    expect(grant.status).toBe('unknown');
  });
});

describe('amount and currency', () => {
  it('blanks an amount the page does not state', () => {
    const grant = grantOf(run({ ...honest, amount: 99_000 }));
    expect(grant.amount).toBeNull();
    expect(grant.currency).toBeNull();
    expect(grant.blanked).toContain('amount');
  });

  it('blanks an amount stated in a different currency from the one claimed', () => {
    const grant = grantOf(run({ ...honest, amount: 25_000, currency: 'NGN' }));
    expect(grant.amount).toBeNull();
    expect(grant.blanked).toContain('amount');
  });

  it('keeps naira when the page says naira', () => {
    const grant = grantOf(run({ ...honest, amount: 2_000_000, currency: 'NGN' }, 'Music Futures Fund. Awards of ₦2,000,000. Closes 30 November 2026.'));
    expect(grant.amount).toBe(2_000_000);
    expect(grant.currency).toBe('NGN');
  });

  it('writes a figure in a currency we cannot save as text and leaves the amount empty', () => {
    const grant = grantOf(run({ ...honest, amount: 20_000, currency: 'CAD' }, 'Music Futures Fund. Awards of CAD 20,000. Closes 30 November 2026.'));
    expect(grant.amount).toBeNull();
    expect(grant.currency).toBeNull();
    expect(grant.figureNote).toBe('CAD 20,000');
    expect(grant.blanked).not.toContain('amount');
  });

  it('blanks an amount that is not a positive number', () => {
    for (const amount of [0, -5, Number.NaN, '25,000', {}]) {
      const grant = grantOf(run({ ...honest, amount }));
      expect(grant.amount).toBeNull();
      expect(grant.blanked).toContain('amount');
    }
  });

  it('blanks an amount that comes with no currency, because we do not guess one', () => {
    const grant = grantOf(run({ ...honest, amount: 25_000, currency: null }));
    expect(grant.amount).toBeNull();
    expect(grant.currency).toBeNull();
    expect(grant.blanked).toContain('amount');
  });

  it('keeps no amount when the model gives none', () => {
    const grant = grantOf(run({ ...honest, amount: null, currency: null }));
    expect(grant.amount).toBeNull();
    expect(grant.blanked).not.toContain('amount');
  });
});

describe('eligibility lines', () => {
  it('drops a line that is not on the page and says so', () => {
    const grant = grantOf(run({ ...honest, eligibility: [honest.eligibility[0], 'Winners receive a free car.'] }));
    expect(grant.eligibility).toEqual([honest.eligibility[0]]);
    expect(grant.blanked).toContain('eligibility');
  });

  it('matches a line without caring about case or line breaks', () => {
    const grant = grantOf(run({ ...honest, eligibility: ['artists based in nigeria with\n   at least one public release.'] }));
    expect(grant.eligibility.length).toBe(1);
  });

  it('keeps at most five lines of at most 200 characters', () => {
    const long = `${'Applicants must keep writing music every single day of the year and show it. '.repeat(5)}`.trim();
    const lines = Array.from({ length: 8 }, (_, i) => `Line ${i + 1} of the rules is here.`);
    const text = `Music Futures Fund.\n${lines.join('\n')}\n${long}\nCloses 30 November 2026.`;
    const grant = grantOf(run({ ...honest, eligibility: [...lines, long] }, text));
    expect(grant.eligibility.length).toBeLessThanOrEqual(5);
    for (const line of grant.eligibility) expect(line.length).toBeLessThanOrEqual(200);
  });

  it('gives back the page wording and keeps each line once', () => {
    const grant = grantOf(run({ ...honest, eligibility: ['ARTISTS BASED IN NIGERIA WITH AT LEAST ONE PUBLIC RELEASE.', honest.eligibility[0]] }));
    expect(grant.eligibility).toEqual([honest.eligibility[0]]);
  });

  it('ignores a line too short to mean anything', () => {
    const grant = grantOf(run({ ...honest, eligibility: ['Yes', honest.eligibility[0]] }));
    expect(grant.eligibility).toEqual([honest.eligibility[0]]);
  });

  it('ignores a value that is not a list of text', () => {
    expect(grantOf(run({ ...honest, eligibility: 'Artists in Nigeria' })).eligibility).toEqual([]);
    expect(grantOf(run({ ...honest, eligibility: [42, null, {}] })).eligibility).toEqual([]);
  });
});

describe('verifyExtraction: eligibility never carries a link', () => {
  // A grant's only link is the page's own address. A line quoted as "who can apply"
  // that holds a web address is how a page would smuggle a second link in, so it is
  // dropped even when the page holds it word for word.
  it('drops an eligibility line that holds a web address, and keeps the rest', () => {
    const text = PAGE_TEXT + '\nApply here: https://evil.example/apply for artists in Nigeria.\nSee www.other.example for details on eligibility.';
    const result = verifyExtraction({
      page: page(text),
      fields: {
        ...honest,
        eligibility: [
          'Apply here: https://evil.example/apply for artists in Nigeria.',
          'See www.other.example for details on eligibility.',
          'Who can apply: Artists based in Nigeria with at least one public release.',
        ],
      },
      readOn: READ_ON,
      today: TODAY,
    });
    if (!result.ok) throw new Error('expected a grant');
    expect(result.grant.eligibility).toEqual(['Who can apply: Artists based in Nigeria with at least one public release.']);
    expect(result.grant.blanked).toContain('eligibility');
  });
});


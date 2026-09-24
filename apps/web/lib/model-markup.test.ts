import { describe, expect, it } from 'vitest';
import { buildHelpReply } from './chappi/intent-router';
import { describeStatusFacts } from './release-status';
import { parseModelMarkup, stripModelMarkup, type MarkupSegment } from './model-markup';

/** Shorthand for a plain segment. */
function P(text: string): MarkupSegment {
  return { text, bold: false };
}

/** Shorthand for a bold segment. */
function B(text: string): MarkupSegment {
  return { text, bold: true };
}

describe('the screenshot reply', () => {
  it('bolds the phase labels and drops the asterisks', () => {
    const input =
      '- **Setup:** 26 tasks\n' +
      '- **Pre-release:** 13 tasks\n' +
      '- **Release week:** 12 tasks\n' +
      '- **Post-release:** 13 tasks';
    expect(parseModelMarkup(input)).toEqual([
      P('- '),
      B('Setup:'),
      P(' 26 tasks\n- '),
      B('Pre-release:'),
      P(' 13 tasks\n- '),
      B('Release week:'),
      P(' 12 tasks\n- '),
      B('Post-release:'),
      P(' 13 tasks'),
    ]);
    expect(stripModelMarkup(input)).toBe(
      '- Setup: 26 tasks\n- Pre-release: 13 tasks\n- Release week: 12 tasks\n- Post-release: 13 tasks'
    );
  });

  it('gives the identical result written with * bullets instead of -', () => {
    const dashInput =
      '- **Setup:** 26 tasks\n' +
      '- **Pre-release:** 13 tasks\n' +
      '- **Release week:** 12 tasks\n' +
      '- **Post-release:** 13 tasks';
    const starInput =
      '* **Setup:** 26 tasks\n' +
      '* **Pre-release:** 13 tasks\n' +
      '* **Release week:** 12 tasks\n' +
      '* **Post-release:** 13 tasks';
    expect(parseModelMarkup(starInput)).toEqual(parseModelMarkup(dashInput));
  });
});

describe('text with no markup is untouched', () => {
  const noChangeFixtures: string[] = [
    buildHelpReply().text,
    describeStatusFacts({ totalCount: 12, doneCount: 5, inProgressCount: 2, blockedCount: 1, dueThisWeekCount: 3 }),
    'Uploaded "__init__.wav" to Midnight.',
    '5 * 3 = 15, rated 4.5*',
    'snake_case, ade_o@label.com, @_artist_',
    'f**k it, B**** Better Have My Money, what the f**',
    '#NewMusicFriday, #1 on the chart',
    'a > b, <3, [draft] mix',
    '> 50% of tasks are done',
    '+ 3 more activities',
    'Setup | Pre-release | Release week',
    '- house bullet\n1. numbered\n\u2022 dot',
    'un**frigging**believable',
    '*.wav and *.mp3',
    'Go to https://urganize.com/a_b_c.',
    'C:\\Users\\me\\file.wav',
    'Plain sentence with nothing special in it at all.',
  ];

  for (const fixture of noChangeFixtures) {
    it(`leaves "${fixture.slice(0, 40)}" byte-identical`, () => {
      expect(parseModelMarkup(fixture)).toEqual([{ text: fixture, bold: false }]);
      expect(stripModelMarkup(fixture)).toBe(fixture);
    });
  }

  it('returns [] for an empty string', () => {
    expect(parseModelMarkup('')).toEqual([]);
    expect(stripModelMarkup('')).toBe('');
  });
});

describe('bold edges', () => {
  it('drops a truncated opening ** at the start of the text', () => {
    expect(parseModelMarkup('**Setup: 26 tasks')).toEqual([P('Setup: 26 tasks')]);
  });

  it('drops a truncated opening ** mid-sentence', () => {
    expect(parseModelMarkup('Due soon: **Setup')).toEqual([P('Due soon: Setup')]);
  });

  it('bolds a phrase immediately followed by punctuation', () => {
    expect(parseModelMarkup("**Midnight EP**'s rollout")).toEqual([B('Midnight EP'), P("'s rollout")]);
  });

  it('bolds a phrase wrapped in parentheses', () => {
    expect(parseModelMarkup('(**now**)')).toEqual([P('('), B('now'), P(')')]);
  });

  it('treats *** as bold (bold+italic collapsed to bold)', () => {
    expect(parseModelMarkup('***Heads up:*** the master is late')).toEqual([
      B('Heads up:'),
      P(' the master is late'),
    ]);
  });

  it('resolves a bold span containing a nested single-star span', () => {
    expect(parseModelMarkup('**Do this *today***')).toEqual([B('Do this today')]);
  });

  it('never makes __ bold', () => {
    expect(parseModelMarkup('__Setup__ first')).toEqual([P('Setup first')]);
  });

  it('does not bold across a line break (pinned limitation)', () => {
    expect(parseModelMarkup('**Setup\n26**')).toEqual([P('Setup\n26**')]);
  });
});

describe('other inline forms', () => {
  it('strips single-asterisk italics', () => {
    expect(parseModelMarkup('Pick *one* thing.')).toEqual([P('Pick one thing.')]);
  });

  it('strips single-underscore emphasis', () => {
    expect(parseModelMarkup('Pick _one_ owner.')).toEqual([P('Pick one owner.')]);
  });

  it('strips strikethrough', () => {
    expect(parseModelMarkup('~~Friday~~ Saturday')).toEqual([P('Friday Saturday')]);
  });
});

describe('headings', () => {
  it('bolds a heading and strips the hashes', () => {
    expect(parseModelMarkup('## Setup\n26 tasks')).toEqual([B('Setup'), P('\n26 tasks')]);
  });

  it('bolds nested emphasis inside a heading and trims a closing hash run', () => {
    expect(parseModelMarkup('### **Pre-release** plan ##')).toEqual([B('Pre-release plan')]);
  });

  it('drops an empty heading line entirely', () => {
    expect(parseModelMarkup('#\nx')).toEqual([P('x')]);
  });

  it('leaves a hashtag alone (no space after #)', () => {
    expect(parseModelMarkup('#NewMusicFriday is trending')).toEqual([P('#NewMusicFriday is trending')]);
  });
});

describe('horizontal rules', () => {
  it('removes a rule without leaving a double blank line', () => {
    expect(parseModelMarkup('Setup done.\n\n---\n\nNext: artwork.')).toEqual([
      P('Setup done.\n\nNext: artwork.'),
    ]);
  });

  it('removes spaced and mixed-character rules', () => {
    expect(parseModelMarkup('***\nA\n* * *\nB\n___')).toEqual([P('A\nB')]);
  });

  it('removes a leading rule with no content before it', () => {
    expect(parseModelMarkup('---\n\nHello')).toEqual([P('Hello')]);
  });
});

describe('fences', () => {
  it('keeps fenced content verbatim, asterisks included', () => {
    const input = 'Caption:\n```\nOut now! **link in bio**\n```\nPost it Friday.';
    expect(parseModelMarkup(input)).toEqual([
      P('Caption:\nOut now! **link in bio**\nPost it Friday.'),
    ]);
  });

  it('keeps everything after an unclosed fence verbatim', () => {
    const input = 'Before\n~~~\nInside **still literal**';
    expect(parseModelMarkup(input)).toEqual([P('Before\nInside **still literal**')]);
  });

  it('unwraps a whole-reply ```markdown fence and formats the inside', () => {
    const input = '```markdown\n- **Setup:** 26\n```';
    expect(parseModelMarkup(input)).toEqual([P('- '), B('Setup:'), P(' 26')]);
  });

  it('does not unwrap a fence that is only part of the reply', () => {
    const input = 'Here is the ISRC:\n```\nUSRC17607839\n```\nSave it.';
    expect(parseModelMarkup(input)).toEqual([P('Here is the ISRC:\nUSRC17607839\nSave it.')]);
  });
});

describe('inline code', () => {
  it('keeps the content, drops the backticks', () => {
    expect(parseModelMarkup('Set the ISRC to `USRC17607839`')).toEqual([
      P('Set the ISRC to USRC17607839'),
    ]);
  });

  it('does not let asterisks inside code become emphasis', () => {
    expect(parseModelMarkup('`a*b*c` and *d*')).toEqual([P('a*b*c and d')]);
  });

  it('respects ambient bold around a code span', () => {
    expect(parseModelMarkup('**Due `Friday`**')).toEqual([B('Due Friday')]);
  });
});

describe('links', () => {
  it('shows the label with the URL in parentheses', () => {
    expect(parseModelMarkup('[Press kit](https://urganize.com/k/ade)')).toEqual([
      P('Press kit (https://urganize.com/k/ade)'),
    ]);
  });

  it('does not repeat the URL when the label already is one', () => {
    expect(parseModelMarkup('[https://x.com](https://x.com)')).toEqual([P('https://x.com')]);
  });

  it('shows only the label for an in-app path', () => {
    expect(parseModelMarkup('[Open it](/dashboard?release=r1)')).toEqual([P('Open it')]);
  });

  it('shows a mailto address in parentheses', () => {
    expect(parseModelMarkup('[Email Ade](mailto:ade@label.com)')).toEqual([
      P('Email Ade (ade@label.com)'),
    ]);
  });

  it('keeps a balanced parenthesis inside the destination', () => {
    expect(parseModelMarkup('[Wiki](https://en.wikipedia.org/wiki/Afrobeats_(genre))')).toEqual([
      P('Wiki (https://en.wikipedia.org/wiki/Afrobeats_(genre))'),
    ]);
  });

  it('bolds a bold label and keeps the suffix plain', () => {
    expect(parseModelMarkup('[**Midnight EP**](https://x.com/m)')).toEqual([
      B('Midnight EP'),
      P(' (https://x.com/m)'),
    ]);
  });

  it('bolds the label and the URL suffix together when wrapped in **', () => {
    expect(parseModelMarkup('**[Midnight EP](https://x.com/m)**')).toEqual([
      B('Midnight EP (https://x.com/m)'),
    ]);
  });
});

describe('urls and images', () => {
  it('bolds a bare URL wrapped in **', () => {
    expect(parseModelMarkup('**https://urganize.com**')).toEqual([B('https://urganize.com')]);
  });

  it('unwraps an autolink', () => {
    expect(parseModelMarkup('<https://urganize.com>')).toEqual([P('https://urganize.com')]);
  });

  it('unwraps a mailto autolink', () => {
    expect(parseModelMarkup('<mailto:ade@label.com>')).toEqual([P('ade@label.com')]);
  });

  it('replaces an image with its alt text', () => {
    expect(parseModelMarkup('![cover](https://x.com/c.png)')).toEqual([P('cover')]);
  });

  it('trims a trailing sentence-period off a bare URL inside a bold span', () => {
    // Without trimming, the greedy bare-URL match would swallow the closing
    // ** into the URL itself, leaving no closer at all: the opening ** would
    // then be a genuinely unclosed opener (dropped) and the closing ** would
    // show up as stray literal asterisks. With trimming, the period is
    // handed back to ordinary parsing and lands inside the bold span (it
    // sits right before the real closing markers), and the ** pair itself
    // resolves correctly.
    expect(parseModelMarkup('See **https://urganize.com/a.** now')).toEqual([
      P('See '),
      B('https://urganize.com/a.'),
      P(' now'),
    ]);
  });
});

describe('escapes', () => {
  it('turns an escaped character into the literal', () => {
    expect(parseModelMarkup('1\\. Not a list, \\*literal\\*')).toEqual([
      P('1. Not a list, *literal*'),
    ]);
  });
});

describe('blockquotes', () => {
  it('strips one or more leading markers', () => {
    expect(parseModelMarkup('> Hey team, the master is in.\n>> nested')).toEqual([
      P('Hey team, the master is in.\nnested'),
    ]);
  });
});

describe('tables', () => {
  it('folds a header, separator and rows into lines, with a bold cell', () => {
    const input = '| Phase | Tasks |\n|:---|---:|\n| Setup | 26 |\n| **Pre-release** | 13 |';
    expect(parseModelMarkup(input)).toEqual([
      P('Phase \u00b7 Tasks\nSetup \u00b7 26\n'),
      B('Pre-release'),
      P(' \u00b7 13'),
    ]);
  });

  it('handles an escaped pipe inside a cell', () => {
    expect(parseModelMarkup('| a \\| b | c |\n|---|---|')).toEqual([P('a | b \u00b7 c')]);
  });

  it('leaves a mismatched header/separator cell count unchanged', () => {
    const input = '| a | b | c |\n|---|---|';
    expect(parseModelMarkup(input)).toEqual([P(input)]);
  });
});

describe('bullets', () => {
  it('normalizes nested * bullets to the house dash and formats inline content', () => {
    expect(parseModelMarkup('* one\n  * two\n*Note:* soon')).toEqual([
      P('- one\n  - two\nNote: soon'),
    ]);
  });
});

describe('line endings', () => {
  it('normalizes CRLF before parsing', () => {
    expect(parseModelMarkup('**A**\r\nB')).toEqual([B('A'), P('\nB')]);
  });
});

describe('shape invariants over every fixture above', () => {
  const fixtures: string[] = [
    '- **Setup:** 26 tasks\n- **Pre-release:** 13 tasks',
    'un**frigging**believable',
    '**Setup: 26 tasks',
    '**Midnight EP**\'s rollout',
    '***Heads up:*** the master is late',
    '**Do this *today***',
    '## Setup\n26 tasks',
    'Setup done.\n\n---\n\nNext: artwork.',
    'Caption:\n```\nOut now! **link in bio**\n```\nPost it Friday.',
    '[Press kit](https://urganize.com/k/ade)',
    '**[Midnight EP](https://x.com/m)**',
    '| Phase | Tasks |\n|:---|---:|\n| Setup | 26 |\n| **Pre-release** | 13 |',
    '* one\n  * two\n*Note:* soon',
    'f**k it, B**** Better Have My Money',
  ];

  for (const fixture of fixtures) {
    it(`produces no empty segments and no adjacent same-bold segments for "${fixture.slice(0, 30)}"`, () => {
      const segments = parseModelMarkup(fixture);
      for (const seg of segments) {
        expect(seg.text).not.toBe('');
      }
      for (let i = 1; i < segments.length; i += 1) {
        expect(segments[i].bold).not.toBe(segments[i - 1].bold);
      }
    });

    it(`strips to the joined segment text for "${fixture.slice(0, 30)}"`, () => {
      const segments = parseModelMarkup(fixture);
      expect(stripModelMarkup(fixture)).toBe(segments.map((s) => s.text).join(''));
    });
  }
});

describe('pathological inputs return promptly', () => {
  const cases: Array<[string, string]> = [
    ['20k asterisks', '*'.repeat(20000)],
    ['many small bold-opener attempts', '**a '.repeat(5000)],
    ['20k open brackets with no close', '['.repeat(20000)],
    ['10k alternating backtick/a', '`a'.repeat(10000)],
    ['10k pipe-space', '| '.repeat(10000)],
    ['20k spaces then a heading', ' '.repeat(20000) + '# x'],
  ];

  for (const [name, input] of cases) {
    it(`completes for: ${name}`, () => {
      const start = Date.now();
      const segments = parseModelMarkup(input);
      expect(Array.isArray(segments)).toBe(true);
      expect(Date.now() - start).toBeLessThan(2000);
    });
  }

  it('returns text over the max parse length completely untouched', () => {
    const huge = '**bold** '.repeat(20000); // well over 100,000 chars
    expect(parseModelMarkup(huge)).toEqual([{ text: huge, bold: false }]);
  });
});

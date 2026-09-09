import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  HELP_COPY,
  HELP_JARGON_WORDS,
  MAX_HELP_CHARS,
  MAX_HELP_SENTENCES,
  MAX_HELP_WORDS_PER_SENTENCE,
  findHelpCopyProblems,
  helpCopyInstruction,
} from './help-copy';

/**
 * The fifth-grader bar, enforced rather than reviewed.
 *
 * The founder's ask for these pullouts was that "a fifth grader could use the
 * app", and a bar like that survives exactly as long as nobody is in a hurry.
 * So it is a test: a pullout is at most two short sentences, in words a
 * beginner already knows.
 *
 * Scope is this module only. The rest of the product's copy predates the rule
 * and is not in scope for a retrofit — the same line lib/press-kit-copy-guard
 * draws for the house rules it enforces. New help copy is born clean; old
 * prose stays as it is.
 */

describe('findHelpCopyProblems', () => {
  it('passes a short, plain, one-sentence explanation', () => {
    expect(findHelpCopyProblems('The main style of the music, like Afrobeats.')).toEqual([]);
  });

  it('passes two short sentences', () => {
    expect(
      findHelpCopyProblems('Your distributor gives you this code. Leave it blank for now if you do not have it.')
    ).toEqual([]);
  });

  it('refuses an empty or blank string', () => {
    expect(findHelpCopyProblems('')).toContain('empty');
    expect(findHelpCopyProblems('   ')).toContain('empty');
  });

  it('refuses untrimmed text', () => {
    // A leading space is invisible in review and shows up as a gap on screen.
    expect(findHelpCopyProblems(' Leading space here.')).toContain('untrimmed');
    expect(findHelpCopyProblems('Trailing space here. ')).toContain('untrimmed');
  });

  it('refuses a third sentence', () => {
    // A pullout is a pullout, not a paragraph. Three sentences is the thing
    // this whole pass exists to get rid of.
    const three = 'One thing here. Two things here. Three things here.';
    expect(findHelpCopyProblems(three)).toContain('too many sentences');
  });

  it('refuses a sentence that runs long even when there is only one', () => {
    const rambling = `This ${'very '.repeat(MAX_HELP_WORDS_PER_SENTENCE)} long sentence.`;
    expect(findHelpCopyProblems(rambling)).toContain('sentence too long');
  });

  it('refuses text over the character cap', () => {
    const long = `${'a'.repeat(MAX_HELP_CHARS + 1)}.`;
    expect(findHelpCopyProblems(long)).toContain('too long');
  });

  it('requires a full stop, so a pullout reads as a sentence and not a label', () => {
    expect(findHelpCopyProblems('The main style of the music')).toContain('no full stop');
  });

  it('refuses jargon a beginner would have to look up', () => {
    for (const word of HELP_JARGON_WORDS) {
      const problems = findHelpCopyProblems(`We will ${word} it for you.`);
      expect(problems.join(' '), `expected "${word}" to be refused`).toContain('jargon');
    }
  });

  it('refuses jargon whatever its case, and only as a whole word', () => {
    // Joined rather than matched element-wise: the module names the offending
    // word ("jargon: configure") so a developer reading a failure knows which
    // one to rewrite.
    expect(findHelpCopyProblems('We will Configure it for you.').join(' ')).toContain('jargon');
    // "configured" should be caught, but "reconfigurement" contains the listed
    // word without starting on it — a bare substring match would refuse a word
    // the list never named, so the check is bounded at the word start.
    expect(findHelpCopyProblems('We configured it for you.').join(' ')).toContain('jargon');
    expect(findHelpCopyProblems('Reconfigurement is not a real word here.').join(' ')).not.toContain(
      'jargon'
    );
  });

  it('refuses an em dash and the word ship, so the house rules hold here too', () => {
    expect(findHelpCopyProblems('Two things — both of them.')).toContain('em dash');
    expect(findHelpCopyProblems('We ship it for you.').join(' ')).toContain('banned word');
  });

  it('refuses a double space', () => {
    expect(findHelpCopyProblems('One thing  here.')).toContain('double space');
  });

  it('names every problem it finds rather than stopping at the first', () => {
    // A guard that reports one problem per run turns a rewrite into several
    // rounds of the same test.
    const problems = findHelpCopyProblems(' We will configure it — for you.  ');
    expect(problems.length).toBeGreaterThan(1);
  });
});

describe('HELP_COPY', () => {
  it('holds at least one explanation', () => {
    expect(Object.keys(HELP_COPY).length).toBeGreaterThan(0);
  });

  it('passes its own bar, every entry', () => {
    const failures: string[] = [];
    for (const [key, entry] of Object.entries(HELP_COPY)) {
      const problems = findHelpCopyProblems(entry.text);
      if (problems.length > 0) {
        failures.push(`${key}: ${problems.join(', ')} in ${JSON.stringify(entry.text)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('gives every entry a label naming what it explains', () => {
    // The label is what the trigger announces ("What is Genre?"), so a missing
    // one is a control a screen reader cannot describe.
    const failures = Object.entries(HELP_COPY)
      .filter(([, entry]) => !entry.label.trim())
      .map(([key]) => key);
    expect(failures).toEqual([]);
  });

  it('never explains a thing with its own name', () => {
    // "Metadata: the metadata for your song" is the failure mode. A pullout
    // exists because the label was not enough, so leaning on the label is the
    // one thing it must not do. Words under 5 letters are skipped: "name",
    // "line" and "UPC" are ordinary English or the domain's own acronym, and
    // banning them would push copy into vagueness, which costs a beginner more
    // than a repeated short word does.
    const failures: string[] = [];
    for (const [key, entry] of Object.entries(HELP_COPY)) {
      for (const word of entry.label.split(/[^a-zA-Z]+/).filter((w) => w.length >= 5)) {
        if (new RegExp(`\\b${word}`, 'i').test(entry.text)) {
          failures.push(`${key} leans on "${word}": ${JSON.stringify(entry.text)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('says no two things with the same words', () => {
    // Two identical pullouts mean one of the two surfaces is explained wrong.
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const [key, entry] of Object.entries(HELP_COPY)) {
      const previous = seen.get(entry.text.toLowerCase());
      if (previous) duplicates.push(`${previous} and ${key}`);
      else seen.set(entry.text.toLowerCase(), key);
    }
    expect(duplicates).toEqual([]);
  });
});

/**
 * Dead copy is worse than no copy: it reads as covered in review and renders
 * nowhere. Derived from the module rather than a hand-written list, so a key
 * added without a call site fails — the mechanism that holds the tool registry
 * and the icon set in step.
 */
describe('every explanation is actually rendered', () => {
  const WEB = join(__dirname, '..');

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  }

  const sources = [...walk(join(WEB, 'components')), ...walk(join(WEB, 'app'))]
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

  it('finds a call site for every key', () => {
    const unused = Object.keys(HELP_COPY).filter((key) => !sources.includes(key));
    expect(unused).toEqual([]);
  });
});

describe('helpCopyInstruction', () => {
  it('states the caps it actually enforces, so prose and guard cannot disagree', () => {
    const instruction = helpCopyInstruction();
    expect(instruction).toContain(String(MAX_HELP_SENTENCES));
    expect(instruction).toContain(String(MAX_HELP_WORDS_PER_SENTENCE));
  });
});

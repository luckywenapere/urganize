import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { attribute, classText, openingTags } from './jsx-scan';

/**
 * A form field's border has to be findable: 3:1 against what it sits on
 * (WCAG 1.4.11). The hairline strokes the app draws cards and dividers with sit
 * near 1.1:1 on purpose, and they had been copied onto about a hundred input,
 * select and textarea elements, so a field was close to invisible on a cream
 * page. Fields use `border-stroke-control` now (lib/text-contrast.test.ts holds
 * that colour to 3:1), and this keeps a new field from going back.
 *
 * It reads source because vitest here has no DOM. A class string is followed to
 * a const in the same file (`inputClass`, `fieldClass`), which is how most
 * fields in this app get their look; one imported from another file is not
 * followed, so this is a floor and not a proof.
 */

const WEB = join(__dirname, '..');
const UI = join(WEB, '..', '..', 'packages', 'ui', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '.next') return [];
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const rel = (path: string) => relative(WEB, path).split(sep).join('/');

const FILES = [join(WEB, 'components'), join(WEB, 'app'), UI]
  .flatMap(walk)
  .filter((path) => path.endsWith('.tsx') && !path.endsWith('.test.tsx'))
  .filter((path) => !path.includes(`${sep}app${sep}api${sep}`));

/** The hairline tiers, written as a base border. A variant (`focus:border-...`)
 * is a state and is judged on its own. */
const WEAK_STROKE = /(?<![:\w-])border-stroke-(?:default|subtle|strong)\b/;
/** The content calendar's own divider token, used on its fields. */
const WEAK_CALENDAR = /border-\[var\(--cc-border\)\]/;

/** Kinds of `<input>` that are not a box the reader types into. */
const NOT_A_BOX = new Set(['checkbox', 'radio', 'hidden', 'file', 'range', 'submit', 'button', 'color']);

type Field = { where: string; classes: string; hasType: string | null };

const FIELDS: Field[] = FILES.flatMap((path) => {
  const source = readFileSync(path, 'utf8');
  return openingTags(source, ['input', 'select', 'textarea', 'Input', 'Select', 'Textarea']).map((tag) => ({
    where: `${rel(path)}:${tag.line}`,
    classes: classText(source, tag),
    hasType: attribute(tag, 'type'),
  }));
}).filter((field) => !NOT_A_BOX.has(field.hasType ?? ''));

describe('form fields use the control border', () => {
  it('finds the fields it is meant to be checking', () => {
    // A scan that silently matched nothing would pass every test below.
    expect(FIELDS.length).toBeGreaterThan(150);
  });

  it('sees the fields that share a class const, not only inline class strings', () => {
    const controlled = FIELDS.filter((field) => field.classes.includes('border-stroke-control'));
    expect(controlled.length).toBeGreaterThan(80);
  });

  it('no field draws its boundary with a hairline stroke', () => {
    const found = FIELDS.filter(
      (field) =>
        // A field that is bare until hovered (the task pop-up's inline rows) keeps
        // its transparent resting border on purpose.
        !field.classes.includes('border-transparent') &&
        (WEAK_STROKE.test(field.classes) || WEAK_CALENDAR.test(field.classes))
    ).map((field) => field.where);
    expect(found).toEqual([]);
  });

  it('a hover state on a field is never weaker than the border it sits on', () => {
    // hover:border-stroke-* was the same 1.1:1 hairline; on a 3:1 border it
    // would make the field fade when pointed at.
    const found = FIELDS.filter((field) => /hover:border-stroke-/.test(field.classes) && !field.classes.includes('border-transparent')).map(
      (field) => field.where
    );
    expect(found).toEqual([]);
  });
});

describe('the public forms draw their fields with the field token', () => {
  const css = readFileSync(join(WEB, 'app', 'globals.css'), 'utf8');

  for (const [file, variable] of [
    ['components/credits/CreditSubmissionForm.tsx', '--credits-field-border'],
    ['components/capture/CaptureLeadForm.tsx', '--capture-field-border'],
  ] as const) {
    it(`${file} styles its inputs with ${variable}`, () => {
      const source = readFileSync(join(WEB, file), 'utf8');
      const body = /function inputStyle\(\)[^{]*\{([\s\S]*?)\n\}/.exec(source);
      expect(body).not.toBeNull();
      expect(body![1]).toContain('FIELD_STROKE');
      expect(source).toContain(`var(${variable})`);
      expect(css).toContain(`${variable}:`);
    });
  }
});

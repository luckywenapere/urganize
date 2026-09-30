import { describe, expect, it } from 'vitest';
import { attribute, classText, constInitializer, openingTags } from './jsx-scan';

describe('openingTags', () => {
  it('walks past a > that sits inside a string or an expression', () => {
    const source = `<input className="a>b" onChange={(e) => set(e.target.value)} />\n<p>after</p>`;
    const [tag] = openingTags(source, ['input']);
    expect(tag.text).toBe(`<input className="a>b" onChange={(e) => set(e.target.value)} />`);
  });

  it('does not match a longer tag name', () => {
    const source = `<inputs a="b" />\n<input a="c" />\n<Inputs />`;
    expect(openingTags(source, ['input', 'Input'])).toHaveLength(1);
  });

  it('finds several names in source order and numbers the lines from 1', () => {
    const source = `<div>\n  <select a="1" />\n  <input b="2" />\n</div>`;
    const tags = openingTags(source, ['input', 'select']);
    expect(tags.map((tag) => [tag.name, tag.line])).toEqual([
      ['select', 2],
      ['input', 3],
    ]);
  });

  it('keeps going across lines for a tag with many attributes', () => {
    const source = `<textarea\n  id="a"\n  className={\`x \${y}\`}\n  rows={3}\n/>`;
    expect(openingTags(source, ['textarea'])[0].text.endsWith('/>')).toBe(true);
  });
});

describe('attribute', () => {
  it('reads a quoted value', () => {
    expect(attribute({ text: '<input type="password" />' }, 'type')).toBe('password');
  });

  it('reads the inside of a braced expression, braces and all nested', () => {
    expect(attribute({ text: '<input className={clsx("a", { b: x })} />' }, 'className')).toBe('clsx("a", { b: x })');
  });

  it('does not mistake inputClassName for className', () => {
    expect(attribute({ text: '<Input inputClassName="x" />' }, 'className')).toBeNull();
  });

  it('returns null when the attribute is absent', () => {
    expect(attribute({ text: '<input />' }, 'className')).toBeNull();
  });
});

describe('constInitializer', () => {
  it('returns a string, a template, or a concatenation up to the semicolon', () => {
    const source = `const a = 'one';\nconst b = \`two \${a}\`;\nconst c =\n  'three ' +\n  'four';`;
    expect(constInitializer(source, 'a')).toBe(`'one'`);
    expect(constInitializer(source, 'b')).toBe('`two ${a}`');
    expect(constInitializer(source, 'c')?.replace(/\s+/g, ' ')).toBe(`'three ' + 'four'`);
  });

  it('is not fooled by a semicolon inside the string', () => {
    expect(constInitializer(`const a = 'x; y';`, 'a')).toBe(`'x; y'`);
  });

  it('returns null for a name that is not declared here', () => {
    expect(constInitializer(`const a = 'x';`, 'b')).toBeNull();
  });
});

describe('classText', () => {
  const source = `const inputClass = 'border border-stroke-control';\nconst other = 'unrelated';`;

  it('includes the className attribute as written', () => {
    const tag = { text: '<input className="px-3 border-brand" />' };
    expect(classText(source, tag)).toContain('border-brand');
  });

  it('follows a bare identifier to the const in the same file', () => {
    expect(classText(source, { text: '<input className={inputClass} />' })).toContain('border-stroke-control');
  });

  it('follows an identifier inside a template literal', () => {
    expect(classText(source, { text: '<input className={`${inputClass} mt-1`} />' })).toContain('border-stroke-control');
  });

  it('does not pull in a const the tag never mentions', () => {
    expect(classText(source, { text: '<input className={inputClass} />' })).not.toContain('unrelated');
  });

  it('gives an empty string for a tag with no className', () => {
    expect(classText(source, { text: '<input />' })).toBe('');
  });
});

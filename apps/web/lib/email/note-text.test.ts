import { describe, expect, it } from 'vitest';
import { parseNoteText, noteTextToPlain, isSafeNoteHref } from './note-text';

describe('parseNoteText', () => {
  it('splits paragraphs on blank lines and keeps single newlines as breaks', () => {
    const paragraphs = parseNoteText('First line\nsecond line\n\n\nNew paragraph');
    expect(paragraphs).toEqual([
      [
        { kind: 'text', text: 'First line' },
        { kind: 'break' },
        { kind: 'text', text: 'second line' },
      ],
      [{ kind: 'text', text: 'New paragraph' }],
    ]);
  });

  it('turns [text](url) into a link and leaves the words around it', () => {
    expect(parseNoteText('Please [open Urganize](https://app.urganize.app) today.')).toEqual([
      [
        { kind: 'text', text: 'Please ' },
        { kind: 'link', text: 'open Urganize', href: 'https://app.urganize.app' },
        { kind: 'text', text: ' today.' },
      ],
    ]);
  });

  it('links a bare https URL without swallowing the full stop after it', () => {
    expect(parseNoteText('See https://urganize.app/pricing.')).toEqual([
      [
        { kind: 'text', text: 'See ' },
        { kind: 'link', text: 'https://urganize.app/pricing', href: 'https://urganize.app/pricing' },
        { kind: 'text', text: '.' },
      ],
    ]);
  });

  it('refuses a javascript: link and keeps its words as plain text', () => {
    expect(parseNoteText('[click](javascript:alert(1))')).toEqual([
      [{ kind: 'text', text: '[click](javascript:alert(1))' }],
    ]);
  });

  it('allows mailto links', () => {
    const [paragraph] = parseNoteText('[Email me](mailto:lucky@urganize.app)');
    expect(paragraph).toEqual([{ kind: 'link', text: 'Email me', href: 'mailto:lucky@urganize.app' }]);
  });

  it('drops empty input and whitespace-only paragraphs', () => {
    expect(parseNoteText('')).toEqual([]);
    expect(parseNoteText('   \n\n  \n')).toEqual([]);
  });

  it('normalises Windows line endings', () => {
    expect(parseNoteText('One\r\n\r\nTwo')).toHaveLength(2);
  });
});

describe('noteTextToPlain', () => {
  it('writes a link as "text (url)" and keeps paragraphs apart', () => {
    expect(noteTextToPlain('Go [here](https://a.test/x).\n\nBye')).toBe('Go here (https://a.test/x).\n\nBye');
  });

  it('does not repeat a bare URL', () => {
    expect(noteTextToPlain('https://a.test')).toBe('https://a.test');
  });
});

describe('isSafeNoteHref', () => {
  it('accepts http, https and mailto only', () => {
    expect(isSafeNoteHref('https://x.test')).toBe(true);
    expect(isSafeNoteHref('http://x.test')).toBe(true);
    expect(isSafeNoteHref('mailto:a@b.test')).toBe(true);
    expect(isSafeNoteHref('javascript:alert(1)')).toBe(false);
    expect(isSafeNoteHref('data:text/html,hi')).toBe(false);
    expect(isSafeNoteHref('/dashboard')).toBe(false);
  });
});

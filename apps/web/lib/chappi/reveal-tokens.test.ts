import { describe, expect, it } from 'vitest';
import { buildRevealGroups, REVEAL_MAX_DELAY_MS, REVEAL_WORD_STAGGER_MS } from './reveal-tokens';
import type { MarkupSegment } from '@/lib/model-markup';

describe('buildRevealGroups', () => {
  it('gives whitespace-run tokens a null delay and words a staggered one', () => {
    const segments: MarkupSegment[] = [{ text: 'Hi there\nfriend', bold: false }];
    const groups = buildRevealGroups(segments);
    expect(groups).toHaveLength(1);
    expect(groups[0].bold).toBe(false);
    expect(groups[0].tokens).toEqual([
      { token: 'Hi', delay: 0 },
      { token: ' ', delay: null },
      { token: 'there', delay: REVEAL_WORD_STAGGER_MS },
      { token: '\n', delay: null },
      { token: 'friend', delay: REVEAL_WORD_STAGGER_MS * 2 },
    ]);
  });

  it('keeps one word counter running across segments (bold does not reset it)', () => {
    const segments: MarkupSegment[] = [
      { text: '- ', bold: false },
      { text: 'Setup:', bold: true },
      { text: ' 26 tasks', bold: false },
    ];
    const groups = buildRevealGroups(segments);
    // "- " has no word (pure whitespace token "-": actually "-" is not
    // whitespace, so it IS a word). Word order: "-", "Setup:", "26", "tasks".
    expect(groups[0].tokens[0]).toEqual({ token: '-', delay: 0 });
    expect(groups[1].tokens[0]).toEqual({ token: 'Setup:', delay: REVEAL_WORD_STAGGER_MS });
    expect(groups[2].tokens[1]).toEqual({ token: '26', delay: REVEAL_WORD_STAGGER_MS * 2 });
    expect(groups[2].tokens[3]).toEqual({ token: 'tasks', delay: REVEAL_WORD_STAGGER_MS * 3 });
  });

  it('caps the delay at REVEAL_MAX_DELAY_MS for a long reply', () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
    const groups = buildRevealGroups([{ text: words, bold: false }]);
    const delays = groups[0].tokens.filter((t) => t.delay !== null).map((t) => t.delay as number);
    expect(Math.max(...delays)).toBe(REVEAL_MAX_DELAY_MS);
    expect(delays.filter((d) => d === REVEAL_MAX_DELAY_MS).length).toBeGreaterThan(1);
  });

  it('carries each group\'s own bold flag, including a whitespace-only segment', () => {
    const groups = buildRevealGroups([
      { text: 'plain', bold: false },
      { text: ' ', bold: true },
      { text: 'bold', bold: true },
    ]);
    expect(groups[1].bold).toBe(true);
    expect(groups[1].tokens).toEqual([{ token: ' ', delay: null }]);
  });
});

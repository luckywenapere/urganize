import { describe, expect, it } from 'vitest';
import {
  COMPOSER_OVERLAP_PX,
  SCROLL_TO_LATEST_THRESHOLD_PX,
  distanceFromLatest,
  isAwayFromLatest,
} from './chat-scroll-position';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('distanceFromLatest', () => {
  it('is the transcript still below the viewport', () => {
    expect(distanceFromLatest({ scrollTop: 100, scrollHeight: 1000, clientHeight: 500 })).toBe(400);
  });
  it('is zero at the bottom and never negative on iOS overscroll', () => {
    expect(distanceFromLatest({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 })).toBe(0);
    expect(distanceFromLatest({ scrollTop: 540, scrollHeight: 1000, clientHeight: 500 })).toBe(0);
  });
  it('treats an unreadable measurement as at the bottom', () => {
    expect(distanceFromLatest({ scrollTop: Number.NaN, scrollHeight: 1000, clientHeight: 500 })).toBe(0);
  });
});

describe('isAwayFromLatest', () => {
  it('shows the arrow only past the threshold', () => {
    const near = { scrollTop: 1000 - 500 - SCROLL_TO_LATEST_THRESHOLD_PX, scrollHeight: 1000, clientHeight: 500 };
    expect(isAwayFromLatest(near)).toBe(false);
    expect(isAwayFromLatest({ ...near, scrollTop: near.scrollTop - 1 })).toBe(true);
  });
  it('never shows on a transcript that does not scroll', () => {
    expect(isAwayFromLatest({ scrollTop: 0, scrollHeight: 400, clientHeight: 500 })).toBe(false);
  });
  it('never shows on a transcript shorter than the threshold', () => {
    expect(isAwayFromLatest({ scrollTop: 0, scrollHeight: 500 + SCROLL_TO_LATEST_THRESHOLD_PX, clientHeight: 500 })).toBe(
      false
    );
  });
  it('takes a custom threshold', () => {
    expect(isAwayFromLatest({ scrollTop: 0, scrollHeight: 560, clientHeight: 500 }, 50)).toBe(true);
  });
});

describe('the composer overlap is one number', () => {
  it('the sentinel height and the composer margin follow COMPOSER_OVERLAP_PX', () => {
    const source = readFileSync(join(__dirname, '../components/chappi/ChappiConversation.tsx'), 'utf8').replace(/\r\n/g, '\n');
    // 16px is Tailwind's 4 (1rem): the wrapper pulls up by -mt-4, and the h-12
    // sentinel is taller than the overlap so the last line clears the frost.
    expect(COMPOSER_OVERLAP_PX).toBe(16);
    expect(source).toContain('-mt-4 shrink-0');
    expect(source).toMatch(/ref=\{bottomRef\}[^>]*className="h-12/);
  });
});

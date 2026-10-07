import { describe, expect, it } from 'vitest';
import {
  composerBottomGap,
  consumeArrivingFromHome,
  glideOffset,
  markArrivingFromHome,
} from './home-chat-glide';

describe('glideOffset', () => {
  it('moves the box down to sit above the bottom of the screen', () => {
    expect(glideOffset({ boxBottom: 500, viewportHeight: 900, bottomGap: 24 })).toBe(376);
  });
  it('stays put while the keyboard is open, since the box rides on it', () => {
    expect(
      glideOffset({ boxBottom: 500, viewportHeight: 900, bottomGap: 24, keyboardOpen: true })
    ).toBe(0);
  });
  it('moves it up when it starts below that spot', () => {
    expect(glideOffset({ boxBottom: 950, viewportHeight: 900, bottomGap: 24 })).toBe(-74);
  });
});

describe('composerBottomGap', () => {
  it('leaves room for the phone bottom bar below lg', () => {
    expect(composerBottomGap(375)).toBe(88);
    expect(composerBottomGap(1024)).toBe(24);
  });
});

describe('arrival mark', () => {
  it('is true once, right after Home marks it', () => {
    markArrivingFromHome(1000);
    expect(consumeArrivingFromHome(1200)).toBe(true);
    expect(consumeArrivingFromHome(1300)).toBe(false);
  });
  it('is false when the mark is stale', () => {
    markArrivingFromHome(1000);
    expect(consumeArrivingFromHome(7000)).toBe(false);
  });
  it('is false with no mark', () => {
    expect(consumeArrivingFromHome(1000)).toBe(false);
  });
});

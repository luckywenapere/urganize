import { describe, expect, it } from 'vitest';
import { ASSET_SIZE_LIMITS, MAX_PRESS_PHOTO_BYTES } from './asset-constants';
import {
  PRESS_PHOTO_MIN_EDGE,
  PRESS_PHOTO_PRINT_EDGE,
  PRESS_PHOTO_USAGE_RIGHTS,
  gradePressPhoto,
  isPressPhotoUsageRight,
  usageRightLabel,
  validatePressPhotoFile,
} from './press-photo';

const file = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: 'press-shot.jpg',
  type: 'image/jpeg',
  size: 2 * 1024 * 1024,
  ...over,
});

describe('validatePressPhotoFile', () => {
  it('takes an ordinary press shot', () => {
    expect(validatePressPhotoFile(file())).toEqual({ ok: true });
  });

  it('refuses an empty file', () => {
    expect(validatePressPhotoFile(file({ size: 0 })).ok).toBe(false);
  });

  it('refuses a file over the press photo ceiling', () => {
    const result = validatePressPhotoFile(file({ size: MAX_PRESS_PHOTO_BYTES + 1 }));
    expect(result.ok).toBe(false);
  });

  it('accepts a file that would be refused as a promo image', () => {
    // The whole reason this has its own ceiling: promo_image is 5 MiB, and a
    // print-resolution press shot routinely runs past it.
    const size = ASSET_SIZE_LIMITS.promo_image + 1;
    expect(size).toBeLessThan(MAX_PRESS_PHOTO_BYTES);
    expect(validatePressPhotoFile(file({ size })).ok).toBe(true);
  });

  it('refuses a PDF', () => {
    expect(validatePressPhotoFile(file({ type: 'application/pdf' })).ok).toBe(false);
  });
});

describe('gradePressPhoto', () => {
  it('never blocks a landscape photo', () => {
    // The one thing that must not be copied from gradeCoverArt, whose tier 2
    // blocks anything non-square. Most press shots are landscape, so grading
    // aspect ratio here would refuse the entire feature's input.
    const wide = gradePressPhoto({ width: 4000, height: 2250 });
    const tall = gradePressPhoto({ width: 2250, height: 4000 });
    expect(wide.verdict).toBe('ready');
    expect(tall.verdict).toBe('ready');
  });

  it('grades a square photo exactly like a landscape one of the same long edge', () => {
    expect(gradePressPhoto({ width: 3000, height: 3000 }).verdict).toBe(
      gradePressPhoto({ width: 3000, height: 1688 }).verdict
    );
  });

  it('is ready at the print edge', () => {
    expect(gradePressPhoto({ width: PRESS_PHOTO_PRINT_EDGE, height: 1200 }).verdict).toBe(
      'ready'
    );
  });

  it('warns below the print edge but still allows it', () => {
    const grade = gradePressPhoto({ width: PRESS_PHOTO_PRINT_EDGE - 1, height: 1200 });
    expect(grade.verdict).toBe('warning');
    expect(grade.headline.length).toBeGreaterThan(0);
  });

  it('blocks below the absolute floor', () => {
    expect(gradePressPhoto({ width: PRESS_PHOTO_MIN_EDGE - 1, height: 400 }).verdict).toBe(
      'blocked'
    );
  });

  it('blocks dimensions it cannot read', () => {
    expect(gradePressPhoto(null).verdict).toBe('blocked');
    expect(gradePressPhoto({ width: 0, height: 0 }).verdict).toBe('blocked');
  });

  it('measures the long edge, whichever side it is on', () => {
    expect(gradePressPhoto({ width: 400, height: 4000 }).verdict).toBe('ready');
  });

  it('never says "ship" and uses no em dash', () => {
    // House copy rules, and a grade line is user-facing.
    for (const dims of [
      { width: 4000, height: 2250 },
      { width: 1500, height: 1000 },
      { width: 400, height: 300 },
    ]) {
      const grade = gradePressPhoto(dims);
      const text = `${grade.headline} ${grade.detail}`;
      expect(text).not.toMatch(/\bship(s|ped|ping)?\b/i);
      expect(text).not.toContain('—');
    }
  });
});

describe('usage rights', () => {
  it('offers four choices', () => {
    expect(PRESS_PHOTO_USAGE_RIGHTS).toHaveLength(4);
  });

  it('recognises its own values and nothing else', () => {
    for (const option of PRESS_PHOTO_USAGE_RIGHTS) {
      expect(isPressPhotoUsageRight(option.value)).toBe(true);
    }
    expect(isPressPhotoUsageRight('whatever')).toBe(false);
    expect(isPressPhotoUsageRight('')).toBe(false);
  });

  it('has a label for every value', () => {
    for (const option of PRESS_PHOTO_USAGE_RIGHTS) {
      expect(usageRightLabel(option.value)).toBe(option.label);
    }
  });

  it('hands an unknown stored value straight back', () => {
    // Rights used to be free text on some rows, and a kit that already holds a
    // sentence must keep showing it rather than reading as unset.
    expect(usageRightLabel('Cleared for The Native only')).toBe('Cleared for The Native only');
  });
});

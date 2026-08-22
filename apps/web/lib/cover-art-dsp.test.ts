import { describe, expect, it } from 'vitest';
import {
  DSP_ABSOLUTE_MIN_EDGE,
  DSP_MIN_EDGE,
  DSP_REQUIREMENT_LABEL,
  formatDimensions,
  gradeCoverArt,
} from './cover-art-dsp';

describe('cover art DSP constants', () => {
  it('holds the numbers every distributor quotes', () => {
    expect(DSP_MIN_EDGE).toBe(3000);
    expect(DSP_ABSOLUTE_MIN_EDGE).toBe(640);
  });

  it('states the requirement in one readable line', () => {
    expect(DSP_REQUIREMENT_LABEL).toContain('Square');
    expect(DSP_REQUIREMENT_LABEL).toContain('JPEG or PNG');
    expect(DSP_REQUIREMENT_LABEL).toContain('3000');
  });
});

describe('formatDimensions', () => {
  it('renders width by height', () => {
    expect(formatDimensions(3000, 3000)).toBe('3000 × 3000');
  });

  it('rounds sub-pixel measurements', () => {
    expect(formatDimensions(2999.6, 3000.4)).toBe('3000 × 3000');
  });
});

describe('gradeCoverArt — blocked', () => {
  it('blocks an image it could not measure', () => {
    const grade = gradeCoverArt({ width: null, height: null, mimeType: 'image/jpeg' });
    expect(grade.verdict).toBe('blocked');
    expect(grade.headline).toMatch(/could not read/i);
  });

  it('blocks zero and negative dimensions', () => {
    expect(gradeCoverArt({ width: 0, height: 0 }).verdict).toBe('blocked');
    expect(gradeCoverArt({ width: -10, height: -10 }).verdict).toBe('blocked');
  });

  it('blocks a non-square image however large', () => {
    const grade = gradeCoverArt({ width: 4000, height: 3000, mimeType: 'image/jpeg' });
    expect(grade.verdict).toBe('blocked');
    expect(grade.headline).toContain('not square');
  });

  it('blocks an image that is square but tiny', () => {
    const grade = gradeCoverArt({ width: 320, height: 320, mimeType: 'image/png' });
    expect(grade.verdict).toBe('blocked');
    expect(grade.detail).toContain(String(DSP_ABSOLUTE_MIN_EDGE));
  });

  it('blocks one pixel below the absolute floor and warns at it', () => {
    expect(gradeCoverArt({ width: 639, height: 639, mimeType: 'image/png' }).verdict).toBe(
      'blocked'
    );
    expect(gradeCoverArt({ width: 640, height: 640, mimeType: 'image/png' }).verdict).toBe(
      'warning'
    );
  });
});

describe('gradeCoverArt — warning', () => {
  it('warns on a square draft below the DSP minimum', () => {
    const grade = gradeCoverArt({ width: 1400, height: 1400, mimeType: 'image/jpeg' });
    expect(grade.verdict).toBe('warning');
    expect(grade.headline).toContain('1400 × 1400');
  });

  it('still warns one pixel below the minimum', () => {
    expect(gradeCoverArt({ width: 2999, height: 2999, mimeType: 'image/jpeg' }).verdict).toBe(
      'warning'
    );
  });

  it('warns on a big square WebP, which no DSP ingests', () => {
    const grade = gradeCoverArt({ width: 3000, height: 3000, mimeType: 'image/webp' });
    expect(grade.verdict).toBe('warning');
    expect(grade.detail).toContain('JPEG or PNG');
  });

  it('treats a missing mime type as the wrong format rather than ready', () => {
    expect(gradeCoverArt({ width: 3000, height: 3000, mimeType: null }).verdict).toBe('warning');
    expect(gradeCoverArt({ width: 3000, height: 3000 }).verdict).toBe('warning');
  });

  it('reports size before format when both are wrong', () => {
    const grade = gradeCoverArt({ width: 800, height: 800, mimeType: 'image/webp' });
    expect(grade.verdict).toBe('warning');
    expect(grade.detail).toContain('3000');
  });
});

describe('gradeCoverArt — ready', () => {
  it('passes a square 3000px JPEG', () => {
    const grade = gradeCoverArt({ width: 3000, height: 3000, mimeType: 'image/jpeg' });
    expect(grade.verdict).toBe('ready');
    expect(grade.headline).toContain('3000 × 3000');
    expect(grade.detail).toBe('');
  });

  it('passes a square 3000px PNG and anything larger', () => {
    expect(gradeCoverArt({ width: 3000, height: 3000, mimeType: 'image/png' }).verdict).toBe(
      'ready'
    );
    expect(gradeCoverArt({ width: 6000, height: 6000, mimeType: 'image/png' }).verdict).toBe(
      'ready'
    );
  });

  it('is case insensitive about the mime type', () => {
    expect(gradeCoverArt({ width: 3000, height: 3000, mimeType: 'IMAGE/JPEG' }).verdict).toBe(
      'ready'
    );
  });
});

describe('gradeCoverArt — copy discipline', () => {
  const grades = [
    gradeCoverArt({ width: null, height: null }),
    gradeCoverArt({ width: 4000, height: 3000, mimeType: 'image/jpeg' }),
    gradeCoverArt({ width: 320, height: 320, mimeType: 'image/png' }),
    gradeCoverArt({ width: 1400, height: 1400, mimeType: 'image/jpeg' }),
    gradeCoverArt({ width: 3000, height: 3000, mimeType: 'image/webp' }),
    gradeCoverArt({ width: 3000, height: 3000, mimeType: 'image/jpeg' }),
  ];

  it('never uses an em dash or en dash', () => {
    for (const grade of grades) {
      expect(grade.headline).not.toMatch(/[—–]/);
      expect(grade.detail).not.toMatch(/[—–]/);
    }
  });

  it('always gives a headline, and a next step whenever something is wrong', () => {
    for (const grade of grades) {
      expect(grade.headline.trim().length).toBeGreaterThan(0);
      if (grade.verdict !== 'ready') {
        expect(grade.detail.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { clampCrop, cropSourceRect } from './photo-crop';

describe('photo crop', () => {
  it('centres a landscape image on its middle square at zoom 1', () => {
    expect(cropSourceRect(2000, 1000, 300, { zoom: 1, x: 0, y: 0 })).toEqual({ sx: 500, sy: 0, size: 1000 });
  });

  it('never lets the image leave a corner empty', () => {
    // At zoom 1 a landscape image can slide sideways but not up or down.
    const clamped = clampCrop(2000, 1000, 300, { zoom: 1, x: 10_000, y: 50 });
    expect(clamped.x).toBe(150);
    expect(clamped.y).toBe(0);
    expect(cropSourceRect(2000, 1000, 300, { zoom: 1, x: 10_000, y: 0 }).sx).toBe(0);
  });

  it('zooming in takes a smaller square', () => {
    const rect = cropSourceRect(1000, 1000, 250, { zoom: 2, x: 0, y: 0 });
    expect(rect).toEqual({ sx: 250, sy: 250, size: 500 });
  });

  it('caps zoom between 1 and 4', () => {
    expect(clampCrop(800, 800, 200, { zoom: 9, x: 0, y: 0 }).zoom).toBe(4);
    expect(clampCrop(800, 800, 200, { zoom: 0.2, x: 0, y: 0 }).zoom).toBe(1);
  });
});

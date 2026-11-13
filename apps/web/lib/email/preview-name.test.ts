import { describe, expect, it } from 'vitest';
import { PREVIEW_EXAMPLE_NAME, previewRecipientName } from './preview-name';

describe('the composer preview name', () => {
  it('uses the first person on the list', () => {
    expect(previewRecipientName('Ben Park')).toBe('Ben Park');
    expect(previewRecipientName('  Ben   Park ')).toBe('Ben Park');
  });

  it('falls back to the example name for anything empty, long or odd', () => {
    expect(PREVIEW_EXAMPLE_NAME).toBe('Ada');
    for (const raw of [undefined, null, 42, '', '   ', 'x'.repeat(61), 'ben@example.com', '<b>Ben</b>']) {
      expect(previewRecipientName(raw)).toBe('Ada');
    }
  });
});

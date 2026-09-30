import { describe, expect, it } from 'vitest';
import { toastDismissMs } from './toast-timing';

describe('toastDismissMs', () => {
  it('keeps a short confirmation brief', () => {
    expect(toastDismissMs('success', 'Saved.')).toBe(4000);
  });

  it('holds failures and warnings longer than confirmations', () => {
    const message = 'Could not save.';
    expect(toastDismissMs('error', message)).toBeGreaterThan(toastDismissMs('warning', message));
    expect(toastDismissMs('warning', message)).toBeGreaterThan(toastDismissMs('success', message));
  });

  it('gives a long message longer to read, up to a ceiling', () => {
    const long = 'x'.repeat(200);
    expect(toastDismissMs('success', long)).toBeGreaterThan(4000);
    expect(toastDismissMs('error', 'x'.repeat(5000))).toBe(15000);
  });
});

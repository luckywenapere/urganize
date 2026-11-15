import { describe, expect, it } from 'vitest';
import { dropCountdown } from './countdown';

describe('The Drops column on Home', () => {
  it('reads "8 days · Wed 18 Nov" on one line, the number apart', () => {
    expect(dropCountdown(8, 'Wed 18 Nov')).toEqual({ number: '8', rest: 'days · Wed 18 Nov', text: '8 days · Wed 18 Nov' });
    expect(dropCountdown(57, 'Wed 6 Jan')?.text).toBe('57 days · Wed 6 Jan');
  });

  it('says day for one', () => {
    expect(dropCountdown(1, 'Mon 16 Nov')).toEqual({ number: '1', rest: 'day · Mon 16 Nov', text: '1 day · Mon 16 Nov' });
  });

  it('says Today on the day, with no number', () => {
    expect(dropCountdown(0, 'Sun 15 Nov')).toEqual({ number: null, rest: 'Today · Sun 15 Nov', text: 'Today · Sun 15 Nov' });
  });

  it('says a past day plainly, with no number', () => {
    expect(dropCountdown(-1, 'Sat 14 Nov')).toEqual({ number: null, rest: 'Out · Sat 14 Nov', text: 'Out · Sat 14 Nov' });
    expect(dropCountdown(-12, 'Tue 3 Nov')?.text).toBe('Out · Tue 3 Nov');
  });

  it('is nothing without a date', () => {
    expect(dropCountdown(null, 'Wed 18 Nov')).toBeNull();
    expect(dropCountdown(8, null)).toBeNull();
  });
});

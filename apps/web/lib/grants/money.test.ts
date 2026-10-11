import { describe, expect, it } from 'vitest';
import { amountAppearsIn, describeFigure, readAmounts } from './money';

const first = (text: string) => readAmounts(text)[0];

describe('reading amounts', () => {
  it('reads naira, dollars, pounds and euros', () => {
    expect(first('Grants of up to ₦2,000,000')).toMatchObject({ amount: 2_000_000, currency: 'NGN' });
    expect(first('NGN 500,000 per artist')).toMatchObject({ amount: 500_000, currency: 'NGN' });
    expect(first('Award: N750,000')).toMatchObject({ amount: 750_000, currency: 'NGN' });
    expect(first('up to $25,000')).toMatchObject({ amount: 25_000, currency: 'USD' });
    expect(first('US$10,000')).toMatchObject({ amount: 10_000, currency: 'USD' });
    expect(first('USD 5,000')).toMatchObject({ amount: 5_000, currency: 'USD' });
    expect(first('£10,000 each')).toMatchObject({ amount: 10_000, currency: 'GBP' });
    expect(first('GBP 7,500')).toMatchObject({ amount: 7_500, currency: 'GBP' });
    expect(first('€5.000 grants')).toMatchObject({ amount: 5_000, currency: 'EUR' });
    expect(first('EUR 4,000')).toMatchObject({ amount: 4_000, currency: 'EUR' });
  });

  it('reads words and short forms', () => {
    expect(first('₦5 million')).toMatchObject({ amount: 5_000_000, currency: 'NGN' });
    expect(first('$2.5 million')).toMatchObject({ amount: 2_500_000, currency: 'USD' });
    expect(first('$10k')).toMatchObject({ amount: 10_000, currency: 'USD' });
    expect(first('£1.5m')).toMatchObject({ amount: 1_500_000, currency: 'GBP' });
    expect(first('5,000 naira')).toMatchObject({ amount: 5_000, currency: 'NGN' });
    expect(first('3,000 dollars')).toMatchObject({ amount: 3_000, currency: 'USD' });
    expect(first('$25,000.50')).toMatchObject({ amount: 25_000.5, currency: 'USD' });
  });

  it('reads both ends of a range', () => {
    const found = readAmounts('Awards from $5,000 to $10,000');
    expect(found.map((a) => a.amount)).toEqual([5_000, 10_000]);
  });

  it('flags a currency we cannot save instead of guessing', () => {
    expect(first('CAD 20,000')).toMatchObject({ amount: 20_000, currency: 'OTHER', otherCode: 'CAD' });
    expect(first('C$20,000')).toMatchObject({ amount: 20_000, currency: 'OTHER', otherCode: 'CAD' });
    expect(first('ZAR 150,000')).toMatchObject({ currency: 'OTHER', otherCode: 'ZAR' });
    expect(first('A$5,000')).toMatchObject({ currency: 'OTHER', otherCode: 'AUD' });
  });

  it('ignores a number with no currency', () => {
    expect(readAmounts('We received 5,000 applications from 40 countries in 2026')).toEqual([]);
    expect(readAmounts('Room N12 on floor 3')).toEqual([]);
  });

  it('does not read a letter N inside a word', () => {
    expect(readAmounts('Lagos HQ, SUN5000 plan')).toEqual([]);
  });
});

describe('amountAppearsIn', () => {
  it('needs the same number in the same currency', () => {
    expect(amountAppearsIn(5_000, 'USD', 'up to $5,000')).toBe(true);
    expect(amountAppearsIn(5_000, 'NGN', 'up to $5,000')).toBe(false);
    expect(amountAppearsIn(6_000, 'USD', 'up to $5,000')).toBe(false);
    expect(amountAppearsIn(10_000, 'USD', 'from $5,000 to $10,000')).toBe(true);
    expect(amountAppearsIn(5_000, 'USD', 'a 5,000 person event')).toBe(false);
  });
});

describe('describeFigure', () => {
  it('writes a figure as plain text for the notes', () => {
    expect(describeFigure({ amount: 20_000, currency: 'OTHER', otherCode: 'CAD', raw: 'CAD 20,000' })).toBe('CAD 20,000');
    expect(describeFigure({ amount: 2_500_000, currency: 'NGN', raw: '₦2.5 million' })).toBe('NGN 2,500,000');
  });
});

/**
 * Naira, in and out of kobo. The one place this is written down.
 *
 * Money is stored as integer kobo everywhere in this product, never as a float,
 * and these are the two doors between what a person types or reads (naira) and
 * what is stored (kobo). They lived in lib/pitch-payments.ts until release spend
 * (2026-10-09) needed them too; that file still re-exports them, so nothing that
 * imported them from there changed.
 *
 * Pure and client-safe: no imports, no environment, no I/O.
 */

const WHOLE_NAIRA = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });
const NAIRA_WITH_KOBO = new Intl.NumberFormat('en-NG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₦5,000", or "₦5,000.50" when there are kobo. Never negative. */
export function formatNaira(kobo: number): string {
  if (!Number.isFinite(kobo) || kobo <= 0) return '₦0';
  const whole = Math.round(kobo);
  if (whole % 100 === 0) return `₦${WHOLE_NAIRA.format(whole / 100)}`;
  return `₦${NAIRA_WITH_KOBO.format(whole / 100)}`;
}

/**
 * What a person types into an amount field, as kobo. Accepts "5000", "5,000",
 * "₦5,000" and up to two decimal places. Anything else, zero or negative, is
 * null: the caller says so rather than guessing.
 */
export function nairaToKobo(value: string | number): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    const kobo = Math.round(value * 100);
    return kobo > 0 ? kobo : null;
  }
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[₦,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [naira, kobo = ''] = cleaned.split('.');
  const total = Number(naira) * 100 + Number(kobo.padEnd(2, '0'));
  return Number.isFinite(total) && total > 0 ? total : null;
}

/**
 * Kobo as a plain naira number for a spreadsheet: "5000", or "5000.50" when
 * there are kobo. No currency sign and no thousands separator, because a cell
 * written "₦5,000" is text to Excel and Google Sheets and cannot be summed.
 *
 * Integer arithmetic only, so a value like 1 kobo cannot come out as
 * "0.01000000000000000020816...". Zero is allowed (a payback of nothing is a
 * real answer); a negative or non-finite value is an empty string, because a
 * blank cell is more honest in a total than a made-up zero.
 */
export function koboToPlainNaira(kobo: number): string {
  if (!Number.isFinite(kobo) || kobo < 0) return '';
  const whole = Math.round(kobo);
  const naira = Math.floor(whole / 100);
  const rest = whole % 100;
  return rest === 0 ? String(naira) : `${naira}.${String(rest).padStart(2, '0')}`;
}

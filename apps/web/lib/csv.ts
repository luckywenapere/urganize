// CSV serialisation, shared.
//
// This escape rule already existed three times over — app/api/admin/onboarding,
// app/api/admin/pricing-validation, and components/releases/CaptureSection all
// carry a private one-line copy. A fourth copy is worse than a shared helper,
// so new code comes here. The existing three are deliberately left alone: they
// work, and migrating them is not this feature's job.

/** Quote every field unconditionally and double any inner quote.
 *
 * Always quoting is the point. A conditional "only quote when it contains a
 * comma" rule has to be right about commas, quotes, newlines, leading zeros and
 * anything Excel decides looks like a date; quoting everything is right by
 * construction. null and undefined become an empty field rather than the
 * strings "null" or "undefined". */
export function escapeCsvValue(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function toCsvRow(values: readonly unknown[]): string {
  return values.map(escapeCsvValue).join(',');
}

/** Header row plus body. CRLF because that is what RFC 4180 says and what
 * Excel wants; every reader handles it. */
export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [toCsvRow(header), ...rows.map(toCsvRow)].join('\r\n');
}

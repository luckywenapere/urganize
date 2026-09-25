// Pure From / Reply-To header composition. Moved verbatim from lib/email.ts.
// No I/O, no env — unit-tested directly.

/** Builds the From header.
 *
 *  configuredFrom is the sender verbatim — either `Name <addr@domain>` or a bare
 *  address. With a label, the ADDRESS is kept and only the display name is
 *  replaced; the label is sanitised (no angle brackets, quotes or line breaks —
 *  header-injection characters) and capped so a hostile profile name cannot
 *  forge headers or overflow the field. A label that sanitises to nothing falls
 *  back to the configured value unchanged. */
export function composeFromHeader(configuredFrom: string, label?: string): string {
  const cleanLabel = String(label || '')
    .replace(/[<>"\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  if (!cleanLabel) return configuredFrom;
  const match = configuredFrom.match(/<([^<>]+)>\s*$/);
  const address = (match ? match[1] : configuredFrom).trim();
  if (!address) return configuredFrom;
  return `${cleanLabel} <${address}>`;
}

/** The bare address out of a From header. `Urganize <a@b.com>` -> `a@b.com`;
 *  a bare address is returned as-is. Used to record from_address on the log. */
export function extractAddress(from: string): string {
  const match = from.match(/<([^<>]+)>\s*$/);
  return (match ? match[1] : from).trim();
}

/** A single, plain mailbox and nothing else. Deliberately strict: no display
 *  name, no comma list, no angle brackets, no whitespace, and a length cap.
 *  A comma would add a silent second recipient and a line break would open a
 *  header, so anything that is not obviously one address falls back. */
const PLAIN_ADDRESS = /^[^\s<>,;:"'\\@]+@[^\s<>,;:"'\\@]+\.[^\s<>,;:"'\\@]+$/;

/** Picks the Reply-To for a message. The override wins when it is a plain
 *  address; otherwise the configured mailbox stands, and null means the header
 *  is omitted entirely. */
export function composeReplyTo(configured: string | null, override?: string): string | null {
  const candidate = String(override || '').trim();
  if (candidate && candidate.length <= 254 && PLAIN_ADDRESS.test(candidate)) return candidate;
  return configured;
}

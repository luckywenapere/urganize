import type { PressKitSectionContent } from '@/types/press-kits';
import { resolveKitLink } from './press-kit-public';

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? (value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[])
    : [];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * 2026-10-23 as "23 Oct 2026". A date the reader cannot misread in either
 * order. Anything that is not a plain calendar date is returned untouched, so
 * a typed "Summer 2026" survives, and an impossible date like 2026-02-31 is
 * not quietly turned into March.
 */
export function formatKitDate(value: unknown): string {
  const raw = str(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(raw);
  if (!match) return raw;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 ||
    month > 12 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return raw;
  }
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** The mailto address of the first contact that has a usable email. */
export function firstContactEmail(content: PressKitSectionContent | undefined): string {
  for (const contact of rows((content || {}).contacts)) {
    const email = str(contact.email);
    if (/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)) return email;
  }
  return '';
}

/**
 * The words of a kit as one plain text file, for the download. Only what the
 * kit already shows: bios, who to email, the links. No numbers are invented
 * and nothing is included that the public page would not print.
 */
export function kitTextFile(params: {
  artistName: string;
  header: PressKitSectionContent;
  bios: PressKitSectionContent;
  contact: PressKitSectionContent;
  links: PressKitSectionContent;
}): string {
  const out: string[] = [params.artistName.trim() || 'Press kit'];
  const descriptor = str(params.header.descriptor);
  if (descriptor) out.push(descriptor);
  const place = [str(params.header.homeCity), str(params.header.homeCountry)].filter(Boolean).join(', ');
  if (place) out.push(place);

  for (const [key, label] of [
    ['short', 'Short bio'],
    ['medium', 'Bio'],
    ['long', 'Long bio'],
  ] as const) {
    const text = str(params.bios[key]);
    if (text) out.push('', label, text);
  }

  const contacts = rows(params.contact.contacts).filter((c) => str(c.name) || str(c.email));
  if (contacts.length > 0) {
    out.push('', 'Contact');
    for (const contact of contacts) {
      out.push([str(contact.name), str(contact.role) && `(${str(contact.role)})`, str(contact.email)]
        .filter(Boolean)
        .join(' '));
    }
  }

  const links = rows(params.links.links)
    .map((entry) => resolveKitLink(entry))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  if (links.length > 0) {
    out.push('', 'Links');
    for (const link of links) out.push(`${link.label}: ${link.href}`);
  }

  return `${out.join('\n')}\n`;
}

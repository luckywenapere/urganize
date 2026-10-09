import { Button, Link, Section, Text } from 'react-email';
import { Fragment, type ReactNode } from 'react';
import { SOCIAL_LINKS } from '../links';
import { BODY_TEXT, INK, MUTED_TEXT, PAGE_BG, SPRING } from './theme';

// Shared body pieces so every template reads as one system. react-email inlines
// all of this, so the styles are plain objects with literal colours.

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: '0 0 14px',
        color: INK,
        fontSize: '21px',
        lineHeight: '1.35',
        fontWeight: 700,
      }}
    >
      {children}
    </Text>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text style={{ margin: '0 0 18px', color: BODY_TEXT, fontSize: '15px', lineHeight: '1.65' }}>
      {children}
    </Text>
  );
}

// A link inside a sentence. Underlined, because in a founder note the link IS
// the call to action (there is no button), and colour alone does not mark it
// out: #1e5c38 sits close to the body text.
//
// Wrapping: a word inside a link must never be split. `word-break: break-all`
// (the value here until 2026-09-30) splits wherever the line ends, so on a
// 375px phone "message me on WhatsApp" rendered as "Whats" / "App". The pair
// below only breaks inside a word that cannot fit on a line by itself, which
// means a long bare URL, and leaves ordinary words whole.
//
// react-email's Link sets `textDecorationLine: 'none'` and spreads our style
// after it, so that key is overridden IN PLACE here (leaving no `none` in the
// output for a mail client to pick), and the shorthand rides along for
// clients that only read `text-decoration`.
export function AccentLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        color: '#1e5c38',
        textDecorationLine: 'underline',
        textDecoration: 'underline',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      }}
    >
      {children}
    </Link>
  );
}

/** The one button style. Spring fill, ink text — the accent the app uses. */
export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      href={href}
      style={{
        display: 'inline-block',
        backgroundColor: SPRING,
        color: INK,
        fontSize: '15px',
        fontWeight: 700,
        textDecoration: 'none',
        padding: '13px 26px',
        borderRadius: '10px',
      }}
    >
      {children}
    </Button>
  );
}

/** The spring-left-border card that carries the one structured thing a personal
 *  note quotes precisely (an activity, a request). Everything around it stays
 *  prose — see the founder-note register note in the welcome/assignment
 *  templates. */
export function NoteCard({ children }: { children: ReactNode }) {
  return (
    <Section
      style={{
        borderLeft: `3px solid ${SPRING}`,
        backgroundColor: PAGE_BG,
        borderRadius: '0 12px 12px 0',
        padding: '16px 20px',
        margin: '0 0 22px',
      }}
    >
      {children}
    </Section>
  );
}

export function FootnoteText({ children }: { children: ReactNode }) {
  return (
    <Text style={{ margin: '22px 0 0', color: MUTED_TEXT, fontSize: '13px', lineHeight: '1.6' }}>
      {children}
    </Text>
  );
}

/** "Follow us" with one plain text link per account. Text, not icons: mail clients
 *  block images by default and none of them render SVG, and a new sending domain
 *  does better with fewer remote assets. No separator character (a middle dot
 *  would collide with the " · " meta lines some templates assert are absent):
 *  each link is underlined and spaced, and in a client that drops the spacing the
 *  single space between them still keeps them apart. */
export function SocialFooter() {
  return (
    <Text style={{ margin: '8px 0 0', color: MUTED_TEXT, fontSize: '12px', lineHeight: '1.9' }}>
      Follow us:{' '}
      {SOCIAL_LINKS.map(({ label, href }) => (
        <Fragment key={label}>
          <Link
            href={href}
            style={{
              color: MUTED_TEXT,
              // react-email's Link sets textDecorationLine: 'none' and spreads
              // this style after it, so the key is overridden in place (see
              // AccentLink) rather than left for a mail client to pick.
              textDecorationLine: 'underline',
              textDecoration: 'underline',
              marginRight: '12px',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </Link>{' '}
        </Fragment>
      ))}
    </Text>
  );
}

/** The footer line for optional mail (welcome, reminders, announcements). */
export function UnsubscribeFooter({ url }: { url: string }) {
  return (
    <Text style={{ margin: '6px 0 0', color: MUTED_TEXT, fontSize: '12px', lineHeight: '1.6' }}>
      Don&rsquo;t want emails like this?{' '}
      <Link href={url} style={{ color: MUTED_TEXT, textDecoration: 'underline' }}>
        Unsubscribe
      </Link>
      .
    </Text>
  );
}

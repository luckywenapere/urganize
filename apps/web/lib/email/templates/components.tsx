import { Button, Link, Section, Text } from 'react-email';
import type { ReactNode } from 'react';
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

export function AccentLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={{ color: '#1e5c38', wordBreak: 'break-all' }}>
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

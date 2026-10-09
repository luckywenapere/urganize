import { Body, Container, Head, Hr, Html, Preview, Section, Text } from 'react-email';
import type { ReactNode } from 'react';
import { SocialFooter } from './components';
import { CARD_BG, FONT_STACK, HAIRLINE, INK, MUTED_TEXT, PAGE_BG } from './theme';

export type EmailLayoutProps = {
  /** The inbox preheader — the grey line shown after the subject. Keep it short
   *  and never a duplicate of the opening line. */
  preview: string;
  children: ReactNode;
  /** Extra footer content under the hairline, e.g. the unsubscribe line for
   *  marketing categories (added in PR 2). Omitted for transactional mail. */
  footer?: ReactNode;
  /** Show the "Follow us" social links under the tagline. On for every email
   *  that reaches a customer. Off only for mail that goes to the founder's own
   *  inbox (the two founder alerts), where it would be noise. */
  socials?: boolean;
};

// The one shell every Urganize email uses. Simple and plain, per the brief: a
// white card on a faint ground, a small "Urganize" wordmark at the top (never
// the old heavy dark banner), a system font, and a short footer. Card-style
// bodies (invite, credits) and personal notes (welcome, assignment) both sit
// inside it; the difference is only what each template puts in `children`.
export function EmailLayout({ preview, children, footer, socials = true }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: PAGE_BG, fontFamily: FONT_STACK }}>
        <Container
          style={{
            maxWidth: '560px',
            margin: '0 auto',
            padding: '32px 16px',
          }}
        >
          <Section
            style={{
              backgroundColor: CARD_BG,
              border: `1px solid ${HAIRLINE}`,
              borderRadius: '14px',
              padding: '30px 30px 34px',
            }}
          >
            <Text
              style={{
                margin: '0 0 22px',
                color: INK,
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '-0.2px',
              }}
            >
              Urganize
            </Text>
            {children}
          </Section>
          <Hr style={{ borderColor: HAIRLINE, margin: '20px 0 14px' }} />
          <Text style={{ margin: 0, color: MUTED_TEXT, fontSize: '12px', lineHeight: '1.6' }}>
            Urganize. Everything after the music.
          </Text>
          {socials ? <SocialFooter /> : null}
          {footer ? <>{footer}</> : null}
        </Container>
      </Body>
    </Html>
  );
}

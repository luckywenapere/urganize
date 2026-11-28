import { Fragment } from 'react';
import { Img, Link, Text } from 'react-email';
import { AccentLink, Paragraph } from './components';
import { HAIRLINE, MUTED_TEXT } from './theme';
import { firstNameFrom } from '../format';
import { parseNoteText } from '../note-text';
import type { OnboardingStill } from '../onboarding-sequence';
import { STILL_LINK_CLASS } from '../render-constants';

// The body shared by every founder note: the onboarding sequence and anything
// written in the admin composer. FOUNDER-NOTE REGISTER, the welcome email's
// rule: a greeting, plain paragraphs, links in the words, signed by a person. No
// card, no button, no banner. It reads as a personal email, which is also what a
// young sending domain needs to look like to a spam filter.
//
// The words arrive as note-text (see note-text.ts). React escapes them, and only
// http(s) and mailto links are ever turned into links.

export type FounderNoteBodyProps = {
  /** The recipient's stored name. Only a plausible first name is used, so an
   *  email handle or a blank reads "Hey," rather than "Hey lucky.w,". */
  recipientName: string;
  body: string;
  includeGreeting?: boolean;
  signOff?: boolean;
  /** The name the note is signed with. Welcome and onboarding are Oyin; the
   *  admin composer passes its own. */
  signature?: string;
  /** An optional picture placed after one paragraph (onboarding only). */
  still?: OnboardingStill;
};

// Shown at 468px, the card's text width (560 less 2 x 16 page padding and
// 2 x 30 card padding), and never wider than the column on a phone.
const STILL_WIDTH = 468;

function NoteStill({ still }: { still: OnboardingStill }) {
  return (
    <Link href={still.href} className={STILL_LINK_CLASS} style={{ display: 'block', margin: '4px 0 22px', textDecoration: 'none' }}>
      <Img
        src={still.src}
        alt={still.alt}
        width={STILL_WIDTH}
        height={Math.round((STILL_WIDTH * still.height) / still.width)}
        style={{
          display: 'block',
          width: '100%',
          maxWidth: `${STILL_WIDTH}px`,
          height: 'auto',
          border: `1px solid ${HAIRLINE}`,
          borderRadius: '14px',
          // How the alt text looks where images are blocked (many clients by
          // default): small muted body text, not a browser-blue link.
          color: MUTED_TEXT,
          fontSize: '13px',
          lineHeight: '1.5',
        }}
      />
    </Link>
  );
}

export function FounderNoteBody({
  recipientName,
  body,
  includeGreeting = true,
  signOff = true,
  signature = "Oyin",
  still,
}: FounderNoteBodyProps) {
  const firstName = firstNameFrom(recipientName);
  const paragraphs = parseNoteText(body);

  return (
    <>
      {includeGreeting ? <Paragraph>{firstName ? `Hey ${firstName},` : 'Hey,'}</Paragraph> : null}
      {paragraphs.map((paragraph, index) => (
        <Fragment key={index}>
          <Paragraph>
            {paragraph.map((segment, segmentIndex) => {
              if (segment.kind === 'break') return <br key={segmentIndex} />;
              if (segment.kind === 'link') {
                return (
                  <AccentLink key={segmentIndex} href={segment.href}>
                    {segment.text}
                  </AccentLink>
                );
              }
              return <Fragment key={segmentIndex}>{segment.text}</Fragment>;
            })}
          </Paragraph>
          {still?.afterParagraph === index ? <NoteStill still={still} /> : null}
        </Fragment>
      ))}
      {signOff ? (
        <Text style={{ margin: '24px 0 0', color: '#1e2621', fontSize: '15px', lineHeight: '1.65' }}>
          {signature}
          <br />
          <span style={{ color: MUTED_TEXT, fontSize: '13px' }}>Founder, Urganize</span>
        </Text>
      ) : null}
    </>
  );
}

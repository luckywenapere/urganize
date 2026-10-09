import { Fragment } from 'react';
import { Text } from 'react-email';
import { AccentLink, Paragraph } from './components';
import { MUTED_TEXT } from './theme';
import { firstNameFrom } from '../format';
import { parseNoteText } from '../note-text';

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
};

export function FounderNoteBody({
  recipientName,
  body,
  includeGreeting = true,
  signOff = true,
}: FounderNoteBodyProps) {
  const firstName = firstNameFrom(recipientName);
  const paragraphs = parseNoteText(body);

  return (
    <>
      {includeGreeting ? <Paragraph>{firstName ? `Hey ${firstName},` : 'Hey,'}</Paragraph> : null}
      {paragraphs.map((paragraph, index) => (
        <Paragraph key={index}>
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
      ))}
      {signOff ? (
        <Text style={{ margin: '24px 0 0', color: '#1e2621', fontSize: '15px', lineHeight: '1.65' }}>
          Wena
          <br />
          <span style={{ color: MUTED_TEXT, fontSize: '13px' }}>Founder, Urganize</span>
        </Text>
      ) : null}
    </>
  );
}

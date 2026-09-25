import { Text } from 'react-email';
import { EmailLayout } from './Layout';
import { FootnoteText, NoteCard, Paragraph } from './components';
import { INK } from './theme';
import { firstNameFrom } from '../format';

export type WorkRequestAnswerEmailProps = {
  recipientName: string;
  answererName: string;
  roleLabel: string;
  interested: boolean;
  reply: string;
  /** Only ever set for an interested answer. Saying yes IS the consent to be
   *  reached — see revealsContact in lib/work-requests.ts. */
  contactEmail?: string;
  /** Their public profile, when they have one (only `public` records do). */
  profileUrl?: string;
};

// The answer coming back to whoever asked. THIS IS WHERE THE INTRODUCTION
// HAPPENS: our From is always the verified sender, so without the contact block
// an interested answer left the asker holding a yes and no way to act on it. The
// route also sets Reply-To to the same address, so hitting Reply works. Nothing
// is revealed on a pass. `interested` is re-checked here so a future caller that
// forgets the rule still cannot leak an address on a refusal. Copy verbatim from
// the original lib/email-templates.ts buildWorkRequestAnswerEmail.
export function WorkRequestAnswerEmail({
  recipientName,
  answererName,
  roleLabel,
  interested,
  reply,
  contactEmail,
  profileUrl,
}: WorkRequestAnswerEmailProps) {
  const answerer = answererName.trim() || 'They';
  const role = roleLabel.trim().toLowerCase() || 'the work';
  const replyText = reply.trim();
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';

  const lead = interested
    ? `${answerer} is interested in the ${role} you asked about.`
    : `${answerer} passed on the ${role} you asked about.`;

  const contact = interested ? (contactEmail || '').trim() : '';
  const profile = interested ? (profileUrl || '').trim() : '';

  return (
    <EmailLayout preview={lead}>
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>{lead}</Paragraph>
      {replyText ? (
        <NoteCard>
          <Text style={{ margin: 0, color: INK, fontSize: '15px', lineHeight: '1.6' }}>
            {replyText}
          </Text>
        </NoteCard>
      ) : null}
      {contact ? (
        <Paragraph>
          Reply to this email to reach them, or write to{' '}
          <a href={`mailto:${contact}`} style={{ color: INK, fontWeight: 600 }}>
            {contact}
          </a>
          .
        </Paragraph>
      ) : null}
      {profile ? (
        <Paragraph>
          <a href={profile} style={{ color: INK, fontWeight: 600 }}>
            What they have delivered before
          </a>
        </Paragraph>
      ) : null}
      <FootnoteText>
        You are getting this because you asked them through the Urganize directory.
      </FootnoteText>
    </EmailLayout>
  );
}

export function workRequestAnswerSubject(
  answererName: string,
  roleLabel: string,
  interested: boolean
): string {
  const answerer = answererName.trim() || 'They';
  const role = roleLabel.trim().toLowerCase() || 'the work';
  return interested ? `${answerer} is interested` : `${answerer} passed on the ${role}`;
}

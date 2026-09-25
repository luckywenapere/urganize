import { Text } from 'react-email';
import { EmailLayout } from './Layout';
import { FootnoteText, NoteCard, Paragraph } from './components';
import { INK } from './theme';
import { firstNameFrom } from '../format';

export type WorkRequestEmailProps = {
  recipientName: string;
  senderName: string;
  roleLabel: string;
  note: string;
  settingsUrl: string;
};

// Somebody in the directory has been asked to work on a release. Founder-note
// register: one person approaching another. IT CARRIES NO RELEASE — the
// recipient has not said yes, and an unannounced title must not travel to
// somebody about to say no. Copy verbatim from the original
// lib/email-templates.ts buildWorkRequestEmail.
export function WorkRequestEmail({
  recipientName,
  senderName,
  roleLabel,
  note,
  settingsUrl,
}: WorkRequestEmailProps) {
  const sender = senderName.trim() || 'Someone on Urganize';
  const role = (roleLabel.trim() || 'some work').toLowerCase();
  const noteText = note.trim();
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';

  return (
    <EmailLayout preview={`${sender} is asking about ${role} work.`}>
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>
        {sender} found you in the Urganize directory and is asking about {role} work.
      </Paragraph>
      {noteText ? (
        <NoteCard>
          <Text style={{ margin: 0, color: INK, fontSize: '15px', lineHeight: '1.6' }}>
            {noteText}
          </Text>
        </NoteCard>
      ) : null}
      <Paragraph>You can say you are interested, or pass, in a tap. Passing is quiet.</Paragraph>
      <Paragraph>
        <a href={settingsUrl} style={{ color: INK, fontWeight: 600 }}>
          Answer it here
        </a>
      </Paragraph>
      <FootnoteText>
        You are getting this because you listed yourself in the Urganize directory. You can close
        your record any time in Settings.
      </FootnoteText>
    </EmailLayout>
  );
}

export function workRequestSubject(senderName: string, roleLabel: string): string {
  const sender = senderName.trim() || 'Someone on Urganize';
  const role = (roleLabel.trim() || 'some work').toLowerCase();
  return `${sender} is looking for a ${role}`;
}

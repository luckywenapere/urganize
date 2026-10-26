import { Text } from 'react-email';
import { EmailLayout } from './Layout';
import { FootnoteText, NoteCard, Paragraph, PrimaryButton, UnsubscribeFooter } from './components';
import { BODY_TEXT } from './theme';
import { firstNameFrom } from '../format';

export type ChimeInEmailProps = {
  /** The recipient's stored display name. */
  recipientName: string;
  /** Who asked, or who added the note: a name when we have one, else their email. */
  authorLabel: string;
  releaseTitle: string;
  /** 'ask': they were asked to chime in. 'note': someone chimed in on their rollout. */
  kind: 'ask' | 'note';
  /** The note itself (kind 'note'), or the latest idea (kind 'ask'), already cut to length. Optional. */
  message?: string;
  /** Absolute URL landing on the rollout. */
  rolloutUrl: string;
  /** Added by sendEmail: this category can be turned off. */
  unsubscribeUrl?: string;
};

// Rollout ideas (2026-10-26). Same register as the chat-mention email: plain
// paragraphs in the author's voice, one card with their words, one button.
// Pair with sendEmail's fromLabel ("<author> via Urganize").
export function ChimeInEmail({
  recipientName,
  authorLabel,
  releaseTitle,
  kind,
  message,
  rolloutUrl,
  unsubscribeUrl,
}: ChimeInEmailProps) {
  const author = authorLabel.trim() || 'Your teammate';
  const release = releaseTitle.trim() || 'your rollout';
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';
  const subject = chimeInSubject(author, release, kind);
  const lead =
    kind === 'ask'
      ? `${author} wants you to chime in on ${release}. Talk or type your idea, and it goes into the plan.`
      : `${author} chimed in on ${release}:`;
  const paragraphs = String(message || '')
    .trim()
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <EmailLayout
      preview={`${subject}.`}
      footer={unsubscribeUrl ? <UnsubscribeFooter url={unsubscribeUrl} /> : undefined}
    >
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>{lead}</Paragraph>
      {paragraphs.length ? (
        <NoteCard>
          {paragraphs.map((part, index) => (
            <Text
              key={index}
              style={{
                margin: index === 0 ? 0 : '10px 0 0',
                color: BODY_TEXT,
                fontSize: '15px',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
              }}
            >
              {part}
            </Text>
          ))}
        </NoteCard>
      ) : null}
      <PrimaryButton href={rolloutUrl}>{kind === 'ask' ? 'Chime in' : 'Open the rollout'}</PrimaryButton>
      <FootnoteText>Replying to this email does not reach {author}. Add your note on the rollout.</FootnoteText>
    </EmailLayout>
  );
}

export function chimeInSubject(authorLabel: string, releaseTitle: string, kind: 'ask' | 'note'): string {
  const author = authorLabel.trim() || 'Your teammate';
  const release = releaseTitle.trim() || 'your rollout';
  return kind === 'ask' ? `${author} wants you to chime in on ${release}` : `${author} chimed in on ${release}`;
}

import { Text } from 'react-email';
import { EmailLayout } from './Layout';
import { FootnoteText, NoteCard, Paragraph, PrimaryButton, UnsubscribeFooter } from './components';
import { BODY_TEXT } from './theme';
import { firstNameFrom } from '../format';

export type ChatMentionEmailProps = {
  /** The recipient's stored display name. */
  recipientName: string;
  /** Who wrote the message: a name when we have one, otherwise their email. */
  authorLabel: string;
  releaseTitle: string;
  /** True for "@everyone", false when this person was tagged by name. */
  everyone: boolean;
  /** The message itself, already cut to length (chatEmailExcerpt). */
  message: string;
  /** Absolute URL landing on the rollout with its chat open. */
  chatUrl: string;
  /** Added by sendEmail: this category can be turned off. */
  unsubscribeUrl?: string;
};

// Somebody tagged you in a rollout's chat. FOUNDER-NOTE REGISTER, the
// assignment email's rules: plain paragraphs in the author's voice, one card
// carrying their words, one button. Pair with sendEmail's fromLabel
// ("<author> via Urganize"). The full message goes in (founder call,
// 2026-10-07) so it can be read without opening the app.
export function ChatMentionEmail({
  recipientName,
  authorLabel,
  releaseTitle,
  everyone,
  message,
  chatUrl,
  unsubscribeUrl,
}: ChatMentionEmailProps) {
  const author = authorLabel.trim() || 'Your teammate';
  const release = releaseTitle.trim() || 'your rollout';
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';
  const lead = everyone
    ? `${author} sent this to everyone on ${release}:`
    : `${author} tagged you in the chat on ${release}:`;
  const paragraphs = message
    .trim()
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <EmailLayout
      preview={everyone ? `${author} messaged the team on ${release}.` : `${author} tagged you on ${release}.`}
      footer={unsubscribeUrl ? <UnsubscribeFooter url={unsubscribeUrl} /> : undefined}
    >
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>{lead}</Paragraph>
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
      <PrimaryButton href={chatUrl}>Reply in the chat</PrimaryButton>
      <FootnoteText>
        Replying to this email does not reach {author}. Answer in the chat so the whole team sees
        it.
      </FootnoteText>
    </EmailLayout>
  );
}

export function chatMentionSubject(authorLabel: string, releaseTitle: string, everyone: boolean): string {
  const author = authorLabel.trim() || 'Your teammate';
  const release = releaseTitle.trim() || 'your rollout';
  return everyone ? `${author} messaged everyone on ${release}` : `${author} tagged you on ${release}`;
}

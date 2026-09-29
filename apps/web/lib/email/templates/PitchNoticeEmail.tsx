import { Text } from 'react-email';
import { EmailLayout } from './Layout';
import { FootnoteText, NoteCard, Paragraph, PrimaryButton } from './components';
import { INK } from './theme';
import { firstNameFrom } from '../format';

export type PitchNoticeEmailProps = {
  recipientName: string;
  subject: string;
  /** The spec sentence for this moment, from lib/pitch-payment-copy.ts. */
  lead: string;
  /** A curator's written reply, shown as a quoted card. Optional. */
  quote?: string;
  ctaLabel: string;
  /** Absolute URL into the app. */
  ctaUrl: string;
  footnote: string;
};

// One template for every curator pitch payment moment: a paid pitch arriving,
// the one-day reminder, a missed window, an inbox pause, a reply reaching the
// artist and an automatic refund. They share a shape (one sentence that says
// what happened, sometimes the curator's words, one button), so one template
// keeps them looking alike. The SENTENCES come from lib/pitch-payment-copy.ts,
// the spec's copy verbatim, so the email says exactly what the app says.
export function PitchNoticeEmail({ recipientName, lead, quote, ctaLabel, ctaUrl, footnote }: PitchNoticeEmailProps) {
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';
  const quoteText = (quote || '').trim();

  return (
    <EmailLayout preview={lead}>
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>{lead}</Paragraph>
      {quoteText ? (
        <NoteCard>
          <Text style={{ margin: 0, color: INK, fontSize: '15px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
            {quoteText}
          </Text>
        </NoteCard>
      ) : null}
      <PrimaryButton href={ctaUrl}>{ctaLabel}</PrimaryButton>
      <FootnoteText>{footnote}</FootnoteText>
    </EmailLayout>
  );
}

export function pitchNoticeSubject(subject: string): string {
  return subject.trim() || 'An update on a pitch';
}

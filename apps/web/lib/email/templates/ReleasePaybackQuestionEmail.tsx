import { EmailLayout } from './Layout';
import { FootnoteText, Paragraph, PrimaryButton, UnsubscribeFooter } from './components';
import { firstNameFrom } from '../format';
import { SPEND_COPY, paybackQuestion } from '../../release-spend';

export type ReleasePaybackQuestionEmailProps = {
  recipientName: string;
  releaseTitle: string;
  /** Absolute URL landing on the rollout's Spend section. */
  spendUrl: string;
  /** Added by sendEmail: this category can be turned off. */
  unsubscribeUrl?: string;
};

// The one question asked 30 days after release day: what did it pay back? The
// brief gives the question and not the words around it, so the body below is
// TODO(copy). Founder-note register, like the other personal-reading mail:
// plain paragraphs and one button, no banner.
export function ReleasePaybackQuestionEmail({
  recipientName,
  releaseTitle,
  spendUrl,
  unsubscribeUrl,
}: ReleasePaybackQuestionEmailProps) {
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';
  const question = paybackQuestion(releaseTitle);

  return (
    <EmailLayout
      preview={question}
      footer={unsubscribeUrl ? <UnsubscribeFooter url={unsubscribeUrl} /> : undefined}
    >
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>{question}</Paragraph>
      {/* TODO(copy): the brief gives the question, not the sentence after it. */}
      <Paragraph>{SPEND_COPY.paybackNotificationBody}</Paragraph>
      <Paragraph>
        <PrimaryButton href={spendUrl}>Answer in Urganize</PrimaryButton>
      </Paragraph>
      <FootnoteText>It takes a minute. You are only asked once.</FootnoteText>
    </EmailLayout>
  );
}

export function releasePaybackQuestionSubject(releaseTitle: string): string {
  return paybackQuestion(releaseTitle);
}

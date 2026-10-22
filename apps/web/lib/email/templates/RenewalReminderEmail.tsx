import { Text } from 'react-email';
import { EmailLayout } from './Layout';
import { FootnoteText, NoteCard, Paragraph, PrimaryButton, UnsubscribeFooter } from './components';
import { firstNameFrom } from '../format';
import { renewalEmailCopy, type CheckoutPlan } from '@/lib/self-serve';

export type RenewalReminderEmailProps = {
  recipientName: string;
  plan: CheckoutPlan;
  expiresAt: string;
  amountNaira: number | null;
  /** The payer's own account number, when they have one. */
  account: { bankName: string; accountNumber: string; accountName: string } | null;
  renewUrl: string;
  unsubscribeUrl?: string;
};

// Self-serve checkout (2026-10-22): 7, 3 and 1 days before a period paid by
// bank transfer ends. A transfer period does not renew by itself, so this is
// the only thing that keeps the team from going read-only by surprise.
export function RenewalReminderEmail(props: RenewalReminderEmailProps) {
  const copy = renewalEmailCopy(props);
  const first = firstNameFrom(props.recipientName);
  return (
    <EmailLayout
      preview={copy.preview}
      footer={props.unsubscribeUrl ? <UnsubscribeFooter url={props.unsubscribeUrl} /> : undefined}
    >
      <Paragraph>{first ? `Hey ${first},` : 'Hey,'}</Paragraph>
      <Paragraph>{copy.body}</Paragraph>
      {props.account ? (
        <NoteCard>
          <Text style={{ margin: 0, fontFamily: 'Menlo, Consolas, monospace', fontSize: '14px', lineHeight: '1.6' }}>
            {props.account.bankName} · {props.account.accountNumber}
            <br />
            {props.account.accountName}
          </Text>
        </NoteCard>
      ) : null}
      <PrimaryButton href={props.renewUrl}>Renew</PrimaryButton>
      <FootnoteText>{copy.footnote}</FootnoteText>
    </EmailLayout>
  );
}

export function renewalReminderSubject(props: Pick<RenewalReminderEmailProps, 'plan' | 'expiresAt' | 'amountNaira'>): string {
  return renewalEmailCopy(props).subject;
}

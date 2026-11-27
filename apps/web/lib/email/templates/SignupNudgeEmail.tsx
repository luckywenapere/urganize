import { EmailLayout } from './Layout';
import { UnsubscribeFooter } from './components';
import { FounderNoteBody } from './FounderNote';
import { SIGNUP_NUDGE_BODY, SIGNUP_NUDGE_PREVIEW, SIGNUP_NUDGE_SUBJECT } from '../signup-nudge';

export type SignupNudgeEmailProps = {
  recipientName: string;
  /** Added by sendEmail for unsubscribable categories; the footer link. */
  unsubscribeUrl?: string;
};

// The next-morning note to someone who made an account and stopped before
// adding their music (#1429). The words live in ../signup-nudge.ts; this only
// lays them out, as a founder note signed by Oyin.
export function SignupNudgeEmail({ recipientName, unsubscribeUrl }: SignupNudgeEmailProps) {
  return (
    <EmailLayout
      preview={SIGNUP_NUDGE_PREVIEW}
      footer={unsubscribeUrl ? <UnsubscribeFooter url={unsubscribeUrl} /> : undefined}
    >
      <FounderNoteBody recipientName={recipientName} body={SIGNUP_NUDGE_BODY} signature="Oyin" />
    </EmailLayout>
  );
}

export function signupNudgeSubject(): string {
  return SIGNUP_NUDGE_SUBJECT;
}

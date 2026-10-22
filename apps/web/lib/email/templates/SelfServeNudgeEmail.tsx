import { EmailLayout } from './Layout';
import { PrimaryButton, UnsubscribeFooter } from './components';
import { FounderNoteBody } from './FounderNote';
import { nudgeEmailCopy, type NudgeEmailInput } from '@/lib/self-serve';

export type SelfServeNudgeEmailProps = NudgeEmailInput & {
  recipientName: string;
  /** Where the button goes (through the click counter). */
  ctaUrl: string;
  /** Added by sendEmail for unsubscribable categories; the footer link. */
  unsubscribeUrl?: string;
};

// Self-serve checkout (2026-10-22): the day 1, 3 and 7 notes to a team that
// paid at checkout, each sent only while its step is still undone. A founder
// note with one button, as the approved mocks show. The words live in
// lib/self-serve.ts (nudgeEmailCopy) so they are tested there.
export function SelfServeNudgeEmail(props: SelfServeNudgeEmailProps) {
  const copy = nudgeEmailCopy(props);
  return (
    <EmailLayout
      preview={copy.preview}
      footer={props.unsubscribeUrl ? <UnsubscribeFooter url={props.unsubscribeUrl} /> : undefined}
    >
      <FounderNoteBody recipientName={props.recipientName} body={copy.body} signOff={false} />
      <PrimaryButton href={props.ctaUrl}>{copy.cta}</PrimaryButton>
      <FounderNoteBody recipientName="" body="" includeGreeting={false} />
    </EmailLayout>
  );
}

export function selfServeNudgeSubject(props: NudgeEmailInput): string {
  return nudgeEmailCopy(props).subject;
}

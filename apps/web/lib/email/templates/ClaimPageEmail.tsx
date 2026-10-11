import { EmailLayout } from './Layout';
import { FootnoteText, Paragraph, PrimaryButton, UnsubscribeFooter } from './components';
import { claimEmailContent, type ClaimEmailKind } from '../../claim-email-copy';

export type ClaimPageEmailProps = {
  recipientName: string;
  /** The rollout's artist, as the team typed it. Empty when there is none. */
  artistName: string;
  releaseTitle: string;
  /** Role ids from the credit. */
  roles: string[];
  claimUrl: string;
  /** Added by sendEmail: this category can be turned off. */
  unsubscribeUrl?: string;
};

// The claim email Urganize sends on its own (2026-10-11), and its one reminder.
// Every word comes from lib/claim-email-copy.ts. One clear button, nothing else
// to click but the unsubscribe line. Not the owner's email (ClaimInviteEmail),
// which is a note in the owner's voice and is sent when they press "Email".
export function ClaimPageEmail({
  kind,
  recipientName,
  artistName,
  releaseTitle,
  roles,
  claimUrl,
  unsubscribeUrl,
}: ClaimPageEmailProps & { kind: ClaimEmailKind }) {
  const copy = claimEmailContent(kind, { recipientName, artistName, releaseTitle, roles });
  return (
    <EmailLayout
      preview={copy.preview}
      footer={unsubscribeUrl ? <UnsubscribeFooter url={unsubscribeUrl} /> : undefined}
    >
      <Paragraph>{copy.greeting}</Paragraph>
      {copy.lead.map((line) => (
        <Paragraph key={line}>{line}</Paragraph>
      ))}
      <Paragraph>{copy.value}</Paragraph>
      <PrimaryButton href={claimUrl}>{copy.button}</PrimaryButton>
      {copy.after.map((line) => (
        <Paragraph key={line}>{line}</Paragraph>
      ))}
      <FootnoteText>{copy.footnote}</FootnoteText>
    </EmailLayout>
  );
}

export function claimPageSubject(kind: ClaimEmailKind, props: ClaimPageEmailProps): string {
  return claimEmailContent(kind, props).subject;
}

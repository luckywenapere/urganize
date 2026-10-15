import { EmailLayout } from './Layout';
import { FootnoteText, Heading, Paragraph } from './components';

export type ClaimCodeEmailProps = {
  code: string;
};

// The six-digit code that proves a claim (URG-305, 2026-10-15). Bare: the code
// is the whole email. Sent only to an address that is already on the credit.
export function ClaimCodeEmail({ code }: ClaimCodeEmailProps) {
  return (
    <EmailLayout preview={`Your Urganize code is ${code}`}>
      <Heading>{code}</Heading>
      <Paragraph>Your code to claim your page on Urganize. It works for 10 minutes.</Paragraph>
      <FootnoteText>If you did not ask for this, ignore it.</FootnoteText>
    </EmailLayout>
  );
}

export function claimCodeSubject(code: string): string {
  return `${code} is your Urganize code`;
}

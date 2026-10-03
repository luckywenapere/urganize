import { EmailLayout } from './Layout';
import { FootnoteText, Paragraph, PrimaryButton } from './components';
import { firstNameFrom } from '../format';

export type ReferralRewardEmailProps = {
  recipientName: string;
  credits: number;
  /** Where the credit history lives. */
  creditsUrl: string;
};

// Tells a team it earned credits because a team it invited made its first
// payment. It deliberately names no one: the invited team did not agree to be
// named, and "a team you invited" is all the inviter needs to know.
export function ReferralRewardEmail({ recipientName, credits, creditsUrl }: ReferralRewardEmailProps) {
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';
  const lead = `A team you invited just subscribed, so we added ${credits} credits to your balance.`;

  return (
    <EmailLayout preview={lead}>
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>{lead}</Paragraph>
      <Paragraph>They never expire. Use them with UrgAns, or keep sharing your invite link to earn more.</Paragraph>
      <Paragraph>
        <PrimaryButton href={creditsUrl}>See your credits</PrimaryButton>
      </Paragraph>
      <FootnoteText>You are getting this because you invited a team to Urganize.</FootnoteText>
    </EmailLayout>
  );
}

export function referralRewardSubject(credits: number): string {
  return `You earned ${credits} credits`;
}

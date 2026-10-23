import { EmailLayout } from './Layout';
import { FootnoteText, Heading, Paragraph, PrimaryButton } from './components';
import { firstNameFrom } from '../format';

export type WaitlistJoinedEmailProps = {
  recipientName: string;
  place: number;
  friendsNeeded: number;
  /** Where their personal share link lives (the "You're on the list" screen). */
  shareUrl: string;
};

// Sent once, the first time a not-yet-let-in account lands on the waitlist
// screen. Tells them their place and that friends move them up.
export function WaitlistJoinedEmail({ recipientName, place, friendsNeeded, shareUrl }: WaitlistJoinedEmailProps) {
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';
  const lead = `Your place in line is #${place.toLocaleString('en-US')}.`;

  return (
    <EmailLayout preview={lead}>
      <Heading>You&apos;re on the list.</Heading>
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>{lead}</Paragraph>
      <Paragraph>
        Bring {friendsNeeded} friends and you get in early. Each friend who joins through your link moves you up.
      </Paragraph>
      <Paragraph>
        <PrimaryButton href={shareUrl}>Share your link</PrimaryButton>
      </Paragraph>
      <FootnoteText>You are getting this because you joined the Urganize waitlist.</FootnoteText>
    </EmailLayout>
  );
}

export function waitlistJoinedSubject(place: number): string {
  return `You're on the list: #${place.toLocaleString('en-US')}`;
}

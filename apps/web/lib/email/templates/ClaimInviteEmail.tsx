import { EmailLayout } from './Layout';
import { FootnoteText, Paragraph } from './components';
import { INK } from './theme';
import { firstNameFrom } from '../format';

export type ClaimInviteEmailProps = {
  recipientName: string;
  ownerName: string;
  releaseTitle: string;
  claimUrl: string;
};

// A collaborator was credited on a rollout and a profile now exists for them,
// unclaimed. Founder-note register: one person writing to another, so no
// banner and no button, one plain link. Sent only when the rollout's owner
// presses "Email" on the credit, never automatically.
export function ClaimInviteEmail({ recipientName, ownerName, releaseTitle, claimUrl }: ClaimInviteEmailProps) {
  const owner = ownerName.trim() || 'Someone on Urganize';
  const title = releaseTitle.trim() || 'a rollout';
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';

  return (
    <EmailLayout preview={`${owner} credited you on ${title}.`}>
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>
        {owner} credited you on {title}, and that credit now has a page on Urganize.
      </Paragraph>
      <Paragraph>
        The page is yours to claim. You can check your credits, add a short bio, say if you are open
        to work and choose if other people can see it.
      </Paragraph>
      <Paragraph>
        <a href={claimUrl} style={{ color: INK, fontWeight: 600 }}>
          Claim your page
        </a>
      </Paragraph>
      <FootnoteText>
        You are getting this because {owner} has your email from the credits form. If this is not
        you, you can ignore it. To take the page down, use the Request removal link on it.
      </FootnoteText>
    </EmailLayout>
  );
}

export function claimInviteSubject(ownerName: string, releaseTitle: string): string {
  const owner = ownerName.trim() || 'Someone';
  const title = releaseTitle.trim() || 'a rollout';
  return `${owner} credited you on ${title}`;
}

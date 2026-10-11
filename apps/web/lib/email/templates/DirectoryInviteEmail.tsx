import { EmailLayout } from './Layout';
import { FootnoteText, Paragraph, PrimaryButton } from './components';
import { firstNameFrom } from '../format';

export type DirectoryInviteEmailProps = {
  recipientName: string;
  inviterName: string;
  /** "a producer", "an A&R" (lib/directory-invites.ts roleWithArticle). */
  roleWithArticle: string;
  inviteUrl: string;
};

// A manager invited somebody they work with into the Urganize Directory
// (2026-10-11, GitHub #834). Sent only when the manager typed the email and
// pressed "Send invite", so it is transactional, like the owner's claim email.
// One button, and the first promise is that nothing is public until they say.
export function DirectoryInviteEmail({ recipientName, inviterName, roleWithArticle, inviteUrl }: DirectoryInviteEmailProps) {
  const inviter = inviterName.trim() || 'Someone on Urganize';
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';

  return (
    <EmailLayout preview={`${inviter} added you to the Urganize Directory.`}>
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>
        {inviter} added you to the Urganize Directory as {roleWithArticle}, so artists and managers can find you.
      </Paragraph>
      <Paragraph>Only you can see your profile until you publish it. You can change anything first.</Paragraph>
      <PrimaryButton href={inviteUrl}>Check your profile</PrimaryButton>
      <FootnoteText>
        You are getting this because {inviter} typed your email. If this is not for you, ignore it and nothing goes
        public.
      </FootnoteText>
    </EmailLayout>
  );
}

export function directoryInviteSubject(inviterName: string): string {
  const inviter = inviterName.trim() || 'Someone';
  return `${inviter} invited you to Urganize`;
}

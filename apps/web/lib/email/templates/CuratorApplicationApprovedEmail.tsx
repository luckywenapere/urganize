import { EmailLayout } from './Layout';
import { FootnoteText, Paragraph, PrimaryButton } from './components';

export type CuratorApplicationApprovedEmailProps = {
  /** The playlist's name, or its link's host and path when we could not read one. */
  playlistName: string;
  /** The single-use /curator/join/<code> link. */
  inviteUrl: string;
  /** How many days the link works for. */
  expiresInDays: number;
};

// A playlist owner applied at /curator/apply and an admin pressed Approve
// (2026-10-24). They asked for a reply, so this is transactional. One button:
// the single-use invite link the approve minted.
export function CuratorApplicationApprovedEmail({
  playlistName,
  inviteUrl,
  expiresInDays,
}: CuratorApplicationApprovedEmailProps) {
  const playlist = playlistName.trim() || 'your playlist';
  return (
    <EmailLayout preview="You're in. Here is your invite to curate for Urganize.">
      <Paragraph>Hey,</Paragraph>
      <Paragraph>
        We listened to {playlist} and we&apos;d love to have you. Artists can now pitch you new music through Urganize.
      </Paragraph>
      <Paragraph>Use the button to make your curator account. The link works once.</Paragraph>
      <PrimaryButton href={inviteUrl}>Accept your invite</PrimaryButton>
      <FootnoteText>
        The link works for {expiresInDays} days. You are getting this because you applied to curate for Urganize.
      </FootnoteText>
    </EmailLayout>
  );
}

export const CURATOR_APPLICATION_APPROVED_SUBJECT = "You're in: curate for Urganize";

import { EmailLayout } from './Layout';
import { FootnoteText, Paragraph, PrimaryButton } from './components';
import { firstNameFrom } from '../format';
import { APP_URL } from '../links';
import type { VerificationEmailKind } from '../../artist-verification';

export type ArtistVerificationEmailProps = {
  recipientName: string;
  kind: VerificationEmailKind;
  artistName: string;
  artistId: string;
  /** The admin's reason, for "needs a new screenshot" and "taken down". */
  note: string | null;
};

// The emails the team gets as an artist moves through verification (issue
// #1390). Plain and short. They never claim anything has been switched off
// unless an admin took the artist down by hand.
export function ArtistVerificationEmail({
  recipientName,
  kind,
  artistName,
  artistId,
  note,
}: ArtistVerificationEmailProps) {
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';
  const { lead, body } = copyFor(kind, artistName, note);

  return (
    <EmailLayout preview={lead}>
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>{lead}</Paragraph>
      <Paragraph>{body}</Paragraph>
      <Paragraph>
        <PrimaryButton href={`${APP_URL}/dashboard/${artistId}`}>Open {artistName}</PrimaryButton>
      </Paragraph>
      <FootnoteText>You are getting this because you work with {artistName} on Urganize.</FootnoteText>
    </EmailLayout>
  );
}

export function artistVerificationSubject(kind: VerificationEmailKind, artistName: string): string {
  switch (kind) {
    case 'received':
      return `We got the screenshot for ${artistName}`;
    case 'approved':
      return `${artistName} is verified`;
    case 'needs_fix':
      return `The screenshot for ${artistName} did not work`;
    case 'badge_removed':
      return `${artistName} is not verified any more`;
    case 'taken_down':
      return `We have taken down ${artistName}`;
    default:
      return `${artistName} is back on Urganize`;
  }
}

function withReason(note: string | null, fallback: string): string {
  const reason = typeof note === 'string' ? note.trim() : '';
  return reason ? `${reason} ${fallback}` : fallback;
}

function copyFor(kind: VerificationEmailKind, artistName: string, note: string | null): { lead: string; body: string } {
  switch (kind) {
    case 'received':
      return {
        lead: `We got the screenshot for ${artistName}.`,
        body: `We are checking it now. Nothing changes on the ${artistName} page while we look.`,
      };
    case 'approved':
      return {
        lead: `${artistName} is verified.`,
        body: 'The badge now shows on the artist page and on the press kit.',
      };
    case 'needs_fix':
      return {
        lead: `The screenshot for ${artistName} did not work.`,
        body: withReason(note, 'Send a new one and we will check again.'),
      };
    case 'badge_removed':
      return {
        lead: `${artistName} is not verified any more.`,
        body: withReason(note, `We removed the badge. Send a new screenshot to verify ${artistName} again.`),
      };
    case 'taken_down':
      return {
        lead: `We have taken down ${artistName}.`,
        body: withReason(note, 'Reply to this email with a screenshot and we will check again.'),
      };
    default:
      return {
        lead: `${artistName} is back on Urganize.`,
        body: 'Please verify the artist again. It takes two minutes.',
      };
  }
}

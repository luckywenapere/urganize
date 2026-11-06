import { Text } from 'react-email';
import { EmailLayout } from './Layout';
import { FootnoteText, Heading, NoteCard, Paragraph, PrimaryButton, UnsubscribeFooter } from './components';
import { INK } from './theme';
import { firstNameFrom } from '../format';

export type ReleaseOutNowEmailProps = {
  recipientName: string;
  releaseTitle: string;
  artistName: string;
  /** The smart link that opens the song on every service. */
  smartLinkUrl: string;
  /** Added by sendEmail: this category can be turned off. */
  unsubscribeUrl?: string;
};

// Release day (Nov 2026, #1090, mock docs/mocks/release-day-auto-link, founder
// approved): the song is out and here is the link. Sent once to each person on
// the artist's team when the smart link exists. Short on purpose.
export function ReleaseOutNowEmail({
  recipientName,
  releaseTitle,
  artistName,
  smartLinkUrl,
  unsubscribeUrl,
}: ReleaseOutNowEmailProps) {
  const firstName = firstNameFrom(recipientName);
  const song = releaseTitle.trim() || 'Your song';
  const by = artistName.trim() ? ` by ${artistName.trim()}` : '';
  const shownUrl = smartLinkUrl.replace(/^https?:\/\//, '');

  return (
    <EmailLayout
      preview={`${song}${by} is out now. Here's the link to share.`}
      footer={unsubscribeUrl ? <UnsubscribeFooter url={unsubscribeUrl} /> : undefined}
    >
      {firstName ? <Paragraph>Hey {firstName},</Paragraph> : null}
      <Heading>
        {song}
        {by} is out now.
      </Heading>
      <Paragraph>
        It&apos;s live on streaming. This link opens it on every service. Share it everywhere today.
      </Paragraph>
      <NoteCard>
        <Text style={{ margin: 0, color: INK, fontSize: '15px', lineHeight: '1.4', wordBreak: 'break-all' }}>{shownUrl}</Text>
      </NoteCard>
      <PrimaryButton href={smartLinkUrl}>Open the link</PrimaryButton>
      <FootnoteText>You&apos;re getting this because you&apos;re on {artistName.trim() || 'the artist'}&apos;s team in Urganize.</FootnoteText>
    </EmailLayout>
  );
}

export function releaseOutNowSubject(releaseTitle: string): string {
  return `${releaseTitle.trim() || 'Your song'} is out now`;
}

import { EmailLayout } from './Layout';
import { UnsubscribeFooter } from './components';
import { FounderNoteBody } from './FounderNote';
import { announcementPreview, announcementSubject } from '../announcement';

export type AnnouncementEmailProps = {
  subject: string;
  /** What the founder typed in the admin composer, as note-text. */
  body: string;
  recipientName: string;
  includeGreeting: boolean;
  signOff: boolean;
  /** Added by sendEmail for unsubscribable categories; the footer link. */
  unsubscribeUrl?: string;
};

// An email written and sent from the admin dashboard (/admin/emails/new). The
// validation lives in ../announcement.ts, which the routes use without React.
export function AnnouncementEmail({
  body,
  recipientName,
  includeGreeting,
  signOff,
  unsubscribeUrl,
}: AnnouncementEmailProps) {
  return (
    <EmailLayout
      preview={announcementPreview(body)}
      footer={unsubscribeUrl ? <UnsubscribeFooter url={unsubscribeUrl} /> : undefined}
    >
      <FounderNoteBody
        recipientName={recipientName}
        body={body}
        includeGreeting={includeGreeting}
        signOff={signOff}
      />
    </EmailLayout>
  );
}

export { announcementSubject };

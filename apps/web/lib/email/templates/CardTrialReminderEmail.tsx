import { EmailLayout } from './Layout';
import { FounderNoteBody } from './FounderNote';
import { announcementPreview } from '../announcement';

export type CardTrialReminderEmailProps = {
  recipientName: string;
  subject: string;
  /** Note-text, from cardTrialReminderCopy (lib/bachs-trial.ts). */
  body: string;
};

// The day before a card trial's first charge (2026-11-14, #1266). Founder-note
// register: a greeting, two plain paragraphs with the way to cancel in the
// words, signed by a person. TRANSACTIONAL on purpose: it tells someone their
// card is about to be charged, so it goes out whatever they unsubscribed from.
export function CardTrialReminderEmail({ recipientName, body }: CardTrialReminderEmailProps) {
  return (
    <EmailLayout preview={announcementPreview(body)}>
      <FounderNoteBody recipientName={recipientName} body={body} includeGreeting signOff />
    </EmailLayout>
  );
}

export function cardTrialReminderSubject(props: Pick<CardTrialReminderEmailProps, 'subject'>): string {
  return props.subject;
}

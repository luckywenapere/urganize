import { EmailLayout } from './Layout';
import { Paragraph } from './components';
import { MUTED_TEXT } from './theme';
import { Text } from 'react-email';

export type NotifyAdminEmailProps = {
  /** Who is asking — a name when we have one, otherwise their email. */
  requesterLabel: string;
  /** The team, for the subject/lead. */
  teamName: string | null;
  /** Where the admin goes to activate. */
  activateUrl: string;
};

// A teammate asking their admin to activate the plan. Warm and factual, never
// dunning: the admin is a customer and the person who triggered it is their
// colleague, so it names them and stops. Copy verbatim from the original
// lib/billing-alert-templates.ts buildNotifyAdminEmail.
export function NotifyAdminEmail({ requesterLabel, teamName, activateUrl }: NotifyAdminEmailProps) {
  const requester = requesterLabel.trim() || 'A teammate';
  const team = teamName?.trim() || null;

  const line = team
    ? `${requester} tried to pick up work on ${team} and needs the plan activated.`
    : `${requester} tried to pick up work and needs the plan activated.`;

  return (
    <EmailLayout preview={line}>
      <Paragraph>Hi,</Paragraph>
      <Paragraph>{line}</Paragraph>
      <Paragraph>
        <a href={activateUrl} style={{ color: '#1f7a4d', fontWeight: 600 }}>
          Activate the plan
        </a>
      </Paragraph>
      <Text style={{ margin: 0, color: MUTED_TEXT, fontSize: '13px', lineHeight: '1.6' }}>
        Everything your team created is still there and nothing has been removed.
      </Text>
    </EmailLayout>
  );
}

export function notifyAdminSubject(requesterLabel: string, teamName: string | null): string {
  const requester = requesterLabel.trim() || 'A teammate';
  const team = teamName?.trim() || null;
  return team
    ? `${requester} is waiting on ${team} in Urganize`
    : `${requester} is waiting on your team in Urganize`;
}

import { EmailLayout } from './Layout';
import { Paragraph } from './components';
import { MUTED_TEXT } from './theme';
import { Text } from 'react-email';

export type NotifyAdminEmailProps = {
  /** Who is asking — a name when we have one, otherwise their email. */
  requesterLabel: string;
  /** The team, for the subject/lead. */
  teamName: string | null;
  /** Where the admin goes to activate (or, for `distribute`, to upgrade). */
  activateUrl: string;
  /** What the teammate is asking for. Absent means `activate` (the wall). */
  ask?: 'activate' | 'distribute';
};

// A teammate asking their admin to activate the plan. Warm and factual, never
// dunning: the admin is a customer and the person who triggered it is their
// colleague, so it names them and stops. Copy verbatim from the original
// lib/billing-alert-templates.ts buildNotifyAdminEmail.
export function NotifyAdminEmail({ requesterLabel, teamName, activateUrl, ask }: NotifyAdminEmailProps) {
  const requester = requesterLabel.trim() || 'A teammate';
  const team = teamName?.trim() || null;

  // From the Distribute card on Home (2026-10-31): a teammate on a plan without
  // distribution asking the owner to move the team to Manager.
  if (ask === 'distribute') {
    const upgradeLine = team
      ? `${requester} wants ${team} to get music to Spotify, Apple Music, Audiomack and more. Distribution comes with the Manager plan.`
      : `${requester} wants your team to get music to Spotify, Apple Music, Audiomack and more. Distribution comes with the Manager plan.`;
    return (
      <EmailLayout preview={upgradeLine}>
        <Paragraph>Hi,</Paragraph>
        <Paragraph>{upgradeLine}</Paragraph>
        <Paragraph>
          <a href={activateUrl} style={{ color: '#1f7a4d', fontWeight: 600 }}>
            Upgrade to Manager
          </a>
        </Paragraph>
      </EmailLayout>
    );
  }

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

export function notifyAdminSubject(
  requesterLabel: string,
  teamName: string | null,
  ask?: 'activate' | 'distribute'
): string {
  const requester = requesterLabel.trim() || 'A teammate';
  const team = teamName?.trim() || null;
  if (ask === 'distribute') {
    return team
      ? `${requester} asked you to move ${team} to Manager`
      : `${requester} asked you to move your team to Manager`;
  }
  return team
    ? `${requester} is waiting on ${team} in Urganize`
    : `${requester} is waiting on your team in Urganize`;
}

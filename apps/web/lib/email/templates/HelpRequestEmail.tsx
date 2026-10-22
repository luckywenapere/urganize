import { Text } from 'react-email';
import { EmailLayout } from './Layout';
import { NoteCard, Paragraph } from './components';
import { MUTED_TEXT } from './theme';

export type HelpRequestEmailProps = {
  topicLabel: string;
  message: string;
  fromLabel: string;
  replyEmail: string;
  teamName: string | null;
  plan: string | null;
  pagePath: string | null;
  version: string;
};

// Self-serve checkout (2026-10-22): a customer's help message, routed to the
// founder's inbox. Reply-To is the customer, so pressing Reply answers them.
// Internal: never sent to a customer.
export function HelpRequestEmail(props: HelpRequestEmailProps) {
  const rows: Array<[string, string]> = [
    ['From', `${props.fromLabel} <${props.replyEmail}>`],
    ['Team', props.teamName || 'Not set'],
    ['Plan', props.plan || 'None'],
    ['Page', props.pagePath || 'Not given'],
    ['Version', props.version],
  ];
  return (
    <EmailLayout preview={`${props.topicLabel}: ${props.message.slice(0, 80)}`} socials={false}>
      <Paragraph>
        <b>{props.topicLabel}</b>
      </Paragraph>
      <NoteCard>
        <Text style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '15px', lineHeight: '1.6' }}>{props.message}</Text>
      </NoteCard>
      {rows.map(([label, value]) => (
        <Text key={label} style={{ margin: '4px 0 0', color: MUTED_TEXT, fontSize: '13px', lineHeight: '1.5' }}>
          {label}: {value}
        </Text>
      ))}
    </EmailLayout>
  );
}

export function helpRequestSubject(props: Pick<HelpRequestEmailProps, 'topicLabel' | 'fromLabel'>): string {
  return `Help (${props.topicLabel}): ${props.fromLabel}`;
}

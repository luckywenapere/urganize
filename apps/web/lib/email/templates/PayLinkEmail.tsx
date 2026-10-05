import { EmailLayout } from './Layout';
import { Paragraph } from './components';
import { MUTED_TEXT } from './theme';
import { Text } from 'react-email';

export type PayLinkEmailProps = {
  /** First name, or null when we do not have one. */
  firstName: string | null;
  /** Where they finish on the web. */
  payUrl: string;
};

// Sent to the person who asked for it, from inside the iPhone app, where Apple
// does not let us take payment. It is one tap to the pay page. Plain and short:
// no countdown, no guilt, nothing about what they could lose.
export function PayLinkEmail({ firstName, payUrl }: PayLinkEmailProps) {
  const name = firstName?.trim();
  return (
    <EmailLayout preview="Your link to pick a plan">
      <Paragraph>{name ? `Hi ${name},` : 'Hi,'}</Paragraph>
      <Paragraph>
        Here is the link you asked for. Open it on any phone or computer to pick a plan and pick
        your rollouts back up.
      </Paragraph>
      <Paragraph>
        <a href={payUrl} style={{ color: '#1f7a4d', fontWeight: 600 }}>
          Pick your plan
        </a>
      </Paragraph>
      <Text style={{ margin: 0, color: MUTED_TEXT, fontSize: '13px', lineHeight: '1.6' }}>
        Everything your team made is still there and nothing has been removed.
      </Text>
    </EmailLayout>
  );
}

export function payLinkSubject(): string {
  return 'Your link to pick a plan on Urganize';
}

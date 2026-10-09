import { Column, Row, Section, Text } from 'react-email';
import { EmailLayout } from './Layout';
import { BODY_TEXT, MUTED_TEXT } from './theme';

export type FounderOpsAlertEmailProps = {
  subject: string;
  /** What happened and what to do, in a sentence or two. */
  headline: string;
  /** The label/value rows that let the founder act without opening anything. */
  facts: Array<[string, string]>;
};

// INTERNAL — curator pitch payment problems that need a human: a payout account
// whose name did not match, a checkout whose amount did not match its quote, a
// refund that failed, a daily reconcile that found a gap, a curator paused for
// strikes. Not the billing alert template, because that one is built around a
// TEAM (owner, trial, rollouts in trial), and most of these are about a curator
// who has no team at all. Dense, no button, the same shell and log as every send.
export function FounderOpsAlertEmail({ headline, facts }: FounderOpsAlertEmailProps) {
  return (
    <EmailLayout preview={headline} socials={false}>
      <Text style={{ margin: '0 0 14px', color: BODY_TEXT, fontSize: '14px', fontWeight: 600 }}>
        {headline}
      </Text>
      <Section>
        {facts.map(([label, value]) => (
          <Row key={label}>
            <Column
              style={{
                padding: '4px 12px 4px 0',
                color: MUTED_TEXT,
                fontSize: '13px',
                whiteSpace: 'nowrap',
                verticalAlign: 'top',
                width: '1%',
              }}
            >
              {label}
            </Column>
            <Column style={{ padding: '4px 0', color: BODY_TEXT, fontSize: '13px', fontWeight: 600 }}>
              {value}
            </Column>
          </Row>
        ))}
      </Section>
    </EmailLayout>
  );
}

export function founderOpsAlertSubject(subject: string): string {
  return subject.trim() || 'Pitch payments need a look';
}

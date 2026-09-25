import { Column, Row, Section, Text } from 'react-email';
import { EmailLayout } from './Layout';
import { BODY_TEXT, MUTED_TEXT } from './theme';
import {
  FOUNDER_ALERT_HEADLINE,
  buildFounderAlertFacts,
  type FounderAlertContext,
  type FounderAlertKind,
} from '../alert-types';

export type FounderBillingAlertEmailProps = {
  kind: FounderAlertKind;
  context: FounderAlertContext;
};

// INTERNAL — goes to the founder, a sales lead rather than product mail: dense,
// what happened, which team, who to call, and the numbers that say how invested
// they are. No button. It still goes through the shared shell and the log like
// every other send. Copy verbatim from the original buildFounderBillingAlertEmail.
export function FounderBillingAlertEmail({ kind, context }: FounderBillingAlertEmailProps) {
  const headline = FOUNDER_ALERT_HEADLINE[kind];
  const facts = buildFounderAlertFacts(context);

  return (
    <EmailLayout preview={headline}>
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

import { Column, Row, Section, Text } from 'react-email';
import { EmailLayout } from './Layout';
import { FootnoteText, Heading, Paragraph, PrimaryButton } from './components';
import { BODY_TEXT, HAIRLINE, INK, MUTED_TEXT } from './theme';

export type CreditSubmissionEmailProps = {
  /** Who filled the form in, already labelled (legal name plus stage name). */
  collaboratorLabel: string;
  /** The release they answered for, already defaulted. */
  releaseTitle: string;
  /** Label/value pairs, already filtered to the ones they actually gave. */
  rows: Array<{ label: string; value: string }>;
  /** Absolute URL to the Metadata scene for this release. */
  metadataUrl: string;
};

// "Someone sent their credits" — the detail half of the credit-submission
// notification. The push is the ping; THIS carries what they actually typed, so
// a manager can check a split or forward it to a distributor without opening the
// app. Card register (product mail). Copy verbatim from the original
// lib/email-templates.ts buildCreditSubmissionEmail.
export function CreditSubmissionEmail({
  collaboratorLabel,
  releaseTitle,
  rows,
  metadataUrl,
}: CreditSubmissionEmailProps) {
  const who = collaboratorLabel.trim() || 'A collaborator';
  const release = releaseTitle.trim() || 'your rollout';
  const cleanRows = rows.filter((row) => row.label.trim() && row.value.trim());

  return (
    <EmailLayout preview={`${who} filled in the credits form for ${release}.`}>
      <Heading>{who} sent their credits</Heading>
      <Paragraph>For {release}. Here is what they filled in.</Paragraph>
      {cleanRows.length ? (
        <Section
          style={{
            borderTop: `1px solid ${HAIRLINE}`,
            borderBottom: `1px solid ${HAIRLINE}`,
            margin: '0 0 24px',
          }}
        >
          {cleanRows.map((row) => (
            <Row key={`${row.label}:${row.value}`}>
              <Column
                style={{
                  padding: '7px 14px 7px 0',
                  color: MUTED_TEXT,
                  fontSize: '13px',
                  lineHeight: '1.5',
                  verticalAlign: 'top',
                  whiteSpace: 'nowrap',
                  width: '1%',
                }}
              >
                {row.label}
              </Column>
              <Column
                style={{
                  padding: '7px 0',
                  color: INK,
                  fontSize: '14px',
                  lineHeight: '1.5',
                  verticalAlign: 'top',
                }}
              >
                {row.value}
              </Column>
            </Row>
          ))}
        </Section>
      ) : null}
      <PrimaryButton href={metadataUrl}>Open the rollout</PrimaryButton>
      <Text style={{ margin: '22px 0 0', color: MUTED_TEXT, fontSize: '13px', lineHeight: '1.6' }}>
        Or paste this link into your browser:
        <br />
        <a href={metadataUrl} style={{ color: BODY_TEXT, wordBreak: 'break-all' }}>
          {metadataUrl}
        </a>
      </Text>
      <FootnoteText>
        You are getting this because you created the credits link for this rollout. If they correct
        something later it replaces this entry quietly, without another email.
      </FootnoteText>
    </EmailLayout>
  );
}

export function creditSubmissionSubject(collaboratorLabel: string, releaseTitle: string): string {
  const who = collaboratorLabel.trim() || 'A collaborator';
  const release = releaseTitle.trim() || 'your rollout';
  return `${who} sent credits for ${release}`;
}

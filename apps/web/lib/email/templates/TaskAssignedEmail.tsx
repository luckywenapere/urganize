import { Text } from 'react-email';
import { EmailLayout } from './Layout';
import { FootnoteText, NoteCard, Paragraph, PrimaryButton } from './components';
import { BODY_TEXT, INK, MUTED_TEXT } from './theme';
import { firstNameFrom } from '../format';
import { APP_URL } from '../links';

export type TaskAssignedEmailProps = {
  /** The assignee's stored display name. */
  recipientName: string;
  /** Who assigned it — a name when we have one, otherwise their email. */
  assignerLabel: string;
  taskTitle: string;
  /** The release the activity belongs to; '' when it has none. */
  releaseTitle: string;
  /** Already formatted ("Fri, Sep 4"); '' when the activity has no due date. */
  dueDateLabel: string;
  /** 'Urgent' / 'High priority' for the two loud tiers, '' otherwise. */
  priorityLabel: string;
  /** First stretch of the activity's description; '' when there is none. */
  note: string;
  /** Absolute URL landing on the workspace scoped to the release. */
  taskUrl: string;
};

// "You've been handed an activity" — sent to the assignee alongside the in-app +
// push notification. FOUNDER-NOTE REGISTER, deliberately, with one designed
// element: a small card carrying the activity itself (the one part a colleague
// WOULD write down precisely). Everything around it stays prose; do not add a
// heavy banner. Pair with sendEmail's fromLabel ("<assigner> via Urganize").
// Copy verbatim from the original lib/email-templates.ts buildTaskAssignedEmail.
export function TaskAssignedEmail({
  recipientName,
  assignerLabel,
  taskTitle,
  releaseTitle,
  dueDateLabel,
  priorityLabel,
  note,
  taskUrl,
}: TaskAssignedEmailProps) {
  const assigner = assignerLabel.trim() || 'Your teammate';
  const title = taskTitle.trim() || 'An activity';
  const release = releaseTitle.trim();
  const due = dueDateLabel.trim();
  const priority = priorityLabel.trim();
  const noteText = note.trim();
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';

  const lead = release
    ? `${assigner} just handed you this one, for ${release}:`
    : `${assigner} just handed you this one:`;

  // "Midnight EP · due Fri, Sep 4 · Urgent" — only the parts that exist.
  const metaLine = [release, due ? `due ${due}` : '', priority].filter(Boolean).join(' · ');

  return (
    <EmailLayout
      preview={`${assigner} assigned you ${title}${release ? ` for ${release}` : ''}.`}
    >
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>{lead}</Paragraph>
      <NoteCard>
        <Text
          style={{
            margin: 0,
            color: INK,
            fontSize: '17px',
            lineHeight: '1.4',
            fontWeight: 700,
            letterSpacing: '-0.2px',
          }}
        >
          {title}
        </Text>
        {metaLine ? (
          <Text style={{ margin: '6px 0 0', color: MUTED_TEXT, fontSize: '13px', lineHeight: '1.5' }}>
            {metaLine}
          </Text>
        ) : null}
        {noteText ? (
          <Text
            style={{
              margin: '10px 0 0',
              color: BODY_TEXT,
              fontSize: '14px',
              lineHeight: '1.55',
              fontStyle: 'italic',
            }}
          >
            &ldquo;{noteText}&rdquo;
          </Text>
        ) : null}
      </NoteCard>
      <Paragraph>
        Everything you need is on the activity itself: the details, the files and where it sits in
        the plan.
      </Paragraph>
      <PrimaryButton href={taskUrl}>Open the activity</PrimaryButton>
      <FootnoteText>
        You are getting this because {assigner} assigned the activity to you on{' '}
        <a href={APP_URL} style={{ color: MUTED_TEXT }}>
          Urganize
        </a>
        .
      </FootnoteText>
    </EmailLayout>
  );
}

export function taskAssignedSubject(assignerLabel: string, taskTitle: string): string {
  const assigner = assignerLabel.trim() || 'Your teammate';
  const title = taskTitle.trim() || 'An activity';
  return `${assigner} put "${title}" on your plate`;
}

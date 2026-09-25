import { Text } from 'react-email';
import { EmailLayout } from './Layout';
import { FootnoteText, Heading, Paragraph, PrimaryButton } from './components';
import { BODY_TEXT, MUTED_TEXT } from './theme';

export type WorkspaceInviteEmailProps = {
  /** Display name of the team the invitee is joining. */
  workspaceName: string;
  /** Who sent it — a name when we have one, otherwise their email. */
  inviterLabel: string;
  /** The /invite/accept URL carrying the single-use token, built at the call
   *  site with resolveAppBaseUrl. */
  inviteUrl: string;
  /** Plain-English access description, already mapped from the role. */
  accessLabel: string;
};

// Team invite. Card register — this IS product mail. Copy kept verbatim from the
// original lib/email-templates.ts buildWorkspaceInviteEmail.
export function WorkspaceInviteEmail({
  workspaceName,
  inviterLabel,
  inviteUrl,
  accessLabel,
}: WorkspaceInviteEmailProps) {
  const workspace = workspaceName.trim() || 'a team';
  const inviter = inviterLabel.trim() || 'A teammate';
  const access = accessLabel.trim() || 'access';

  return (
    <EmailLayout preview={`${inviter} invited you to join ${workspace} on Urganize.`}>
      <Heading>
        {inviter} invited you to {workspace}
      </Heading>
      <Paragraph>
        Urganize is where the team runs a rollout: the plan, the work, and who is doing what, in one
        place. You&rsquo;ll have {access}.
      </Paragraph>
      <PrimaryButton href={inviteUrl}>Accept the invite</PrimaryButton>
      <Text style={{ margin: '22px 0 0', color: MUTED_TEXT, fontSize: '13px', lineHeight: '1.6' }}>
        Or paste this link into your browser:
        <br />
        <a href={inviteUrl} style={{ color: BODY_TEXT, wordBreak: 'break-all' }}>
          {inviteUrl}
        </a>
      </Text>
      <FootnoteText>
        This link works once and expires in 30 days. If you weren&rsquo;t expecting it, you can
        ignore this email.
      </FootnoteText>
    </EmailLayout>
  );
}

export function workspaceInviteSubject(inviterLabel: string, workspaceName: string): string {
  const workspace = workspaceName.trim() || 'a team';
  const inviter = inviterLabel.trim() || 'A teammate';
  return `${inviter} invited you to ${workspace} on Urganize`;
}

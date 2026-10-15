// The prop shape for each template id, so sendEmail is type-checked at the call
// site. These are TYPE-ONLY imports: erased at build, so this file (and anything
// importing it) never pulls react-email at runtime.
import type { WelcomeEmailProps } from './WelcomeEmail';
import type { ClaimCodeEmailProps } from './ClaimCodeEmail';
import type { WorkspaceInviteEmailProps } from './WorkspaceInviteEmail';
import type { CreditSubmissionEmailProps } from './CreditSubmissionEmail';
import type { TaskAssignedEmailProps } from './TaskAssignedEmail';
import type { WorkRequestEmailProps } from './WorkRequestEmail';
import type { WorkRequestAnswerEmailProps } from './WorkRequestAnswerEmail';
import type { ReferralRewardEmailProps } from './ReferralRewardEmail';
import type { FounderBillingAlertEmailProps } from './FounderBillingAlertEmail';
import type { NotifyAdminEmailProps } from './NotifyAdminEmail';
import type { PayLinkEmailProps } from './PayLinkEmail';
import type { PitchNoticeEmailProps } from './PitchNoticeEmail';
import type { FounderOpsAlertEmailProps } from './FounderOpsAlertEmail';
import type { OnboardingStepEmailProps } from './OnboardingStepEmail';
import type { AnnouncementEmailProps } from './AnnouncementEmail';
import type { ChatMentionEmailProps } from './ChatMentionEmail';
import type { TeamAdminNoticeEmailProps } from './TeamAdminNoticeEmail';
import type { ReleasePaybackQuestionEmailProps } from './ReleasePaybackQuestionEmail';
import type { ClaimInviteEmailProps } from './ClaimInviteEmail';
import type { ClaimPageEmailProps } from './ClaimPageEmail';
import type { DirectoryInviteEmailProps } from './DirectoryInviteEmail';

export type EmailTemplateProps = {
  welcome: WelcomeEmailProps;
  workspace_invite: WorkspaceInviteEmailProps;
  credit_submission: CreditSubmissionEmailProps;
  task_assigned: TaskAssignedEmailProps;
  work_request: WorkRequestEmailProps;
  work_request_answer: WorkRequestAnswerEmailProps;
  referral_reward: ReferralRewardEmailProps;
  founder_billing_alert: FounderBillingAlertEmailProps;
  notify_admin: NotifyAdminEmailProps;
  pay_link: PayLinkEmailProps;
  pitch_notice: PitchNoticeEmailProps;
  founder_ops_alert: FounderOpsAlertEmailProps;
  onboarding_step: OnboardingStepEmailProps;
  announcement: AnnouncementEmailProps;
  chat_mention: ChatMentionEmailProps;
  team_admin_notice: TeamAdminNoticeEmailProps;
  release_payback_question: ReleasePaybackQuestionEmailProps;
  claim_invite: ClaimInviteEmailProps;
  claim_auto_invite: ClaimPageEmailProps;
  claim_reminder: ClaimPageEmailProps;
  claim_code: ClaimCodeEmailProps;
  directory_invite: DirectoryInviteEmailProps;
};

export type EmailTemplateId = keyof EmailTemplateProps;

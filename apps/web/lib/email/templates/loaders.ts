import { createElement, type ReactElement } from 'react';
import type { EmailTemplateId, EmailTemplateProps } from './props';

// Lazy loaders — one dynamic import per template. This file is safe to import
// statically (index.ts does): the components are behind `() => import(...)`
// thunks that run only when a send actually happens, so react-email (and
// react-dom/server, reached via render.ts) never lands in the ~55-file
// tasks-server graph. createElement is the only static React use and is tiny.

export type LoadedTemplate<Id extends EmailTemplateId> = {
  element: (props: EmailTemplateProps[Id]) => ReactElement;
  subject: (props: EmailTemplateProps[Id]) => string;
};

type LoaderMap = { [Id in EmailTemplateId]: () => Promise<LoadedTemplate<Id>> };

const LOADERS: LoaderMap = {
  welcome: async () => {
    const m = await import('./WelcomeEmail');
    return { element: (p) => createElement(m.WelcomeEmail, p), subject: () => m.WELCOME_SUBJECT };
  },
  workspace_invite: async () => {
    const m = await import('./WorkspaceInviteEmail');
    return {
      element: (p) => createElement(m.WorkspaceInviteEmail, p),
      subject: (p) => m.workspaceInviteSubject(p.inviterLabel, p.workspaceName),
    };
  },
  credit_submission: async () => {
    const m = await import('./CreditSubmissionEmail');
    return {
      element: (p) => createElement(m.CreditSubmissionEmail, p),
      subject: (p) => m.creditSubmissionSubject(p.collaboratorLabel, p.releaseTitle),
    };
  },
  task_assigned: async () => {
    const m = await import('./TaskAssignedEmail');
    return {
      element: (p) => createElement(m.TaskAssignedEmail, p),
      subject: (p) => m.taskAssignedSubject(p.assignerLabel, p.taskTitle),
    };
  },
  work_request: async () => {
    const m = await import('./WorkRequestEmail');
    return {
      element: (p) => createElement(m.WorkRequestEmail, p),
      subject: (p) => m.workRequestSubject(p.senderName, p.roleLabel),
    };
  },
  claim_invite: async () => {
    const m = await import('./ClaimInviteEmail');
    return {
      element: (p) => createElement(m.ClaimInviteEmail, p),
      subject: (p) => m.claimInviteSubject(p.ownerName, p.releaseTitle),
    };
  },
  claim_code: async () => {
    const m = await import('./ClaimCodeEmail');
    return {
      element: (p) => createElement(m.ClaimCodeEmail, p),
      subject: (p) => m.claimCodeSubject(p.code),
    };
  },
  claim_auto_invite: async () => {
    const m = await import('./ClaimPageEmail');
    return {
      element: (p) => createElement(m.ClaimPageEmail, { ...p, kind: 'invite' }),
      subject: (p) => m.claimPageSubject('invite', p),
    };
  },
  claim_reminder: async () => {
    const m = await import('./ClaimPageEmail');
    return {
      element: (p) => createElement(m.ClaimPageEmail, { ...p, kind: 'reminder' }),
      subject: (p) => m.claimPageSubject('reminder', p),
    };
  },
  directory_invite: async () => {
    const m = await import('./DirectoryInviteEmail');
    return {
      element: (p) => createElement(m.DirectoryInviteEmail, p),
      subject: (p) => m.directoryInviteSubject(p.inviterName),
    };
  },
  work_request_answer: async () => {
    const m = await import('./WorkRequestAnswerEmail');
    return {
      element: (p) => createElement(m.WorkRequestAnswerEmail, p),
      subject: (p) => m.workRequestAnswerSubject(p.answererName, p.roleLabel, p.interested),
    };
  },
  team_admin_notice: async () => {
    const m = await import('./TeamAdminNoticeEmail');
    return {
      element: (p) => createElement(m.TeamAdminNoticeEmail, p),
      subject: (p) => m.teamAdminNoticeSubject(p.kind, p.when),
    };
  },
  release_payback_question: async () => {
    const m = await import('./ReleasePaybackQuestionEmail');
    return {
      element: (p) => createElement(m.ReleasePaybackQuestionEmail, p),
      subject: (p) => m.releasePaybackQuestionSubject(p.releaseTitle),
    };
  },
  referral_reward: async () => {
    const m = await import('./ReferralRewardEmail');
    return {
      element: (p) => createElement(m.ReferralRewardEmail, p),
      subject: (p) => m.referralRewardSubject(p.credits),
    };
  },
  waitlist_joined: async () => {
    const m = await import('./WaitlistJoinedEmail');
    return {
      element: (p) => createElement(m.WaitlistJoinedEmail, p),
      subject: (p) => m.waitlistJoinedSubject(p.place),
    };
  },
  founder_billing_alert: async () => {
    const [m, alerts] = await Promise.all([
      import('./FounderBillingAlertEmail'),
      import('../alert-types'),
    ]);
    return {
      element: (p) => createElement(m.FounderBillingAlertEmail, p),
      subject: (p) => alerts.founderBillingAlertSubject(p.kind, p.context),
    };
  },
  notify_admin: async () => {
    const m = await import('./NotifyAdminEmail');
    return {
      element: (p) => createElement(m.NotifyAdminEmail, p),
      subject: (p) => m.notifyAdminSubject(p.requesterLabel, p.teamName),
    };
  },
  pay_link: async () => {
    const m = await import('./PayLinkEmail');
    return {
      element: (p) => createElement(m.PayLinkEmail, p),
      subject: (p) => m.payLinkSubject(p),
    };
  },
  pitch_notice: async () => {
    const m = await import('./PitchNoticeEmail');
    return {
      element: (p) => createElement(m.PitchNoticeEmail, p),
      subject: (p) => m.pitchNoticeSubject(p.subject),
    };
  },
  front_desk_digest: async () => {
    const m = await import('./FrontDeskDigestEmail');
    return {
      element: (p) => createElement(m.FrontDeskDigestEmail, p),
      subject: (p) => m.frontDeskDigestSubject(p),
    };
  },
  founder_ops_alert: async () => {
    const m = await import('./FounderOpsAlertEmail');
    return {
      element: (p) => createElement(m.FounderOpsAlertEmail, p),
      subject: (p) => m.founderOpsAlertSubject(p.subject),
    };
  },
  onboarding_step: async () => {
    const m = await import('./OnboardingStepEmail');
    return {
      element: (p) => createElement(m.OnboardingStepEmail, p),
      subject: (p) => m.onboardingStepSubject(p.step),
    };
  },
  announcement: async () => {
    const m = await import('./AnnouncementEmail');
    return {
      element: (p) => createElement(m.AnnouncementEmail, p),
      subject: (p) => m.announcementSubject(p.subject),
    };
  },
  self_serve_nudge: async () => {
    const m = await import('./SelfServeNudgeEmail');
    return {
      element: (p) => createElement(m.SelfServeNudgeEmail, p),
      subject: (p) => m.selfServeNudgeSubject(p),
    };
  },
  renewal_reminder: async () => {
    const m = await import('./RenewalReminderEmail');
    return {
      element: (p) => createElement(m.RenewalReminderEmail, p),
      subject: (p) => m.renewalReminderSubject(p),
    };
  },
  curator_application_approved: async () => {
    const m = await import('./CuratorApplicationApprovedEmail');
    return {
      element: (p) => createElement(m.CuratorApplicationApprovedEmail, p),
      subject: () => m.CURATOR_APPLICATION_APPROVED_SUBJECT,
    };
  },
  help_request: async () => {
    const m = await import('./HelpRequestEmail');
    return {
      element: (p) => createElement(m.HelpRequestEmail, p),
      subject: (p) => m.helpRequestSubject(p),
    };
  },
  chat_mention: async () => {
    const m = await import('./ChatMentionEmail');
    return {
      element: (p) => createElement(m.ChatMentionEmail, p),
      subject: (p) => m.chatMentionSubject(p.authorLabel, p.releaseTitle, p.everyone),
    };
  },
  chime_in: async () => {
    const m = await import('./ChimeInEmail');
    return {
      element: (p) => createElement(m.ChimeInEmail, p),
      subject: (p) => m.chimeInSubject(p.authorLabel, p.releaseTitle, p.kind),
    };
  },
};

export async function loadEmailTemplate<Id extends EmailTemplateId>(
  id: Id
): Promise<LoadedTemplate<Id>> {
  return LOADERS[id]();
}

export const EMAIL_TEMPLATE_IDS = Object.keys(LOADERS) as EmailTemplateId[];

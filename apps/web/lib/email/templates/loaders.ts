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
  work_request_answer: async () => {
    const m = await import('./WorkRequestAnswerEmail');
    return {
      element: (p) => createElement(m.WorkRequestAnswerEmail, p),
      subject: (p) => m.workRequestAnswerSubject(p.answererName, p.roleLabel, p.interested),
    };
  },
  referral_reward: async () => {
    const m = await import('./ReferralRewardEmail');
    return {
      element: (p) => createElement(m.ReferralRewardEmail, p),
      subject: (p) => m.referralRewardSubject(p.credits),
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
      subject: () => m.payLinkSubject(),
    };
  },
  pitch_notice: async () => {
    const m = await import('./PitchNoticeEmail');
    return {
      element: (p) => createElement(m.PitchNoticeEmail, p),
      subject: (p) => m.pitchNoticeSubject(p.subject),
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
};

export async function loadEmailTemplate<Id extends EmailTemplateId>(
  id: Id
): Promise<LoadedTemplate<Id>> {
  return LOADERS[id]();
}

export const EMAIL_TEMPLATE_IDS = Object.keys(LOADERS) as EmailTemplateId[];

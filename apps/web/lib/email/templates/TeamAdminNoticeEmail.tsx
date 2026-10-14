import { EmailLayout } from './Layout';
import { FootnoteText, Paragraph, PrimaryButton } from './components';
import { firstNameFrom, formatDueDateForEmail } from '../format';
import { APP_URL } from '../links';

/** 'pause_ending' / 'pause_ended' are the cancel flow's pause emails
 *  (2026-10-14, lib/cancel-flow-server.ts runPauseSweep): a few days before the
 *  plan comes back, and on the day it does. */
export type TeamAdminNoticeKind = 'comped' | 'trial_extended' | 'pause_ending' | 'pause_ended';

/** Where a pause email's button goes: Settings > Billing, one tap to resume. */
export const PAUSE_EMAIL_PATH = '/dashboard?settings=billing';

export type TeamAdminNoticeEmailProps = {
  recipientName: string;
  /** What the founder just did for the team. */
  kind: TeamAdminNoticeKind;
  /** 'now' when the change was just made; 'earlier' for a change we are
   *  catching people up on, so the copy is never a claim about today. */
  when: 'now' | 'earlier';
  /** When the trial still has time left, the date it now runs until. Null
   *  drops the date line. */
  trialEndsAt: string | null;
  /** Pause emails only: the day the plan comes back. */
  resumeAt?: string | null;
};

// Tells the owner of a team that the founder gave the team free access, or
// extended its free trial. Sent for every such change, including the ones made
// before this email existed (the backfill), so the copy says when it happened.
export function TeamAdminNoticeEmail({ recipientName, kind, when, trialEndsAt, resumeAt }: TeamAdminNoticeEmailProps) {
  const firstName = firstNameFrom(recipientName);
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';
  const isPause = kind === 'pause_ending' || kind === 'pause_ended';
  const { lead, body } = isPause ? pauseCopyFor(kind, resumeAt ?? null) : copyFor(kind, when, trialEndsAt);

  return (
    <EmailLayout preview={lead}>
      <Paragraph>{greeting}</Paragraph>
      <Paragraph>{lead}</Paragraph>
      <Paragraph>{body}</Paragraph>
      <Paragraph>
        {isPause ? (
          <PrimaryButton href={`${APP_URL}${PAUSE_EMAIL_PATH}`}>Resume my plan</PrimaryButton>
        ) : (
          <PrimaryButton href={`${APP_URL}/dashboard`}>Open Urganize</PrimaryButton>
        )}
      </Paragraph>
      <FootnoteText>You are getting this because you own the team on Urganize.</FootnoteText>
    </EmailLayout>
  );
}

function trialEndLine(trialEndsAt: string | null): string | null {
  const day = formatDueDateForEmail(trialEndsAt);
  return day ? `Your trial now runs until ${day}.` : null;
}

function copyFor(
  kind: TeamAdminNoticeKind,
  when: 'now' | 'earlier',
  trialEndsAt: string | null
): { lead: string; body: string } {
  if (kind === 'comped') {
    return when === 'now'
      ? {
          lead: "We've given your team free access to Urganize.",
          body: 'There is nothing to pay and nothing you need to do. Everything works as normal.',
        }
      : {
          lead: 'We gave your team free access to Urganize.',
          body: 'There is nothing to pay and nothing you need to do. Everything works as normal.',
        };
  }
  const dateLine = trialEndLine(trialEndsAt);
  const body = dateLine ?? 'You have more time to try everything Urganize does.';
  return when === 'now'
    ? { lead: "We've extended your free trial.", body }
    : { lead: 'We extended your free trial.', body };
}

function pauseCopyFor(kind: 'pause_ending' | 'pause_ended', resumeAt: string | null): { lead: string; body: string } {
  const day = formatDueDateForEmail(resumeAt);
  if (kind === 'pause_ending') {
    return {
      lead: day ? `Your Urganize pause ends on ${day}.` : 'Your Urganize pause ends soon.',
      body: 'Resume your plan to keep working. Nothing is charged until you do.',
    };
  }
  return {
    lead: 'Your Urganize pause has ended.',
    body: 'Everything is still there to read. Resume your plan to start working again.',
  };
}

export function teamAdminNoticeSubject(kind: TeamAdminNoticeKind, when: 'now' | 'earlier'): string {
  if (kind === 'pause_ending') return 'Your Urganize pause ends soon';
  if (kind === 'pause_ended') return 'Your Urganize pause has ended';
  if (kind === 'comped') {
    return when === 'now'
      ? 'Your team has free access to Urganize'
      : 'Your team was given free access to Urganize';
  }
  return when === 'now' ? 'Your free trial has been extended' : 'Your free trial was extended';
}

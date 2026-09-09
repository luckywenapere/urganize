/**
 * Pure copy for the "a collaborator sent their credits" notification
 * (2026-08-27). No React, no I/O, no env — the sending half lives in
 * lib/credit-notifications-server.ts, which is server-only. Split so vitest
 * can reach the decisions: it only collects lib/**\/*.test.ts.
 */

import { RELEASE_CREDIT_ROLE_LABELS, type ReleaseCreditRole } from '@/types/credits';

/** What the owner is told about, assembled by the server module from the row
 * that was just inserted. Every field is already validated by the submit
 * route, so nothing here needs to re-check shape. */
export type CreditSubmissionNotice = {
  releaseId: string;
  releaseTitle: string;
  submissionId: string;
  legalName: string;
  stageName: string;
  roles: ReleaseCreditRole[];
  email: string;
  phone: string;
  country: string;
  songwriterSplit: number | null;
  masterSplit: number | null;
  proAffiliation: string;
  ipiNumber: string;
  publisherName: string;
  publisherIpi: string;
  contribution: string;
};

/** Fallbacks so a notification never reads as broken when a field is blank.
 * legalName is required by the submit route, so the person fallback is a
 * belt-and-braces case rather than an expected one. */
const UNNAMED_PERSON = 'Someone';
const UNNAMED_RELEASE = 'your rollout';

export function collaboratorLabel(notice: {
  legalName: string;
  stageName: string;
}): string {
  const legal = notice.legalName.trim();
  const stage = notice.stageName.trim();
  if (legal && stage && stage.toLowerCase() !== legal.toLowerCase()) {
    return `${legal} (${stage})`;
  }
  return legal || stage || UNNAMED_PERSON;
}

export function releaseLabel(title: string): string {
  return title.trim() || UNNAMED_RELEASE;
}

/**
 * Substitute the two placeholders the admin-editable preset copy may carry.
 *
 * Deliberately NOT a general template engine: an admin typing an unknown
 * `{whatever}` should see it left alone rather than replaced with an empty
 * string, because a silently-blanked word reads as a bug in the product to
 * whoever receives the notification.
 */
export function fillCreditPlaceholders(
  template: string,
  values: { collaboratorName: string; releaseTitle: string }
): string {
  return template
    .split('{collaboratorName}')
    .join(values.collaboratorName)
    .split('{releaseTitle}')
    .join(values.releaseTitle);
}

/** The in-app path the push opens. `scene=metadata` lands on the answers
 * rather than the catalog — it is a valid scene param (lib/scene-cache.ts). */
export function creditSubmissionUrl(releaseId: string): string {
  return `/dashboard?release=${encodeURIComponent(releaseId)}&scene=metadata`;
}

/**
 * The push collapse tag.
 *
 * Keyed on the SUBMISSION, never on the release: a shared tag makes the push
 * service REPLACE the previous notification rather than stack it, so two
 * collaborators answering minutes apart would leave the owner seeing only the
 * second one. The founder's call was one notification each, naming the person
 * (2026-08-27), and a per-release tag would silently defeat that.
 */
export function creditSubmissionTag(submissionId: string): string {
  return `credits-${submissionId}`;
}

export type CreditPushCopy = { title: string; body: string; url: string; tag: string };

export function buildCreditSubmissionPush(
  notice: CreditSubmissionNotice,
  preset: { title: string; body: string }
): CreditPushCopy {
  const values = {
    collaboratorName: collaboratorLabel(notice),
    releaseTitle: releaseLabel(notice.releaseTitle),
  };
  return {
    title: fillCreditPlaceholders(preset.title, values),
    body: fillCreditPlaceholders(preset.body, values),
    url: creditSubmissionUrl(notice.releaseId),
    tag: creditSubmissionTag(notice.submissionId),
  };
}

/** One split, as the owner reads it. One decimal place, matching what the
 * public form accepts and what the Metadata scene displays. */
export function formatSplit(value: number | null): string {
  if (value === null) return 'not given';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)}%`;
}

export function formatRoles(roles: readonly ReleaseCreditRole[]): string {
  const labels = roles.map((role) => RELEASE_CREDIT_ROLE_LABELS[role] || role).filter(Boolean);
  return labels.length > 0 ? labels.join(', ') : 'not given';
}

/**
 * The detail rows the email carries, in the order a distributor asks for them.
 *
 * This is the reason the email exists rather than being a second copy of the
 * push: a manager can act on it, or forward it, without opening the app. Blank
 * fields are dropped entirely — a wall of "not given" is worse than a short
 * list. Splits are the exception: an absent split is meaningful (they were
 * asked and did not answer, or their role did not require one), so it is
 * printed only when their role means it should have been given.
 */
export function buildCreditDetailRows(
  notice: CreditSubmissionNotice
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Legal name', value: notice.legalName.trim() },
    { label: 'Stage name', value: notice.stageName.trim() },
    { label: 'Roles', value: formatRoles(notice.roles) },
    { label: 'What they did', value: notice.contribution.trim() },
    { label: 'Email', value: notice.email.trim() },
    { label: 'Phone', value: notice.phone.trim() },
    { label: 'Country', value: notice.country.trim() },
    { label: 'Writing share', value: notice.songwriterSplit === null ? '' : formatSplit(notice.songwriterSplit) },
    { label: 'Recording share', value: notice.masterSplit === null ? '' : formatSplit(notice.masterSplit) },
    { label: 'Royalty society (PRO)', value: notice.proAffiliation.trim() },
    { label: 'Society ID (IPI)', value: notice.ipiNumber.trim() },
    { label: 'Publisher', value: notice.publisherName.trim() },
    { label: 'Publisher IPI', value: notice.publisherIpi.trim() },
  ];
  return rows.filter((row) => row.value && row.value !== 'not given');
}

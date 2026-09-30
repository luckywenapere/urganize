import { parseAnnouncementDraft } from '@/lib/email/announcement';
import { isOnboardingStepKey, type OnboardingStepKey } from '@/lib/email/onboarding-sequence';

// What the preview and test routes are asked to show: either a draft from the
// composer, or one step of the onboarding sequence.

export type EmailToShow =
  | {
      kind: 'announcement';
      subject: string;
      body: string;
      includeGreeting: boolean;
      signOff: boolean;
    }
  | { kind: 'sequence'; step: OnboardingStepKey };

export function parseEmailToShow(raw: unknown): { ok: true; email: EmailToShow } | { ok: false; error: string } {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (input?.kind === 'sequence') {
    if (!isOnboardingStepKey(input.step)) return { ok: false, error: 'Unknown sequence email.' };
    return { ok: true, email: { kind: 'sequence', step: input.step } };
  }
  const parsed = parseAnnouncementDraft(input);
  if (!parsed.ok) return parsed;
  return { ok: true, email: { kind: 'announcement', ...parsed.draft } };
}

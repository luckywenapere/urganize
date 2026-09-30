import { EmailLayout } from './Layout';
import { UnsubscribeFooter } from './components';
import { FounderNoteBody } from './FounderNote';
import { getOnboardingStep, type OnboardingStepKey } from '../onboarding-sequence';

export type OnboardingStepEmailProps = {
  step: OnboardingStepKey;
  recipientName: string;
  /** Added by sendEmail for unsubscribable categories; the footer link. */
  unsubscribeUrl?: string;
};

// One step of the onboarding sequence. The words live in onboarding-sequence.ts,
// all five together, so this file only lays them out.
export function OnboardingStepEmail({ step, recipientName, unsubscribeUrl }: OnboardingStepEmailProps) {
  const definition = getOnboardingStep(step);
  return (
    <EmailLayout
      preview={definition.preview}
      footer={unsubscribeUrl ? <UnsubscribeFooter url={unsubscribeUrl} /> : undefined}
    >
      <FounderNoteBody recipientName={recipientName} body={definition.body} />
    </EmailLayout>
  );
}

export function onboardingStepSubject(step: OnboardingStepKey): string {
  return getOnboardingStep(step).subject;
}

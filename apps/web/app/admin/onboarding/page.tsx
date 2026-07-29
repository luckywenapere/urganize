import type { Metadata } from 'next';
import OnboardingAdminPageClient from './OnboardingAdminPageClient';

export const metadata: Metadata = { title: 'Onboarding answers' };

export default function OnboardingAdminPage() {
  return <OnboardingAdminPageClient />;
}

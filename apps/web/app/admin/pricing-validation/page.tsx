import type { Metadata } from 'next';
import PricingValidationPageClient from './PricingValidationPageClient';

export const metadata: Metadata = {
  title: 'Pricing validation',
};

export default function PricingValidationAdminPage() {
  return <PricingValidationPageClient />;
}

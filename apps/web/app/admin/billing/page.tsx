import type { Metadata } from 'next';
import BillingMarginAdminPageClient from './BillingMarginAdminPageClient';

export const metadata: Metadata = { title: 'Billing margin' };

export default function BillingMarginAdminPage() {
  return <BillingMarginAdminPageClient />;
}

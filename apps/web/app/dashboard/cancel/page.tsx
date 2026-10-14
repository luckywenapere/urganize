import type { Metadata } from 'next';
import { CancelFlow } from '@/components/billing/CancelFlow';

// The cancel flow (2026-10-14). Thin server wrapper for the tab title, the
// credits page's shape. Everything happens in CancelFlow.
export const metadata: Metadata = {
  title: 'Cancel',
};

export default function CancelPage() {
  return <CancelFlow />;
}

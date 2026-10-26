import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CuratorApplyPageClient } from './CuratorApplyPageClient';

// /curator/apply — a playlist owner without an invite applies (2026-10-24,
// founder approved mocks v2-apply and v2-sent). No sign-in. An admin answers
// in /admin/curator-applications; approve mints the same single-use
// /curator/join/<code> link an admin can make by hand.
//
// Dark with the rest of the curator side when NEXT_PUBLIC_FEATURE_PITCHING is
// off. The form is server-rendered, so it shows before the JS arrives.

export const metadata: Metadata = {
  title: 'Curate for Urganize',
  description:
    'Put new music from real artists on your playlist. We read every application and reply within a week.',
};

export default function CuratorApplyPage() {
  if (process.env.NEXT_PUBLIC_FEATURE_PITCHING !== 'true') notFound();
  return <CuratorApplyPageClient />;
}

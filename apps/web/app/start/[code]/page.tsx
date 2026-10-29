import type { Metadata } from 'next';
import StartInviteClient from './StartInviteClient';

// Closed sign-up (2026-10-15): the founder's single-use invite link,
// my.urganize.app/start/<code>. See lib/access-gate.ts.
export const metadata: Metadata = {
  title: "You're invited",
  robots: { index: false, follow: false },
};

export default async function StartInvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <StartInviteClient code={code} />;
}

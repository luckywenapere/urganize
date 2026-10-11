import type { Metadata } from 'next';
import { createAdminClient } from '@/app/api/_shared/auth';
import { openClaimLink, type ClaimView } from '@/lib/seeding-server';
import WelcomeClaimClient from './WelcomeClaimClient';

/**
 * The page an invited manager lands on from a link Wena sent them.
 *
 * Server rendered, because the people opening it are on a phone, often on weak
 * data, and a page that is blank until a bundle downloads loses them (the
 * front-door lesson in CLAUDE.md). The profile is in the HTML.
 *
 * It records NOTHING on render: a chat app's link preview fetches this page the
 * moment the message is sent. The client reports the open once it has run.
 *
 * noindex on every branch. Every failure to find the link answers the same
 * 'missing' view, so a guessed address says nothing.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your profile',
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

export default async function WelcomePage({ params }: PageProps) {
  const { token } = await params;
  let view: ClaimView = { state: 'missing' };
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const client = supabaseUrl ? createAdminClient(supabaseUrl) : null;
    if (client) view = await openClaimLink(client, token);
  } catch {
    view = { state: 'missing' };
  }
  return <WelcomeClaimClient token={token} initial={view} />;
}

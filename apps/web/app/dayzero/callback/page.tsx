import type { Metadata } from 'next';
import DayzeroCallbackClient from './DayzeroCallbackClient';

// Day Zero's Redirect URL (#1393). A thin server wrapper so a plain GET (Day
// Zero's own check of this URL) gets a 200 with the "Activate from your Day
// Zero account" screen already in the HTML. With ?code= the client page swaps
// it for the license through POST /api/dayzero/claim (server side).
export const metadata: Metadata = {
  title: 'Activate Day Zero',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

export default async function DayzeroCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <DayzeroCallbackClient
      code={first(params.code)}
      activated={first(params.activated) === '1'}
      otherAccount={first(params.error) === 'other_account'}
    />
  );
}

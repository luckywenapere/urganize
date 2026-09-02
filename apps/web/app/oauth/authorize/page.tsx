import type { Metadata } from 'next';
import AuthorizePageClient from './AuthorizePageClient';

// Thin server wrapper so the route gets a real tab title through the root
// layout's '%s | Urganize' template — the page itself is a client component and
// cannot export metadata.
export const metadata: Metadata = {
  title: 'Connect an app',
  // A consent screen has no business in a search index.
  robots: { index: false, follow: false },
};

export default function OauthAuthorizePage() {
  return <AuthorizePageClient />;
}

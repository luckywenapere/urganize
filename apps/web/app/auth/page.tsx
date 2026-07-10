import type { Metadata } from 'next';
import AuthPageClient from './AuthPageClient';

// Thin server wrapper so this route gets a real browser-tab title through the
// root layout's '%s | Urganize' template — the page itself is a client
// component and cannot export metadata.
export const metadata: Metadata = {
  title: 'Sign in',
};

export default function AuthPage() {
  return <AuthPageClient />;
}

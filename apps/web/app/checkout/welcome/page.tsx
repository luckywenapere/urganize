import type { Metadata } from 'next';
import WelcomePageClient from './WelcomePageClient';

export const metadata: Metadata = {
  title: 'Welcome',
};

export default function CheckoutWelcomePage() {
  return <WelcomePageClient />;
}

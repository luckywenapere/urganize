import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// See the reset-password layout: the page is a client component, so the tab
// title has to come from here.
export const metadata: Metadata = {
  title: 'Forgot your password',
};

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}

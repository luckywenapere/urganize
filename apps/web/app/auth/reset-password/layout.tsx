import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The page is a client component and cannot export metadata, so this layout
// gives the tab a name (through the root '%s | Urganize' template) instead of
// the bare product name it had.
export const metadata: Metadata = {
  title: 'Set a new password',
};

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}

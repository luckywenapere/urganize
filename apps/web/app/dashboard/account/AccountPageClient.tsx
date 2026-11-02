'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Only draws where the swipe shell is not used (a computer, or someone who
 * chose the classic menu): there Settings is the pop-up, so this opens it.
 */
export default function AccountPageClient() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard?settings=menu');
  }, [router]);
  return null;
}

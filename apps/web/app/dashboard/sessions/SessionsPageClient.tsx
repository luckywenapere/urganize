'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Sessions is a tab of the phone's swipe shell, which draws it itself
 * (components/shell/swipe/SessionsPane). This page only draws on screens that
 * do not use that shell, where there is no Sessions list, so it sends the
 * person to the Assistant instead.
 */
export default function SessionsPageClient() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/urgans');
  }, [router]);
  return null;
}

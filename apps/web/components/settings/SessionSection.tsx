'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { panelClass } from './panelClass';

export function SessionSection() {
  const router = useRouter();
  const email = useAuthStore((state) => state.user?.email || '');
  const logout = useAuthStore((state) => state.logout);

  if (!email) return null;

  return (
    <section className={`${panelClass} mt-6`}>
      <h2 className="mb-4 text-xl">Session</h2>
      <div className="rounded-lg border border-stroke-subtle bg-bg-elevated p-4">
        <p className="text-sm text-content-secondary">Signed in as {email}.</p>
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.push('/auth');
          }}
          className="mt-4 rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-medium text-content-primary hover:bg-bg-hover"
        >
          Log out
        </button>
      </div>
    </section>
  );
}

'use client';

// Booked artist-interview slots, ported into the admin hub from
// apps/homepage/app/dashboard/(protected)/interviews (2026-07-30, the pass
// that retired the homepage admin surfaces). The public booking form stays
// on the marketing site; this is the internal view of what's booked. The
// GET doubles as the admin gate — non-admins bounce to /dashboard.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';

type InterviewSlot = {
  id: number;
  artistName: string;
  phone: string;
  imessage: string;
  date: string;
  bookedAt: string;
};

type InterviewsResponse = { slots: InterviewSlot[] };

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export default function InterviewsAdminPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [checked, setChecked] = useState(false);
  const [slots, setSlots] = useState<InterviewSlot[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const response = await fetch('/api/admin/interviews', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (response.status === 401 || response.status === 403) {
          router.replace('/dashboard');
          return;
        }
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setError(payload.error || 'Could not load interview slots.');
          setChecked(true);
          return;
        }
        const payload = (await response.json().catch(() => null)) as InterviewsResponse | null;
        if (!cancelled && payload) {
          setSlots(Array.isArray(payload.slots) ? payload.slots : []);
          setChecked(true);
        }
      } catch {
        if (!cancelled) router.replace('/dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  if (authLoading || !user || !checked) {
    return <AdminPageSkeleton titleWidth="w-40" table={{ columns: 5, rows: 5 }} />;
  }

  return (
    <div>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Admin
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">
        Interviews
        <span className="ml-3 align-middle font-sans text-base font-normal text-content-tertiary">
          {slots.length} booked
        </span>
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Artist interview slots booked through the marketing site. Every slot is
        6:00 PM West Africa Time.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      {slots.length === 0 && !error ? (
        <div className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-8 text-center text-sm text-content-tertiary">
          No interviews booked yet.
        </div>
      ) : slots.length > 0 ? (
        <div className="mt-6 overflow-x-auto rounded-lg border border-stroke-default">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-bg-elevated font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary">
              <tr>
                <th className="px-4 py-3 font-bold">Interview day</th>
                <th className="px-4 py-3 font-bold">Artist</th>
                <th className="px-4 py-3 font-bold">Phone</th>
                <th className="px-4 py-3 font-bold">iMessage</th>
                <th className="px-4 py-3 font-bold">Booked on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke-subtle bg-bg-surface">
              {slots.map((slot) => (
                <tr key={slot.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-content-primary">
                    {slot.date}
                  </td>
                  <td className="px-4 py-3 text-content-secondary">{slot.artistName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-secondary">{slot.phone}</td>
                  <td className="px-4 py-3 text-content-secondary">{slot.imessage}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-content-tertiary">{slot.bookedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

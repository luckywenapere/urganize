'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { SectionCard } from '@/components/shared/SectionCard';
import { CreateReleaseForm } from '@/components/releases/CreateReleaseForm';

const getToday = () => new Date().toISOString().slice(0, 10);

export default function NewReleasePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [form, setForm] = useState({
    artistId: '',
    artistName: '',
    title: '',
    releaseDate: getToday(),
    description: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch('/api/releases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(form),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        releaseId?: string;
        error?: string;
      };
      if (!response.ok || !payload.releaseId) {
        throw new Error(payload.error || 'Could not create release.');
      }

      router.push(`/dashboard/releases/${payload.releaseId}`);
    } catch (submitError: any) {
      setError(submitError?.message || 'Could not create release.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <LoadingScreen
        variant="dashboard"
        eyebrow="New Release"
        title="Preparing release setup"
        description="Loading the focused workflow for release creation."
      />
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[760px] px-4 pb-10 pt-20 sm:px-6 sm:py-10">
        <SectionCard>
          <CreateReleaseForm
            form={form}
            artistOptions={[]}
            error={error}
            isSubmitting={isSubmitting}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            onSubmit={handleSubmit}
          />
        </SectionCard>
      </div>
    </main>
  );
}

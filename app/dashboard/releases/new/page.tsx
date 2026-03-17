'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { SectionCard } from '@/components/shared/SectionCard';
import { SqlSetupNotice } from '@/components/shared/SqlSetupNotice';
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
  const [setupSql, setSetupSql] = useState('');
  const [setupDetails, setSetupDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth');
    }
  }, [authLoading, router, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError('');
    setSetupSql('');
    setSetupDetails('');

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
        details?: string;
        sql?: string;
      };
      if (!response.ok || !payload.releaseId) {
        if (typeof payload.sql === 'string' && payload.sql.trim()) {
          setSetupSql(payload.sql);
        }
        if (typeof payload.details === 'string' && payload.details.trim()) {
          setSetupDetails(payload.details);
        }
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
        <div className="space-y-5">
          {setupSql ? (
            <SqlSetupNotice
              title="Release operations tables are missing"
              description={
                setupDetails
                  ? `Create the release-ops schema first, then submit this form again. ${setupDetails}`
                  : 'Create the release-ops schema first, then submit this form again.'
              }
              sql={setupSql}
            />
          ) : null}

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
      </div>
    </main>
  );
}

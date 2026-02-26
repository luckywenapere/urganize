'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';

type PlanSummary = {
  id: string;
  title: string;
  artist_name: string;
  created_at: string;
  setup_completed: boolean;
  hard_deadline: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout, setNeedsOnboarding, isLoading: authLoading } = useAuthStore();

  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const getPlanStatus = (plan: PlanSummary): 'Completed' | 'Overdue' | 'In Progress' => {
    if (plan.setup_completed) return 'Completed';
    if (!plan.hard_deadline) return 'In Progress';
    return new Date(plan.hard_deadline).getTime() < Date.now() ? 'Overdue' : 'In Progress';
  };

  useEffect(() => {
    const loadData = async () => {
      if (authLoading) return;
      if (!user) {
        setLoading(false);
        router.replace('/auth');
        return;
      }

      const { data: releases } = await supabase
        .from('releases')
        .select('id,title,artist_name,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      const ids = (releases || []).map((item) => item.id);
      if (ids.length === 0) {
        setPlans([]);
        setLoading(false);
        return;
      }

      const { data: setupRows } = await supabase
        .from('release_profiles')
        .select('release_id,setup_completed,hard_deadline')
        .in('release_id', ids)
        .order('updated_at', { ascending: false });

      const setupMap = new Map<string, { setup_completed: boolean; hard_deadline: string | null }>();
      (setupRows || []).forEach((row) => {
        if (!setupMap.has(row.release_id)) {
          setupMap.set(row.release_id, {
            setup_completed: !!row.setup_completed,
            hard_deadline: row.hard_deadline || null,
          });
        }
      });

      const mappedPlans = (releases || []).map((release) => ({
        id: release.id,
        title: release.title || 'Untitled Plan',
        artist_name: release.artist_name || 'Unknown Artist',
        created_at: release.created_at,
        setup_completed: setupMap.get(release.id)?.setup_completed || false,
        hard_deadline: setupMap.get(release.id)?.hard_deadline || null,
      }));

      setPlans(mappedPlans);
      setLoading(false);
    };

    loadData();
  }, [authLoading, router, user]);

  const createNewPlan = async () => {
    if (!user || isCreatingPlan) return;

    setIsCreatingPlan(true);
    const dateLabel = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date());

    try {
      const defaultDeadline = new Date();
      defaultDeadline.setDate(defaultDeadline.getDate() + 30);

      const { data: release, error: releaseError } = await supabase
        .from('releases')
        .insert({
          user_id: user.id,
          title: `New Plan - ${dateLabel}`,
          artist_name: user.name || 'Artist',
          type: 'single',
          status: 'draft',
        })
        .select('id')
        .single();

      if (releaseError || !release) {
        throw releaseError || new Error('Failed to create plan');
      }

      const { error: profileError } = await supabase
        .from('release_profiles')
        .insert({
          release_id: release.id,
          setup_step: 2,
          setup_completed: false,
          hard_deadline: defaultDeadline.toISOString(),
        });

      if (profileError) {
        throw profileError;
      }

      setNeedsOnboarding(true);
      router.push(`/dashboard?startOnboarding=2&planId=${release.id}`);
    } finally {
      setIsCreatingPlan(false);
    }
  };

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1360px] flex-col px-6 py-10 lg:max-w-[1120px] lg:px-10 lg:py-12 xl:px-12">
        <div className="flex items-center justify-between">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              className="text-[clamp(2rem,4.5vw,3rem)] leading-none lg:text-[2rem]"
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
            >
              ≡
            </button>
            {isMenuOpen && (
              <div className="absolute left-0 top-full z-20 mt-3 min-w-[180px] rounded-xl border border-white/10 bg-[#02090d] p-2 shadow-lg">
                <Link
                  href="/dashboard"
                  className="block rounded-md px-3 py-2 text-sm text-white/85 hover:bg-white/10"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  href="/settings"
                  className="block rounded-md px-3 py-2 text-sm text-white/85 hover:bg-white/10"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    setIsMenuOpen(false);
                    await logout();
                    router.push('/auth');
                  }}
                  className="mt-1 block w-full rounded-md px-3 py-2 text-left text-sm text-white/85 hover:bg-white/10"
                >
                  Logout
                </button>
              </div>
            )}
          </div>

          <div className="w-[1em]" aria-hidden />
        </div>

        <section className="mt-20 lg:mt-20 xl:mt-24">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-[clamp(2.6rem,6vw,5rem)] tracking-tight lg:text-[3.2rem] xl:text-[3.6rem]">Plans</h1>
            <button
              type="button"
              onClick={createNewPlan}
              disabled={isCreatingPlan || loading}
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20 disabled:opacity-50"
            >
              {isCreatingPlan ? 'Creating...' : 'Create New Plan'}
            </button>
          </div>

          <div className="mt-8 rounded-[28px] border border-white/5 bg-[#02090d] p-7 sm:p-9">
            {loading ? (
              <p className="mt-4 text-white/75">Loading plans...</p>
            ) : plans.length === 0 ? (
              <p className="mt-4 text-white/75">No plans yet. Create a new one to start onboarding.</p>
            ) : (
              <div className="mt-5 space-y-3">
                {plans.map((plan) => (
                  <button
                    type="button"
                    key={plan.id}
                    onClick={() => router.push(`/dashboard/plans/${plan.id}`)}
                    className="flex w-full flex-col gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left transition hover:border-white/20 hover:bg-black/30 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-base font-medium text-white">{plan.title}</p>
                      <p className="text-sm text-white/70">{plan.artist_name}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white/70">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          getPlanStatus(plan) === 'Completed'
                            ? 'bg-emerald-500/20 text-emerald-200'
                            : getPlanStatus(plan) === 'Overdue'
                              ? 'bg-red-500/20 text-red-200'
                              : 'bg-amber-500/20 text-amber-100'
                        }`}
                      >
                        {getPlanStatus(plan)}
                      </span>
                      <span className="text-white/30">•</span>
                      <span>{new Date(plan.created_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

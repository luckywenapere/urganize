'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const [completedTasks, setCompletedTasks] = useState(0);
  const [currentTask, setCurrentTask] = useState('Single task');
  const [goalStatus, setGoalStatus] = useState('In Progress');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;

      const { data: releases } = await supabase
        .from('releases')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      const ids = (releases || []).map((item) => item.id);
      if (ids.length === 0) {
        setLoading(false);
        return;
      }

      const { data: completed } = await supabase
        .from('ai_tasks')
        .select('id', { count: 'exact' })
        .in('release_id', ids)
        .eq('status', 'completed');
      setCompletedTasks(completed?.length || 0);

      const { data: activeTask } = await supabase
        .from('ai_tasks')
        .select('title')
        .in('release_id', ids)
        .in('status', ['current', 'pending'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeTask?.title) setCurrentTask(activeTask.title);

      const { data: setup } = await supabase
        .from('release_profiles')
        .select('setup_completed')
        .in('release_id', ids)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setGoalStatus(setup?.setup_completed ? 'Onboarding Complete' : 'Onboarding Active');
      setLoading(false);
    };

    loadData();
  }, [user]);

  const progress = useMemo(() => {
    if (completedTasks <= 0) return 24;
    return Math.min(92, 24 + completedTasks * 9);
  }, [completedTasks]);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1360px] flex-col px-6 py-10 lg:max-w-[1120px] lg:px-10 lg:py-12 xl:px-12">
        <div className="flex items-center justify-between">
          <button type="button" className="text-[clamp(2rem,4.5vw,3rem)] leading-none lg:text-[2rem]">≡</button>
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.push('/auth');
            }}
            className="text-[clamp(2rem,4.5vw,3rem)] leading-none lg:text-[2rem]"
          >
            Logout
          </button>
        </div>

        <section className="mt-20 lg:mt-20 xl:mt-24">
          <h1 className="text-[clamp(2.6rem,6vw,5rem)] tracking-tight lg:text-[3.2rem] xl:text-[3.6rem]">Progress Timeline</h1>

          <div className="mt-10">
            <div className="relative h-8 w-full bg-transparent lg:h-7">
              <div className="absolute left-0 top-1/2 h-6 w-full -translate-y-1/2 bg-white lg:h-4" />
              <div
                className="absolute top-1/2 h-24 w-10 -translate-y-1/2 bg-white lg:h-16 lg:w-8"
                style={{ left: `calc(${progress}% - 20px)` }}
              />
            </div>
          </div>

          <div className="mt-12 rounded-[28px] border border-white/5 bg-[#02090d] p-7 sm:p-9">
            {loading ? (
              <p className="text-[clamp(1.9rem,4.6vw,3.2rem)] text-white/85 lg:text-[2rem]">Loading...</p>
            ) : (
              <div className="space-y-6">
                <p className="text-[clamp(2rem,4.8vw,3.5rem)] lg:text-[2.15rem]">Completed Tasks: {completedTasks}</p>
                <p className="text-[clamp(2rem,4.8vw,3.5rem)] lg:text-[2.15rem]">Current Task: {currentTask}</p>
                <p className="text-[clamp(2rem,4.8vw,3.5rem)] lg:text-[2.15rem]">Goal Status: {goalStatus}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

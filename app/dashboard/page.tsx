'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        setLoading(false);
        router.push('/auth');
        return;
      }

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
  }, [router, user]);

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

  const progress = useMemo(() => {
    if (completedTasks <= 0) return 24;
    return Math.min(92, 24 + completedTasks * 9);
  }, [completedTasks]);

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

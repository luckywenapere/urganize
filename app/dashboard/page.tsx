'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { getSubscriptionAccess } from '@/lib/subscription-access';
import { SubscriptionPaywall } from '@/components/billing/SubscriptionPaywall';

type PlanSummary = {
  id: string;
  title: string;
  artist_name: string;
  created_at: string;
  status: 'draft' | 'in-progress' | 'ready' | 'released';
  setup_completed: boolean;
  hard_deadline: string | null;
};

type CachedPlansPayload = {
  plans: PlanSummary[];
  cachedAt: number;
};

const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
const VIRTUALIZED_LIST_THRESHOLD = 12;
const PLAN_MENU_WIDTH_PX = 190;
const PLAN_MENU_SAFE_MARGIN_PX = 12;

const VirtualizedPlanList = dynamic(
  () => import('@/components/dashboard/VirtualizedPlanList').then((mod) => mod.VirtualizedPlanList),
  {
    ssr: false,
    loading: () => (
      <div className="mt-5 space-y-3">
        <div className="h-20 rounded-xl skeleton-shimmer" />
        <div className="h-20 rounded-xl skeleton-shimmer" />
        <div className="h-20 rounded-xl skeleton-shimmer" />
      </div>
    ),
  }
);

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout, setNeedsOnboarding, isLoading: authLoading } = useAuthStore();

  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [planFilter, setPlanFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [planSearch, setPlanSearch] = useState('');
  const [planSort, setPlanSort] = useState<'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'status'>('newest');
  const [activePlanMenuId, setActivePlanMenuId] = useState<string | null>(null);
  const [activePlanMenuDirection, setActivePlanMenuDirection] = useState<'up' | 'down'>('down');
  const [activePlanMenuOffsetX, setActivePlanMenuOffsetX] = useState(0);
  const [planPendingRename, setPlanPendingRename] = useState<PlanSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameError, setRenameError] = useState('');
  const [isRenamingPlan, setIsRenamingPlan] = useState(false);
  const [planPendingDelete, setPlanPendingDelete] = useState<PlanSummary | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingPlan, setIsDeletingPlan] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [error, setError] = useState('');
  const [hasSubscriptionAccess, setHasSubscriptionAccess] = useState<boolean | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingPlanTitle, setEditingPlanTitle] = useState('');
  const [savingInlinePlanId, setSavingInlinePlanId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const cacheKey = user ? `urganize.dashboard.plans.${user.id}` : '';

  const getPlanStatus = useCallback((plan: PlanSummary): 'Completed' | 'Overdue' | 'In Progress' => {
    if (plan.status === 'released') return 'Completed';
    if (plan.setup_completed) return 'Completed';
    if (!plan.hard_deadline) return 'In Progress';
    return new Date(plan.hard_deadline).getTime() < Date.now() ? 'Overdue' : 'In Progress';
  }, []);

  const activePlansCount = useMemo(() => plans.filter((plan) => plan.status !== 'released').length, [plans]);
  const archivedPlansCount = useMemo(() => plans.filter((plan) => plan.status === 'released').length, [plans]);
  const overduePlansCount = useMemo(
    () => plans.filter((plan) => getPlanStatus(plan) === 'Overdue').length,
    [getPlanStatus, plans]
  );
  const filteredPlans = useMemo(() => {
    const query = planSearch.trim().toLowerCase();
    const filterByStatus = (plan: PlanSummary) => {
      if (planFilter === 'active') return plan.status !== 'released';
      if (planFilter === 'archived') return plan.status === 'released';
      return true;
    };
    const filterBySearch = (plan: PlanSummary) => {
      if (!query) return true;
      return (
        plan.title.toLowerCase().includes(query) ||
        plan.artist_name.toLowerCase().includes(query) ||
        plan.status.toLowerCase().includes(query)
      );
    };
    const statusRank = (plan: PlanSummary): number => {
      const status = getPlanStatus(plan);
      if (status === 'Overdue') return 0;
      if (status === 'In Progress') return 1;
      return 2;
    };
    const sorted = plans
      .filter((plan) => filterByStatus(plan) && filterBySearch(plan))
      .sort((a, b) => {
        if (planSort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (planSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (planSort === 'title_asc') return a.title.localeCompare(b.title);
        if (planSort === 'title_desc') return b.title.localeCompare(a.title);
        return statusRank(a) - statusRank(b) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    return sorted;
  }, [getPlanStatus, planFilter, planSearch, planSort, plans]);

  useEffect(() => {
    let cancelled = false;

    const readCachedPlans = (): CachedPlansPayload | null => {
      if (!cacheKey) return null;
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as CachedPlansPayload;
        if (!Array.isArray(parsed.plans) || typeof parsed.cachedAt !== 'number') return null;
        if (Date.now() - parsed.cachedAt > DASHBOARD_CACHE_TTL_MS) return null;
        return parsed;
      } catch {
        return null;
      }
    };

    const loadData = async () => {
      if (authLoading) return;
      if (!user) {
        setLoading(false);
        router.replace('/auth');
        return;
      }

      const cached = readCachedPlans();
      if (cached && !cancelled) {
        setPlans(cached.plans);
        setLoading(false);
      }

      setIsRefreshing(true);
      setError('');
      try {
        const entitlement = await getSubscriptionAccess(user.id);
        if (!cancelled) {
          setHasSubscriptionAccess(entitlement.hasAccess);
        }
        if (!entitlement.hasAccess) {
          if (!cancelled) {
            setPlans([]);
            if (cacheKey) {
              localStorage.removeItem(cacheKey);
            }
          }
          return;
        }

        const { data: releases } = await supabase
          .from('releases')
          .select('id,title,artist_name,created_at,status')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30);

        const ids = (releases || []).map((item) => item.id);
        if (ids.length === 0) {
          if (!cancelled) {
            setPlans([]);
            if (cacheKey) {
              localStorage.removeItem(cacheKey);
            }
          }
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
          status: release.status || 'draft',
          setup_completed: setupMap.get(release.id)?.setup_completed || false,
          hard_deadline: setupMap.get(release.id)?.hard_deadline || null,
        }));

        if (!cancelled) {
          setPlans(mappedPlans);
          if (cacheKey) {
            const cachePayload: CachedPlansPayload = {
              plans: mappedPlans,
              cachedAt: Date.now(),
            };
            localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
          }
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message || 'Could not load plans right now.');
          setHasSubscriptionAccess(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [authLoading, cacheKey, router, user]);

  const createNewPlan = async () => {
    if (!user || isCreatingPlan) return;
    if (hasSubscriptionAccess === false) {
      router.push('/settings');
      return;
    }
    setError('');
    setIsCreatingPlan(true);
    setNeedsOnboarding(true);
    router.push('/dashboard?startOnboarding=2&flow=create-plan');
    setIsCreatingPlan(false);
  };

  const requestDeletePlan = (plan: PlanSummary) => {
    setPlanPendingDelete(plan);
    setDeleteConfirmText('');
    setDeleteError('');
    setActivePlanMenuId(null);
    setActivePlanMenuDirection('down');
    setActivePlanMenuOffsetX(0);
  };

  const requestRenamePlan = (plan: PlanSummary) => {
    setPlanPendingRename(plan);
    setRenameTitle(plan.title || '');
    setRenameError('');
    setActivePlanMenuId(null);
    setActivePlanMenuDirection('down');
    setActivePlanMenuOffsetX(0);
  };

  const renamePlanTitle = async (planId: string, nextTitle: string) => {
    if (!user?.id) return;
    const { error: renameUpdateError } = await supabase
      .from('releases')
      .update({ title: nextTitle, updated_at: new Date().toISOString() })
      .eq('id', planId)
      .eq('user_id', user.id);
    if (renameUpdateError) throw renameUpdateError;

    setPlans((current) => {
      const nextPlans = current.map((plan) => (plan.id === planId ? { ...plan, title: nextTitle } : plan));
      if (cacheKey) {
        const cachePayload: CachedPlansPayload = {
          plans: nextPlans,
          cachedAt: Date.now(),
        };
        localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
      }
      return nextPlans;
    });
  };

  const beginInlineTitleEdit = (plan: PlanSummary) => {
    setEditingPlanId(plan.id);
    setEditingPlanTitle(plan.title || '');
    setError('');
  };

  const commitInlineTitleEdit = async (planId: string) => {
    const nextTitle = editingPlanTitle.trim();
    const currentPlan = plans.find((plan) => plan.id === planId);
    const currentTitle = (currentPlan?.title || '').trim();

    if (!nextTitle || nextTitle === currentTitle) {
      setEditingPlanId(null);
      setEditingPlanTitle('');
      return;
    }

    setSavingInlinePlanId(planId);
    try {
      await renamePlanTitle(planId, nextTitle);
      setEditingPlanId(null);
      setEditingPlanTitle('');
    } catch (renameError: any) {
      setError(renameError?.message || 'Could not rename plan.');
    } finally {
      setSavingInlinePlanId(null);
    }
  };

  const togglePlanMenu = (planId: string, anchor: HTMLElement) => {
    if (activePlanMenuId === planId) {
      setActivePlanMenuId(null);
      setActivePlanMenuDirection('down');
      setActivePlanMenuOffsetX(0);
      return;
    }
    const anchorRect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const menuLeft = anchorRect.right - PLAN_MENU_WIDTH_PX;
    const menuRight = anchorRect.right;
    let offsetX = 0;
    if (menuLeft < PLAN_MENU_SAFE_MARGIN_PX) {
      offsetX = PLAN_MENU_SAFE_MARGIN_PX - menuLeft;
    }
    const maxRight = window.innerWidth - PLAN_MENU_SAFE_MARGIN_PX;
    if (menuRight + offsetX > maxRight) {
      offsetX -= menuRight + offsetX - maxRight;
    }
    setActivePlanMenuDirection(spaceBelow < 220 ? 'up' : 'down');
    setActivePlanMenuOffsetX(offsetX);
    setActivePlanMenuId(planId);
  };

  const closeDeleteModal = () => {
    if (isDeletingPlan) return;
    setPlanPendingDelete(null);
    setDeleteConfirmText('');
    setDeleteError('');
  };

  const closeRenameModal = () => {
    if (isRenamingPlan) return;
    setPlanPendingRename(null);
    setRenameTitle('');
    setRenameError('');
  };

  const confirmRenamePlan = async () => {
    if (!planPendingRename || !user?.id) return;
    const nextTitle = renameTitle.trim();
    if (!nextTitle) {
      setRenameError('Title is required.');
      return;
    }

    setRenameError('');
    setIsRenamingPlan(true);
    try {
      await renamePlanTitle(planPendingRename.id, nextTitle);

      setPlanPendingRename(null);
      setRenameTitle('');
      setRenameError('');
    } catch (renamePlanError: any) {
      setRenameError(renamePlanError?.message || 'Could not rename plan.');
    } finally {
      setIsRenamingPlan(false);
    }
  };

  const confirmDeletePlan = async () => {
    if (!planPendingDelete) return;
    if (deleteConfirmText.trim() !== 'DELETE') {
      setDeleteError('Type DELETE exactly to confirm.');
      return;
    }

    setDeleteError('');
    setIsDeletingPlan(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/plans/${planPendingDelete.id}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirmationText: deleteConfirmText }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Could not delete plan');
      }

      setPlans((current) => {
        const nextPlans = current.filter((plan) => plan.id !== planPendingDelete.id);
        if (cacheKey) {
          if (nextPlans.length === 0) {
            localStorage.removeItem(cacheKey);
          } else {
            const cachePayload: CachedPlansPayload = {
              plans: nextPlans,
              cachedAt: Date.now(),
            };
            localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
          }
        }
        return nextPlans;
      });

      setPlanPendingDelete(null);
      setDeleteConfirmText('');
      setDeleteError('');
    } catch (deletePlanError: any) {
      setDeleteError(deletePlanError?.message || 'Could not delete plan.');
    } finally {
      setIsDeletingPlan(false);
    }
  };

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current) return;
      if (!menuRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
      const targetElement = event.target as HTMLElement;
      if (!targetElement.closest('[data-plan-menu="true"]')) {
        setActivePlanMenuId(null);
        setActivePlanMenuDirection('down');
        setActivePlanMenuOffsetX(0);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
        setActivePlanMenuId(null);
        setActivePlanMenuDirection('down');
        setActivePlanMenuOffsetX(0);
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
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-[1360px] flex-col px-6 py-10 lg:max-w-[1120px] lg:px-10 lg:py-12 xl:px-12">
        <div className="flex items-center justify-between">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              className="rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-sm font-semibold text-content-primary transition hover:bg-bg-hover"
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
            >
              Menu
            </button>
            {isMenuOpen && (
              <div className="absolute left-0 top-full z-20 mt-3 min-w-[190px] rounded-xl border border-stroke-default bg-bg-surface p-2 shadow-lg">
                <Link
                  href="/dashboard"
                  className="block rounded-md px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  href="/settings"
                  className="block rounded-md px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Settings
                </Link>
                <Link
                  href="/admin"
                  className="block rounded-md px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Admin
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    setIsMenuOpen(false);
                    await logout();
                    router.push('/auth');
                  }}
                  className="mt-1 block w-full rounded-md px-3 py-2 text-left text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
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
            <div>
              <h1 className="text-[clamp(2.6rem,6vw,5rem)] tracking-tight lg:text-[3.2rem] xl:text-[3.6rem]">Plans</h1>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-content-tertiary">Release command dashboard</p>
            </div>
            <div className="flex items-center gap-3">
              {isRefreshing && !loading && (
                <span className="rounded-full border border-stroke-default bg-bg-elevated px-2 py-1 text-xs text-content-secondary">
                  Refreshing...
                </span>
              )}
              <button
                type="button"
                onClick={createNewPlan}
                disabled={isCreatingPlan || loading || hasSubscriptionAccess !== true}
                className="rounded-xl border border-brand/40 bg-brand-muted px-4 py-2 text-sm font-semibold text-content-primary transition hover:bg-brand/20 disabled:opacity-50"
              >
                {isCreatingPlan ? 'Creating...' : 'Create New Plan'}
              </button>
            </div>
          </div>
          {hasSubscriptionAccess !== false && !loading && (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-stroke-default bg-bg-elevated p-3">
                <p className="text-xs uppercase tracking-wide text-content-tertiary">Active</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-content-primary">{activePlansCount}</p>
              </div>
              <div className="rounded-xl border border-stroke-default bg-bg-elevated p-3">
                <p className="text-xs uppercase tracking-wide text-content-tertiary">Archived</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-content-primary">{archivedPlansCount}</p>
              </div>
              <div className="rounded-xl border border-stroke-default bg-bg-elevated p-3">
                <p className="text-xs uppercase tracking-wide text-content-tertiary">Overdue</p>
                <p className={`mt-1 text-2xl font-semibold tracking-tight ${overduePlansCount > 0 ? 'text-status-warning' : 'text-content-primary'}`}>
                  {overduePlansCount}
                </p>
              </div>
            </div>
          )}
          {hasSubscriptionAccess === false ? (
            <div className="mt-8">
              <SubscriptionPaywall
                title="Subscription required to access plans"
                description="Your subscription is inactive. Renew billing to view, create, and manage plans."
              />
            </div>
          ) : plans.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-stroke-default/80 bg-bg-elevated/70 p-2 backdrop-blur-sm">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlanFilter('active')}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition hover:-translate-y-[1px] ${
                    planFilter === 'active'
                      ? 'border-brand/45 bg-brand-muted text-content-primary'
                      : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                  }`}
                >
                  Active ({activePlansCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPlanFilter('archived')}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition hover:-translate-y-[1px] ${
                    planFilter === 'archived'
                      ? 'border-brand/45 bg-brand-muted text-content-primary'
                      : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                  }`}
                >
                  Archived ({archivedPlansCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPlanFilter('all')}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition hover:-translate-y-[1px] ${
                    planFilter === 'all'
                      ? 'border-brand/45 bg-brand-muted text-content-primary'
                      : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                  }`}
                >
                  All ({plans.length})
                </button>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  value={planSearch}
                  onChange={(event) => setPlanSearch(event.target.value)}
                  placeholder="Search plans, artists, status"
                  className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand sm:col-span-2"
                />
                <select
                  value={planSort}
                  onChange={(event) =>
                    setPlanSort(
                      (event.target.value as 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'status') || 'newest'
                    )
                  }
                  className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                >
                  <option value="newest">Sort: Newest</option>
                  <option value="oldest">Sort: Oldest</option>
                  <option value="title_asc">Sort: Title A-Z</option>
                  <option value="title_desc">Sort: Title Z-A</option>
                  <option value="status">Sort: Status (Overdue first)</option>
                </select>
              </div>
            </div>
          ) : null}

          {error && (
            <p className="mt-5 rounded-xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
              {error}
            </p>
          )}

          <div className="relative mt-8 overflow-hidden rounded-[30px] border border-stroke-subtle bg-bg-surface p-7 sm:p-9">
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-brand/15 blur-3xl" />
            <div className="pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-status-info/12 blur-3xl" />
            {loading ? (
              <p className="mt-4 text-content-secondary">Loading plans...</p>
            ) : hasSubscriptionAccess === false ? (
              <p className="mt-4 text-content-secondary">Plans are locked until billing is active.</p>
            ) : plans.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-stroke-default bg-bg-elevated p-6 text-center">
                <p className="text-content-secondary">No plans yet. Create your first plan to start onboarding.</p>
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-stroke-default bg-bg-elevated p-6 text-center">
                <p className="text-content-secondary">
                  {planFilter === 'archived'
                    ? 'No archived plans yet.'
                    : planFilter === 'active'
                      ? 'No active plans right now.'
                      : 'No plans available.'}
                </p>
              </div>
            ) : filteredPlans.length >= VIRTUALIZED_LIST_THRESHOLD ? (
              <VirtualizedPlanList
                plans={filteredPlans}
                showArchivedBadge={planFilter === 'all'}
                getPlanStatus={getPlanStatus}
                onSelectPlan={(planId) => router.push(`/dashboard/plans/${planId}`)}
                onRenamePlanTitle={async (planId, title) => {
                  await renamePlanTitle(planId, title);
                }}
                onRequestRenamePlan={(plan) => requestRenamePlan(plan)}
                onRequestDeletePlan={(plan) => requestDeletePlan(plan)}
              />
            ) : (
              <div className="mt-5 space-y-3">
                {filteredPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="relative lazy-fade lazy-fade-in flex w-full flex-col gap-2 rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 text-left transition hover:-translate-y-[1px] hover:border-stroke-default hover:bg-bg-hover sm:flex-row sm:items-center sm:justify-between"
                    style={{ zIndex: activePlanMenuId === plan.id ? 40 : 1 }}
                  >
                    <div
                      className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                      onClick={() => {
                        if (editingPlanId === plan.id) return;
                        router.push(`/dashboard/plans/${plan.id}`);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && editingPlanId !== plan.id) {
                          router.push(`/dashboard/plans/${plan.id}`);
                        }
                      }}
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          {editingPlanId === plan.id ? (
                            <input
                              value={editingPlanTitle}
                              onChange={(event) => setEditingPlanTitle(event.target.value)}
                              onBlur={() => {
                                void commitInlineTitleEdit(plan.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  void commitInlineTitleEdit(plan.id);
                                }
                                if (event.key === 'Escape') {
                                  setEditingPlanId(null);
                                  setEditingPlanTitle('');
                                }
                              }}
                              autoFocus
                              className="w-full max-w-[320px] rounded border border-stroke-subtle bg-bg-surface px-2 py-1 text-base font-medium text-content-primary outline-none focus:border-brand"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                beginInlineTitleEdit(plan);
                              }}
                              className="truncate text-left text-base font-medium text-content-primary underline-offset-4 hover:underline"
                            >
                              {plan.title}
                            </button>
                          )}
                          {savingInlinePlanId === plan.id && (
                            <span className="text-[11px] text-content-tertiary">Saving...</span>
                          )}
                          {planFilter === 'all' && plan.status === 'released' && (
                            <span className="rounded-full border border-stroke-default bg-bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-content-tertiary">
                              Archived
                            </span>
                          )}
                        </div>
                        <p className="truncate text-sm text-content-secondary">{plan.artist_name}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-content-secondary">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            getPlanStatus(plan) === 'Completed'
                              ? 'bg-brand-muted text-brand'
                              : getPlanStatus(plan) === 'Overdue'
                                ? 'bg-status-error/20 text-status-error'
                                : 'bg-status-warning/20 text-status-warning'
                          }`}
                        >
                          {getPlanStatus(plan)}
                        </span>
                        <span className="text-content-tertiary">.</span>
                        <span>{new Date(plan.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="relative self-end sm:self-auto" data-plan-menu="true">
                      <button
                        type="button"
                        onClick={(event) => togglePlanMenu(plan.id, event.currentTarget)}
                        className="rounded-md border border-stroke-default bg-bg-surface px-2 py-1 text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                        aria-label={`Open menu for ${plan.title}`}
                      >
                        ...
                      </button>
                      {activePlanMenuId === plan.id && (
                        <div
                          className={`absolute right-0 z-50 min-w-[170px] rounded-xl border border-stroke-default bg-bg-surface p-2 shadow-lg ${activePlanMenuDirection === 'up' ? 'bottom-full mb-2 animate-menu-up' : 'top-full mt-2 animate-menu-down'}`}
                          style={{ transform: `translateX(${activePlanMenuOffsetX}px)` }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActivePlanMenuId(null);
                              setActivePlanMenuDirection('down');
                              setActivePlanMenuOffsetX(0);
                              router.push(`/dashboard/plans/${plan.id}`);
                            }}
                            className="block w-full rounded-md px-3 py-2 text-left text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                          >
                            Open plan
                          </button>
                          <button
                            type="button"
                            onClick={() => requestRenamePlan(plan)}
                            className="mt-1 block w-full rounded-md px-3 py-2 text-left text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                          >
                            Rename title
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDeletePlan(plan)}
                            className="mt-1 block w-full rounded-md px-3 py-2 text-left text-sm text-status-error hover:bg-status-error/10"
                          >
                            Delete plan
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
      {planPendingDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-stroke-default bg-bg-surface p-6">
            <h2 className="text-xl font-semibold text-content-primary">Delete this plan?</h2>
            <p className="mt-2 text-sm text-content-secondary">
              This will permanently delete <span className="font-semibold text-content-primary">{planPendingDelete.title}</span> and all plan assets.
            </p>
            <p className="mt-3 text-sm text-content-secondary">Type <span className="font-semibold text-content-primary">DELETE</span> to confirm.</p>
            <input
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              className="mt-3 w-full rounded-lg border border-status-error/35 bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-status-error"
              placeholder="DELETE"
            />
            {deleteError && <p className="mt-3 text-sm text-status-error">{deleteError}</p>}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={isDeletingPlan}
                className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeletePlan}
                disabled={isDeletingPlan}
                className="rounded-lg bg-status-error px-4 py-2 text-sm font-semibold text-content-inverse hover:opacity-90 disabled:opacity-50"
              >
                {isDeletingPlan ? 'Deleting...' : 'Delete plan'}
              </button>
            </div>
          </div>
        </div>
      )}
      {planPendingRename && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-stroke-default bg-bg-surface p-6">
            <h2 className="text-xl font-semibold text-content-primary">Rename plan title</h2>
            <p className="mt-2 text-sm text-content-secondary">
              Enter a new title for <span className="font-semibold text-content-primary">{planPendingRename.title}</span>.
            </p>
            <input
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              className="mt-3 w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
              placeholder="Plan title"
            />
            {renameError && <p className="mt-3 text-sm text-status-error">{renameError}</p>}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeRenameModal}
                disabled={isRenamingPlan}
                className="rounded-lg border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary hover:bg-bg-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRenamePlan}
                disabled={isRenamingPlan}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-50"
              >
                {isRenamingPlan ? 'Saving...' : 'Save title'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

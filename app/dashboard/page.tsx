'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { getSubscriptionAccess } from '@/lib/subscription-access';
import { getRolePermissions } from '@/lib/role-permissions';
import { clearPersistedState, readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { deleteUiDraft, fetchUiDraft, saveUiDraft } from '@/lib/ui-drafts';
import { SubscriptionPaywall } from '@/components/billing/SubscriptionPaywall';
import { SearchableGenreSelect } from '@/components/ui/SearchableGenreSelect';

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

type ArtistDirectoryItem = {
  id: string;
  name: string;
  genre: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type DashboardGuide = {
  title: string;
  subtitle: string;
  checklist: Array<{
    item: string;
    actionLabel: string;
    action:
      | 'create-plan'
      | 'open-active-plan'
      | 'open-next-step'
      | 'open-settings'
      | 'open-first-plan';
  }>;
};

type DashboardUiState = {
  planFilter: 'active' | 'archived' | 'all';
  planSearch: string;
  planSort: 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'status';
  artistSearch: string;
  artistForm: {
    name: string;
    genre: string;
    notes: string;
  };
};

type PricingValidationResponse = unknown;
type StoredPricingValidationResponse = unknown;

const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
const VIRTUALIZED_LIST_THRESHOLD = 12;
const PLAN_MENU_WIDTH_PX = 190;
const PLAN_MENU_SAFE_MARGIN_PX = 12;
const DASHBOARD_UI_STATE_VERSION = 1;
const DASHBOARD_UI_STATE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DASHBOARD_UI_STATE_SCOPE = 'dashboard-ui';

const isDashboardUiState = (value: unknown): value is DashboardUiState => {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<DashboardUiState>;
  return (
    (state.planFilter === 'active' || state.planFilter === 'archived' || state.planFilter === 'all') &&
    (state.planSort === 'newest' ||
      state.planSort === 'oldest' ||
      state.planSort === 'title_asc' ||
      state.planSort === 'title_desc' ||
      state.planSort === 'status') &&
    typeof state.planSearch === 'string' &&
    typeof state.artistSearch === 'string' &&
    !!state.artistForm &&
    typeof state.artistForm === 'object'
  );
};

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
  const permissions = useMemo(() => getRolePermissions(user?.role), [user?.role]);
  const dashboardGuide = useMemo<DashboardGuide>(() => {
    if (permissions.canManagePlans) {
      return {
        title: 'Manager flow',
        subtitle: 'Create plans, assign work, and track execution across artists.',
        checklist: [
          {
            item: 'Create a new plan from dashboard.',
            actionLabel: 'Create plan',
            action: 'create-plan',
          },
          {
            item: 'Set artist/release context and generate the first AI task.',
            actionLabel: 'Open active plan',
            action: 'open-active-plan',
          },
          {
            item: 'Use Workspace tabs to manage tasks, marketing, playlists, and assets.',
            actionLabel: 'Open workspace',
            action: 'open-active-plan',
          },
          {
            item: 'Use Next Step to continue execution cycles until release is complete.',
            actionLabel: 'Plan next step',
            action: 'open-next-step',
          },
        ],
      };
    }
    if (user?.role === 'artist') {
      return {
        title: 'Self-managed artist flow',
        subtitle: 'Run your own release campaign in one place.',
        checklist: [
          {
            item: 'Open your plan and complete the current task.',
            actionLabel: 'Open active plan',
            action: 'open-active-plan',
          },
          {
            item: 'Track outreach in playlist and marketing modules.',
            actionLabel: 'Open workspace',
            action: 'open-active-plan',
          },
          {
            item: 'Use checklist + assets to keep release delivery organized.',
            actionLabel: 'Open workspace',
            action: 'open-active-plan',
          },
          {
            item: 'Plan next step after each completed task to keep momentum.',
            actionLabel: 'Plan next step',
            action: 'open-next-step',
          },
        ],
      };
    }
    if (permissions.canEditWorkspace) {
      return {
        title: 'Team member flow',
        subtitle: 'Execute assigned work and keep campaign status updated.',
        checklist: [
          {
            item: 'Open active plans and check the current task.',
            actionLabel: 'Open active plan',
            action: 'open-active-plan',
          },
          {
            item: 'Update workspace modules as work is done.',
            actionLabel: 'Open workspace',
            action: 'open-active-plan',
          },
          {
            item: 'Upload or link proof in feedback so progress is visible.',
            actionLabel: 'Open next step',
            action: 'open-next-step',
          },
          {
            item: 'Flag blockers early so manager can adjust the plan.',
            actionLabel: 'Open active plan',
            action: 'open-active-plan',
          },
        ],
      };
    }
    return {
      title: 'Viewer flow',
      subtitle: 'Monitor progress with read-only visibility.',
      checklist: [
        {
          item: 'Open plans and review status, deadlines, and completion.',
          actionLabel: 'Open first plan',
          action: 'open-first-plan',
        },
        {
          item: 'Use workspace tabs to inspect tasks, playlists, and assets.',
          actionLabel: 'Open first plan',
          action: 'open-first-plan',
        },
        {
          item: 'Share feedback with your team outside the app when needed.',
          actionLabel: 'Open settings',
          action: 'open-settings',
        },
        {
          item: 'Request edit access if you need to update workflow items.',
          actionLabel: 'Open settings',
          action: 'open-settings',
        },
      ],
    };
  }, [permissions.canEditWorkspace, permissions.canManagePlans, user?.role]);

  const canRunGuideAction = (action: DashboardGuide['checklist'][number]['action']) => {
    const hasGuidePlan = plans.some((plan) => plan.status !== 'released') || plans.length > 0;
    if (action === 'open-active-plan' || action === 'open-next-step' || action === 'open-first-plan') {
      return hasGuidePlan;
    }
    if (action === 'create-plan') return permissions.canCreatePlans;
    return true;
  };

  const runGuideAction = async (action: DashboardGuide['checklist'][number]['action']) => {
    const guidePlanId = (plans.find((plan) => plan.status !== 'released') || plans[0])?.id;
    if (action === 'create-plan') {
      if (!user || isCreatingPlan) return;
      if (!permissions.canCreatePlans) {
        setError('Only managers can create plans.');
        return;
      }
      if (hasSubscriptionAccess === false) {
        router.push('/settings');
        return;
      }
      setError('');
      setIsCreatingPlan(true);
      setNeedsOnboarding(true);
      router.push('/dashboard?startOnboarding=2&flow=create-plan');
      setIsCreatingPlan(false);
      return;
    }
    if (!guidePlanId && (action === 'open-active-plan' || action === 'open-next-step' || action === 'open-first-plan')) return;
    if (action === 'open-active-plan' || action === 'open-first-plan') {
      router.push(`/dashboard/plans/${guidePlanId}`);
      return;
    }
    if (action === 'open-next-step') {
      router.push(`/dashboard/plans/${guidePlanId}/next-step`);
      return;
    }
    if (action === 'open-settings') {
      router.push('/settings');
    }
  };

  const renderGuideActionIcon = (action: DashboardGuide['checklist'][number]['action']) => {
    const iconClassName = 'h-3.5 w-3.5 text-content-secondary transition-colors duration-200 group-hover:text-content-primary';
    if (action === 'create-plan') {
      return (
        <svg viewBox="0 0 20 20" fill="none" className={iconClassName} aria-hidden="true">
          <path d="M5 3.75h7l3 3v9.5H5v-12.5Z" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 3.75v3h3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 8.75v4.5M7.75 11h4.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        </svg>
      );
    }
    if (action === 'open-next-step') {
      return (
        <svg viewBox="0 0 20 20" fill="none" className={iconClassName} aria-hidden="true">
          <path d="M3.75 10h12.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          <path d="m11.75 5.5 4.5 4.5-4.5 4.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3.75 5.5h4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        </svg>
      );
    }
    if (action === 'open-settings') {
      return (
        <svg viewBox="0 0 20 20" fill="none" className={iconClassName} aria-hidden="true">
          <circle cx="10" cy="10" r="2.75" stroke="currentColor" strokeWidth="1.35" />
          <path d="M10 4.25v1.5M10 14.25v1.5M4.25 10h1.5M14.25 10h1.5M5.94 5.94l1.06 1.06M12.99 12.99l1.06 1.06M14.05 5.94 12.99 7M7.01 12.99l-1.06 1.06" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        </svg>
      );
    }
    if (action === 'open-first-plan') {
      return (
        <svg viewBox="0 0 20 20" fill="none" className={iconClassName} aria-hidden="true">
          <rect x="3.75" y="4.25" width="12.5" height="11.5" rx="2.25" stroke="currentColor" strokeWidth="1.35" />
          <path d="M6.75 8h6.5M6.75 11h4.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 20 20" fill="none" className={iconClassName} aria-hidden="true">
        <rect x="3.75" y="4.25" width="12.5" height="11.5" rx="2.25" stroke="currentColor" strokeWidth="1.35" />
        <path d="M7 10h6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      </svg>
    );
  };

  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [planFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [planSearch, setPlanSearch] = useState('');
  const [planSort] = useState<'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'status'>('newest');
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
  const [artists, setArtists] = useState<ArtistDirectoryItem[]>([]);
  const [artistSearch] = useState('');
  const [artistForm, setArtistForm] = useState({ name: '', genre: '', notes: '' });
  const [editingArtistId, setEditingArtistId] = useState<string | null>(null);
  const [showGuideTooltip, setShowGuideTooltip] = useState(false);
  const [listenerProfileExists, setListenerProfileExists] = useState(false);
  const [listenerProfileGeneratedAt, setListenerProfileGeneratedAt] = useState<string | null>(null);
  const setPlanFilter = (_value: 'active' | 'archived' | 'all') => {};
  const setPlanSort = (_value: 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'status') => {};
  const setArtistSearch = (_value: string) => {};
  const pricingValidation: any = null;
  const pricingValidationLoading = false;
  const pricingValidationSubmitting = false;
  const showPricingValidationEditor = false;
  const setPricingValidation = (_value: unknown) => {};
  const setPricingValidationLoading = (_value: boolean) => {};
  const setPricingValidationSubmitting = (_value: boolean) => {};
  const setShowPricingValidationEditor = (_value: boolean) => {};
  const PricingValidationPrompt = (_props: Record<string, unknown>) => null;
  const handlePricingValidationSubmit = async (_payload: unknown) => {};
  const activePlanForGuide = useMemo(
    () => plans.find((plan) => plan.status !== 'released') || plans[0] || null,
    [plans]
  );
  const menuRef = useRef<HTMLDivElement | null>(null);
  const cacheKey = user ? `urganize.dashboard.plans.${user.id}` : '';
  const artistDefaultsKey = user ? `urganize.artistDefaults.${user.id}` : '';
  const guideTooltipSeenKey = user ? `urganize.dashboard.guideTooltipSeen.${user.id}` : '';
  const dashboardUiStateKey = user ? `urganize.dashboard.ui.v${DASHBOARD_UI_STATE_VERSION}.${user.id}` : '';

  useEffect(() => {
    if (!guideTooltipSeenKey) return;
    const hasSeenGuideTooltip = localStorage.getItem(guideTooltipSeenKey) === '1';
    setShowGuideTooltip(!hasSeenGuideTooltip);
  }, [guideTooltipSeenKey]);

  useEffect(() => {
    if (!dashboardUiStateKey) return;
    let cancelled = false;

    const restore = async () => {
      const localDraft = readPersistedState<DashboardUiState>(
        dashboardUiStateKey,
        DASHBOARD_UI_STATE_VERSION,
        isDashboardUiState,
        DASHBOARD_UI_STATE_MAX_AGE_MS
      );
      const remoteDraft = await fetchUiDraft<DashboardUiState>(DASHBOARD_UI_STATE_SCOPE, dashboardUiStateKey);
      const restored =
        localDraft || (remoteDraft.payload && isDashboardUiState(remoteDraft.payload) ? remoteDraft.payload : null);
      if (!restored || cancelled) return;

      setPlanSearch(restored.planSearch);
      setArtistForm(restored.artistForm);
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [dashboardUiStateKey]);

  useEffect(() => {
    if (!dashboardUiStateKey) return;
    const draft: DashboardUiState = {
      planFilter,
      planSearch,
      planSort,
      artistSearch,
      artistForm,
    };
    writePersistedState<DashboardUiState>(dashboardUiStateKey, DASHBOARD_UI_STATE_VERSION, draft);
    void saveUiDraft<DashboardUiState>(DASHBOARD_UI_STATE_SCOPE, dashboardUiStateKey, draft);
  }, [artistForm, artistSearch, dashboardUiStateKey, planFilter, planSearch, planSort]);

  useEffect(() => {
    const hideDashboardChrome = () => {
      const root = document.querySelector('main');
      if (!root) return;

      const cardTexts = ['Active', 'Archived', 'Overdue'];
      const candidates = Array.from(root.querySelectorAll('section, div'));

      candidates.forEach((element) => {
        const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
        const isStatusCard =
          text === 'Active' ||
          text === 'Archived' ||
          text === 'Overdue' ||
          cardTexts.some((label) => text.startsWith(label) && text.length < 80);

        if (isStatusCard) {
          (element as HTMLElement).style.display = 'none';
        }
      });
    };

    const frame = window.requestAnimationFrame(hideDashboardChrome);
    const timer = window.setTimeout(hideDashboardChrome, 400);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  const dismissGuideTooltip = () => {
    setShowGuideTooltip(false);
    if (guideTooltipSeenKey) {
      localStorage.setItem(guideTooltipSeenKey, '1');
    }
  };

  const clearDashboardDrafts = () => {
    clearPersistedState(dashboardUiStateKey);
    void deleteUiDraft(DASHBOARD_UI_STATE_SCOPE, dashboardUiStateKey);
    setArtistForm({ name: '', genre: '', notes: '' });
    setEditingArtistId(null);
  };

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
  const filteredArtists = useMemo(() => {
    const query = artistSearch.trim().toLowerCase();
    if (!query) return artists;
    return artists.filter((artist) => {
      return (
        artist.name.toLowerCase().includes(query) ||
        artist.genre.toLowerCase().includes(query) ||
        artist.notes.toLowerCase().includes(query)
      );
    });
  }, [artistSearch, artists]);
  const importablePlanArtists = useMemo(() => {
    const existing = new Set(artists.map((artist) => artist.name.trim().toLowerCase()).filter(Boolean));
    const names = Array.from(
      new Set(
        plans
          .map((plan) => plan.artist_name.trim())
          .filter(Boolean)
          .filter((name) => !existing.has(name.toLowerCase()))
      )
    );
    return names;
  }, [artists, plans]);

  const loadManagedArtists = useCallback(async () => {
    if (!user || !permissions.canManageArtists) {
      setArtists([]);
      return;
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      if (!token) return;
      const response = await fetch('/api/managed-artists', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        artists?: ArtistDirectoryItem[];
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error || 'Could not load managed artists.');
        return;
      }
      setArtists(Array.isArray(payload.artists) ? payload.artists : []);
    } catch {
      setError('Could not load managed artists.');
    }
  }, [permissions.canManageArtists, user]);

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

  useEffect(() => {
    if (hasSubscriptionAccess === false) {
      setArtists([]);
      return;
    }
    loadManagedArtists();
  }, [hasSubscriptionAccess, loadManagedArtists]);

  useEffect(() => {
    let cancelled = false;
    const loadListenerProfileStatus = async () => {
      if (!user || hasSubscriptionAccess === false) {
        if (!cancelled) {
          setListenerProfileExists(false);
          setListenerProfileGeneratedAt(null);
        }
        return;
      }
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        if (!token) return;
        const response = await fetch('/api/listener-profile/inputs', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as {
          exists?: boolean;
          generatedAt?: string | null;
        };
        if (!response.ok) return;
        if (!cancelled) {
          setListenerProfileExists(Boolean(payload.exists));
          setListenerProfileGeneratedAt(payload.generatedAt || null);
        }
      } catch {
        if (!cancelled) {
          setListenerProfileExists(false);
          setListenerProfileGeneratedAt(null);
        }
      }
    };

    loadListenerProfileStatus();
    return () => {
      cancelled = true;
    };
  }, [hasSubscriptionAccess, user]);

  useEffect(() => {
    let cancelled = false;

    const loadPricingValidation = async () => {
      if (!user || hasSubscriptionAccess === false) {
        if (!cancelled) {
          setPricingValidation(null);
          setShowPricingValidationEditor(false);
        }
        return;
      }

      setPricingValidationLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        if (!token) return;
        const response = await fetch('/api/pricing-validation', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as {
          response?: StoredPricingValidationResponse | null;
        };
        if (!response.ok || cancelled) return;
        setPricingValidation(payload.response || null);
      } finally {
        if (!cancelled) {
          setPricingValidationLoading(false);
        }
      }
    };

    void loadPricingValidation();
    return () => {
      cancelled = true;
    };
  }, [hasSubscriptionAccess, user]);

  const submitPricingValidation = async (payload: PricingValidationResponse) => {
    setPricingValidationSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      if (!token) throw new Error('Session expired. Please sign in again.');

      const response = await fetch('/api/pricing-validation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        response?: StoredPricingValidationResponse;
        error?: string;
      };
      if (!response.ok || !result.response) {
        throw new Error(result.error || 'Could not save pricing validation response.');
      }

      setPricingValidation(result.response);
      setShowPricingValidationEditor(false);
      setError('');
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not save pricing validation response.');
    } finally {
      setPricingValidationSubmitting(false);
    }
  };

  const createNewPlan = async () => {
    if (!user || isCreatingPlan) return;
    if (!permissions.canCreatePlans) {
      setError('Only managers can create plans.');
      return;
    }
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

  const saveArtistDirectoryItem = async () => {
    const name = artistForm.name.trim();
    if (!name) {
      setError('Artist name is required.');
      return;
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      if (!token) throw new Error('Session expired. Please sign in again.');

      const payload = {
        name,
        genre: artistForm.genre.trim(),
        notes: artistForm.notes.trim(),
      };

      const endpoint = editingArtistId ? `/api/managed-artists/${editingArtistId}` : '/api/managed-artists';
      const method = editingArtistId ? 'PUT' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || 'Could not save artist.');
      }

      await loadManagedArtists();
      setArtistForm({ name: '', genre: '', notes: '' });
      setEditingArtistId(null);
      setError('');
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not save artist.');
    }
  };

  const editArtistDirectoryItem = (artist: ArtistDirectoryItem) => {
    setEditingArtistId(artist.id);
    setArtistForm({
      name: artist.name,
      genre: artist.genre,
      notes: artist.notes,
    });
  };

  const deleteArtistDirectoryItem = async (artistId: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      if (!token) throw new Error('Session expired. Please sign in again.');
      const response = await fetch(`/api/managed-artists/${artistId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not remove artist.');
      }
      await loadManagedArtists();
      if (editingArtistId === artistId) {
        setEditingArtistId(null);
        setArtistForm({ name: '', genre: '', notes: '' });
      }
    } catch (deleteArtistError: any) {
      setError(deleteArtistError?.message || 'Could not remove artist.');
    }
  };

  const startPlanForArtist = (artist: ArtistDirectoryItem) => {
    if (!artistDefaultsKey) return;
    localStorage.setItem(
      artistDefaultsKey,
        JSON.stringify({
          artistName: artist.name,
          genre: artist.genre,
        })
      );
    setNeedsOnboarding(true);
    router.push('/dashboard?startOnboarding=2&flow=create-plan');
  };

  const importArtistsFromPlans = async () => {
    if (importablePlanArtists.length === 0) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';
      if (!token) throw new Error('Session expired. Please sign in again.');

      await Promise.all(
        importablePlanArtists.map((name) =>
          fetch('/api/managed-artists', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ name }),
          })
        )
      );
      await loadManagedArtists();
    } catch (importError: any) {
      setError(importError?.message || 'Could not import artists from plans.');
    }
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
                  href="/dashboard/listener-profile"
                  className="block rounded-md px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Ideal Listener
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
              <p className="mt-2 text-xs text-content-secondary">
                Role: <span className="font-medium text-content-primary">{permissions.role}</span>
                {!permissions.canManagePlans ? ' • Read-only plan management' : ''}
              </p>
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
                disabled={isCreatingPlan || loading || hasSubscriptionAccess !== true || !permissions.canCreatePlans}
                title={!permissions.canCreatePlans ? 'Only manager role can create plans.' : undefined}
                className="rounded-xl border border-brand/40 bg-brand-muted px-4 py-2 text-sm font-semibold text-content-primary transition hover:bg-brand/20 disabled:opacity-50"
              >
                {isCreatingPlan ? 'Creating...' : permissions.canCreatePlans ? 'Create New Plan' : 'Manager Only'}
              </button>
            </div>
          </div>
          {hasSubscriptionAccess !== false && !loading && (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="saas-panel-subtle p-4">
                <p className="text-xs uppercase tracking-wide text-content-tertiary">Active</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-content-primary">{activePlansCount}</p>
              </div>
              <div className="saas-panel-subtle p-4">
                <p className="text-xs uppercase tracking-wide text-content-tertiary">Archived</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-content-primary">{archivedPlansCount}</p>
              </div>
              <div className="saas-panel-subtle p-4">
                <p className="text-xs uppercase tracking-wide text-content-tertiary">Overdue</p>
                <p className={`mt-1 text-2xl font-semibold tracking-tight ${overduePlansCount > 0 ? 'text-status-warning' : 'text-content-primary'}`}>
                  {overduePlansCount}
                </p>
              </div>
            </div>
          )}
          {hasSubscriptionAccess !== false && (
            <section className="saas-panel mt-6 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-xl border border-stroke-default bg-bg-surface/90 p-2 text-content-secondary">
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                      <circle cx="12" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M5.5 20c0-4.2 2.9-7.5 6.5-7.5s6.5 3.3 6.5 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      <path d="M3.75 12h1.5M18.75 12h1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-content-tertiary">Ideal Listener Profile</h2>
                    <p className="mt-1 text-sm text-content-secondary">
                      Define and generate your most likely fan so campaign decisions stay focused.
                    </p>
                    {listenerProfileGeneratedAt && (
                      <p className="mt-1 text-xs text-content-tertiary">Last generated {new Date(listenerProfileGeneratedAt).toLocaleString()}</p>
                    )}
                  </div>
                </div>
                <Link
                  href="/dashboard/listener-profile"
                  className="rounded-xl border border-brand/40 bg-brand-muted px-4 py-2 text-sm font-semibold text-content-primary transition hover:bg-brand/20"
                >
                  {listenerProfileExists ? 'View Ideal Listener Profile' : 'Create Ideal Listener Profile'}
                </Link>
              </div>
            </section>
          )}
          {hasSubscriptionAccess !== false && (
            <section className="mt-6">
              {pricingValidation && !showPricingValidationEditor ? (
                <div className="saas-panel p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl">
                      <p className="saas-eyebrow">Validation research</p>
                      <h2 className="saas-title mt-2">Monthly subscription intent</h2>
                      <p className="mt-2 text-sm text-content-secondary">
                        Saved response: <span className="font-semibold text-content-primary">{pricingValidation.willingness === 'yes' ? 'Yes, monthly' : pricingValidation.willingness === 'maybe' ? 'Maybe' : 'Not right now'}</span>
                        {' • '}
                        Price comfort: <span className="font-semibold text-content-primary">{pricingValidation.priceBand ? pricingValidation.priceBand.replace('under-', 'Under NGN ').replace('5000-10000', 'NGN 5,000 - 10,000').replace('10000-plus', 'Above NGN 10,000').replace('not-sure', 'Not sure yet') : 'Not shared yet'}</span>
                      </p>
                      <p className="mt-3 text-sm leading-7 text-content-secondary">
                        This response helps validate whether mastering, release planning, listener insight, consultations, marketing support, and centralized execution justify a monthly subscription.
                      </p>
                      {pricingValidation.notes && (
                        <p className="mt-3 rounded-2xl border border-stroke-default bg-bg-elevated/55 px-4 py-3 text-sm text-content-secondary">
                          {pricingValidation.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      <span className="rounded-full border border-stroke-default bg-bg-elevated/85 px-3 py-1.5 text-xs font-medium text-content-secondary">
                        Updated {new Date(pricingValidation.updatedAt).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPricingValidationEditor(true)}
                        className="rounded-xl border border-brand/45 bg-brand-muted px-4 py-2 text-sm font-semibold text-content-primary transition hover:bg-brand/20"
                      >
                        Update response
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <PricingValidationPrompt
                  placement="dashboard"
                  variant="dashboard"
                  title="Would this be worth paying for monthly if it kept release work stress-free?"
                  subtitle="Best dashboard placement: directly under strategy cards, where users already evaluate plan quality and product usefulness."
                  submitLabel="Save response"
                  response={pricingValidation}
                  isBusy={pricingValidationSubmitting || pricingValidationLoading}
                  onSkip={() => setShowPricingValidationEditor(false)}
                  onSubmit={submitPricingValidation}
                />
              )}
            </section>
          )}
          {hasSubscriptionAccess !== false && user?.role === 'manager' && (
            <section className="saas-panel mt-6 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-content-tertiary">Artist Directory</h2>
                  <p className="mt-1 text-sm text-content-secondary">Save artists, then start a new plan with prefilled artist details.</p>
                </div>
                <div className="flex items-center gap-2">
                  {importablePlanArtists.length > 0 && (
                    <button
                      type="button"
                      onClick={importArtistsFromPlans}
                      className="rounded-md border border-stroke-default bg-bg-surface px-2.5 py-1 text-xs text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                    >
                      Import {importablePlanArtists.length} from plans
                    </button>
                  )}
                  <span className="rounded-full border border-stroke-default bg-bg-surface px-2.5 py-1 text-xs text-content-secondary">
                    {artists.length} artist{artists.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                <input
                  value={artistForm.name}
                  onChange={(event) => setArtistForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Artist name"
                  className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                />
                <SearchableGenreSelect
                  value={artistForm.genre}
                  onChange={(value) => setArtistForm((current) => ({ ...current, genre: value }))}
                  className="bg-bg-surface"
                />
                  <button
                    type="button"
                    onClick={saveArtistDirectoryItem}
                    className="rounded-lg border border-brand/40 bg-brand-muted px-3 py-2 text-sm font-semibold text-content-primary hover:bg-brand/20"
                  >
                    {editingArtistId ? 'Save Artist' : 'Add Artist'}
                  </button>
                  <button
                    type="button"
                    onClick={clearDashboardDrafts}
                    className="rounded-lg border border-stroke-default bg-bg-surface px-3 py-2 text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                  >
                    Clear Draft
                  </button>
                </div>
              <textarea
                value={artistForm.notes}
                onChange={(event) => setArtistForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Notes (optional)"
                className="mt-2 min-h-[72px] w-full rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
              />
              {editingArtistId && (
                <button
                  type="button"
                    onClick={() => {
                      setEditingArtistId(null);
                      setArtistForm({ name: '', genre: '', notes: '' });
                    }}
                    className="mt-2 text-xs text-content-secondary hover:underline"
                  >
                  Cancel editing
                </button>
              )}
              <input
                value={artistSearch}
                onChange={(event) => setArtistSearch(event.target.value)}
                placeholder="Search artists"
                className="mt-3 w-full rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
              />
              {filteredArtists.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {filteredArtists.map((artist) => (
                    <div key={artist.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-content-primary">{artist.name}</p>
                        <p className="text-xs text-content-secondary">{artist.genre || 'No genre'}</p>
                        {artist.notes && <p className="mt-1 text-xs text-content-secondary">{artist.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => startPlanForArtist(artist)}
                          className="rounded-md border border-brand/35 bg-brand-muted px-2 py-1 text-content-primary hover:bg-brand/20"
                        >
                          Start Plan
                        </button>
                        <button
                          type="button"
                          onClick={() => editArtistDirectoryItem(artist)}
                          className="text-content-secondary hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteArtistDirectoryItem(artist.id)}
                          className="text-status-error hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-content-secondary">No artists yet. Add one to speed up plan creation.</p>
              )}
            </section>
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

          <section className="relative mt-5 rounded-2xl border border-stroke-default bg-bg-surface/95 p-5 sm:p-6">
            {showGuideTooltip && (
              <div className="absolute right-4 top-4 z-20 w-[min(340px,calc(100%-2rem))] rounded-xl border border-brand/35 bg-bg-elevated px-4 py-3 shadow-[0_14px_36px_-24px_rgba(0,0,0,0.65)]">
                <p className="text-xs uppercase tracking-[0.14em] text-content-tertiary">New</p>
                <p className="mt-1 text-sm text-content-primary">Start here for your role-based flow and quick actions.</p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={dismissGuideTooltip}
                    className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-content-inverse hover:bg-brand-hover"
                  >
                    Got it
                  </button>
                  <button
                    type="button"
                    onClick={dismissGuideTooltip}
                    className="rounded-md border border-stroke-default bg-bg-surface px-2.5 py-1 text-xs text-content-secondary hover:bg-bg-hover"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-content-tertiary">How Urganize Works</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-content-primary">{dashboardGuide.title}</h2>
                <p className="mt-1 text-sm text-content-secondary">{dashboardGuide.subtitle}</p>
              </div>
            </div>
            <ol className="mt-4 grid grid-cols-1 gap-2 text-sm text-content-secondary md:grid-cols-2">
              {dashboardGuide.checklist.map((entry, index) => (
                <li key={entry.item} className="rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 transition-colors duration-200 hover:border-stroke-default">
                  <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-muted text-xs font-semibold text-brand">
                    {index + 1}
                  </span>
                  {entry.item}
                  <button
                    type="button"
                    disabled={!canRunGuideAction(entry.action)}
                    onClick={() => void runGuideAction(entry.action)}
                    className="group ml-3 inline-flex items-center gap-1.5 rounded-md border border-stroke-default bg-bg-surface px-2.5 py-1 text-xs text-content-primary shadow-[0_1px_0_rgba(255,255,255,0.04)] transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out hover:-translate-y-[1px] hover:bg-bg-hover hover:border-stroke-default/90 hover:shadow-[0_6px_16px_-10px_rgba(0,0,0,0.55)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                  >
                    {renderGuideActionIcon(entry.action)}
                    <span>{entry.actionLabel}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

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
                canManagePlans={permissions.canManagePlans}
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
                            <>
                              {permissions.canManagePlans ? (
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
                              ) : (
                                <p className="truncate text-left text-base font-medium text-content-primary">{plan.title}</p>
                              )}
                            </>
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
                      <span>
                        {new Date(plan.created_at).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
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
                          {permissions.canManagePlans && (
                            <button
                              type="button"
                              onClick={() => requestRenamePlan(plan)}
                              className="mt-1 block w-full rounded-md px-3 py-2 text-left text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                            >
                              Rename title
                            </button>
                          )}
                          {permissions.canManagePlans && (
                            <button
                              type="button"
                              onClick={() => requestDeletePlan(plan)}
                              className="mt-1 block w-full rounded-md px-3 py-2 text-left text-sm text-status-error hover:bg-status-error/10"
                            >
                              Delete plan
                            </button>
                          )}
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

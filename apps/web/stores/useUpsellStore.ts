'use client';

import { create } from 'zustand';
import type { PaidFeatureFlag } from '@/lib/entitlements';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';

// Global singleton (URG-178) so any surface — the topbar Chappi icon, the
// workspace Files link, the release detail Asset section, a future catalog
// affordance — can show the SAME upsell without prop-drilling. Mirrors the
// ChappiDock/CreateReleaseModal pattern: mounted once by AppShell, driven by
// state instead of a route.
type UpsellStore = {
  isOpen: boolean;
  flag: PaidFeatureFlag | null;
  /** surface identifies WHERE the gated attempt happened (e.g. 'topbar_chappi_icon',
   * 'files_page', 'workspace_files_link') for the gated_feature_attempted event. */
  show: (flag: PaidFeatureFlag, surface: string) => void;
  hide: () => void;
};

export const useUpsellStore = create<UpsellStore>((set) => ({
  isOpen: false,
  flag: null,
  show: (flag, surface) => {
    captureAnalyticsEvent(createPostHogEvent('gated_feature_attempted', { flag, surface }));
    set({ isOpen: true, flag });
  },
  hide: () => set({ isOpen: false, flag: null }),
}));

'use client';

import { memo } from 'react';
import Link from 'next/link';
import { ADMIN_NAV_ITEMS } from '@/components/admin/AdminNav';

/**
 * The internal dashboards, moved here from the top bar's More menu (founder
 * call, 2026-10-07). The list is the admin hub's own, so the two cannot drift.
 * Shown only to accounts `visibleSettingsSegments` lets in; each page still
 * checks ADMIN_EMAILS on its own API, so this list is navigation, not the guard.
 */
function AdminSegmentView() {
  return (
    <ul className="divide-y divide-stroke-subtle">
      {ADMIN_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              className="motion-focus flex min-h-11 items-center gap-3 py-2.5 text-sm text-content-primary hover:text-brand"
            >
              <Icon className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Memoised (2026-10-11): every segment opened in this visit stays mounted, and
 * the dialog re-renders on each keystroke in its search box and each dirty or
 * URL change, which used to re-render every one of them. Measured as a 304ms
 * INP on the Team segment. With stable props it now re-renders only when its
 * own inputs change.
 */
export const AdminSegment = memo(AdminSegmentView);

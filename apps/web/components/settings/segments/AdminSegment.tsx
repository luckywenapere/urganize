'use client';

import Link from 'next/link';
import { ADMIN_NAV_ITEMS } from '@/components/admin/AdminNav';

/**
 * The internal dashboards, moved here from the top bar's More menu (founder
 * call, 2026-10-07). The list is the admin hub's own, so the two cannot drift.
 * Shown only to accounts `visibleSettingsSegments` lets in; each page still
 * checks ADMIN_EMAILS on its own API, so this list is navigation, not the guard.
 */
export function AdminSegment() {
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

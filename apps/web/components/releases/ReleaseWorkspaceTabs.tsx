'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type ReleaseWorkspaceTabsProps = {
  releaseId: string;
};

const buildTabs = (releaseId: string) => [
  { href: `/dashboard/releases/${releaseId}`, label: 'Overview' },
  { href: `/dashboard/releases/${releaseId}/tasks`, label: 'Tasks' },
  { href: `/dashboard/releases/${releaseId}/playbook`, label: 'Playbook' },
  { href: `/dashboard/releases/${releaseId}/metadata`, label: 'Release Info' },
];

export function ReleaseWorkspaceTabs({ releaseId }: ReleaseWorkspaceTabsProps) {
  const pathname = usePathname();
  const tabs = buildTabs(releaseId);

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex min-w-full gap-2 rounded-[24px] border border-stroke-default bg-bg-elevated/65 p-2">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href ||
            (tab.href.includes('/tasks') && pathname?.startsWith(`/dashboard/releases/${releaseId}/tasks`)) ||
            (tab.href.includes('/playbook') && pathname?.startsWith(`/dashboard/releases/${releaseId}/playbook`)) ||
            (tab.href.includes('/metadata') && pathname?.startsWith(`/dashboard/releases/${releaseId}/metadata`));

          return (
            <Link
              key={tab.href}
              href={tab.href}
              data-onboarding-target={tab.label === 'Tasks' ? 'tasks-tab' : undefined}
              className={`inline-flex min-h-11 items-center rounded-[18px] px-4 py-3 text-sm font-semibold transition ${
                isActive
                  ? 'bg-bg-surface text-content-primary shadow-[0_14px_28px_-18px_rgba(0,0,0,0.45)]'
                  : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

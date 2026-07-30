"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, TrendingUp } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard/growth", label: "Growth", icon: TrendingUp },
  { href: "/dashboard/interviews", label: "Interviews", icon: CalendarCheck },
] as const;

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-6">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-[#6f857c]">Metrics</p>
      <div className="mt-3 flex flex-col gap-1.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? "border-[#9fe870]/25 bg-[#9fe870]/10 text-[#eaffdf]"
                  : "border-transparent text-[#d7e4d9] hover:border-white/10 hover:bg-white/5"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

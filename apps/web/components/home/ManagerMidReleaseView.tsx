"use client";

import { HomeHeaderRow } from "./HomeHeaderRow";
import { HomeBlocks } from "./HomeBlocks";
import type { HomePayload } from "@/lib/home/types";

/**
 * Home while rollouts are in flight: the greeting, then every group with
 * something in it, as stacks (2026-10-07, founder call). Nothing is folded
 * behind a "See everything" button any more: each stack is already one card
 * tall until it is opened. Artist and label accounts use this layout too.
 *
 * The UrgAns box is not in here: on a phone it is pinned to the bottom of the
 * screen (HomeAskBar), and on a desktop the conversation sits beside this
 * column (HomeDesktopSplit). See app/dashboard/home/HomePageClient.tsx.
 */
export function ManagerMidReleaseView({
  home,
  viewerId,
}: {
  home: HomePayload;
  viewerId: string;
}) {
  return (
    <div className="space-y-5">
      <HomeHeaderRow header={home.header} />
      <HomeBlocks home={home} viewerId={viewerId} />
    </div>
  );
}

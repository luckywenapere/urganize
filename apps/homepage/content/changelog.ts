export type ChangelogMonth = {
  month: string;
  highlights: string[];
};

// Plain-English product changelog, most recent month first.
// Add to the current month's `highlights` array as things ship; add a new
// month object at the top of `changelog` when the calendar turns over.
export const changelog: ChangelogMonth[] = [
  {
    month: "July 2026",
    highlights: [
      "Added light mode across the app and marketing site, with automatic system-preference detection and a manual toggle.",
      "Faster load times — cut the app's initial load size by over 20% for snappier page loads.",
      "Task completion made instant and more reliable, with no more silent failures when checking off a task.",
      "Fixed notification bugs, including notifications not clearing when their task was deleted.",
      "Refreshed the Team page with founder story and updated bios.",
      "Site-wide search-visibility improvements so pages show up better in search and share cleanly on social.",
      "Started building Chappi, a conversational assistant for driving your releases by just typing what you need (in the works, not yet switched on).",
    ],
  },
  {
    month: "June 2026",
    highlights: [
      "Major workspace redesign — releases and tasks now live together on one home screen instead of separate pages.",
      "Task list gained collapsible sections and a \"Done\" group with one-click undo.",
      "Notifications added — a notification bell with real-time alerts when things change on your releases.",
      "File attachments moved inline into the workspace, no more separate panel.",
      "Recurring monthly and annual subscription plans launched, alongside a public pricing page with Naira/USD switching.",
      "Added Google sign-in alongside email and password.",
      "Team invites now work end-to-end, including for teammates signing up for the first time.",
      "Workspace logo added — upload your label or team logo once and it automatically fills in as placeholder cover art for any release that doesn't have its own artwork yet.",
      "Added a \"Label\" plan for teams managing a full artist roster, with hands-on onboarding support.",
      "Replaced the old chat widget with a direct WhatsApp line to the founder.",
      "Privacy Policy and Terms of Service rewritten to match the actual product.",
    ],
  },
  {
    month: "May 2026",
    highlights: [
      "Release templates shipped: creating a single release now instantly generates a full 64-task rollout plan spanning 11 weeks of pre- and post-release work.",
      "File and asset attachments added — upload artwork, masters, contracts, and other release files straight to a release.",
      "Event milestones added — listening parties, video shoots, and release day now appear as dated milestones on a release's timeline, visually distinct from regular tasks.",
      "Task dependencies introduced — blocked tasks are now clearly marked and unlock automatically as their blockers are completed.",
      "Simplified the release view — replaced the old multi-stage pipeline UI with a single, clearer task-progress view.",
      "Task details became more flexible — set custom due dates, assignees, and priority without needing a template.",
      "Subscription billing connected to real payment data, with automatic account activation on successful payment.",
      "Introduced a 28-day free trial (no card required) for every new account.",
      "Built (not yet turned on) an AI rollout planner that tailors a release's task list to your specific release, and an AI status-update generator that writes a one-paragraph update for you to send your team.",
    ],
  },
  {
    month: "April 2026",
    highlights: [
      "Rebuilt Urganize on a clean, modern foundation.",
      "Introduced the first version of the combined releases + tasks workspace.",
      "Added in-app support chat so you can reach the founder directly.",
      "Added a guided onboarding flow for new accounts.",
      "Rebuilt the marketing site with a new editorial look, real product screenshots, and a walkthrough video.",
      "Added the Team page.",
    ],
  },
];

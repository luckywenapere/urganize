export type Release = {
  version: string;
  date: string;
  highlights: string[];
};

// The version-grouped release ledger — newest first. This file is the
// single source of truth for the product version: the top entry's `version`
// is the current version (exported below as CURRENT_VERSION). Ship a change
// by adding a release entry at the top AND bumping every package.json to
// match (see CLAUDE.md → Versioning for the procedure and bump rules).
//
// SCOPE: entries cover the product app (apps/web) ONLY. Marketing-site
// (apps/homepage) changes, however visible on the site, never earn an
// entry or a version bump. Marketing entries were purged retroactively on
// 2026-07-18; removed numbers stay retired, so the sequence has gaps.
//
// Versions before v0.10.0 are reconstructed milestones — the product was
// informally versioned until then. From v0.10.0 on, every release increments
// per the policy in CLAUDE.md.
export const changelog: Release[] = [
  {
    version: "0.38.3",
    date: "August 4, 2026",
    highlights: [
      "Release pages got simpler: everything now happens right where you're already working, without an extra page to click into. The Metadata shortcut also moved to the front of the row so it's the first thing you see.",
    ],
  },
  {
    version: "0.38.2",
    date: "August 4, 2026",
    highlights: [
      "UrgAns has its own address now: the assistant's page moved to a URL that matches its name. Old links and shortcuts still get you there.",
    ],
  },
  {
    version: "0.38.1",
    date: "August 4, 2026",
    highlights: [
      "The Workspace button in the top bar now closes the catalog when you're already looking at it, taking you back to UrgAns. Before, clicking it there didn't do anything.",
    ],
  },
  {
    version: "0.38.0",
    date: "August 3, 2026",
    highlights: [
      "Chappi has a new name: UrgAns. Same assistant, same everything else.",
      "UrgAns now travels with you. Sign in, and every page you visit keeps the assistant open in a panel on the side, carrying your conversation along. Close it and it stays out of your way; the UrgAns icon in the top bar brings it back whenever you want it.",
    ],
  },
  {
    version: "0.37.2",
    date: "July 31, 2026",
    highlights: [
      "Redrew the Chappi cursor from scratch: it's sharper on high-resolution screens now, and the fix for staying visible over dark backgrounds is a clean filled circle instead of the boxy outline from the last update.",
    ],
  },
  {
    version: "0.37.1",
    date: "July 31, 2026",
    highlights: [
      "Fixed the Chappi cursor's outline from earlier today — it was showing up as an ugly solid box instead of a clean edge. It now fills in just the mark itself, the way it was supposed to look the first time.",
    ],
  },
  {
    version: "0.37.0",
    date: "July 31, 2026",
    highlights: [
      "Release metadata is here: every release gets a Metadata page (next to Press kit) where you fill in distribution details — ISRC, UPC, genre, label, copyright lines — and generate a shareable link for collaborators. Send it to producers, co-writers, and engineers so they can submit their own publishing credits (splits, PRO, IPI, socials) without needing an Urganize account, and watch their submissions land on the page as they come in.",
    ],
  },
  {
    version: "0.36.1",
    date: "July 31, 2026",
    highlights: [
      "Fixed two rough edges in the Chappi cursor: it no longer gets stuck on the regular pointer after you select some text, and it now stays visible when it passes over dark buttons or images instead of disappearing.",
    ],
  },
  {
    version: "0.36.0",
    date: "July 31, 2026",
    highlights: [
      "Chappi now slides in beside your releases instead of taking over the screen — open it from the catalog, keep working with your releases in view, and expand to full screen whenever you want more room.",
    ],
  },
  {
    version: "0.35.6",
    date: "July 31, 2026",
    highlights: [
      "The Chappi cursor now stays put — it used to flip back to the regular pointer over buttons and links, and now it doesn't. Fixed a glitch where opening a pop-up (creating a release, deleting one, and a few others) would turn the whole dimmed screen into a hand cursor.",
    ],
  },
  {
    version: "0.35.5",
    date: "July 31, 2026",
    highlights: [
      "Signing in now lands you on Chappi first — ask it anything or jump straight into a quick action, with your releases and tasks always one tap away in the top bar.",
    ],
  },
  {
    version: "0.35.4",
    date: "July 31, 2026",
    highlights: [
      "Invite prompts now say what they mean: \"Invite artists, freelancers and team members\" replaces the narrower \"Invite teammates\" everywhere it appears — Settings, the release page, Chappi's invite banner, and after your first release.",
    ],
  },
  {
    version: "0.35.3",
    date: "July 31, 2026",
    highlights: [
      "Activities: the Status and Assignee fields dropped their Beta tags — they're no longer experimental.",
      "Attachments are temporarily hidden from activities while we rework file uploads. Nothing you'd already attached was touched or deleted, it's just hidden from the app for now.",
    ],
  },
  {
    version: "0.35.2",
    date: "July 31, 2026",
    highlights: [
      "The Chappi mark now replaces your mouse pointer while you work in Urganize on a computer. Buttons and text fields still show their usual cursors, and phones and tablets are unaffected.",
    ],
  },
  {
    version: "0.35.1",
    date: "July 31, 2026",
    highlights: [
      "Choosing \"I prefer to start from scratch\" during sign-up now does what it says: your first release starts with an empty activity list instead of the pre-built rollout plan.",
    ],
  },
  {
    version: "0.35.0",
    date: "July 31, 2026",
    highlights: [
      "Press kits are here: generate a shareable, branded link for any release straight from its page — cover art, release details, and photos pull in automatically, and the kit updates itself whenever the release changes. Send it to press, curators, or bookers with one link.",
    ],
  },
  {
    version: "0.34.1",
    date: "July 31, 2026",
    highlights: [
      "Loading screens on the release and press kit pages now match what actually appears, so content no longer jumps around as the page finishes loading.",
    ],
  },
  {
    version: "0.34.0",
    date: "July 30, 2026",
    highlights: [
      "Simplified how you move around a release: the left side menu is gone. Every release page now has a plain Back link at the top, and the release page itself carries direct buttons to its content calendar and press kit — one click, nothing to collapse or expand.",
    ],
  },
  {
    version: "0.33.5",
    date: "July 30, 2026",
    highlights: [
      "The release menu now has a Dashboard link at the top, so you can always get back home from any release page — no more hunting for the way out.",
      "Selecting a release on the dashboard now shows an Overview button that opens the release page directly.",
      "Cleaned up the release menu: the collapse control is a small icon instead of looking like another menu item, and the duplicate Content calendar button is gone from the release header.",
    ],
  },
  {
    version: "0.33.4",
    date: "July 30, 2026",
    highlights: [
      "The press kit is now one click from your dashboard — select a release and the Press kit button appears right next to Calendar and Files, no need to open the release first.",
    ],
  },
  {
    version: "0.33.3",
    date: "July 29, 2026",
    highlights: [
      "Removed an old, half-finished setup screen that could take over the dashboard and leave you stuck with no way out. Signing up walks through the proper setup flow, and joining a workspace by invite now takes you straight in.",
    ],
  },
  {
    version: "0.33.2",
    date: "July 29, 2026",
    highlights: [
      "Fixed invited teammates getting stuck on a first-time setup screen after accepting their invite — joining a workspace now takes you straight to the dashboard. Anyone already stuck is freed the next time they open the app.",
    ],
  },
  {
    version: "0.33.1",
    date: "July 26, 2026",
    highlights: [
      "Fixed Chappi's message box floating mid-screen on mobile — it now sits properly at the bottom of the page.",
    ],
  },
  {
    version: "0.33.0",
    date: "July 26, 2026",
    highlights: [
      "The AI status update generator is now live — read your release's current state and get a one-paragraph update ready to share.",
      "AI rollout planning and status updates now retry more reliably behind the scenes, so a slow response is far less likely to show as an error.",
    ],
  },
  {
    version: "0.32.0",
    date: "July 26, 2026",
    highlights: [
      "The AI rollout planner is now live — when you create a release with a rollout plan, it's tailored by AI to your release's context, ready to review and edit before you commit it.",
    ],
  },
  {
    version: "0.31.1",
    date: "July 23, 2026",
    highlights: [
      "The notifications panel dropped its Beta tag — the label stays in Settings only.",
    ],
  },
  {
    version: "0.31.0",
    date: "July 23, 2026",
    highlights: [
      "Urganize now cheers you on — a welcome when you arrive, a momentum nudge while you work, and a gentle reminder if you've been away a while, all as notifications on devices that have them on.",
      "\"What's new\" announcements now only cover real feature releases — no more cards about tiny fixes.",
      "Signing in is smoother for Google accounts — the password option always stays available alongside the Google suggestion.",
    ],
  },
  {
    version: "0.30.1",
    date: "July 23, 2026",
    highlights: [
      "The Chappi dock's welcome now sits at the bottom of the panel, right above the footer — no more floating mid-air with empty space beneath it.",
    ],
  },
  {
    version: "0.30.0",
    date: "July 23, 2026",
    highlights: [
      "A \"What's new\" note now greets you on your first visit after an update — everything that shipped since you last looked, in one place. Dismiss it and it stays gone until the next release.",
      "Announcements: the team can now send a push notification to every user's device — release notes, tips, and news will start arriving where you are.",
    ],
  },
  {
    version: "0.29.0",
    date: "July 23, 2026",
    highlights: [
      "Creating a release now starts with a choice: begin from the proven rollout plan (recommended) or from a blank release you build up yourself — two clear cards, pick one, then name and date it.",
      "Settings gains a Back button that returns you to exactly where you came from — the release you were on, your scoped workspace, or Chappi.",
    ],
  },
  {
    version: "0.28.3",
    date: "July 23, 2026",
    highlights: [
      "Loading screens across Settings now mirror your real data — the Teammates and Releases lists show exactly as many placeholder rows as you have members and releases, so content lands where the placeholders stood.",
      "The single-release loading screen matches its final shape too: back button, motion bar, and side rails sized to your roster.",
      "Notifications are now marked Beta in Settings and in the notifications panel.",
    ],
  },
  {
    version: "0.28.2",
    date: "July 23, 2026",
    highlights: [
      "Invite links are now short and clean — app.urganize.app/join/… with a small code, instead of the long token they used to carry. Old links keep working until they expire.",
    ],
  },
  {
    version: "0.28.1",
    date: "July 23, 2026",
    highlights: [
      "Sharing an app.urganize.app link now shows the current branded card — the share image was stale and its URL could resolve to an address social crawlers couldn't reach.",
    ],
  },
  {
    version: "0.28.0",
    date: "July 23, 2026",
    highlights: [
      "Invites now come in two kinds: a Teammate sees your whole catalog, while an Artist only ever sees their own releases — pick Artist when inviting (by email or link) and choose which artist they are.",
      "Artist-scoped access is enforced everywhere: the catalog, release pages, and activities all show an invited artist only their own work.",
    ],
  },
  {
    version: "0.27.0",
    date: "July 23, 2026",
    highlights: [
      "Invite by link: don't have someone's email? Copy invite link from Settings → Teammates and share it anywhere — anyone who opens it joins your team as a Team Member. Links stay valid for 7 days.",
      "Only you can delete your releases — teammates never see a Delete button on releases they don't own.",
      "Team invites are now marked Beta while we refine collaboration.",
    ],
  },
  {
    version: "0.26.1",
    date: "July 23, 2026",
    highlights: [
      "The Releases list in Settings no longer labels every release \"draft\" — the status shows only once a release has actually moved past its starting point, same as the catalog cards.",
    ],
  },
  {
    version: "0.26.0",
    date: "July 23, 2026",
    highlights: [
      "Team collaboration now actually works end to end: when a teammate accepts your invite, they see your whole catalog — every release and its activities — and can open and work them.",
      "Your Teammates list now shows who's still pending — an Invited badge sits next to anyone who hasn't accepted yet, and disappears the moment they join.",
      "Teammates can see the team too: everyone gets a read-only Teammates list in Settings, so an invitee can confirm they've been added.",
      "The role you pick when inviting now counts: Manager can manage the team, Artist and Team Member can work activities, and Viewer is read-only everywhere.",
      "An invitee's team now defaults to the workspace that invited them, not an empty personal one.",
    ],
  },
  {
    version: "0.25.2",
    date: "July 23, 2026",
    highlights: [
      "Teammate invite links now always point at app.urganize.app — invitees land straight on the accept page instead of hitting a hosting login wall. Re-send any invite that didn't work.",
    ],
  },
  {
    version: "0.25.1",
    date: "July 23, 2026",
    highlights: [
      "No more phantom scrollbar — when your catalog fits the screen, the page doesn't scroll at all, and when it doesn't fit, you scroll without a visible scrollbar, like a native app.",
      "Notifications can now be cleared — a Clear button in the notifications panel empties it in one tap.",
    ],
  },
  {
    version: "0.25.0",
    date: "July 23, 2026",
    highlights: [
      "Chappi chats can now be pinned to a specific release — a picker under the message box lists your releases by name (with their cover art), so instructions like \"add an activity\" land on the release you chose without naming it every time.",
    ],
  },
  {
    version: "0.24.1",
    date: "July 23, 2026",
    highlights: [
      "The activity view now names the release it belongs to, right between the status and the due date — no more guessing which release an activity is part of.",
      "Long activity titles now wrap onto the next line on mobile instead of getting cut off at the edge of the screen.",
      "On Android, the keyboard no longer covers the Chappi message box while you type — the page now makes room for it.",
    ],
  },
  {
    version: "0.24.0",
    date: "July 23, 2026",
    highlights: [
      "The app now remembers what it showed you — your catalog, activities, and settings paint instantly on every visit, like a proper mobile app, refreshing quietly in the background.",
      "The mobile catalog is redesigned: release cards are centered at a comfortable size instead of edge to edge, and a single release fits your screen with no scrolling.",
      "The motion tracker now shows on mobile too when you open a release.",
      "Chappi on mobile behaves like a real chat app — the page stays put, the conversation scrolls on its own, the message box stays pinned, and tapping it no longer zooms the screen.",
      "The account button in the top bar is now a clean profile icon instead of your initials, drawn in the house style.",
    ],
  },
  {
    version: "0.23.2",
    date: "July 23, 2026",
    highlights: [
      "Fixed the single-release view scrolling the whole page when your roster is large — the screen now stays locked and the release rails scroll on their own, which also makes switching between releases reliable.",
      "The motion tracker is back on the single-release view — a progress bar with the done count (like 2 of 64) sits right at the top, next to a smaller back button.",
      "Chappi's welcome screen is simpler — straight to the greeting and the message box.",
    ],
  },
  {
    version: "0.23.1",
    date: "July 23, 2026",
    highlights: [
      "Opening a release now keeps everything on one screen — the page stays put and the activities list scrolls on its own, so the back button and your other releases never leave view.",
      "The release row at the top of the app is cleaner: just the cover art, release name, and date.",
      "Chappi conversations now start from the bottom, right above the message box — like every chat you already use.",
    ],
  },
  {
    version: "0.23.0",
    date: "July 23, 2026",
    highlights: [
      "Appearance gains a System option — pick it and the app follows your device's light/dark setting automatically, switching live the moment your device does.",
      "Release statuses now carry a Beta tag everywhere they appear (release cards, the release page, and the activity view) while we refine how statuses work.",
    ],
  },
  {
    version: "0.22.3",
    date: "July 23, 2026",
    highlights: [
      "The new-release form is down to its essentials — the rollout-timing explainer now appears after you create the release, inside the dismissible guide, where it's actually useful.",
    ],
  },
  {
    version: "0.22.2",
    date: "July 23, 2026",
    highlights: [
      "The release row in the top bar now reads like the card it replaced — artist name over the title, with the release date alongside.",
      "The help menu's icons joined the house set: a tour laminate for Docs, a studio microphone for Contact, a speaker cab for Community.",
      "Trimmed the notifications setting to a single quiet status line once it's on.",
    ],
  },
  {
    version: "0.22.1",
    date: "July 23, 2026",
    highlights: [
      "Opening a release now puts the whole release — cover art and all — into the top bar, and the activities take over the page. The duplicate \"showing activities for\" pill is gone.",
      "New in-house icons for Settings (mixing-desk faders) and Sign out (an eject button) — no more stock gear and door.",
      "The create-activity window lost its redundant \"Quick Create\" label.",
    ],
  },
  {
    version: "0.22.0",
    date: "July 23, 2026",
    highlights: [
      "Tasks are now called activities everywhere — and the release you're working on now lives in the top bar (artist and title), so the page below is all activities and actions.",
      "The activity view got simpler: comments are gone, and attachments and assigning are marked Beta while we refine them.",
      "Chatting with Chappi now feels like a proper messenger: a clean centered conversation, your messages in bubbles, replies as plain text, and the writing box always at the bottom — no more full-width sprawl or name labels.",
      "Loading screens now mirror your own catalog — if you have two releases, you see two loading cards, centered, exactly where they'll land. Settings now lives in one place: your profile menu.",
    ],
  },
  {
    version: "0.21.0",
    date: "July 23, 2026",
    highlights: [
      "A full visual pass in the house style: soft rounded corners are back everywhere, the top bar went quiet and calm, and the help \"?\" moved up beside the rest of the navigation.",
      "Hand-drawn icons throughout the chrome — a record crate for your releases, a waveform bubble for Chappi, a live-signal mark for notifications — instead of the stock icons every app uses.",
      "The release picker in quick-create now shows cover art (or the Urganize mark) instead of letter initials, the releases view dropped its redundant heading, and the release page's list is now titled Activities.",
    ],
  },
  {
    version: "0.20.0",
    date: "July 23, 2026",
    highlights: [
      "The new-release form is shorter — the description field is gone. Once you're in your new release, a quick dismissible guide points you to what matters: the tasks below.",
      "The quick \"create task\" shortcut (press C) no longer shows a leftover Tag picker from an earlier version of the app.",
      "The releases view now centers your releases as a group instead of bunching them to one side when you have fewer than a full row.",
    ],
  },
  {
    version: "0.19.3",
    date: "July 23, 2026",
    highlights: [
      "The release completion label now reads \"Motion\" — how much of the release is moving, at a glance.",
    ],
  },
  {
    version: "0.19.2",
    date: "July 23, 2026",
    highlights: [
      "Releases without cover art now wear the Urganize \"U\" mark as their default artwork — on every release, past and future, in both light and dark mode — until you upload the real thing.",
      "Fixed Settings sections randomly flashing back to their loading state while you were mid-page — background session refreshes no longer disturb what's already on screen.",
      "Appearance and Notifications now sit side by side on one row, and the redundant \"Account / Settings\" heading is gone from the top bar.",
    ],
  },
  {
    version: "0.19.1",
    date: "July 23, 2026",
    highlights: [
      "Task edits now show up in your list instantly — reassign or unassign someone, rename a task, or move a date, and the row updates the moment you do it. New and deleted tasks appear and disappear right away too.",
      "Loading screens across the app now match what actually loads, so pages land in place instead of jumping around.",
    ],
  },
  {
    version: "0.19.0",
    date: "July 23, 2026",
    highlights: [
      "Real notifications are here. Turn them on in Settings and your device tells you when a task is assigned to you, when something's due, and when a task changes status — even when the app is closed.",
      "Urganize is now installable on your phone: add it to your home screen and it opens like an app, notifications included.",
    ],
  },
  {
    version: "0.18.1",
    date: "July 23, 2026",
    highlights: [
      "Settings polish: your artist now leads the page — it's the first thing you see. Password and session controls moved to the bottom where account plumbing belongs.",
      "The light/dark mode switch is now a proper two-sided control with a sliding highlight — tap the side you want.",
      "Removed the workspace logo and notification-preferences sections; neither was earning its place.",
    ],
  },
  {
    version: "0.18.0",
    date: "July 23, 2026",
    highlights: [
      "Tasks now open in a smooth pop-up right over your list instead of taking over the whole page — close it and you're exactly where you left off.",
      "Simplified the task view: priorities, tags, and the activity feed are gone. A task is its title, status, owner, due date, notes, files, and comments.",
      "Settings got a full redesign: one clean page with clear sections instead of scattered boxed cards.",
    ],
  },
  {
    version: "0.17.2",
    date: "July 23, 2026",
    highlights: [
      "Cleaned up the task panel: the priority and status filter dropdowns are gone — the task sections themselves are the filter now.",
      "The help menu's community link is now simply called Community, and the keyboard shortcuts panel was removed.",
    ],
  },
  {
    version: "0.17.1",
    date: "July 23, 2026",
    highlights: [
      "Task sections now only show up when there's something in them. No more empty \"Overdue (0)\" or \"Upcoming (0)\" rows — a section appears when a task moves into it and disappears when it empties out.",
    ],
  },
  {
    version: "0.17.0",
    date: "July 23, 2026",
    highlights: [
      "Urganize is now free to use — no trial countdown, no payment lock. We're setting up every team personally, so just sign in and run your releases.",
      "Signing in now lands you straight on your releases. Chappi is still one tap away in the top bar.",
      "The content calendar is now marked Beta while we keep improving it.",
    ],
  },
  {
    version: "0.16.4",
    date: "July 22, 2026",
    highlights: [
      "Removed the Files section from the release page and the workspace while we rework file storage. Nothing you've uploaded was touched or deleted, it's just hidden from the app for now.",
    ],
  },
  {
    version: "0.16.3",
    date: "July 21, 2026",
    highlights: [
      "Deleting a release now lives in one place: Settings, where you can see every release and delete deliberately. Removed the quick-delete icon from the workspace so it's no longer one accidental tap away.",
    ],
  },
  {
    version: "0.16.2",
    date: "July 21, 2026",
    highlights: [
      "Settings page cleanup: inviting a teammate now shows a real, shareable invite link (instead of just claiming it was sent), and newly invited teammates show up in the list right away, no refresh needed. Fixed the Remove button showing up next to your own name in the teammates list. The loading screen also no longer flashes the wrong layout while your account loads.",
    ],
  },
  {
    version: "0.16.1",
    date: "July 20, 2026",
    highlights: [
      "Files now have their own page instead of sitting nested under the task list, so it's clear they're their own thing.",
    ],
  },
  {
    version: "0.16.0",
    date: "July 20, 2026",
    highlights: [
      "Gave the app a full visual refresh: a new color palette, new typography, and clearer, plainer wording throughout.",
    ],
  },
  {
    version: "0.15.1",
    date: "July 20, 2026",
    highlights: [
      "Fixed the first-time setup wizard incorrectly appearing for existing accounts, and gave it a solid background so it no longer overlaps the page behind it.",
    ],
  },
  {
    version: "0.15.0",
    date: "July 20, 2026",
    highlights: [
      "Content calendars: plan social posts per release, one platform account at a time, on a real month grid with a mobile-friendly list view. (Rolling out behind a flag.)",
    ],
  },
  {
    version: "0.14.3",
    date: "July 15, 2026",
    highlights: [
      "Chappi now carries a Beta badge everywhere it appears, so it's clear the assistant is still finding its feet.",
      "Chappi's welcome message now speaks to what it's really for: taking the release off your mind, then inviting you to tell it what's going on.",
    ],
  },
  {
    version: "0.14.1",
    date: "July 15, 2026",
    highlights: [
      "Coming back to Urganize now takes you straight in — if you're already signed in, you no longer catch a flash of the login screen on the way.",
    ],
  },
  {
    version: "0.14.0",
    date: "July 15, 2026",
    highlights: [
      "Chappi now floats with you: an Ask Chappi button at the bottom-right of every page opens a chat panel that follows you around the app — same conversation as the full Chappi page, expandable any time, with a direct line to the founder in its footer. (Rolling out with Chappi.)",
      "Chappi's home got a polish: the greeting now sits centered in the page, and managers get a one-tap banner for inviting their teammates.",
    ],
  },
  {
    version: "0.13.1",
    date: "July 15, 2026",
    highlights: [
      "Signing in now lands you on Chappi first — a centered ask-anything box with your quick actions right under it — and a new workspace icon in the top bar keeps your releases and tasks one click away. (Rolling out with Chappi.)",
    ],
  },
  {
    version: "0.13.0",
    date: "July 14, 2026",
    highlights: [
      "Chappi now has its own page, reached from a new icon in the top bar, with a real scrolling conversation — a long chat no longer crowds your releases and tasks.",
    ],
  },
  {
    version: "0.11.0",
    date: "July 13, 2026",
    highlights: [
      "Promo codes: partner workshops and programs can now give their participants a free window of full Urganize access — redeem a code, no card required.",
    ],
  },
  {
    version: "0.10.0",
    date: "July 13, 2026",
    highlights: [
      "Chappi, a conversational assistant, is now built into the dashboard as the front door — ask about your releases and take actions in plain language. (Rolling out behind a flag; falls back to a command bar until fully switched on.)",
      "Added light mode across the app, with automatic system-preference detection and a manual toggle.",
      "Faster load times — cut the app's initial load size by over 20%.",
      "Task completion is now instant and reliable, with no more silent failures when checking off a task.",
      "Fixed notification bugs, including notifications not clearing when their task was deleted.",
    ],
  },
  {
    version: "0.9.0",
    date: "May–June 2026",
    highlights: [
      "The release workspace: create a release and instantly get a hand-crafted 64-task rollout plan spanning 11 weeks of pre- and post-release work.",
      "Tasks with assignees, due dates, priority, and dependencies — blocked tasks are clearly marked and unlock automatically as their blockers complete.",
      "File and asset attachments — upload artwork, masters, contracts, and split sheets straight to a release.",
      "Event milestones — listening parties, video shoots, and release day appear as dated points on the release timeline.",
      "Consolidated everything onto one workspace screen: releases and their tasks together, instead of separate pages.",
      "Real-time notifications with a notification bell.",
      "Recurring monthly and annual subscriptions plus a Label plan, with Naira and USD billing.",
      "28-day free trial (no card required) for every new account.",
      "Google sign-in alongside email and password, and end-to-end team invites.",
      "Workspace logo that automatically fills in as placeholder cover art for releases without their own artwork.",
      "Direct WhatsApp line to the founder for support.",
      "Built (behind flags, pending activation) an AI rollout planner and an AI status-update generator.",
    ],
  },
  {
    version: "0.8.0",
    date: "April 2026",
    highlights: [
      "Rebuilt Urganize on a clean, modern foundation.",
      "Introduced the first combined releases + tasks workspace.",
      "Added a guided onboarding flow for new accounts.",
      "Added in-app support so you can reach the founder directly.",
    ],
  },
];

// Single source of truth for the current version — derived from the ledger
// so it can never drift from the latest release entry.
export const CURRENT_VERSION = changelog[0].version;

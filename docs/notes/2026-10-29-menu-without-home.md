# The menu without Home (2026-10-29, v1.213.0, no flag, #876)

Oyin approved the mock on 2026-10-29: Home leaves the menu, which now reads Artists, UrgAns, Team everywhere.

**What changed**
- `lib/shell-nav.ts`: no `home` area. Areas are catalogue (Artists), urgans, team, then the paused ones. The phone bottom bar is Artists, UrgAns, Team, More; Team comes off More and is left off the bar only when a role view tucks it. The unread dot sits on the Artists tab.
- Swipe nav (`lib/swipe-nav.ts`, on for every phone): tabs are Artists, UrgAns, Team. The pager draws `TeamPageClient` in place of Home. Back arrows go to Artists.
- `HOME_PATH` (`lib/home-path.ts`) and `HOME_HREF` are `/dashboard/artists`, so sign-in and every post-auth entry land on Artists. `/dashboard/home` redirects to Artists for old links, emails and installed apps.
- Native bridge `SHELL_HOME_PATH` is `/dashboard/artists` (Android back exits there). Installed apps keep the old value until their next build; the redirect covers them.
- The phone bell (`HomeBell`) sits in the Artists page header. Hidden in the swipe nav, as before.
- Go keys: G C Artists, G U UrgAns, G T Team. G H is gone.
- Home's first-days steps, NPS prompt, persona ask, rollout offer and today's posts card no longer show anywhere. Their code is kept (`HomePageClient` and `components/home/*`), unused by any route.

**Not verified:** nothing was looked at in a browser. Unit tests and `tsc` pass; 11 unrelated guard tests fail on this Windows checkout's CRLF line endings, as on main.

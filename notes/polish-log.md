# Polish log

The product-polish loop. One entry per fix, in order. Each is written before the fix (what felt wrong, why it matters to a manager) and gets a "Shipped" line when it merges. Screenshots for each fix live in `notes/polish-shots/<fix>/`.

How the screens are checked: the app runs on a throwaway local database (Postgres, PostgREST and a fake sign-in layer, no production credentials), seeded with a made-up team of three artists, twelve rollouts and three people. It is driven at 390px (phone) and 1440px (desktop) in light and dark. Nothing here touches production data.

## 1. "Invite your team" shows to teams that already have one

- **Felt wrong:** a manager on a three-person team opens Home on desktop and still sees "Get more out of Urganize by inviting your team". The only memory it has is "closed in this browser", so it comes back on every new phone, laptop or cleared browser. Screenshot: `notes/polish-shots/invite-banner/before-3-person-team.png`.
- **Why it matters:** it tells a manager to do something they have already done, which reads as the app not knowing them. Nagging is one of the quickest ways to teach somebody to ignore the app's own prompts.
- **Shipped:** the strip now shows only to a manager whose team is still just themselves, and waits until the team size is known so it never flashes. See `lib/invite-banner.ts`.

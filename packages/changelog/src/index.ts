// The areas /changelog filters by (2026-10-19, URG-388). One per entry.
export const RELEASE_TAGS = ["Rollouts", "Pitching", "Team", "AI", "Account", "App"] as const;
export type ReleaseTag = (typeof RELEASE_TAGS)[number];

// Small pictures the in-app What's new panel can draw beside an entry (#977).
// Each name maps to a drawing in apps/web (components/app/WhatsNewStills.tsx),
// built as markup in the app's own colours, so it follows light and dark and
// costs no image bytes. Add a name here and its drawing there together.
export const RELEASE_STILLS = ["pay-your-way", "plans", "photo"] as const;
export type ReleaseStill = (typeof RELEASE_STILLS)[number];

export type Release = {
  version: string;
  date: string;
  highlights: string[];
  // /changelog reads the ledger as features, PostHog-style (URG-388):
  // `title` is the entry's plain heading (every x.y.0 carries one; an entry
  // without one folds into its month's "smaller improvements"), `tag` is its
  // one area for the filter (an untagged entry counts as App), and
  // `listed: false` keeps housekeeping (site copy, metadata, internal
  // monitoring) off the public page. Since the 2026-10-19 investor curation
  // (URG-393) only release-planning milestones stay listed: polish, nav
  // reshuffles, pricing churn, features later cut and personal-name examples
  // are listed: false (kept here, never deleted). New entries: list only what
  // a strategic investor should see. Optional, so older consumers (the in-app
  // What's new, CURRENT_VERSION) are unchanged. New minor releases: add a
  // title and a tag.
  title?: string;
  tag?: ReleaseTag;
  listed?: boolean;
  // A small picture of the change for the in-app What's new panel (#977).
  // Optional: entries without one show text only.
  still?: ReleaseStill;
  // One picture of the screen a titled entry changed, shown under its lead
  // line on the public /changelog page (#967). Separate from `still`, which
  // the in-app panel draws as markup: the site shows image files, named by
  // version in apps/homepage/public/images/changelog/: <version>.webp and
  // <version>-dark.webp (desktop), <version>-phone.webp and
  // <version>-phone-dark.webp (phones). Sizes are the files' pixel sizes. No
  // siteStill, no picture: the entry reads as before.
  siteStill?: SiteStill;
};

export type SiteStill = {
  alt: string;
  width: number;
  height: number;
  phoneWidth: number;
  phoneHeight: number;
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
// 1.124.2 (internal admin scoreboard table, URG-267) was pulled on
// 2026-10-14 by founder call: internal admin work gets no entry.
//
// Versions before v0.10.0 are reconstructed milestones — the product was
// informally versioned until then. From v0.10.0 on, every release increments
// per the policy in CLAUDE.md.
export const changelog: Release[] = [
  {
    version: "1.261.4",
    tag: "App",
    date: "November 10, 2026",
    highlights: [
      "Picking a plan while you are on Free or a trial now takes you to pay. Before, it showed an error and stopped.",
    ],
  },
  {
    version: "1.261.3",
    tag: "AI",
    date: "November 10, 2026",
    highlights: [
      "The soft blur above the UrgAns reply box is shorter now, so you see more of the chat on your phone.",
      "Tap a song's smart link to copy it. The Copy and Share buttons are gone.",
    ],
  },
  {
    version: "1.261.2",
    title: "A clearer way to say what Urganize does",
    tag: "App",
    date: "November 9, 2026",
    highlights: [
      "Urganize now introduces itself as an app that helps artists, managers and record labels plan new music and keep track of every task.",
      "UrgAns, the sign-in page and our emails describe it the same way.",
    ],
  },
  {
    version: "1.261.1",
    title: "Solo Plus, everywhere it belongs",
    tag: "Account",
    date: "November 8, 2026",
    highlights: [
      "If you leave Solo Plus, we can offer you Solo instead.",
      "Outside Nigeria, Solo Plus is $19 a month.",
    ],
  },
  {
    version: "1.261.0",
    title: "A Free plan, and Solo Plus",
    tag: "Account",
    date: "November 8, 2026",
    highlights: [
      "There is a Free plan now. If you have not picked a plan, you keep using Urganize with 1 artist, 1 rollout at a time and 30 AI credits a month.",
      "New Solo Plus plan, ₦12,000 a month: 3 rollouts at a time, 400 AI credits a month, and your singles and EPs sent to stores.",
      "Plans now come in two groups: Just you, and Your team. Manager is now called Pro, and Pro is now called Pro Plus. Your price and what you get did not change.",
    ],
  },
  {
    version: "1.260.0",
    title: "Paste an artist's link",
    tag: "Rollouts",
    date: "November 8, 2026",
    highlights: [
      "Can't find your artist when you search? Paste the link to their artist page on Apple Music or Deezer instead.",
      "It works when you add an artist and when Home asks you to link one.",
    ],
  },
  {
    version: "1.259.0",
    title: "Change a release date",
    tag: "Rollouts",
    date: "November 8, 2026",
    highlights: [
      "You can change a rollout's release date. Open the rollout menu and pick Change release date, or on your phone tap the date under the title.",
      "Before you save, it tells you how many activities will move with the date. Done ones and ones you added yourself stay where they are.",
    ],
  },
  {
    version: "1.258.0",
    title: "Prices in US dollars outside Nigeria",
    tag: "Account",
    date: "November 8, 2026",
    highlights: [
      "Outside Nigeria, plans are in US dollars: Solo $9, Manager $29 and Pro $79 a month. A year costs ten months.",
      "Pay by card, or with USDT or USDC.",
      "More AI credits are $2 for 100 outside Nigeria.",
      "Label has no set price any more. It is priced with you, in Naira or dollars.",
    ],
  },
  {
    version: "1.257.0",
    title: "Add-ons, singles and more AI credits",
    tag: "Account",
    date: "November 7, 2026",
    highlights: [
      "On Solo and Manager you can send a single to stores for ₦2,000. Your own TRM account still works too.",
      "Add more to your plan in Settings, Plan: extra people for ₦3,000 a month, extra artists for ₦5,000 a month, or distribution for an artist.",
      "Every plan gets more AI credits a month: Solo 150, Manager 450, Pro 900, Label 2,000.",
      "Run out of AI credits? Set a monthly cap and AI keeps going, from ₦15 a credit. It stops at your cap.",
    ],
  },
  {
    version: "1.256.0",
    title: "Send EPs and albums to stores",
    tag: "Rollouts",
    date: "November 7, 2026",
    highlights: [
      "A rollout can now hold several songs. Add a second song and it becomes an EP; add a seventh and it is an album.",
      "Each song gets its own title, ISRC, explicit answer and, if you want, its own credits.",
      "Send them to stores with one master per song. EPs are included on Pro and Label; albums when you pay yearly.",
    ],
  },
  {
    version: "1.255.0",
    title: "New plans and prices",
    tag: "Account",
    date: "November 7, 2026",
    highlights: [
      "Solo is ₦5,000 a month and Manager is ₦15,000 a month, with more people and credits than before.",
      "There's a new plan, Pro, at ₦40,000 a month. It covers 5 artists, 10 people and sending music to stores.",
      "Pay for a year and you get two months free on any plan.",
      "Pro and Label include sending singles to stores. On Solo and Manager, send from your own TRM account.",
      "Running a label? Label starts at ₦100,000 a month, and we set it up with you.",
    ],
  },
  {
    version: "1.254.5",
    tag: "Rollouts",
    date: "November 6, 2026",
    highlights: [
      "The buttons at the top of a released song work again. They were all copying the smart link.",
      "The artist list on Home is simpler: the Drops column is gone.",
    ],
  },
  {
    version: "1.254.4",
    tag: "Rollouts",
    date: "November 6, 2026",
    highlights: [
      "Songs under Out now keep their task count, so you can still track what's left after release.",
    ],
  },
  {
    version: "1.254.3",
    title: "Pay the cheaper way",
    tag: "Account",
    date: "November 6, 2026",
    highlights: [
      "In Nigeria, you can pay for a plan by card or bank transfer again.",
      "Outside Nigeria, you pay in your own currency, by mobile money or with crypto.",
    ],
  },
  {
    version: "1.254.2",
    title: "Bought credits land",
    tag: "Account",
    date: "November 6, 2026",
    highlights: [
      "When you buy UrgAns credits, they now show up on your account straight away.",
    ],
  },
  {
    version: "1.254.1",
    tag: "Rollouts",
    date: "November 6, 2026",
    highlights: [
      "Opening a rollout that's out now also looks for the song, so its smart link shows up there, not only on Home.",
    ],
  },
  {
    version: "1.254.0",
    title: "Out now has its place",
    tag: "Rollouts",
    date: "November 6, 2026",
    highlights: [
      "On release day, a song moves from Rolling out to the top of Out now on the artist page, with its smart link.",
      "Open a rollout once the song is out and its smart link is right at the top, ready to copy or share.",
    ],
  },
  {
    version: "1.253.0",
    title: "Release day runs itself",
    tag: "Rollouts",
    date: "November 6, 2026",
    highlights: [
      "When your artist is linked to streaming, we find the song on release day and make the smart link. Your team gets an email that it's out, with the link.",
      "Linking an artist also fills in the UPC, ISRC and smart link for their songs that are already out.",
      "Copy and share now sit inside the link on the Out now card.",
    ],
  },
  {
    version: "1.252.0",
    title: "Link your artists to streaming",
    tag: "Rollouts",
    date: "November 6, 2026",
    highlights: [
      "Link each artist to their streaming page once. Home asks about artists who are not linked yet, with our best guess ready.",
      "Once an artist is linked, we find their new songs on their own page, so your smart link gets the right UPC and ISRC.",
    ],
  },
  {
    version: "1.251.0",
    tag: "App",
    date: "November 6, 2026",
    highlights: [
      "When a song comes out, it shows at the top of your home screen for a week, with a button to copy its smart link.",
      "No UPC or ISRC yet? We find your song on streaming and ask if it's the right one. Say yes and we make the smart link for you.",
    ],
  },
  {
    version: "1.250.0",
    tag: "App",
    date: "November 4, 2026",
    highlights: [
      "On your phone, the box on a project page now opens the AI right there, over the project. It keeps its own chat for each project.",
      "When the AI adds something to a project, it offers the next jobs as buttons. Tap to add them, or Not now.",
    ],
  },
  {
    version: "1.249.0",
    tag: "App",
    date: "November 4, 2026",
    highlights: [
      "When you plan a project's rollout, its open tasks move into Pre-production with their owners and days. Nothing to copy over.",
      "Start the next one starts a project now. Pick the artist, say if it is just an idea or already being made, and you land on its page.",
      "A week after a release comes out, the artist page asks what is next for them, so the next project starts while the last one is fresh.",
    ],
  },
  {
    version: "1.248.0",
    tag: "App",
    date: "November 4, 2026",
    highlights: [
      "A project has its own tasks now. Add the jobs before the rollout exists, tick them off, and tap one to set who does it and when.",
      "Each project suggests what to do next, like finishing a song that is in the mix. Tap Add to make it a task. The AI can read your project and add tasks too.",
    ],
  },
  {
    version: "1.247.0",
    tag: "App",
    date: "November 4, 2026",
    highlights: [
      "A project can start as just an idea. Write the idea down, then tap Start making when the work begins. It also moves on by itself when a song starts recording or you book a session.",
      "The artist page marks a project that is still an idea, so you can see at a glance which artists have something on the way.",
    ],
  },
  {
    version: "1.246.2",
    tag: "App",
    date: "November 4, 2026",
    highlights: [
      "The Up next card on an artist's page is a plain card now, without the green stripe down its side.",
    ],
  },
  {
    version: "1.246.1",
    tag: "App",
    date: "November 3, 2026",
    highlights: [
      "The artist page fits your phone. The Songs out before Urganize card and the Out now rows no longer squash their words, and the pencil on a cover is a small chip, not a shade over the art.",
    ],
  },
  {
    version: "1.246.0",
    title: "Hold the mic to talk",
    tag: "AI",
    date: "November 3, 2026",
    highlights: [
      "On your phone, hold the mic to talk to AI. Let go and it sends. Slide left to cancel.",
      "A quick tap on the mic still puts your words in the box first.",
    ],
  },
  {
    version: "1.245.1",
    tag: "AI",
    date: "November 3, 2026",
    highlights: [
      "The assistant is now just called AI. Same helper, new name, and your credits are AI credits.",
    ],
  },
  {
    version: "1.245.0",
    title: "A new sign-in page",
    tag: "Account",
    date: "November 3, 2026",
    highlights: [
      "The sign-in page is new: sign in with Google or your email, and see the plans and answers to common questions below.",
      "Each plan now says what it does for you, wherever you are in your career.",
    ],
  },
  {
    version: "1.244.0",
    title: "A lower price for your first month",
    tag: "Account",
    date: "November 2, 2026",
    highlights: [
      "Emerging is now ₦4,000 a month, and your first month is ₦2,600.",
      "Pro is now ₦40,000 a month, and your first month is ₦24,000.",
      "Paying yearly is ₦40,000 for Emerging and ₦400,000 for Pro.",
    ],
  },
  {
    version: "1.243.4",
    tag: "App",
    date: "November 2, 2026",
    highlights: [
      "New icon on your browser tab: the white Urganize mark on black.",
    ],
  },
  {
    version: "1.243.3",
    tag: "Rollouts",
    date: "November 2, 2026",
    highlights: [
      "On a computer, the brief has its back button again, so you can get back to the plan.",
    ],
  },
  {
    version: "1.243.2",
    tag: "App",
    date: "November 2, 2026",
    highlights: [
      "On a computer, your photo is only at the top right now, and the bell is gone from the top bar.",
      "Settings now says Sign out.",
    ],
  },
  {
    version: "1.243.1",
    tag: "App",
    date: "November 2, 2026",
    highlights: [
      "On a computer, your photo now opens Settings over the whole screen. Close it with the X at the top right.",
      "Pick which artist you see from the top of Settings.",
    ],
  },
  {
    version: "1.243.0",
    title: "Rollouts and Settings on your computer",
    tag: "App",
    date: "November 2, 2026",
    highlights: [
      "On a computer the menu is Home, Assistant and Rollouts. Team is in Settings.",
      "Rollouts shows your rollouts on the left and the open rollout's chat on the right.",
      "Your photo at the top right opens Settings as a full page.",
    ],
  },
  {
    version: "1.242.1",
    tag: "AI",
    date: "November 2, 2026",
    highlights: [
      "Your most recent rollout chats are ready before you tap them.",
    ],
  },
  {
    version: "1.242.0",
    title: "Simpler settings on your phone",
    tag: "Account",
    date: "November 2, 2026",
    highlights: [
      "Security & account, UrgAns and Admin are now short lists of rows. Tap one to open it right there.",
      "Leave team and Delete account sit together at the bottom, in red.",
    ],
  },
  {
    version: "1.241.2",
    tag: "App",
    date: "November 2, 2026",
    highlights: [
      "The Team page, an artist's records and catalogue, and a task's details show straight away when you come back to them.",
    ],
  },
  {
    version: "1.241.1",
    tag: "Rollouts",
    date: "November 2, 2026",
    highlights: [
      "The brief and the ideas on a rollout show straight away when you come back to it.",
    ],
  },
  {
    version: "1.241.0",
    title: "Faster after a reload",
    tag: "App",
    date: "November 2, 2026",
    highlights: [
      "After a reload your rollouts show straight away instead of a loading screen.",
      "Your artists show straight away on Home and on an artist's page.",
    ],
  },
  {
    version: "1.240.1",
    tag: "App",
    date: "November 2, 2026",
    highlights: [
      "Rollouts and Settings open faster the first time you tap them.",
    ],
  },
  {
    version: "1.240.0",
    title: "Cleaner Profile and Notifications",
    tag: "Account",
    date: "November 2, 2026",
    highlights: [
      "On your phone, Profile and Notifications are simple rows. Tap one to change it.",
      "Turn push on or off with one switch.",
    ],
  },
  {
    version: "1.239.2",
    tag: "Account",
    date: "November 2, 2026",
    highlights: [
      "The green circle around your photo is gone. In Settings your photo just gets a thin outline.",
      "A setting opens full screen, with a round back button and no tabs above it.",
    ],
  },
  {
    version: "1.239.1",
    tag: "Account",
    date: "November 2, 2026",
    highlights: [
      "What you type in a setting stays there when you go back to the Settings list.",
      "In Settings, your photo has a thin light border instead of the green ring.",
      "Settings opens only from your photo. Swipe right to leave it.",
    ],
  },
  {
    version: "1.239.0",
    title: "Settings is a page",
    tag: "Account",
    date: "November 2, 2026",
    highlights: [
      "On your phone, tap your photo and Settings opens as a page you can swipe back from.",
      "Your photo gets a ring while you are in Settings.",
      "Search settings from the bar at the bottom.",
    ],
  },
  {
    version: "1.238.0",
    title: "Tabs remember where you were",
    tag: "App",
    date: "November 2, 2026",
    highlights: [
      "Leave a rollout for its chat and swipe back to Home: you land on that rollout again.",
      "The rollout chat you had open is still open after a reload.",
      "Sessions is now called Rollouts.",
    ],
  },
  {
    version: "1.237.3",
    tag: "Account",
    date: "November 2, 2026",
    highlights: [
      "Back from a setting you opened from your account page takes you back where you were.",
    ],
  },
  {
    version: "1.237.2",
    tag: "AI",
    date: "November 2, 2026",
    highlights: [
      "Ideas you tell UrgAns on a rollout that already has a plan become suggested changes to the plan.",
    ],
  },
  {
    version: "1.237.1",
    tag: "Rollouts",
    date: "November 2, 2026",
    highlights: [
      "On a phone, Approve and build the plan floats above the chat box.",
    ],
  },
  {
    version: "1.237.0",
    title: "A session for each rollout",
    tag: "AI",
    date: "November 2, 2026",
    highlights: [
      "Sessions is a new tab. Each rollout has its own session, and it stays on that rollout.",
      "Type in the chat box on a rollout and you land in its session, with a button to go straight back.",
      "The Assistant tab is just your main thread now.",
    ],
  },
  {
    version: "1.236.1",
    tag: "Rollouts",
    date: "November 2, 2026",
    highlights: [
      "A new rollout asks for your idea in the chat box. Say it or type it.",
    ],
  },
  {
    version: "1.236.0",
    title: "Tell UrgAns your idea",
    tag: "AI",
    date: "November 2, 2026",
    highlights: [
      "Tell UrgAns your idea for a rollout, typed or spoken, and it goes on the rollout.",
      "A card shows the ideas that are in, with a way to ask your team and write the brief.",
      "The Add idea and Edit idea buttons are gone from the brief card.",
    ],
  },
  {
    version: "1.235.0",
    title: "Your account page",
    tag: "Account",
    date: "November 2, 2026",
    highlights: [
      "Tap your photo to open your account page. Team and your settings are all there.",
      "Home and Assistant are the two tabs. Swipe between them.",
      "We took out a few settings you did not need, like guided tours and role view.",
    ],
  },
  {
    version: "1.234.4",
    tag: "Rollouts",
    date: "November 2, 2026",
    highlights: [
      "After you approve a brief, you land on the plan page when the plan is ready.",
    ],
  },
  {
    version: "1.234.3",
    tag: "App",
    date: "November 2, 2026",
    highlights: [
      "The brief card on a rollout only shows once the brief is written.",
    ],
  },
  {
    version: "1.234.2",
    tag: "App",
    date: "November 2, 2026",
    highlights: [
      "The page no longer stays shifted down after you open and close the keyboard.",
    ],
  },
  {
    version: "1.234.1",
    tag: "App",
    date: "November 1, 2026",
    highlights: [
      "If you are the artist, Home opens your own page.",
    ],
  },
  {
    version: "1.234.0",
    title: "See how it works as you start",
    tag: "Rollouts",
    date: "November 1, 2026",
    highlights: [
      "A new team sees how one sentence becomes a dated plan, right beside Add artist.",
      "Your first project screen shows what adding a project gets you.",
      "The idea card shows a voice note turning into plan steps.",
      "The idea round shows your team's ideas becoming one brief.",
      "When your plan is ready, see a task handed to a teammate before you invite them.",
    ],
  },
  {
    version: "1.233.0",
    title: "See it before you pick it",
    tag: "App",
    date: "November 1, 2026",
    highlights: [
      "Pick a plan and see a small preview of what each option gives you first.",
      "Tour steps now play a short clip of the thing they explain.",
      "The plans page shows what each plan opens for your team.",
      "What's new shows a small picture beside each update.",
      "Your welcome emails now show the screen they talk about.",
    ],
  },
  {
    version: "1.232.0",
    title: "See what a page looks like when it fills up",
    tag: "App",
    date: "November 1, 2026",
    highlights: [
      "Empty pages now show a faded picture of the page once it is full, so you know what to add first.",
    ],
  },
  {
    version: "1.231.0",
    siteStill: {
      alt: "Checkout for the Pro plan showing five ways to pay: bank transfer, Naira card, mobile money, dollar card, USDT or USDC.",
      width: 1216,
      height: 800,
      phoneWidth: 668,
      phoneHeight: 980,
    },
    title: "Pay your way",
    tag: "Account",
    still: "pay-your-way",
    date: "November 1, 2026",
    highlights: [
      "Pay for your plan in Naira by card or transfer, with mobile money in cedis, shillings and more, with a dollar card, or with USDT or USDC.",
      "Each payment covers a month or a year. We remind you before it ends.",
    ],
  },
  {
    version: "1.230.0",
    siteStill: {
      alt: "The Pick a plan step for Northline Music with Emerging at ₦2,600 and Pro at ₦26,000 a month, Pro picked.",
      width: 1216,
      height: 720,
      phoneWidth: 668,
      phoneHeight: 720,
    },
    title: "New plans: Emerging and Pro",
    tag: "Account",
    still: "plans",
    date: "November 1, 2026",
    highlights: [
      "Our plans have new names and prices: Emerging is ₦2,600 a month and Pro is ₦26,000 a month.",
      "You pick a plan right after you set up your team.",
      "Find your plan any time under Plan and billing in your profile menu.",
    ],
  },
  {
    version: "1.229.8",
    tag: "App",
    date: "October 31, 2026",
    listed: false,
    highlights: [
      "Urganize now says what it is in new words: where music teams manage everything from idea to execution.",
    ],
  },
  {
    version: "1.229.7",
    tag: "App",
    date: "October 31, 2026",
    listed: false,
    highlights: [
      "Links to Urganize now show a new preview card: from idea to execution.",
    ],
  },
  {
    version: "1.229.6",
    tag: "Rollouts",
    date: "October 31, 2026",
    highlights: [
      "On your phone, a rollout's title sits right under the tabs again, with no big gap above it.",
      "The next phone app update turns with your phone, so you can use it sideways.",
    ],
  },
  {
    version: "1.229.5",
    tag: "Team",
    date: "October 31, 2026",
    highlights: [
      "If you are not the team's admin, the Distribute card on Home now lets you ask your admin to upgrade, instead of sending you to pay.",
    ],
  },
  {
    version: "1.229.4",
    tag: "Pitching",
    date: "October 31, 2026",
    highlights: [
      "Pitch this! is shorter: the Promo list of radio and media channels is gone.",
    ],
  },
  {
    version: "1.229.3",
    tag: "App",
    date: "October 31, 2026",
    highlights: [
      "In the phone app, the loading screen is light when your phone is set to light.",
    ],
  },
  {
    version: "1.229.2",
    tag: "Rollouts",
    date: "October 31, 2026",
    highlights: [
      "On your phone, a rollout's top is now one slim line: the name, how much is done, and the menu. It stays put as you scroll.",
      "The Brief is always one tap away under it, and you change the cover by tapping the cover on the Brief card.",
      "Add idea, Select and Group by are in the rollout menu now, and the search box above the activities is gone.",
      "The Team row is gone from the menu under your photo. Team is still a tab at the top.",
    ],
  },
  {
    version: "1.229.1",
    tag: "Rollouts",
    date: "October 31, 2026",
    highlights: [
      "When you fold away a rollout's menu, the Menu button now floats at the bottom of the screen, out of the way of your plan.",
      "The phase cards on a rollout have a little more room and even spacing.",
    ],
  },
  {
    version: "1.229.0",
    siteStill: {
      alt: "The Add your photo step after joining Northline Music, with a photo circle, Add photo and Skip.",
      width: 1216,
      height: 720,
      phoneWidth: 668,
      phoneHeight: 720,
    },
    title: "Add your photo",
    tag: "Team",
    still: "photo",
    date: "October 31, 2026",
    highlights: [
      "Add your photo when you set up your team, or right after you join one. Your team sees your face instead of your initials.",
      "Change or remove it any time in Settings, under Profile.",
    ],
  },
  {
    version: "1.228.0",
    title: "Say no to advice",
    tag: "App",
    date: "October 31, 2026",
    highlights: [
      "Every tip in the app can now be put away. Tap Not now, Skip, No thanks or Unpin and it goes.",
      "On the check before distribution, you can keep your title or leave your splits as they are.",
    ],
  },
  {
    version: "1.227.0",
    title: "Home is your artists",
    tag: "App",
    date: "October 31, 2026",
    highlights: [
      "Home now shows just your artists. Tap an artist to see their rollouts.",
      "The page address is shorter, and old links still work.",
    ],
  },
  {
    version: "1.226.1",
    tag: "Rollouts",
    date: "October 31, 2026",
    highlights: [
      "Release day close and you still want it? Tap Keep date and the store-timing warning goes away for your whole team.",
    ],
  },
  {
    version: "1.226.0",
    title: "Skip the Spotify pitch",
    tag: "Rollouts",
    date: "October 31, 2026",
    highlights: [
      "Missed the time for a Spotify pitch? Tap Skip pitch and the warning goes away for your whole team on that rollout.",
    ],
  },
  {
    version: "1.225.2",
    tag: "Rollouts",
    date: "October 31, 2026",
    highlights: [
      "On your phone, when you swipe a plan up, the slim bar at the top no longer lets the plan show through above it.",
    ],
  },
  {
    version: "1.225.1",
    tag: "Team",
    date: "October 31, 2026",
    highlights: [
      "The Team page now just shows your people. Change your team name in Settings, under Artists & brand. Leave a team in Settings, under Security & account.",
      "The Add artist button on your phone now has the same + as the rest of the app.",
    ],
  },
  {
    version: "1.225.0",
    title: "Share the brief with a person",
    tag: "Team",
    date: "October 31, 2026",
    highlights: [
      "Share the brief with someone outside the team, like a videographer. Pick their part, then send the link on WhatsApp or by email.",
      "They see the brief and their part, and when they join they can mark it done. Guests are free, up to 5 on a rollout.",
    ],
  },
  {
    version: "1.224.0",
    title: "UrgAns starts the board",
    tag: "AI",
    date: "October 31, 2026",
    highlights: [
      "When UrgAns writes the brief, it now fills the idea in one line and how it should feel, not just the story.",
      "An empty Look card shows spots for the photos to add: light, styling, places and people.",
    ],
  },
  {
    version: "1.223.0",
    title: "Present the brief",
    tag: "Rollouts",
    date: "October 31, 2026",
    highlights: [
      "Tap Present to show the brief full screen in a meeting: the idea, the look, the sound, what you are making and the key dates. Use the arrow keys or a clicker.",
      "The brief now shows who on your team has seen it.",
    ],
  },
  {
    version: "1.222.0",
    title: "What we're making",
    tag: "Rollouts",
    date: "October 30, 2026",
    highlights: [
      "The brief now lists what the rollout makes, like cover art, teasers and the press release, with who has each one, when it is due and if it is late.",
      "Tap + Piece to add one to the plan, or turn on On the brief in any activity.",
    ],
  },
  {
    version: "1.221.0",
    title: "Photos and notes on the brief",
    tag: "Rollouts",
    date: "October 30, 2026",
    highlights: [
      "Add photos to the brief's Look, or drop them anywhere on the board. Give each one a caption.",
      "Stick notes on the board for ideas and questions. Tap From the cover to pull the rollout's colours from its cover art.",
    ],
  },
  {
    version: "1.220.0",
    title: "The plan comes first",
    tag: "Rollouts",
    date: "October 30, 2026",
    highlights: [
      "A rollout opens on its plan again. Tap Brief at the top of the plan to read the brief on the whole screen.",
      "Back to the plan, Esc or your browser's back button takes you back to the plan.",
    ],
  },
  {
    version: "1.219.0",
    title: "Arrange the brief",
    tag: "Rollouts",
    date: "October 30, 2026",
    highlights: [
      "Owners and admins can now arrange the brief. Tap Arrange, then drag a card to move it or pull its corner to make it bigger.",
      "Reset puts the board back the way it started. On a phone, the brief reads in the order you set.",
    ],
  },
  {
    version: "1.218.0",
    title: "More room for your plan",
    tag: "Rollouts",
    date: "October 30, 2026",
    highlights: [
      "Swipe up a little on Work the plan and the menu folds away, so the timeline and checklist get the room.",
      "To bring it back, pull down at the top, tap Menu, or flick down hard on your phone.",
    ],
  },
  {
    version: "1.217.0",
    title: "The brief is a board",
    tag: "Rollouts",
    date: "October 30, 2026",
    highlights: [
      "The brief is now a board: the cover, the idea, how it should feel, its colours, the look and the sound, then key moments and who is on what.",
      "A rollout with a plan opens on its brief. Work the plan is one tap away.",
    ],
  },
  {
    version: "1.216.4",
    tag: "Rollouts",
    date: "October 30, 2026",
    highlights: [
      "The Altlink credit now shows when you grab a smart link, not on the artist page.",
    ],
  },
  {
    version: "1.216.3",
    tag: "Rollouts",
    date: "October 30, 2026",
    highlights: [
      "Bringing in an artist's older songs is a one-time step for music out before Urganize. New songs come through your rollouts.",
      "On an artist's page, Out now has a Bring them in button where the older songs would go.",
    ],
  },
  {
    version: "1.216.2",
    tag: "App",
    date: "October 30, 2026",
    highlights: [
      "The top menu says Home everywhere now.",
    ],
  },
  {
    version: "1.216.1",
    tag: "Rollouts",
    date: "October 30, 2026",
    highlights: [
      "On an artist page, the Altlink credit is now a small line under your songs that says it makes the smart links.",
    ],
  },
  {
    version: "1.216.0",
    title: "Add an artist, bring their music",
    tag: "Rollouts",
    date: "October 30, 2026",
    highlights: [
      "Adding an artist starts with a search. Pick them and their photo and released music come with them.",
      "New releases show up on the artist's page by themselves.",
      "Artists you added by name get a Find on streaming button on their page.",
      "The Team page has one invite button, and no more empty box under Settings.",
    ],
  },
  {
    version: "1.215.0",
    title: "Talk to the assistant again",
    tag: "AI",
    date: "October 30, 2026",
    highlights: [
      "Voice input is back. Tap the mic and speak to the assistant instead of typing.",
      "The first item in the menu now says Home.",
    ],
  },
  {
    version: "1.214.2",
    tag: "Team",
    date: "October 30, 2026",
    highlights: [
      "Tasks you tick off stay done. The distributor tasks no longer come back as late when your files are not in Urganize.",
    ],
  },
  {
    version: "1.214.1",
    tag: "AI",
    date: "October 30, 2026",
    highlights: [
      "The menu now says Assistant instead of UrgAns.",
    ],
  },
  {
    version: "1.214.0",
    title: "Artists shows what is next",
    tag: "Rollouts",
    date: "October 30, 2026",
    highlights: [
      "Artists now opens with your next drop: its cover, its title and how many days are left.",
      "Each artist shows their next rollout, the day it comes out, and how many tasks are due or late.",
    ],
  },
  {
    version: "1.213.0",
    title: "A shorter menu",
    tag: "App",
    date: "October 29, 2026",
    highlights: [
      "The menu is now Artists, UrgAns and Team. Home is gone, and Urganize opens on Artists.",
      "On your phone, Team sits in the bottom menu, so you reach it in one tap.",
      "Your notifications bell is at the top of Artists on your phone.",
    ],
  },
  {
    version: "1.212.2",
    tag: "App",
    date: "October 29, 2026",
    highlights: [
      "The artist page is simpler: the posting plan is gone, so the music comes first.",
    ],
  },
  {
    version: "1.212.1",
    tag: "Rollouts",
    date: "October 29, 2026",
    highlights: [
      "Fan emails are gone from rollouts. Your smart link lives in Distribute.",
    ],
  },
  {
    version: "1.212.0",
    title: "Finished work out of the way",
    tag: "Rollouts",
    date: "October 29, 2026",
    highlights: [
      "Done activities now hide on the timeline, so what's left to do sits at the top.",
      "Tap Show done to see them again. We remember your choice for each rollout.",
    ],
  },
  {
    version: "1.211.0",
    title: "Join duplicate artists",
    tag: "App",
    listed: false,
    date: "October 29, 2026",
    highlights: [
      "If two of your artists look like the same person, the Artists page asks if you want to join them. One tap puts everything on one artist.",
      "When you import past releases for someone already on your roster, we ask if they belong to that artist first.",
    ],
  },
  {
    version: "1.210.0",
    title: "A calmer artist page",
    tag: "App",
    listed: false,
    date: "October 29, 2026",
    highlights: [
      "Each artist page now leads with where they are and the one thing to do next.",
      "All of their music is in one list: in the making, rolling out, and out now.",
      "New record is the first button.",
    ],
  },
  {
    version: "1.209.3",
    tag: "Team",
    date: "October 29, 2026",
    highlights: [
      "After you join a team, Home says which team you're in.",
      "Artists who add a release ready to go are no longer asked for their artist name again.",
    ],
  },
  {
    version: "1.209.2",
    tag: "Account",
    date: "October 29, 2026",
    highlights: [
      "Connections is gone from the menu and from Settings.",
      "To download a copy of your data, go to Settings, then Security & account.",
    ],
  },
  {
    version: "1.209.1",
    tag: "Team",
    date: "October 29, 2026",
    highlights: [
      "On your phone, Team is now in the menu behind your photo.",
    ],
  },
  {
    version: "1.209.0",
    title: "A faster start, with your team",
    tag: "Team",
    date: "October 29, 2026",
    highlights: [
      "Getting started is now three steps: your account, your team, then your first project.",
      "If someone already invited you, join their team in one tap. If not, ask them on WhatsApp and we'll pick up the invite.",
      "Start a project at any stage, even just an idea. No release day needed.",
      "Managers can now add, plan, rename and re-date rollouts in a team they joined.",
    ],
  },
  {
    version: "1.208.0",
    title: "Your team, in one place",
    tag: "Team",
    date: "October 29, 2026",
    highlights: [
      "Team is a new tab after Artists. See who is on your team, when each person was last in, and the tasks they hold.",
      "Tap someone to see their tasks, late ones first.",
      "Managers can invite people, change their role, and pick which rollouts each person can see.",
      "Anyone can leave a team. Their open tasks go back to the owner.",
    ],
  },
  {
    version: "1.207.2",
    tag: "Rollouts",
    date: "October 29, 2026",
    highlights: [
      "Your smart link's numbers now show where your fans are, country by country.",
      "Visits, clicks and the stores fans pick now read correctly from Altlink.",
    ],
  },
  {
    version: "1.207.1",
    tag: "Rollouts",
    date: "October 29, 2026",
    highlights: [
      "Until your song has a UPC or ISRC, the rollout menu shows Fan emails. Once it has one, the same spot becomes your Smart link.",
      "You can add the UPC or ISRC straight from there.",
    ],
  },
  {
    version: "1.207.0",
    title: "UrgAns knows your smart link",
    tag: "AI",
    date: "October 29, 2026",
    highlights: [
      "Once your rollout has its UPC or ISRC, UrgAns gives you its smart link and how many fans have pre-saved, and tells you to share it before release day.",
    ],
  },
  {
    version: "1.206.3",
    tag: "Account",
    date: "October 29, 2026",
    highlights: [
      "Urganize now lives at team.urganize.app. The old addresses take you there, and you stay signed in.",
    ],
  },
  {
    version: "1.206.2",
    tag: "Rollouts",
    date: "October 29, 2026",
    highlights: [
      "Your smart link now shows the Altlink logo under it, and tapping it opens Altlink's site.",
    ],
  },
  {
    version: "1.206.1",
    tag: "Rollouts",
    date: "October 29, 2026",
    highlights: [
      "Your smart link and its numbers show up once your song has a UPC or ISRC. Before that, the task tells you when it is coming.",
      "On an artist's past releases, the button now says Grab a smart link.",
    ],
  },
  {
    version: "1.206.0",
    title: "Your smart link, in every plan and in Distribute",
    tag: "Rollouts",
    date: "October 29, 2026",
    highlights: [
      "Every new plan has a task to set up and share your smart link. Open it to copy or share the link.",
      "Distribute now has three tabs for each rollout: Stores, Smart link and Numbers. Numbers shows visits, clicks, pre-saves and which stores fans pick.",
      "The Distribute list shows where each rollout is with stores and how its link is doing.",
    ],
  },
  {
    version: "1.205.0",
    title: "Getting ready for the stores is part of your plan",
    tag: "Rollouts",
    date: "October 29, 2026",
    highlights: [
      "Genre, credits and cover art are now tasks in your plan, each with a due date. They tick off by themselves when they're done.",
      "No release date yet? The tasks wait with no date and get one when you set it.",
    ],
  },
  {
    version: "1.204.0",
    title: "See what UrgAns did, on the UrgAns page",
    tag: "AI",
    date: "October 29, 2026",
    highlights: [
      "What UrgAns did now lives on the UrgAns page. Pick a rollout, or see them all.",
      "It is no longer in the rollout menu or in Settings.",
    ],
  },
  {
    version: "1.203.2",
    tag: "Rollouts",
    date: "October 29, 2026",
    highlights: [
      "To change a cover, hover over it on the artist page and tap the pencil. The rollout menu is shorter now.",
    ],
  },
  {
    version: "1.203.1",
    tag: "Rollouts",
    date: "October 29, 2026",
    listed: false,
    highlights: [
      "Fill in details now opens from the Distribute page, not the rollout menu. Tap Edit on Details to change them.",
    ],
  },
  {
    version: "1.203.0",
    title: "Urganize has a new address",
    tag: "Account",
    date: "October 29, 2026",
    highlights: [
      "Urganize now lives at my.urganize.app. The old address takes you there, and you stay signed in.",
      "Links you share now start with go.urganize.app.",
    ],
  },
  {
    version: "1.202.0",
    title: "List and Timeline in one place",
    tag: "Rollouts",
    date: "October 28, 2026",
    highlights: [
      "Work the plan now has a small switch for List and Timeline. The separate Timeline menu row is gone.",
      "On a phone, turn it sideways to see the timeline. Held upright, it asks you to turn the phone.",
    ],
  },
  {
    version: "1.201.2",
    tag: "Team",
    date: "October 28, 2026",
    highlights: [
      "The credits form now matches your phone: light when your phone is light, dark when it is dark.",
      "Shared press kits and fan pages have a plain background now.",
    ],
  },
  {
    version: "1.201.1",
    tag: "App",
    date: "October 28, 2026",
    highlights: [
      "On a computer, the top card on Home is a better size.",
    ],
  },
  {
    version: "1.201.0",
    title: "A calmer Home, with Distribute up front",
    tag: "App",
    date: "October 28, 2026",
    highlights: [
      "On a computer, Home is now one clear page. UrgAns has its own page in the top bar.",
      "Home has a Distribute card to get your music to Spotify, Apple Music, Audiomack and more.",
      "The Chappi character is gone from the app.",
    ],
  },
  {
    version: "1.200.2",
    tag: "Rollouts",
    date: "October 28, 2026",
    listed: false,
    highlights: [
      "Cover art smaller than 3000 × 3000 now goes up at the size stores need.",
    ],
  },
  {
    version: "1.200.1",
    tag: "App",
    date: "October 27, 2026",
    highlights: [
      "Opportunities and My People are switched off for now. Nothing you saved is lost.",
    ],
  },
  {
    version: "1.200.0",
    title: "Your record has a cover, and a way to its rollout",
    tag: "Rollouts",
    date: "October 27, 2026",
    highlights: [
      "Each record now has a cover in its own colour. Add a picture or pick a colour any time.",
      "Songs show as a tracklist. Tap a song's bars to move it from idea to done.",
      "Plan the rollout sits right under the cover. Songs still being made become tasks in the plan, so you can plan early.",
      "Rename, change the kind or drop a record from the menu on its cover.",
    ],
  },
  {
    version: "1.199.1",
    tag: "AI",
    date: "October 27, 2026",
    highlights: [
      "On a record, the UrgAns box at the bottom asks what happened, and what you tell it goes into that record.",
      "When the last song is done, UrgAns points you to Plan the rollout.",
    ],
  },
  {
    version: "1.199.0",
    title: "Home asks what's next",
    tag: "App",
    date: "October 27, 2026",
    highlights: [
      "A week after a release comes out, Home asks what's next for the artist. Answer in a line and the next record starts.",
      "The day after a session, Home asks if it happened. Tap Happened, Moved or Didn't happen.",
    ],
  },
  {
    version: "1.198.0",
    title: "Tell UrgAns about the next record",
    tag: "AI",
    date: "October 27, 2026",
    highlights: [
      "Tell UrgAns about a session in one line, like \"session with tolu friday, doing wahala free\". It shows what it will add to the record, and you tap Add.",
      "UrgAns never makes up a day. \"Next week\" stays next week until you say the day.",
    ],
  },
  {
    version: "1.197.4",
    tag: "Team",
    date: "October 27, 2026",
    highlights: [
      "The credits form background is plain now, with no pattern behind it.",
    ],
  },
  {
    version: "1.197.3",
    tag: "Team",
    date: "October 27, 2026",
    highlights: [
      "The credits form your collaborators fill in has a new, cleaner look with the Urganize logo at the top.",
    ],
  },
  {
    version: "1.197.2",
    tag: "Team",
    date: "October 27, 2026",
    highlights: [
      "The credits form is shorter. People add their name, what they did and their email, and writers add their royalty society and publisher. Shares are no longer asked for.",
    ],
  },
  {
    version: "1.197.1",
    tag: "AI",
    date: "October 27, 2026",
    highlights: [
      "The hint under What UrgAns remembers no longer runs the artist's name into the next word.",
    ],
  },
  {
    version: "1.197.0",
    title: "Keep track of the next record",
    tag: "Rollouts",
    date: "October 27, 2026",
    highlights: [
      "Start the next record from the artist page and keep its songs, sessions and people in one place.",
      "Move each song from Idea to Done, and note each session, even if the day is not set yet.",
    ],
  },
  {
    version: "1.196.0",
    title: "See what UrgAns did",
    tag: "AI",
    date: "October 27, 2026",
    highlights: [
      "Every change UrgAns makes is now listed, with who asked and where: chat, a voice call or a WhatsApp reply.",
      "Find it in each rollout's menu under What UrgAns did, and in Settings under UrgAns for all your rollouts.",
      "Tap Details to see what changed.",
    ],
  },
  {
    version: "1.195.0",
    title: "A posting plan for each artist",
    tag: "Rollouts",
    date: "October 27, 2026",
    highlights: [
      "Each artist has a posting plan: what to post, which day, where, and who posts it. It works with no release coming.",
      "Tell UrgAns your week, like \"studio clip Tuesday, lyric snippet Thursday\", and it lays out the posts for you to approve.",
      "Today's post shows on Home. Tap Done or Skip.",
    ],
  },
  {
    version: "1.194.0",
    title: "UrgAns remembers what you decide about each artist",
    tag: "AI",
    date: "October 27, 2026",
    highlights: [
      "Tell UrgAns something like \"Kemi doesn't want playlist pitching\" and it asks once if it should remember it.",
      "It follows what it remembers in every chat and every plan for that artist.",
      "See, change or remove what UrgAns remembers on the artist's page.",
    ],
  },
  {
    version: "1.193.0",
    title: "Ideas first, then the brief, then the plan",
    tag: "Rollouts",
    date: "October 27, 2026",
    highlights: [
      "Ask your team for ideas on a rollout. Each person sees only their own until you close the round.",
      "When you close it, UrgAns writes the brief from everyone's ideas. Where people disagree, you pick.",
      "Approve the brief and your plan is built from it. The brief stays locked until you make a new version.",
      "Spoken ideas keep their recording, so you can play them back.",
    ],
  },
  {
    version: "1.192.12",
    tag: "App",
    date: "October 27, 2026",
    listed: false,
    highlights: [
      "Urganize's link previews now say it is built for artists and their teams, so nobody has to chase anybody.",
    ],
  },
  {
    version: "1.192.11",
    tag: "Team",
    date: "October 27, 2026",
    listed: false,
    highlights: [
      "The app checks in less often in the background, so it does less work while it is open.",
    ],
  },
  {
    version: "1.192.10",
    tag: "App",
    date: "October 26, 2026",
    highlights: [
      "Home is calmer: the Done, Waiting on others and grants rows are gone.",
    ],
  },
  {
    version: "1.192.9",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "You can scroll the page again with your mouse over the timeline.",
    ],
  },
  {
    version: "1.192.8",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "The Brief opens once your rollout has a plan or an idea. Until then, it asks for your idea first.",
    ],
  },
  {
    version: "1.192.7",
    tag: "App",
    date: "October 26, 2026",
    highlights: [
      "Artists has the mic icon again.",
    ],
  },
  {
    version: "1.192.6",
    tag: "App",
    date: "October 26, 2026",
    highlights: [
      "The side menu stays slim now, and Artists has a person icon.",
    ],
  },
  {
    version: "1.192.5",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "On a computer, your rollout page now scrolls as one page. The tabs slide up and stay just under the top bar.",
    ],
  },
  {
    version: "1.192.4",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "The \"New idea for this plan?\" box is gone. Tap Add idea at the top of your rollout instead.",
    ],
  },
  {
    version: "1.192.3",
    tag: "Team",
    date: "October 26, 2026",
    listed: false,
    highlights: [
      "The chat inside an activity is gone, so the activity is just its details.",
    ],
  },
  {
    version: "1.192.2",
    tag: "App",
    date: "October 26, 2026",
    listed: false,
    highlights: [
      "The load screen now shows the Urganization logo beside its name.",
    ],
  },
  {
    version: "1.192.1",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "Plans now say clearly how many of your artists get distribution.",
      "One extra release is ₦2,200.",
    ],
  },
  {
    version: "1.192.0",
    title: "Distribution limits, and paying for one more release",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "Manager now includes distribution for 1 artist and 7 releases a month. Label includes 5 artists and 10 releases a month.",
      "The Distribute step shows how many releases you have left this month.",
      "Need one more, or a different artist? Pay ₦2,100 for that release and send it.",
    ],
  },
  {
    version: "1.191.1",
    tag: "Account",
    date: "October 26, 2026",
    highlights: [
      "Picking a plan when your trial ends is cleaner: Solo and Manager sit side by side, each with its price, its own button and what it includes.",
    ],
  },
  {
    version: "1.191.0",
    title: "A lower price for your first 6 months",
    tag: "Account",
    date: "October 26, 2026",
    highlights: [
      "New teams pay ₦4,000 a month for Solo or ₦26,000 for Manager for their first 6 months, then the usual price.",
      "You can pay for a year on your own now, no call needed.",
      "Each plan now shows what it includes before you pay.",
      "Label is now a plan you talk to us about.",
    ],
  },
  {
    version: "1.190.7",
    tag: "App",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "Plans now say rollouts, not releases, and Import releases is now Import past rollouts.",
      "Boxes you type in on the new rollout form and the ideas card are easier to see.",
    ],
  },
  {
    version: "1.190.6",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "On your phone, the top of a rollout is calmer: back and menu sit on their own row, with the cover and title below.",
    ],
  },
  {
    version: "1.190.5",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "A new rollout no longer shows a second card above the idea screen.",
    ],
  },
  {
    version: "1.190.4",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "Skip the invite and you can add activities yourself. UrgAns only helps when you ask.",
    ],
  },
  {
    version: "1.190.3",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "When you have no idea yet, you invite your team by email, the same way as any team invite.",
    ],
  },
  {
    version: "1.190.2",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "A new rollout now opens on your idea first, not the five questions.",
    ],
  },
  {
    version: "1.190.1",
    tag: "App",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "Smart links and Get link now make links. They were being turned down before.",
    ],
  },
  {
    version: "1.190.0",
    title: "Ask for ideas by email",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "When you ask for ideas on a rollout, you can now invite someone by email, even if they are not on Urganize yet. They land on your rollout after they join.",
      "When someone adds an idea to a rollout that already has a plan, you see it right away and can review what it would change. Nothing changes until you tap Apply.",
    ],
  },
  {
    version: "1.189.2",
    tag: "App",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "Get link tries again with the simplest request when Altlink turns the first one down.",
    ],
  },
  {
    version: "1.189.1",
    tag: "App",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "Get link now works for releases that are already out.",
    ],
  },
  {
    version: "1.189.0",
    title: "Links for your imported releases",
    tag: "App",
    date: "October 26, 2026",
    highlights: [
      "Imported releases now show their UPC and ISRC.",
      "Tap Get link on any release to make a public link for it. You see a notice first, and each team can make 10 links a day for now.",
    ],
  },
  {
    version: "1.188.0",
    title: "Ask your team when you have no idea yet",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "A new rollout now starts with just the question and the mic. No idea yet? Ask your team, then build your plan when you are ready.",
    ],
  },
  {
    version: "1.187.2",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "The cover art box no longer shows twice at the top of a rollout on your phone.",
    ],
  },
  {
    version: "1.187.1",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "A new rollout now opens on one clear question, \"What’s the idea?\", with the mic and the plan button right under it.",
    ],
  },
  {
    version: "1.187.0",
    title: "Import releases any time",
    tag: "App",
    date: "October 26, 2026",
    highlights: [
      "Use Import releases on the Artists page to bring in an artist's releases by name.",
      "Each artist's page has the same button, next to their catalogue.",
    ],
  },
  {
    version: "1.186.0",
    title: "Start with a call on bigger plans",
    tag: "Account",
    date: "October 26, 2026",
    listed: false,
    highlights: [
      "Solo and Manager monthly work as before: pick, pay and start.",
      "Label, 6-month and yearly plans start with a short call. We email you a payment link after it.",
      "Label is now ₦100,000 a month.",
    ],
  },
  {
    version: "1.185.1",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "The activity pop-up now uses the full height of your screen, so you rarely need to scroll. The chat folds away when you don’t need it.",
    ],
  },
  {
    version: "1.185.0",
    title: "Share to Urganize from the Android app",
    tag: "App",
    date: "October 26, 2026",
    highlights: [
      "In the Android app, share a WhatsApp chat, a voice note, a photo or some text to Urganize. It opens ready to sort. This needs the new app build.",
    ],
  },
  {
    version: "1.184.1",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "Add a new idea to a rollout that already has a plan. UrgAns suggests activities to add and dates to move, and nothing changes until you tap Apply.",
    ],
  },
  {
    version: "1.184.0",
    title: "Bring in an artist's releases",
    tag: "App",
    date: "October 26, 2026",
    highlights: [
      "Type an artist's name when you sign up and Urganize finds them and brings in their releases.",
      "Add as many artists as you like. They show up in your catalogue, on each artist's page.",
    ],
  },
  {
    version: "1.183.0",
    title: "Voice notes and the share sheet",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "Record a voice note, or bring ones from WhatsApp. Urganize writes them down and sorts them like any other note.",
      "On Android, share a chat, a voice note, a photo or some text straight to Urganize from WhatsApp. It opens ready to sort.",
    ],
  },
  {
    version: "1.182.0",
    title: "Photos and UrgAns in Bring your notes",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "Bring in a photo or screenshot of your notes. It reads the writing and sorts it.",
      "Tap Sort with UrgAns to skip small talk, fix labels and spot dates and rollouts. It only reads the text on screen and does not save it.",
    ],
  },
  {
    version: "1.181.3",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "The idea card holds its place while it loads, so the page no longer jumps.",
    ],
  },
  {
    version: "1.181.2",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "On a new rollout the idea comes first, then the plan.",
    ],
  },
  {
    version: "1.181.1",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "A new rollout now starts with your idea, not the cover art. Say what you see and your plan is built from it.",
    ],
  },
  {
    version: "1.181.0",
    title: "Bring your notes",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "Bring in a WhatsApp chat, a file or pasted text. Urganize finds the songs, to-dos, dates and money in it.",
      "Choose what to keep. Notes that name a rollout attach to it, and you can turn the to-dos into a plan.",
      "The chat is read on your phone. Only the notes you keep are saved, and you can undo the whole import.",
    ],
  },
  {
    version: "1.180.0",
    title: "A new rollout starts with its plan",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "On a new rollout the plan comes first, with the idea and first steps below it.",
      "When your plan is ready you see how many steps it has, the first three, and a button to read the brief.",
      "What you say on the idea card now starts the brief.",
    ],
  },
  {
    version: "1.179.4",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "The plan card on a new rollout is one line and one button.",
    ],
  },
  {
    version: "1.179.3",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "Your idea is now a short brief your whole team can read: the goal, how you will do it, what is next and what is missing.",
    ],
  },
  {
    version: "1.179.2",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "A new rollout now scrolls like a normal page, with the idea and first steps side by side.",
    ],
  },
  {
    version: "1.179.1",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "You can skip the planning questions and go straight to your rollout.",
      "A small arrow shows when a question has more options below.",
    ],
  },
  {
    version: "1.179.0",
    title: "The brief starts from your plan",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "Your brief now starts from the plan UrgAns built. The idea is written for you, and the goal, spend and channels show up as decisions you can keep or drop.",
      "A rollout with no release date shows when each step is due, like \"4 weeks before\", instead of an empty list.",
      "Draft with UrgAns works again.",
    ],
  },
  {
    version: "1.178.5",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "A rollout with no release date opens on Work the plan, and See the timeline moves to third in the menu until you pick a date.",
    ],
  },
  {
    version: "1.178.4",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "Work the plan is simpler when you have no release date. Your tasks sit in one plain list, with the date step and your idea beside it.",
    ],
  },
  {
    version: "1.178.3",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "A new rollout is cleaner. Until you set a date, it shows only your idea and the date step.",
    ],
  },
  {
    version: "1.178.2",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "Tasks with no date now say when they fall, like \"4 weeks before\", on Home too.",
    ],
  },
  {
    version: "1.178.1",
    tag: "AI",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "On your phone, UrgAns opens on your sessions. Tap one to open it, and go Back to return.",
    ],
  },
  {
    version: "1.178.0",
    title: "UrgAns writes your rollout plan",
    tag: "AI",
    date: "October 26, 2026",
    highlights: [
      "Plan with UrgAns asks a few short questions: where the music is, what a win looks like, your promo budget in Naira, where your fans are and who is doing the work.",
      "No release date yet? You still get a plan. Tasks say when they fall, like \"4 weeks before\". Set your date and UrgAns adds the dates and the tasks that need one.",
      "Song already out? You get a push plan that starts today.",
      "See the plan before it is saved: what it is built for, where your Naira goes and your first three tasks. Use it, tweak it or try another angle.",
      "Home is simpler: the rollout header with the phase bars is gone.",
    ],
  },
  {
    version: "1.177.1",
    tag: "Rollouts",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "On a phone, tap the square next to a rollout's name to add, change or remove its cover art.",
      "The Rollout menu is shorter: Add cover art and Share to socials are gone from it.",
    ],
  },
  {
    version: "1.177.0",
    tag: "AI",
    listed: false,
    date: "October 26, 2026",
    highlights: [
      "UrgAns now shows your sessions on the left and the open session in the middle.",
      "Home has a small handle that hides or shows its left side, and it remembers your choice.",
    ],
  },
  {
    version: "1.176.0",
    title: "Talk through a rollout and let your team chime in",
    tag: "Rollouts",
    date: "October 26, 2026",
    highlights: [
      "Hold the mic on a rollout and say your idea, or type it.",
      "Ask your artist or team to chime in, or share a link on WhatsApp.",
      "Turn everyone's notes into a plan with AI, or write it yourself.",
    ],
  },
  {
    version: "1.175.1",
    tag: "Pitching",
    date: "October 26, 2026",
    highlights: [
      "Curators now get an email and a notification when someone sends a song to their playlist.",
      "Curators who were never told about a waiting pitch get a late notice with an apology.",
    ],
  },
  {
    version: "1.175.0",
    title: "Tell us how you found Urganize",
    tag: "Account",
    date: "October 25, 2026",
    highlights: [
      "Signing up now asks how you heard about Urganize. It's optional and never holds you up.",
    ],
  },
  {
    version: "1.174.0",
    title: "Look around before you plan a rollout",
    tag: "Rollouts",
    date: "October 24, 2026",
    highlights: [
      "Nothing planned yet? Pick that when you sign up. You land on Home and can plan a rollout later.",
      "Every part of Urganize is open from day one. No more locked links.",
      "Home shows one small card, \"Got a release coming?\". Tap Not now and it goes away.",
      "Tell UrgAns about a release on the way and it offers to plan it for you.",
    ],
  },
  {
    version: "1.173.0",
    title: "A simpler way to start a rollout",
    tag: "Rollouts",
    date: "October 24, 2026",
    highlights: [
      "Starting a rollout is one short form now: artist, format and an optional title. No more fields showing twice.",
      "Single is picked for you. Tap EP or Album to change it, then Create.",
      "No date needed up front. \"Set your release date\" is the first activity in your rollout. Pick date there and the rest of your plan follows.",
    ],
  },
  {
    version: "1.172.0",
    title: "Apply to curate for Urganize",
    tag: "Pitching",
    date: "October 24, 2026",
    highlights: [
      "Own a playlist? You can now apply to curate for Urganize, no invite needed.",
      "Share your playlist link, followers and genre. We reply by email or WhatsApp within a week.",
    ],
  },
  {
    version: "1.171.0",
    title: "Vouch for the people you work with",
    tag: "Team",
    date: "October 24, 2026",
    highlights: [
      "Open an activity and pick who's doing it from My People.",
      "Each person's page shows the work you've done together.",
      "Mark their activity done and vouch for them in one tap. Only your team sees it for now.",
    ],
  },
  {
    version: "1.170.0",
    title: "Mark many done on the Timeline, or ask UrgAns",
    tag: "Rollouts",
    date: "October 24, 2026",
    highlights: [
      "The Timeline has Select too. Pick the activities you've finished and tap Mark done.",
      "You can ask UrgAns to mark several activities done in one go, like \"mark this week's done\".",
    ],
  },
  {
    version: "1.169.1",
    tag: "Rollouts",
    date: "October 24, 2026",
    highlights: [
      "Delete rollout is now in each rollout's own menu, last and in red, not only in Settings.",
      "It asks you to type the rollout's name or DELETE, then moves it to Trash, where you can restore it for 30 days.",
    ],
  },
  {
    version: "1.169.0",
    title: "Mark many activities done at once",
    tag: "Rollouts",
    date: "October 24, 2026",
    highlights: [
      "Tap Select in your activity list, pick the ones you've finished, then tap Mark done.",
      "You get one Undo for the lot, with no check-in after each one.",
    ],
  },
  {
    version: "1.168.0",
    title: "UrgAns on every phone screen",
    tag: "App",
    date: "October 24, 2026",
    highlights: [
      "On your phone, the Message UrgAns box now sits at the bottom of every screen, including rollouts and the timeline.",
      "Ask from inside a rollout and UrgAns already knows which rollout you mean.",
    ],
  },
  {
    version: "1.167.1",
    tag: "App",
    date: "October 24, 2026",
    highlights: [
      "On your phone, the Artists and Rollouts switch now stays in the same spot when you move between them.",
    ],
  },
  {
    version: "1.167.0",
    title: "Deleted rollouts go to Trash",
    tag: "Rollouts",
    listed: false,
    date: "October 23, 2026",
    highlights: [
      "Deleting a rollout now moves it to Trash. You can bring it back for 30 days, with all its activities.",
      "To delete a rollout, you type its name or DELETE first, so you can't do it by accident.",
      "You'll find Delete rollout in the Danger zone in Settings, and Trash next to it.",
    ],
  },
  {
    version: "1.166.2",
    tag: "Account",
    listed: false,
    date: "October 23, 2026",
    highlights: [
      "Solo is now ₦5,000 a month, ₦25,000 for 6 months or ₦50,000 a year.",
    ],
  },
  {
    version: "1.166.1",
    tag: "Account",
    date: "October 23, 2026",
    highlights: [
      "Fixed your account menu hiding behind cards on the page.",
    ],
  },
  {
    version: "1.166.0",
    title: "Move up the waitlist by sharing",
    tag: "Account",
    listed: false,
    date: "October 23, 2026",
    highlights: [
      "While you wait to get in, you now see your place in line and a link to share. Bring 3 friends and you get in early.",
    ],
  },
  {
    version: "1.165.1",
    tag: "Account",
    listed: false,
    date: "October 22, 2026",
    highlights: [
      "After you pay to upgrade your plan, you now see that it worked instead of a page that keeps waiting.",
    ],
  },
  {
    version: "1.165.0",
    title: "Distribution included on Manager and Label",
    tag: "Rollouts",
    date: "October 22, 2026",
    highlights: [
      "Manager and Label now include sending your releases to stores through TRM, at no extra cost.",
      "The Distribute step tells you when your plan covers it.",
    ],
  },
  {
    version: "1.164.0",
    title: "Pay for your plan and start right away",
    tag: "Account",
    date: "October 22, 2026",
    highlights: [
      "Pick Solo or Manager, pay by card or bank transfer, and start your first rollout straight away. No waiting list.",
      "Pay monthly, every 6 months or once a year. Six months costs the price of five.",
      "Paying by bank transfer gives you your own account number, and we remind you before it is time to pay again.",
      "Need a hand? Tap Get help, pick what it is about, and we reply by email.",
    ],
  },
  {
    version: "1.163.0",
    title: "Pre-save links that make themselves",
    tag: "Rollouts",
    date: "October 22, 2026",
    highlights: [
      "Once your rollout has a UPC or ISRC, Urganize makes its pre-save link for you. No button to press.",
      "Share it in one tap, and see visits, clicks and pre-saves as they come in.",
      "On release day the same link turns into a smart link that sends fans to every store.",
    ],
  },
  {
    version: "1.162.18",
    tag: "App",
    date: "October 21, 2026",
    highlights: [
      "On a phone, swiping back closes the sheet or pop-up you have open before it leaves the page.",
      "Swiping back goes up one step at a time, from a scene to its rollout to the artist.",
    ],
  },
  {
    version: "1.162.17",
    tag: "App",
    date: "October 21, 2026",
    highlights: [
      "The account menu is readable in light mode.",
      "Swiping back in Settings takes you to the Settings menu, not out of Settings.",
      "Swiping sideways on an artist or rollout page no longer switches tabs.",
    ],
  },
  {
    version: "1.162.16",
    tag: "Pitching",
    date: "October 21, 2026",
    highlights: [
      "Once a release is out, the Spotify editorial pitch goes away. Distribute stays as the record.",
    ],
  },
  {
    version: "1.162.15",
    tag: "App",
    date: "October 21, 2026",
    highlights: [
      "On a phone, the Directory, Relationships, Opportunities and Press kits pages have a Back arrow, and you no longer see yourself in the Directory.",
    ],
  },
  {
    version: "1.162.14",
    tag: "App",
    date: "October 21, 2026",
    highlights: [
      "On a phone, the Artists and Rollouts lists now have a small switch so you can tell them apart and move between them.",
    ],
  },
  {
    version: "1.162.13",
    tag: "App",
    date: "October 21, 2026",
    highlights: [
      "The Connections sheet now lists only what works. The 'Soon' rows that did nothing are gone.",
    ],
  },
  {
    version: "1.162.12",
    tag: "App",
    date: "October 21, 2026",
    highlights: [
      "Small buttons are now easier to tap on a phone: the Home dots, attach, close, tick circle, filters, links and a few more all have a full-size tap area.",
    ],
  },
  {
    version: "1.162.11",
    tag: "App",
    listed: false,
    date: "October 21, 2026",
    highlights: [
      "Android back now goes to the right Home and no longer trusts an old address. Needs the next app build.",
    ],
  },
  {
    version: "1.162.10",
    tag: "App",
    date: "October 21, 2026",
    highlights: [
      "Smaller fixes: plan dates show just the day, Locked is no longer a choice in Status, invited teammates show their email once, Escape closes the person edit form, and a blocked Push row now says so.",
    ],
  },
  {
    version: "1.162.9",
    tag: "App",
    date: "October 21, 2026",
    highlights: [
      "Cleaner wording across the app: old \"Untitled release\" names now read \"Untitled rollout\", the planner preview shows the same three phases as your plan, and a few stray words and symbols are gone.",
    ],
  },
  {
    version: "1.162.8",
    tag: "Rollouts",
    date: "October 21, 2026",
    highlights: [
      "Once a rollout is out, Distribute and Pitch now say \"Out on\" the date and stop listing things to do before release.",
    ],
  },
  {
    version: "1.162.7",
    tag: "Rollouts",
    date: "October 21, 2026",
    highlights: [
      "On your phone, the Rollouts list now has an Add rollout button right at the top.",
    ],
  },
  {
    version: "1.162.6",
    tag: "Team",
    date: "October 21, 2026",
    highlights: [
      "Team invite links now show the real invite, or a clear 'link not available', as soon as the page opens, even on a slow phone connection.",
    ],
  },
  {
    version: "1.162.5",
    tag: "Account",
    date: "October 21, 2026",
    highlights: [
      "Signing out now clears your Needs you notices, so the next person who signs in on the same phone never sees them.",
    ],
  },
  {
    version: "1.162.4",
    tag: "App",
    date: "October 21, 2026",
    highlights: [
      "Pasting your code and tapping Verify no longer sends it twice, and a link that cannot be used now says so instead of asking you to prove who you are.",
    ],
  },
  {
    version: "1.162.3",
    tag: "App",
    date: "October 21, 2026",
    highlights: [
      "The tab title now follows the page you swipe to (Home, UrgAns or Artists), and Directory shows the brand once.",
    ],
  },
  {
    version: "1.162.2",
    tag: "App",
    date: "October 21, 2026",
    highlights: [
      "A photo that does not load now shows the person's initials instead of a blank circle.",
    ],
  },
  {
    version: "1.162.1",
    tag: "App",
    date: "October 20, 2026",
    highlights: [
      "Swiping between Home, UrgAns and Artists no longer fills your back button, so your phone back-swipe stops wandering through old tabs.",
      "Closing Settings now takes you cleanly back, and a back-swipe with unsaved changes asks before it throws them away.",
    ],
  },
  {
    version: "1.162.0",
    title: "A way back to the newest reply",
    tag: "AI",
    date: "October 20, 2026",
    highlights: [
      "The UrgAns chat box sits on a frosted ground now. The last line of a reply shows through under it instead of stopping at a hard edge.",
      "Scroll up to reread something and a small arrow appears above the box. Tap it to jump back to the newest reply.",
    ],
  },
  {
    version: "1.161.6",
    tag: "App",
    date: "October 19, 2026",
    highlights: [
      "On your phone, tapping Relationships, Opportunities, Connections, Settings or search in the account menu opens it again.",
    ],
  },
  {
    version: "1.161.5",
    tag: "App",
    date: "October 19, 2026",
    highlights: [
      "Desktop keeps its sidebar layout; swipe tabs are for phones only.",
      "Sign-in links can't send you to another website after you sign in, from the sign-in page as well as email links.",
      "Tapping Create account twice in a row now shows Check your inbox instead of an error.",
    ],
  },
  {
    version: "1.161.4",
    tag: "Rollouts",
    date: "October 19, 2026",
    highlights: [
      "Send to TRM now goes through: Urganize sends TRM's exact list of stores, so a single is no longer refused before it leaves.",
      "The status now says Submitted when TRM's system takes the release and Received by TRM once it has reached TRM, so you know which one happened.",
      "If TRM sends a release back, you see TRM's reason (or Contact TRM for details when it gives none), and Resend fixes and resubmits it properly.",
      "If TRM can't find the artist's account after you send, Distribute says to create the TRM account or correct the email, then resubmit.",
    ],
  },
  {
    version: "1.161.3",
    tag: "AI",
    date: "October 19, 2026",
    listed: false,
    highlights: [
      "UrgAns: if the connection drops after you ask for a change, it now says so and refreshes your rollout so you can see whether it went through, instead of guessing and opening the rollout planner. Asking to rename or edit a rollout no longer opens the planner.",
    ],
  },
  {
    version: "1.161.2",
    tag: "Account",
    date: "October 19, 2026",
    highlights: [
      "Plans now say how many releases you can run at a time, and a one-time notice links to our updated terms and privacy policy.",
    ],
  },
  {
    version: "1.161.1",
    tag: "App",
    date: "October 19, 2026",
    highlights: [
      "Swipe navigation: the Message UrgAns box is now one box that stays the same shape, size and place on Home, UrgAns and Artists, so it no longer jumps when you swipe. The rollout picker moved to the top of UrgAns, beside Main thread.",
    ],
  },
  {
    version: "1.161.0",
    title: "UrgAns front desk for curators",
    tag: "Pitching",
    date: "October 19, 2026",
    highlights: [
      "Curators can teach UrgAns their terms once, and UrgAns answers artists' and managers' questions about a pitch from them, right on the pitch.",
      "Anything UrgAns can't answer goes to the curator's front desk inbox, and curators get one daily email with the questions waiting for them.",
    ],
  },
  {
    version: "1.160.8",
    tag: "App",
    date: "October 19, 2026",
    listed: false,
    highlights: [
      "Urganize's link previews now describe it the new way: everyone knows their job till drop day, so you stop being the team's reminder app.",
    ],
  },
  {
    version: "1.160.7",
    tag: "App",
    date: "October 19, 2026",
    highlights: [
      "Fixed swipe navigation on phones opening stuck halfway between Home and UrgAns. Each page now always fills the screen and settles on the tab you're on.",
    ],
  },
  {
    version: "1.160.6",
    tag: "App",
    date: "October 19, 2026",
    listed: false,
    highlights: [
      "The logo line on the plan screen after sign-up now reads \"Shaped with managers from\", matching the homepage.",
    ],
  },
  {
    version: "1.160.5",
    tag: "App",
    date: "October 19, 2026",
    highlights: [
      "Swipe navigation is now on for everyone on phones. Swipe left and right between Home, UrgAns and Artists; your avatar opens your account and connections.",
    ],
  },
  {
    version: "1.160.4",
    tag: "Rollouts",
    date: "October 19, 2026",
    listed: false,
    highlights: [
      "Cancelling a send-to-distributor task now drops that send: it no longer counts as unsent or late in the handoff, and shows quietly as cancelled on the Distribute step. With every send cancelled, the handoff line goes away.",
    ],
  },
  {
    version: "1.160.3",
    tag: "Account",
    date: "October 19, 2026",
    highlights: [
      "New accounts confirm their email with one tap. Your first rollout is saved while you check your inbox and opens as soon as you confirm, even if you open the link on another device.",
      "Redesigned account emails: password reset and every other sign-in email is now one clear line, one button named for what it does, and a plain link if the button won't open, in light and dark.",
      "Sign-in links can no longer be bent to send you to another website after you sign in.",
    ],
  },
  {
    version: "1.160.2",
    tag: "Rollouts",
    date: "October 19, 2026",
    listed: false,
    highlights: [
      "A rollout whose tasks are all cancelled no longer asks you to get ready for distribution or run the distribution check.",
    ],
  },
  {
    version: "1.160.1",
    title: "Swipe between Home, UrgAns and Artists (preview)",
    tag: "App",
    date: "October 19, 2026",
    highlights: [
      "On your phone, swipe left and right to move between Home, UrgAns and Artists. Your avatar opens your account and connections.",
      "Early preview for a few accounts while we test it. Everyone else keeps the current navigation.",
    ],
  },
  {
    version: "1.160.0",
    title: "Send to TRM from Distribute",
    tag: "Rollouts",
    date: "October 19, 2026",
    highlights: [
      "Distribute now says in one line whether a single is ready for stores, and lists exactly what TRM still needs, each with its owner and a Fix button.",
      "Send to TRM delivers the release from Urganize: confirm the date and the artist's TRM email, add the master and it goes straight to TRM. Urganize never keeps the audio.",
      "After sending, a live status follows it from Sent to Checking, Accepted, Delivering and In stores. If TRM sends it back, each reason becomes a fix task on the plan.",
      "Rights and policies come pre-filled with sensible defaults you can change in one place.",
      "The send uses the artist's own TRM plan, so the artist needs a TRM account. If they don't have one yet, Distribute gives you their sign-up link and checks again when they're in.",
    ],
  },
  {
    version: "1.159.1",
    tag: "Rollouts",
    date: "October 19, 2026",
    highlights: [
      "A cancelled task no longer asks you to find someone for it, and it's never shown as your next task.",
    ],
  },
  {
    version: "1.159.0",
    title: "Cancelled tasks step aside",
    tag: "Rollouts",
    date: "October 19, 2026",
    highlights: [
      "Cancelled tasks are hidden from your timeline and task list. Tap \"Show cancelled\" to see them again, and search still finds them.",
      "Finished and cancelled tasks never show as late, and they no longer count against your progress.",
      "A task waiting on a cancelled task is no longer stuck. When everything is done or cancelled, the timeline says you're all clear.",
    ],
  },
  {
    version: "1.158.12",
    tag: "App",
    listed: false,
    date: "October 19, 2026",
    highlights: [
      "A clearer changelog: updates are grouped by month, each new feature has a plain title and an area you can filter by, and smaller fixes fold away.",
    ],
  },
  {
    version: "1.158.11",
    listed: false,
    tag: "App",
    date: "October 19, 2026",
    highlights: [
      "The \"from Urganization\" sign-off on the load screen is set in golden proportion to the Urganize mark, with \"from\" sitting closer to the logo.",
    ],
  },
  {
    version: "1.158.10",
    tag: "App",
    listed: false,
    date: "October 18, 2026",
    highlights: [
      "The Why Urganize headline is shorter, so it reads in three lines on a phone instead of four.",
    ],
  },
  {
    version: "1.158.9",
    tag: "Account",
    listed: false,
    date: "October 18, 2026",
    highlights: [
      "Every page on urganize.app now uses the homepage's type and dark colours, so moving from the homepage to features, pricing or sign-up feels like the same place. Pages also load less font data.",
    ],
  },
  {
    version: "1.158.8",
    listed: false,
    tag: "App",
    date: "October 18, 2026",
    highlights: [
      "The app's load screen is now signed \"from Urganization\" along the bottom, with the company's new official logo.",
    ],
  },
  {
    version: "1.158.7",
    tag: "App",
    listed: false,
    date: "October 18, 2026",
    highlights: [
      "Every page on urganize.app now opens under the same soft dawn sky as the homepage, in light and dark, so the site feels like one place.",
    ],
  },
  {
    version: "1.158.6",
    tag: "Team",
    listed: false,
    date: "October 18, 2026",
    highlights: [
      "Urganize now introduces itself as built for artist managers: the app's title reads \"Urganize: Every release, on plan\" and its description says you add a release and get the plan, week by week to release day, so your team knows what to do and when.",
    ],
  },
  {
    version: "1.158.5",
    listed: false,
    tag: "App",
    date: "October 18, 2026",
    highlights: [
      "On your phone, moving around the app feels smoother. Menus slide up and away instead of popping, opening a part of a rollout like Fill in details eases into place without a loading flash, new pages settle in gently, and on UrgAns the question and the box glide with the keyboard instead of jumping.",
    ],
  },
  {
    version: "1.158.4",
    listed: false,
    tag: "App",
    date: "October 18, 2026",
    highlights: [
      "On your phone, switching between Artists and Rollouts no longer makes the list jump. Both start in the same place, and the same + sits in the same spot: Add artist on Artists, New rollout on Rollouts.",
    ],
  },
  {
    version: "1.158.3",
    tag: "App",
    listed: false,
    date: "October 18, 2026",
    highlights: [
      "When something breaks in the app, we now hear about it straight away, so we can fix it faster.",
    ],
  },
  {
    version: "1.158.0",
    title: "Activities remember when they were done",
    tag: "Rollouts",
    date: "October 18, 2026",
    highlights: [
      "Ticking an activity now saves the day you ticked it, and unticking it clears that again, so a rollout's review can tell which activities were done on time and which were late.",
    ],
  },
  {
    version: "1.157.18",
    listed: false,
    tag: "Rollouts",
    date: "October 18, 2026",
    highlights: [
      "On a rollout, a suggestion you already dismissed on another device no longer flashes up while the page loads. The next moves wait until they know what you dismissed, then appear once, and the rest of the rollout shows straight away.",
    ],
  },
  {
    version: "1.157.17",
    listed: false,
    tag: "Rollouts",
    date: "October 18, 2026",
    highlights: [
      "The cover art grid on a public profile now loads from small copies too, so the covers show up fast and all at once instead of filling in from the top. Your original files are unchanged.",
    ],
  },
  {
    version: "1.157.16",
    listed: false,
    tag: "Team",
    date: "October 18, 2026",
    highlights: [
      "Profile photos now load from a small copy too: curator faces when you pitch, people in Relationships, and the artists on a public profile show up fast and all at once instead of filling in from the top. Your original photos are unchanged.",
    ],
  },
  {
    version: "1.157.15",
    listed: false,
    tag: "App",
    date: "October 18, 2026",
    highlights: [
      "On your phone, Home no longer flashes a card you already dismissed while it loads. It waits until it knows what you dismissed on any device, then shows your next task straight away.",
      "Home's loading shapes now match the real screen: the title and drop date, the bell and your team, the three phase bars, the task card and the rows under it, so nothing jumps when it fills in.",
    ],
  },
  {
    version: "1.157.14",
    listed: false,
    tag: "App",
    date: "October 18, 2026",
    highlights: [
      "On your phone, holding a tab in the bottom bar no longer pops a tip over the page. The tab names already say where each one goes.",
    ],
  },
  {
    version: "1.157.13",
    tag: "Rollouts",
    date: "October 18, 2026",
    highlights: [
      "Cover art and artist photos in lists now load from a small copy instead of the full image, so they show up fast and all at once instead of filling in from the top. Your original files are unchanged.",
    ],
  },
  {
    version: "1.157.12",
    listed: false,
    tag: "App",
    date: "October 18, 2026",
    highlights: [
      "On your phone, Settings answers your first tap. Opening it, picking a section, going back to the list and closing it now happen straight away, instead of waiting on the network and looking like the button did nothing.",
    ],
  },
  {
    version: "1.157.11",
    listed: false,
    tag: "App",
    date: "October 18, 2026",
    highlights: [
      "On your phone, the menu icon at the top of a rollout opens one menu again. A second copy was stacking on top of it.",
      "Change artist is no longer in the rollout menu on your phone or computer. If a release is filed under the wrong artist, the distribution check still offers the fix right where the problem shows.",
    ],
  },
  {
    version: "1.157.10",
    listed: false,
    tag: "App",
    date: "October 18, 2026",
    highlights: [
      "On your phone, the Activities view of a rollout now shows the distribution check as the same Ready to distribute row as the timeline. Tap it to open the checklist and fix what is left; it goes away once everything is done.",
    ],
  },
  {
    version: "1.157.9",
    listed: false,
    tag: "App",
    date: "October 18, 2026",
    highlights: [
      "On your phone, an open rollout is calmer. The top shows the artist and title with a search icon and a menu icon, then one line with the phase, the release day and how much is done.",
      "Weeks that are already behind you fold into one Catch up group with what is still open, and what you finished in them sits in a Done earlier row at the end. Search still finds everything in its own week.",
      "Week headings use plain dates like Fri 23 Oct, Start here marks the one task to do first, and the distribution check is one Ready to distribute row you tap to open.",
      "The floating Rollout menu button is gone, so it no longer covers your list. The menu icon at the top opens the same menu, and tapping search shows the filter and a key to what each dot means.",
    ],
  },
  {
    version: "1.157.8",
    listed: false,
    tag: "App",
    date: "October 18, 2026",
    highlights: [
      "On your phone, tapping a task now slides it up once, smoothly, from the bottom of the screen. It no longer opens and then jumps a second time as the chat loads, and no field looks selected until you tap it.",
    ],
  },
  {
    version: "1.157.7",
    listed: false,
    tag: "App",
    date: "October 18, 2026",
    highlights: [
      "Opening Urganize on your phone now shows one load screen, not two. The logo stays the same size, in the same spot and on the same background from the moment you tap the app until your workspace appears.",
    ],
  },
  {
    version: "1.157.6",
    listed: false,
    tag: "App",
    date: "October 18, 2026",
    highlights: [
      "On your phone, Home gives your next task more room: a bigger card with the task in large type, a small \"Next · Due today\" line above it and a green arrow. Tap anywhere on it to open the task.",
      "Under it, the numbers sit in simple rows: Done shows how many tasks are finished (12 of 40) and opens the rollout, then Waiting on others with how many are late, then any grants that fit your team.",
    ],
  },
  {
    version: "1.157.5",
    listed: false,
    tag: "Rollouts",
    date: "October 17, 2026",
    highlights: [
      "A freshly planned rollout now opens on the plan itself. The \"plan built\" card is gone, so your first steps sit right above the timeline.",
      "While your first steps are up, the distribution check and the jobs nobody is on yet wait their turn. They come back once the steps are done or hidden.",
      "On a new account's first rollout, Confirm your release date is now step 1 of your first steps instead of a second card.",
      "Suggested activities live in Work the plan, not under the timeline. No date yet is one row you tap to open.",
      "On a phone the phases are one line, and the progress bar shows up once something is done. Only one phase is marked Now at a time.",
    ],
  },
  {
    version: "1.157.4",
    tag: "Pitching",
    date: "October 17, 2026",
    highlights: [
      "In Pitch this!, Your kit is now What curators read: three rows with a tick each, one Write the missing parts button with its cost under it, and once everything is in it shrinks to a single Ready row with Copy share link.",
    ],
  },
  {
    version: "1.157.3",
    listed: false,
    tag: "App",
    date: "October 17, 2026",
    highlights: [
      "On your phone, Home is cleaner up top: the bell now sits beside your team's faces, the line above the title is gone, and the date reads \"Drops Fri 30 Oct\" (or \"Out\" once it is released).",
      "Tap anywhere on your next task's card to open it. The separate Open task button is gone.",
      "Manage team and Invite your team open Settings over the page you are on, so closing it takes you back there.",
      "More is down to Relationships, Opportunities and Settings, with Help as a small line underneath. New notifications show as a dot on Home.",
    ],
  },
  {
    version: "1.157.2",
    listed: false,
    tag: "Account",
    date: "October 17, 2026",
    highlights: [
      "Plans got a new price. Solo now has room for 2 people, the artist and their manager. Manager covers up to 3 artists and 5 people, and it is the plan we recommend.",
      "Yearly is still 10 months for 12. If you already pay, your price does not change.",
    ],
  },
  {
    version: "1.157.1",
    listed: false,
    tag: "App",
    date: "October 17, 2026",
    highlights: [
      "On Home, Getting started drops Bring in a teammate once you have one, so the count reads out of 3 instead of showing a ticked, struck-through step.",
      "The Relationships tab's tooltip now reads \"The people your team works with and the open directory.\"",
    ],
  },
  {
    version: "1.157.0",
    title: "Pitch many curators at once",
    tag: "Pitching",
    date: "October 17, 2026",
    highlights: [
      "Pitch this! now runs on your credits. Pick as many curators as you like and send once: each one shows what a pitch costs, or Free, and the bar tells you what you have left, in pitches.",
      "Every pitch to a paid curator buys a listen and a written reply in 7 days. No reply in time, and your credits come back on their own.",
      "Short on credits? Top up right there and your pitches send as soon as the payment goes through. Nothing is lost if it doesn't.",
      "Answers shows each curator once: their reply, the days left, or Credits back. Every pitch and refund is in your Credits history with the curator's name.",
    ],
  },
  {
    version: "1.156.7",
    listed: false,
    tag: "Rollouts",
    date: "October 17, 2026",
    highlights: [
      "A new rollout's first steps no longer list Invite your team once you already have a teammate. If nothing is left to do, the first steps card does not show.",
      "The \"Your rollout is planned / Take the tour\" card no longer appears on a rollout after its plan is built.",
    ],
  },
  {
    version: "1.156.6",
    listed: false,
    tag: "App",
    date: "October 17, 2026",
    highlights: [
      "On a phone, More is simpler: Relationships, Opportunities, Notifications, Settings and Help. Search is the magnifier at the top, and Help opens its own short list (Report an issue, Docs, Contact us, Community).",
    ],
  },
  {
    version: "1.156.5",
    listed: false,
    tag: "Rollouts",
    date: "October 17, 2026",
    highlights: [
      "Urganize now describes itself the same way everywhere: every release, on plan. Emails end with it, and UrgAns says it when you ask what Urganize is.",
    ],
  },
  {
    version: "1.156.4",
    listed: false,
    tag: "Team",
    date: "October 17, 2026",
    highlights: [
      "The Artist menu item now reads Artists, matching its tab, on a phone and on a computer.",
    ],
  },
  {
    version: "1.156.3",
    listed: false,
    tag: "Pitching",
    date: "October 17, 2026",
    highlights: [
      "The separate Press kit page is gone. Write the artist's short bio and who to write to under About the artist in Pitch this!, and Copy kit link shares it. Old Press kit links open the artist instead.",
      "A rollout's only file is now its cover art. The Cover art screen is simpler: one square, one button, then Replace or Remove, and it tells you when the art is ready for stores.",
      "The handoff to your distributor lists cover art and metadata. Send the master from your own files.",
    ],
  },
  {
    version: "1.156.2",
    listed: false,
    tag: "Team",
    date: "October 17, 2026",
    highlights: [
      "Catalogue is now called Artist in the menu, on a phone and on a computer. Tapping it opens your artists first, with Rollouts right beside them.",
    ],
  },
  {
    version: "1.156.1",
    listed: false,
    tag: "Account",
    date: "October 17, 2026",
    highlights: [
      "The Manager plan has a new monthly and yearly price. Solo and Label stay the same.",
    ],
  },
  {
    version: "1.156.0",
    title: "Your first plan is ready when you land",
    tag: "AI",
    date: "October 17, 2026",
    highlights: [
      "When you finish signing up, UrgAns now builds your first rollout plan by itself. It starts while you finish the last screens, so you land on a rollout with its plan ready instead of more questions. It plans for new listeners with no budget, and you can change anything after.",
      "If the plan doesn't build, the rollout says so, with one Try again button. Nothing you entered is lost.",
      "Fixed the model problem that made new rollout plans skip UrgAns's tailoring and follow the standard playbook since October 11.",
    ],
  },
  {
    version: "1.155.0",
    listed: false,
    title: "A tighter Urganize, focused on the release",
    tag: "App",
    date: "October 17, 2026",
    highlights: [
      "Shows are gone from Urganize: shows, setlists, DJ packs, run of show and the songs list. Old Shows links now open Home.",
      "Urganize no longer takes the song. Send your master to your distributor from your own files, then mark it sent on the handoff list.",
      "Deleting an artist now also deletes their old shows and songs, so it no longer asks you to delete the shows first.",
    ],
  },
  {
    version: "1.154.18",
    listed: false,
    tag: "App",
    date: "October 17, 2026",
    highlights: [
      "On a computer, UrgAns now stays open when you click it. It used to open, then jump back to Home a few seconds later.",
      "Opening an old UrgAns link on a computer now opens UrgAns full width instead of Home.",
    ],
  },
  {
    version: "1.154.17",
    listed: false,
    tag: "Team",
    date: "October 17, 2026",
    highlights: [
      "Team logins are gone. Settings, Team now has your teammates and their invites, and making a rollout goes straight to it with no extra step. Email invites and Copy invite link work as before, and everyone already on your team signs in as usual.",
      "The team brief is gone too, along with the UrgAns tab in Settings. UrgAns still knows your rollouts, tasks and team.",
    ],
  },
  {
    version: "1.154.16",
    listed: false,
    tag: "App",
    date: "October 17, 2026",
    highlights: [
      "On Home, the card with your next task no longer shows a Next label or how many days late the task is. It opens straight on the task.",
    ],
  },
  {
    version: "1.154.15",
    listed: false,
    tag: "Rollouts",
    date: "October 17, 2026",
    highlights: [
      "The old per-release EPK is switched off. Each rollout's press kit and pitch live in Pitch this!, and an old EPK link inside the app now takes you to that rollout.",
      "Settings, Notifications is simpler: the After tasks and Motivation switches are gone. UrgAns still asks how a finished task went, and the weekly encouragement still comes. Push notifications is the one switch left.",
      "Searching for pitching in the command bar now opens Pitch this! in your latest rollout.",
    ],
  },
  {
    version: "1.154.14",
    listed: false,
    tag: "App",
    date: "October 17, 2026",
    highlights: [
      "On a phone, when the bottom menu folds away as you scroll down, the Rollout menu button slides down to take its place, and so does the Ask UrgAns box on Home. The bottom menu opens again when you scroll back to the top or tap its round button.",
    ],
  },
  {
    version: "1.154.13",
    listed: false,
    tag: "App",
    date: "October 17, 2026",
    highlights: [
      "On Home, the Chat and Sessions switch now lines up with the chat beneath it, and the profile menu shows its full edge when it opens from the side menu.",
    ],
  },
  {
    version: "1.154.12",
    listed: false,
    tag: "Team",
    date: "October 17, 2026",
    highlights: [
      "Your profile icon now sits at the bottom left of the side menu on a computer. Fold the menu and it glides up to sit above the fold button.",
    ],
  },
  {
    version: "1.154.11",
    listed: false,
    tag: "Rollouts",
    date: "October 17, 2026",
    highlights: [
      "The note UrgAns shows after building a plan no longer lists what it left out, so there is less to read above your activities.",
    ],
  },
  {
    version: "1.154.10",
    listed: false,
    tag: "App",
    date: "October 16, 2026",
    highlights: [
      "Emails from Urganize now come from an address that says what they are for, like notifications, sign-in codes or billing, and replying reaches a real inbox.",
    ],
  },
  {
    version: "1.154.9",
    listed: false,
    tag: "Account",
    date: "October 16, 2026",
    highlights: [
      "After you sign in, Home opens straight onto your last UrgAns chat, and the sign-in page downloads a little less before it works.",
    ],
  },
  {
    version: "1.154.8",
    listed: false,
    tag: "Account",
    date: "October 16, 2026",
    highlights: [
      "The sign-in page, the public pages and every workspace page download less before they work, so they open faster on a slow connection.",
    ],
  },
  {
    version: "1.154.7",
    listed: false,
    tag: "Rollouts",
    date: "October 16, 2026",
    highlights: [
      "A rollout's menu now runs in the order you do the work: upload the song, add cover art, fill in details, distribute, then pitch.",
    ],
  },
  {
    version: "1.154.6",
    listed: false,
    tag: "Account",
    date: "October 16, 2026",
    highlights: [
      "The sign-in page and the public pages download less again before they work, so they open a little faster on a slow connection.",
    ],
  },
  {
    version: "1.154.5",
    listed: false,
    tag: "AI",
    date: "October 16, 2026",
    highlights: [
      "Draft with UrgAns on a rollout's brief now says what it costs and how many credits you have before you tap.",
    ],
  },
  {
    version: "1.154.4",
    tag: "App",
    listed: false,
    date: "October 16, 2026",
    highlights: [
      "Behind the scenes: our own test accounts stay out of server-side analytics too.",
    ],
  },
  {
    version: "1.154.3",
    tag: "App",
    listed: false,
    date: "October 16, 2026",
    highlights: [
      "Behind the scenes: our own test accounts stay out of the numbers.",
    ],
  },
  {
    version: "1.154.2",
    listed: false,
    tag: "Pitching",
    date: "October 16, 2026",
    highlights: [
      "In Pitch this!, Spotify and Apple Music is one simple row now: where your editorial pitch stands, or, before you have one, the date to pitch by. Tap it to open the pitch.",
    ],
  },
  {
    version: "1.154.1",
    listed: false,
    tag: "App",
    date: "October 16, 2026",
    highlights: [
      "The menu is shorter: Show me a rollout again is gone from it. You can still replay the tour from Settings.",
    ],
  },
  {
    version: "1.154.0",
    title: "Smaller AI plans that start with one step",
    tag: "AI",
    date: "October 16, 2026",
    highlights: [
      "New AI plans are smaller: 12 to 15 core activities across Pre-release, Release and Post-release, each with an owner and a date, and the first one marked Start here.",
      "The rest of the playbook waits as suggestions. Open \"N suggested\" in a phase and tap + to add one with its date and owner. Plans you already have stay as they are.",
    ],
  },
  {
    version: "1.153.2",
    listed: false,
    tag: "Rollouts",
    date: "October 16, 2026",
    highlights: [
      "A rollout in pre-production now lists its activities on the timeline before it has a release date.",
      "Start the next one has a close button.",
    ],
  },
  {
    version: "1.153.1",
    listed: false,
    tag: "Account",
    date: "October 16, 2026",
    highlights: [
      "The sign-in page and the rest of the app download less before they work, so they open a little faster on a slow connection.",
    ],
  },
  {
    version: "1.153.0",
    title: "A Brief for every rollout",
    tag: "Rollouts",
    date: "October 16, 2026",
    highlights: [
      "Every rollout has a Brief: the idea, references, dates, who's on what and decisions on one page. UrgAns can draft it.",
      "Turn on a view link to let someone outside the team read the brief. They can't change anything.",
    ],
  },
  {
    version: "1.152.1",
    listed: false,
    tag: "Rollouts",
    date: "October 16, 2026",
    highlights: [
      "On the distributor handoff, the Metadata row's button now reads Upload, like the master and cover art rows.",
    ],
  },
  {
    version: "1.152.0",
    title: "One place to pitch a release",
    tag: "Pitching",
    date: "October 16, 2026",
    highlights: [
      "Pitch this! is now the one place to pitch a release. Your kit sits on top, then curators, their answers, Spotify and Apple Music editors, and promo. Build your pitch kit and Find promo are folded in, and their old links open Pitch this!",
      "One kit, one link: the song's story and who made it sit on top of the artist's bio, photos and contact, which come in automatically. Copy kit link puts the kit live for you, no trip to the press kit editor. Old press kit links and old EPK links still work.",
      "Tap a curator to pitch them: pick the playlist, paste the song link, and the note is already written from your story. Your kit goes with every pitch.",
      "Promo is a short list now: the five best fits first, all 15 channels one tap away, and + puts one on your plan with a due date.",
    ],
  },
  {
    version: "1.151.0",
    title: "A clear handoff to your distributor",
    tag: "Rollouts",
    date: "October 16, 2026",
    highlights: [
      "The Distribute step now opens with the handoff to your distributor: the final master, the cover art and the metadata, each with an owner, a due date counted back from release day, and where it stands (Missing, Uploaded, Approved, Sent). Upload opens the step that holds it, Approve and Mark sent are one tap, and your whole team sees the same thing.",
      "Set how early your distributor needs the files (7, 14, 21 or 28 days before release; 14 to start) and every due date moves with it. Each owner gets the usual reminders 7 and 3 days before, and a red line when the files are late.",
      "Lyrics now have their own box on the Metadata step, and on a computer the rollout's top line shows the handoff: how many of the three are sent and when they're due.",
    ],
  },
  {
    version: "1.150.0",
    title: "A review after every release",
    tag: "Rollouts",
    date: "October 16, 2026",
    highlights: [
      "After a release, your rollout opens with a review: how many activities got done, how many on time and late, what worked, what slipped, and a short take from UrgAns. If you didn't track much in the app, UrgAns asks what happened first instead of grading the plan.",
      "Start the next one: pick the artist, add a working title if you have one, and you get a rollout with no release date and a Pre-production phase: book sessions, finish the song, production, mix, master, artwork, shoot the video and the final MP4. Set a date when you have one and UrgAns plans the release around it.",
      "Between releases, Home shows the review and the button to start pre-production, above Opportunities.",
    ],
  },
  {
    version: "1.149.1",
    listed: false,
    tag: "App",
    date: "October 16, 2026",
    highlights: [
      "On Home, every card in the next-move swipe is now the same height, so the button sits in the same place as you swipe.",
    ],
  },
  {
    version: "1.149.0",
    title: "Focused on your next release",
    tag: "App",
    date: "October 16, 2026",
    highlights: [
      "Urganize now focuses on getting your next release out. Shows, the content calendar, team chat, fan email pages, spend tracking, Notes and the Audience tab are off the menus. Nothing you made was deleted.",
      "UrgAns voice and Talk to UrgAns are off for now. Typing to UrgAns works as before.",
      "Your first rollout no longer stops you to invite a teammate.",
      "Paid playlist pitches are gone. The free curator list stays in Pitch this!",
    ],
  },
  {
    version: "1.148.0",
    title: "A simpler Home",
    tag: "App",
    date: "October 16, 2026",
    highlights: [
      "Home is simpler. While a release is in flight it shows the release, how many days to go and which phase you're in, then the one thing to do next with one button. Swipe for two more.",
      "Waiting on others is now one line that opens when you tap it, and a matched grant shows as a single line.",
      "With nothing in flight, Home helps you start the next release and shows the opportunities that fit your team.",
      "Your teammates now appear as small faces at the top of Home, with a green dot when they're online. Spend, the rollouts list, the getting-started bar and the daily line have left Home, and Home now loads in one go.",
    ],
  },
  {
    version: "1.147.11",
    listed: false,
    tag: "App",
    date: "October 16, 2026",
    highlights: [
      "Every page in the side menu now has its icon beside its name, and folding the menu leaves a slim rail of those icons so you can still jump between pages.",
    ],
  },
  {
    version: "1.147.10",
    listed: false,
    tag: "App",
    date: "October 16, 2026",
    highlights: [
      "On a computer the rollout's top line shows Group by and Filter once, not twice.",
      "Above the timeline, the three phases and the distribution check now share one compact line, so the weeks start higher.",
      "The collapse-menu button sits at the bottom of the side menu, and folding it leaves a thin rail with the button in the same corner.",
    ],
  },
  {
    version: "1.147.9",
    listed: false,
    tag: "Rollouts",
    date: "October 15, 2026",
    highlights: [
      "In full-screen timeline on a computer, the legend button now sits in the top bar beside Exit full screen, so the phases start higher.",
    ],
  },
  {
    version: "1.147.8",
    tag: "App",
    date: "October 15, 2026",
    highlights: [
      "The app opens faster on a slow connection: the sign-in page and every screen download noticeably less before they work, and signing in shows your workspace one round trip sooner.",
    ],
  },
  {
    version: "1.147.7",
    tag: "App",
    date: "October 15, 2026",
    highlights: [
      "Coming back to the app is faster: pages you have opened before now appear straight from your device while the latest version loads in the background. Signing out clears what was saved on the device.",
    ],
  },
  {
    version: "1.147.6",
    listed: false,
    tag: "App",
    date: "October 15, 2026",
    highlights: [
      "Faster first load: every page now downloads about 40 KB less JavaScript before it can be used, and the dashboard about 80 KB less. Task pop-ups, release scenes and analytics now load in the background once the page is ready.",
    ],
  },
  {
    version: "1.147.5",
    tag: "App",
    date: "October 15, 2026",
    highlights: [
      "Under the hood: the app's servers now run right next to its database, so every page and action waits less on the network.",
    ],
  },
  {
    version: "1.147.4",
    tag: "App",
    listed: false,
    date: "October 15, 2026",
    highlights: [
      "Admins can now open the admin dashboards straight from More on a phone, and those pages clear the iPhone notch.",
    ],
  },
  {
    version: "1.147.3",
    listed: false,
    tag: "Rollouts",
    date: "October 15, 2026",
    highlights: [
      "In full-screen timeline on desktop, search and filters now sit in the top bar, next to the title, so the timeline gets more room.",
    ],
  },
  {
    version: "1.147.2",
    listed: false,
    tag: "App",
    date: "October 15, 2026",
    highlights: [
      "Urganize now wears a Beta label: next to the logo on desktop, and at the top of More on your phone. We're still early, and your feedback shapes what comes next.",
    ],
  },
  {
    version: "1.147.1",
    listed: false,
    tag: "App",
    date: "October 15, 2026",
    highlights: [
      "A simpler cursor on desktop: a clean arrow in Urganize's colors, and clicks land exactly where it points.",
    ],
  },
  {
    version: "1.147.0",
    title: "Invite-only for now",
    tag: "Account",
    date: "October 15, 2026",
    highlights: [
      "Urganize is invite-only for now. New sign-ups need an invite; without one you can join the waitlist and we'll reach out. Teammates you invite still join as before.",
      "Signed up without an invite? You'll see \"You're on the list\" and get in as soon as we let you in.",
      "Invite links: open the link you were sent and sign up with any email or Google, and you're in.",
      "New admin invite tools: let someone in from the waitlist or by email and send them a single-use link on WhatsApp, and let in anyone who is waiting with one tap.",
    ],
  },
  {
    version: "1.146.1",
    listed: false,
    tag: "Rollouts",
    date: "October 15, 2026",
    highlights: [
      "The old Shows list now opens Artists, where each artist's shows live. Back on a show takes you to its artist's page.",
    ],
  },
  {
    version: "1.146.0",
    title: "A new look for your public page",
    tag: "Team",
    date: "October 15, 2026",
    highlights: [
      "A new look for your public page: your photo, name and tick, what you do and where, one line about you, the artists you manage, your releases and their cover art, with Reach and Save for anyone who wants to work with you.",
      "Share to Story: your page as a tall card with your face, name, artists and link, ready to post as a story or status.",
      "Claiming your page takes four quick screens: prove it's you with a code sent to your work email, add a photo, a line about you and your artists, then share it.",
    ],
  },
  {
    version: "1.145.0",
    title: "A new Directory",
    tag: "Team",
    date: "October 15, 2026",
    highlights: [
      "A new Directory: search, four quick filters (All, Managers, A&R, PR), a Rising row of faces, and compact rows with each person's face, name, role and city. A tick means Urganize has seen their delivered work.",
      "People credited on a released rollout who have not claimed their page now show in the Directory as Unclaimed. Their page has Claim this profile, a button to invite them, and Request removal.",
    ],
  },
  {
    version: "1.144.0",
    listed: false,
    title: "My People, sorted by last contact",
    tag: "Team",
    date: "October 15, 2026",
    highlights: [
      "My People is a compact list sorted by last contact: each face, name, role and company, and how long since you were in touch. Anyone you haven't reached in six weeks shows that time in green, and the Quiet chip lists just them.",
      "A person's page has Reach (WhatsApp, call or email) and Log. Log a line like \"Sent EP link\" and it joins their short history and resets the clock. Tags and notes are no longer shown; nothing you saved was deleted.",
    ],
  },
  {
    version: "1.143.0",
    listed: false,
    title: "Relationships opens on Directory",
    tag: "Team",
    date: "October 15, 2026",
    highlights: [
      "Relationships now opens on Directory, with My People (formerly People) beside it.",
      "Shows left Relationships. Pencilled-in gigs appear under Gigs in Opportunities, and booked shows live on each artist's page in Catalogue. Old Shows links still open.",
    ],
  },
  {
    version: "1.142.4",
    listed: false,
    tag: "Rollouts",
    date: "October 15, 2026",
    highlights: [
      "The plan's tools (Filter, Group by, Legend and Full screen) now sit on a rollout's top line beside its name, artist and status, so the plan starts right under the tabs.",
      "That line is spaced on one golden-ratio scale, with 34px controls and 8, 13 and 21px gaps, so everything on it lines up.",
    ],
  },
  {
    version: "1.142.3",
    listed: false,
    tag: "Account",
    date: "October 15, 2026",
    highlights: [
      "See plans in Settings now opens your plans during a free trial, so you can pay early. It used to send you back Home.",
    ],
  },
  {
    version: "1.142.2",
    listed: false,
    tag: "Rollouts",
    date: "October 15, 2026",
    highlights: [
      "A rollout's top line now carries everything: Rollouts > its name, the artist, its status, how much is done and New activity. The big header under it is gone, so the plan starts higher.",
      "One search on a computer: the top bar's. The rollout's own search field now shows on phones and in full screen only; Filter stays everywhere.",
    ],
  },
  {
    version: "1.142.1",
    listed: false,
    tag: "Team",
    date: "October 15, 2026",
    highlights: [
      "The remove-photo button on an artist's page now sits in the photo's bottom-right corner, appears when you hover over the photo, and turns red under your pointer.",
    ],
  },
  {
    version: "1.142.0",
    listed: false,
    title: "Start a rollout from an artist's page",
    tag: "Rollouts",
    date: "October 15, 2026",
    highlights: [
      "Start a new rollout from an artist's page: the plus on their Rollouts card opens the new rollout form with that artist already chosen.",
      "A cleaner artist page: tap the photo to change it, and use the small trash icon on its corner to remove it. Tap anywhere on the Press kit bar to open the kit, and add a show with the plus on Shows.",
    ],
  },
  {
    version: "1.141.1",
    listed: false,
    tag: "Rollouts",
    date: "October 15, 2026",
    highlights: [
      "Distribute is no longer in the Catalogue menu. Open a rollout and use its Distribute page instead.",
    ],
  },
  {
    version: "1.141.0",
    listed: false,
    title: "Add a show from an artist's page",
    tag: "Rollouts",
    date: "October 15, 2026",
    highlights: [
      "Add a show straight from an artist's page: tap Add a show in their Shows section, and the booking form opens with that artist already picked. The new show appears on their page and in Shows.",
    ],
  },
  {
    version: "1.140.0",
    listed: false,
    title: "Keyboard shortcuts on a computer",
    tag: "App",
    date: "October 15, 2026",
    highlights: [
      "New keyboard shortcuts on a computer: press G then H, U, C, R or O to jump to Home, UrgAns, Catalogue, Relationships or Opportunities, and / to start typing to UrgAns. Search with ⌘K shows each page's shortcut.",
      "Pressing ⌘C or Ctrl+C to copy text no longer opens a new activity. C on its own still does.",
    ],
  },
  {
    version: "1.139.2",
    listed: false,
    tag: "Team",
    date: "October 15, 2026",
    highlights: [
      "The Artists list is simpler: each artist now shows just their rollouts and shows coming up. Each artist's press kit is still on their own page.",
    ],
  },
  {
    version: "1.139.1",
    listed: false,
    tag: "Rollouts",
    date: "October 15, 2026",
    highlights: [
      "Small fixes behind the scenes. Phases you folded on a rollout's task list open again once, then remember how you leave them.",
    ],
  },
  {
    version: "1.139.0",
    title: "See your team on Home",
    tag: "Team",
    date: "October 15, 2026",
    highlights: [
      "Home now shows your team: everyone who has joined, with a green dot when they're online now and when the rest were last active.",
    ],
  },
  {
    version: "1.138.1",
    listed: false,
    tag: "App",
    date: "October 15, 2026",
    highlights: [
      "On a computer, the round UrgAns button in the bottom corner is gone. Use the UrgAns tab in the top menu instead.",
    ],
  },
  {
    version: "1.138.0",
    listed: false,
    title: "A cleaner Distribute step",
    tag: "Rollouts",
    date: "October 15, 2026",
    highlights: [
      "Distribute now shows each partner's logo and sign-up button, with no long paragraphs, and the two cards stack on your phone.",
      "Add rollout now sits at the right end of the top row on Rollouts, and the rollouts list is shorter, with no count above it and no next activity under each one.",
      "An artist's page is calmer: a round back arrow returns you to Artists, a bigger photo and name fill the top, and the extra Artist, Add photo and Planned labels are gone.",
    ],
  },
  {
    version: "1.137.1",
    listed: false,
    tag: "Rollouts",
    date: "October 15, 2026",
    highlights: [
      "Full screen timeline now keeps the top menu on screen, so you can jump to Home, Rollouts or anywhere else without leaving full screen first. On your phone the bottom bar stays too.",
      "Exit full screen now sticks. The timeline no longer jumps back into full screen a moment after you leave it, including right after UrgAns builds your plan.",
    ],
  },
  {
    version: "1.137.0",
    listed: false,
    title: "UrgAns gets its own tab on a computer",
    tag: "AI",
    date: "October 15, 2026",
    highlights: [
      "On a computer, UrgAns now has its own tab in the top menu, right after Home. It opens Home's chat across the full width.",
      "Pressing Home again while you're on Home still widens the chat, and now the UrgAns tab lights up to show you're there. Press Home to bring Home back.",
    ],
  },
  {
    version: "1.136.0",
    title: "A short checklist to start each rollout",
    tag: "Rollouts",
    date: "October 15, 2026",
    highlights: [
      "A new rollout now opens with one clear next step and a short checklist: add the song, add the cover art, invite your team.",
      "Each step ticks itself off as soon as it's done, and the checklist disappears once all three are finished. You can also hide it any time.",
    ],
  },
  {
    version: "1.135.0",
    title: "Three phases for every rollout",
    tag: "Rollouts",
    date: "October 15, 2026",
    highlights: [
      "Every rollout is now split into three phases: Pre-release, Release and Post-release. Each shows its dates, how much is done, and which phase you are in now.",
      "The timeline groups activities under the three phases, with a phase summary at the top.",
      "The activity list groups by phase too. Tap Group by Status to get the old view back.",
      "Move an activity to a different phase from its detail. Activities from before this get a phase from their date.",
    ],
  },
  {
    version: "1.134.1",
    listed: false,
    tag: "App",
    date: "October 15, 2026",
    highlights: [
      "Home's send arrow is fixed. With nothing typed it's now a quiet grey circle instead of a faded green one that looked broken, and it turns green once you can send.",
      "The arrow is bolder and easier to tap: a full thumb-size button on your phone, on Home and in the UrgAns chat.",
    ],
  },
  {
    version: "1.134.0",
    listed: false,
    title: "Pitching moves inside each rollout",
    tag: "Pitching",
    date: "October 15, 2026",
    highlights: [
      "Pitching left the top menu and the phone's bottom bar. It now lives inside each rollout: open a rollout and tap Pitch this!",
      "Pitch this! now has everything the old Pitching page had: curators, answers, its Spotify and Apple Music editorial pitch, its payment receipts, and your curator inbox link.",
      "Old pitching links, from emails, notifications and curator pages, now open the right rollout's Pitch this! page.",
    ],
  },
  {
    version: "1.133.3",
    listed: false,
    tag: "App",
    date: "October 15, 2026",
    highlights: [
      "Home's loading screen now matches the real page, Opportunities card first, so nothing jumps when it loads.",
      "Home's cards are calmer: softer outlines and progress bars, smaller headlines, one line under each opportunity, and more space between groups.",
    ],
  },
  {
    version: "1.133.2",
    listed: false,
    tag: "App",
    date: "October 14, 2026",
    highlights: [
      "On a computer, the top menu tabs you're not on are now dimmer, so the one you're on stands out. They brighten when you point at them.",
    ],
  },
  {
    version: "1.133.1",
    listed: false,
    tag: "App",
    date: "October 14, 2026",
    highlights: [
      "On your phone, More now has Report an issue, Docs, Contact us and Community at the bottom, the same help you find in the account menu on a computer.",
      "Notifications on your phone now have a close button in the corner.",
    ],
  },
  {
    version: "1.133.0",
    title: "Ask UrgAns to update an activity",
    tag: "AI",
    date: "October 14, 2026",
    highlights: [
      "Tell UrgAns \"mark the cover shoot as done\" or \"move the pitch to in progress\" and it changes the activity's status right away, with no credits used.",
    ],
  },
  {
    version: "1.132.4",
    listed: false,
    tag: "Rollouts",
    date: "October 14, 2026",
    highlights: [
      "Opening the app shows one loading screen, the Urganize mark on its own, with no second loader or Opening Urganize line.",
    ],
  },
  {
    version: "1.132.3",
    listed: false,
    tag: "Team",
    date: "October 14, 2026",
    highlights: [
      "Going back from an artist's page takes you to Rollouts.",
    ],
  },
  {
    version: "1.132.2",
    listed: false,
    tag: "Rollouts",
    date: "October 14, 2026",
    highlights: [
      "Distribute shows Therealmusic Distro and fan payments side by side, without the store checks in between.",
      "The artist page drops the Team list and the press kit explainer line.",
    ],
  },
  {
    version: "1.132.1",
    listed: false,
    tag: "Rollouts",
    date: "October 14, 2026",
    highlights: [
      "Tapping a rollout in Distribute now opens its distribution step right there, so you stay in the Distribute tab.",
    ],
  },
  {
    version: "1.132.0",
    listed: false,
    title: "Filters and menus that fit your phone",
    tag: "App",
    date: "October 14, 2026",
    highlights: [
      "On your phone, the filters on a rollout's timeline now open in a sheet from the bottom, so nothing runs off the side of the screen.",
      "Menus across the app now stay on screen, on small phones and on short laptop screens alike.",
      "Menu rows are a little taller on phones, so they're easier to tap.",
    ],
  },
  {
    version: "1.131.0",
    listed: false,
    title: "Distribute gets its own tab",
    tag: "Rollouts",
    date: "October 14, 2026",
    highlights: [
      "Distribute now has its own tab in Catalogue, next to Rollouts and Artists. Pick a rollout and go straight to sending it to stores.",
      "Press kits left the Catalogue tabs. Find each one on its artist's page or in Settings.",
    ],
  },
  {
    version: "1.130.4",
    listed: false,
    tag: "App",
    date: "October 14, 2026",
    highlights: [
      "The \"Keep Urganize on your Home Screen\" pop-up is gone for good.",
    ],
  },
  {
    version: "1.130.3",
    listed: false,
    tag: "App",
    date: "October 14, 2026",
    highlights: [
      "Home is calmer: the welcome screen is one line and one button, and the extra New session button under your lists is gone. Start a new chat from Sessions.",
    ],
  },
  {
    version: "1.130.2",
    listed: false,
    tag: "App",
    date: "October 14, 2026",
    highlights: [
      "On a computer, the free-trial screen now shows your plan and the start button side by side with the highlights, so there's no scrolling to start.",
    ],
  },
  {
    version: "1.130.1",
    listed: false,
    tag: "Account",
    date: "October 14, 2026",
    highlights: [
      "Signing up with Google now takes you through the same quick setup as signing up with email.",
    ],
  },
  {
    version: "1.130.0",
    listed: false,
    title: "Cancel or pause your plan yourself",
    tag: "Account",
    date: "October 14, 2026",
    highlights: [
      "You can now cancel your plan or trial yourself, in Settings under Billing.",
      "Need a break instead? Pause your plan for 2 weeks up to 3 months. You pay nothing while it's paused.",
      "If you cancel, everything you made stays here for you to read.",
    ],
  },
  {
    version: "1.129.0",
    title: "See your plan before you sign up",
    tag: "Account",
    date: "October 14, 2026",
    highlights: [
      "Signing up now shows your plan week by week before you make an account.",
      "You can turn on reminders by push or email when you sign up. Both stay off unless you pick them.",
      "Got a referral code? Type it in when you create your account.",
      "Pick your plan and start a 3-day free trial with no card.",
      "You can skip inviting your team and go straight to your plan.",
      "Your first plan opens with \"Confirm your release date\" pinned at the top.",
    ],
  },
  {
    version: "1.128.2",
    listed: false,
    tag: "App",
    date: "October 14, 2026",
    highlights: [
      "Your menu now always follows the account type you chose when you joined.",
    ],
  },
  {
    version: "1.128.1",
    listed: false,
    tag: "Team",
    date: "October 14, 2026",
    highlights: [
      "Invite your team no longer appears once you've invited someone.",
      "Tap Not now once and it's hidden on all your rollouts.",
    ],
  },
  {
    version: "1.128.0",
    listed: false,
    title: "A cleaner rollout page on a computer",
    tag: "Rollouts",
    date: "October 14, 2026",
    highlights: [
      "A cleaner rollout page on a computer. The timeline now starts much higher, with less above it.",
      "The rollout menu is sorted into Plan, Release and Promote, so it's quicker to find what you need.",
      "The distribution checklist is now one line showing your next fix. Open it to see the whole list.",
      "Search, filters and the timeline's legend now sit in one row.",
    ],
  },
  {
    version: "1.127.0",
    listed: false,
    title: "A menu that leads with what you need",
    tag: "App",
    date: "October 14, 2026",
    highlights: [
      "The menu now leads with what you need, based on who you said you are. Everything else is under More, and search still finds it.",
      "Want a different view? Change it in Settings, under View.",
    ],
  },
  {
    version: "1.126.0",
    listed: false,
    title: "A side menu for the part you are in",
    tag: "App",
    date: "October 14, 2026",
    highlights: [
      "On a computer, the pages of the part you are in are now in a menu down the left side. Open a rollout and its own menu sits right under Rollouts. You can fold the side menu away for more room.",
      "The top bar is calmer. Your credits and the help links are in the menu under your name now.",
    ],
  },
  {
    version: "1.125.3",
    listed: false,
    tag: "App",
    date: "October 14, 2026",
    highlights: [
      "Pages you've already opened in a session now stay ready for an hour, so tapping back to Home is quick even on a slow connection.",
    ],
  },
  {
    version: "1.125.2",
    listed: false,
    tag: "Rollouts",
    date: "October 14, 2026",
    highlights: [
      "Before your first rollout, tapping a locked page now just shows why it's locked. It no longer opens the page by itself a few seconds later.",
    ],
  },
  {
    version: "1.125.1",
    listed: false,
    tag: "App",
    date: "October 14, 2026",
    highlights: [
      "Pages no longer load twice when you tap a link. A thin bar along the top shows a page is on its way, and tapping the same link again while it loads does nothing extra.",
    ],
  },
  {
    version: "1.125.0",
    title: "Shorter plans, with search and filters",
    tag: "Rollouts",
    date: "October 14, 2026",
    highlights: [
      "Rollout plans are shorter now. You see the handful of tasks that matter most, and Show all brings back the rest.",
      "Search a plan by task name, or filter it by status, who it's on, or when it's due.",
      "Open any task and pin it to keep it in your short list.",
    ],
  },
  {
    version: "1.124.1",
    listed: false,
    tag: "Rollouts",
    date: "October 14, 2026",
    highlights: [
      "Upcoming milestones on the rollout timeline now show as solid green diamonds, and scheduled tasks are easier to see on the dark background.",
    ],
  },
  {
    version: "1.124.0",
    title: "A calmer dark mode",
    tag: "App",
    date: "October 14, 2026",
    highlights: [
      "A calmer look in dark mode: a plain near-black background instead of the grid, green as the one accent colour, and less important text set back so the key things stand out.",
    ],
  },
  {
    version: "1.123.0",
    listed: false,
    title: "Opportunities on Home",
    tag: "Team",
    date: "October 14, 2026",
    highlights: [
      "Home now opens with your newest opportunities: grants picked for your team first, then the deals and grants you are chasing. Tap one, or See all, to open Opportunities.",
    ],
  },
  {
    version: "1.122.1",
    listed: false,
    tag: "Rollouts",
    date: "October 14, 2026",
    highlights: [
      "A rollout with no plan yet no longer opens onto an empty full-screen timeline. The timeline goes full screen once the plan is built.",
    ],
  },
  {
    version: "1.122.0",
    title: "Next moves after every step",
    tag: "Rollouts",
    date: "October 14, 2026",
    highlights: [
      "Next moves: after something happens on a rollout, Home and the rollout page show up to three things to do next, each one tap. Build the plan, run the distribution check, pitch Spotify editorial, start the next block of work, pitch more curators or invite your team. Tap the cross and that one never comes back.",
    ],
  },
  {
    version: "1.121.0",
    listed: false,
    title: "Sign-up starts with who you are",
    tag: "Account",
    date: "October 14, 2026",
    highlights: [
      "Signing up now starts with one question: who are you? Artist manager, label, solo artist, artist team or other. One tap and you're on.",
      "If you joined before we asked, you'll see the same question once on Home. Answer with a tap or close it.",
    ],
  },
  {
    version: "1.120.4",
    tag: "Rollouts",
    date: "October 13, 2026",
    highlights: [
      "Help me pick now shows you three Fridays to choose from. Each one says how many weeks you get, whether there is time to pitch Spotify editorial, and whether another of your rollouts lands that week.",
    ],
  },
  {
    version: "1.120.3",
    listed: false,
    tag: "Team",
    date: "October 13, 2026",
    highlights: [
      "You can now skip the invite step on your first plan. Tap Skip for now and it stays away for a day. Inviting a teammate still clears it for good.",
    ],
  },
  {
    version: "1.120.2",
    listed: false,
    tag: "Rollouts",
    date: "October 13, 2026",
    highlights: [
      "After your first rollout, the \"Tell people it’s coming\" sheet now waits for your next visit, on Home, instead of popping up before you have a plan. The Share button on every rollout works any time.",
    ],
  },
  {
    version: "1.120.1",
    listed: false,
    tag: "App",
    date: "October 11, 2026",
    highlights: [
      "On a computer, the timeline now opens full screen every time you go to it. Exit full screen and it stays that way until you leave the timeline.",
    ],
  },
  {
    version: "1.120.0",
    listed: false,
    title: "Search and filters take less room",
    tag: "App",
    date: "October 11, 2026",
    highlights: [
      "Search and filters take less room. On a computer they sit in the tab row at the top of Rollouts, Notes, People, Directory and Shows, and next to Add on Opportunities.",
      "On a phone it is one row: a search box and a Filters button. The button shows how many filters are on, and opens a sheet with the choices. Shows keeps a single sliding row of artists.",
    ],
  },
  {
    version: "1.119.1",
    listed: false,
    tag: "Rollouts",
    date: "October 11, 2026",
    highlights: [
      "Opening an activity now shows its full title. The Delete and Close bar no longer covers the top of it.",
    ],
  },
  {
    version: "1.119.0",
    title: "Invite your creatives to the Directory",
    tag: "Team",
    date: "October 11, 2026",
    highlights: [
      "Invite your producers, engineers and directors into the Directory. Add their name and what they do, then email them or share a link.",
      "They get a profile only they can see until they publish it. You see who opened it and who joined.",
    ],
  },
  {
    version: "1.118.0",
    title: "Suggested grants each week",
    tag: "Team",
    date: "October 11, 2026",
    highlights: [
      "Suggested grants in Opportunities. Tell us your country, career stage, genres and what you need, and each week we suggest up to three open grants that fit your team, with the award, the deadline and why it matched.",
      "Add a suggestion and it becomes a grant opportunity in your list, linked to the original call. Dismiss it and we will not suggest it again.",
      "When new grants arrive, you get a notification on your phone. Suggested grants are part of paid plans.",
    ],
  },
  {
    version: "1.117.0",
    title: "Find promo inside any rollout",
    tag: "Pitching",
    date: "October 11, 2026",
    highlights: [
      "Find promo inside any rollout: radio stations, music blogs and online music communities. Each one shows how to submit, who to contact, the lead time and whether it is free. Add one to your plan and it becomes an activity dated ahead of release day.",
      "Know a station, blog or community we are missing? Suggest it from the same screen. We check every suggestion before it is listed.",
      "When UrgAns builds your plan, it names a few promo channels that fit your song, one tap from the full list.",
    ],
  },
  {
    version: "1.116.0",
    listed: false,
    title: "Easier to find the pitch kit",
    tag: "Pitching",
    date: "October 11, 2026",
    highlights: [
      "The row of rollout tabs now fades at the edge and shows an arrow when more tabs are hidden, so Add cover art and the pitch kit are always easy to find.",
      "The pitch kit's progress is three short bars you can always see, one per step, even before you start.",
      "The note about UrgAns credits next to Write it for me is bigger and easier to read, and the gap under the story box is even with the other steps.",
      "In a press kit, Turn off the link sits on its own line under More options, and older kits no longer show an \"(old setting)\" label.",
      "When a rollout suggestion would change words you wrote yourself, it says so calmly instead of in a warning colour.",
      "Opening an activity always starts at its title. It no longer opens with the title and its checkbox half hidden under the Delete and Close buttons.",
      "New rollouts no longer show a leftover \"(Artist + Manager in v0.3)\" note in five activity descriptions.",
    ],
  },
  {
    version: "1.115.6",
    listed: false,
    tag: "App",
    date: "October 11, 2026",
    highlights: [
      "On a phone, typing in a rollout's Chat works like a messenger again: the box you type in sits right above the keyboard, with your messages filling the screen above it and the newest one in view. When the keyboard closes, the box goes back to just above the bottom bar, and the page behind the chat no longer slides off screen while you type.",
      "On a phone, Notifications opens at the top of your screen even after you have scrolled down a page. It used to open at the top of the page, out of sight. On a computer nothing changes.",
    ],
  },
  {
    version: "1.115.5",
    listed: false,
    tag: "App",
    date: "October 11, 2026",
    highlights: [
      "On a phone, the bar across the top of the screen is gone, on every screen, so your page starts right at the top. Search is now the first item when you tap More in the bottom bar. On a computer the top bar stays the same.",
    ],
  },
  {
    version: "1.115.4",
    listed: false,
    tag: "Team",
    date: "October 11, 2026",
    highlights: [
      "If you invite a teammate when your first plan is ready, Urganize no longer asks you to invite someone again a moment later. One invite is enough to keep going.",
    ],
  },
  {
    version: "1.115.3",
    listed: false,
    tag: "App",
    date: "October 11, 2026",
    highlights: [
      "On a computer, the menu at the top (Home, Catalogue and the rest) is back in the middle of the top bar, with the Urganize logo on the left and your icons on the right. On a phone the top bar stays the same.",
    ],
  },
  {
    version: "1.115.2",
    listed: false,
    tag: "App",
    date: "October 11, 2026",
    highlights: [
      "On a phone, the search button at the top of the screen now sits on the plain page background, without the tinted fade behind it. On a computer the top bar stays the same.",
    ],
  },
  {
    version: "1.115.1",
    listed: false,
    tag: "App",
    date: "October 11, 2026",
    highlights: [
      "On a computer, the Urganize logo is back at the top left of the top bar. Click it to go to Home. On a phone the top bar stays the same.",
    ],
  },
  {
    version: "1.115.0",
    title: "Credited people get a link to their page",
    tag: "Team",
    date: "October 11, 2026",
    highlights: [
      "When you credit someone on a rollout that is out, we email them a link to claim their page. If they don't claim it, we send one reminder a week later.",
    ],
  },
  {
    version: "1.114.0",
    listed: false,
    title: "Share your page once you claim it",
    tag: "Team",
    date: "October 11, 2026",
    highlights: [
      "When you claim your page, you can share it right away. Copy the link, send it on WhatsApp, or use your phone's share button.",
      "On your own page, when you are signed in, the same share buttons show at the bottom.",
      "People who read a page can now get their own page, or run their rollouts on Urganize, from a link at the bottom.",
    ],
  },
  {
    version: "1.113.0",
    listed: false,
    title: "Frame your profile photo",
    tag: "Team",
    date: "October 11, 2026",
    highlights: [
      "When you add a profile photo you can now frame it first. Drag to move it, zoom in, and the circle shows exactly what everyone will see.",
      "Artist photos now show in more places: the artist picker under your account or More, the Press kits list and editor, the public press kit page, and the top of every rollout.",
    ],
  },
  {
    version: "1.112.1",
    listed: false,
    tag: "App",
    date: "October 11, 2026",
    highlights: [
      "On a computer, the Pitch and Directory screens no longer repeat the page name and a line about it at the top, since the tab above already says where you are.",
    ],
  },
  {
    version: "1.112.0",
    listed: false,
    title: "See where the money went",
    tag: "Rollouts",
    date: "October 11, 2026",
    highlights: [
      "Tap \"Where the money went\" on Home to see a rollout's spend, or tap Add spend to log a cost straight away. The card now shows even before you have logged anything.",
      "The top bar is simpler. The logo and the name next to it are gone. On a phone only search is left at the top, and the UrgAns tab has no top bar at all.",
      "On a phone, notifications, your account and the artist you are looking at are now under More.",
      "The rollout menu on a phone opens as a full sheet, so you can reach every option.",
      "Rollout chat works like a messenger: the message box stays at the bottom, above the keyboard, and new messages are always in view.",
      "The Pitch screen is tidier, and the link box now asks for your private listening link.",
    ],
  },
  {
    version: "1.111.0",
    listed: false,
    title: "Artists get profile photos",
    tag: "Team",
    date: "October 11, 2026",
    highlights: [
      "Artists now have profile photos. Tap the face next to an artist on the Artists list, or on their page, to add or change one. Artists without a photo show their initials.",
      "Add your own photo to your directory record in Settings, and every card in the directory now shows a face. Your photo also leads your public profile page.",
    ],
  },
  {
    version: "1.110.2",
    listed: false,
    tag: "App",
    date: "October 11, 2026",
    highlights: [
      "On a computer, your rollout count and the Add rollout button now sit in the tab row at the top of Catalogue, so the list starts higher on the page.",
    ],
  },
  {
    version: "1.110.1",
    listed: false,
    tag: "Pitching",
    date: "October 11, 2026",
    highlights: [
      "Pitching now has its own spot in the menu: on a phone it sits in the bottom bar where Shows was, and on a computer it gets its own button at the top.",
      "Shows moved into Relationships, next to People and Directory. On a phone, find it under More.",
    ],
  },
  {
    version: "1.110.0",
    title: "A stronger model for plans",
    tag: "AI",
    date: "October 11, 2026",
    highlights: [
      "Rollout plans and bigger UrgAns questions now run on a stronger AI model that also costs fewer credits per plan.",
      "Speaking to UrgAns now uses newer speech-to-text, so what you say lands in the message box more accurately.",
      "Talk to UrgAns: start a voice call from the Talk button and UrgAns answers out loud, and can make plans, add tasks and move dates after you confirm. Calls cost 2 credits a minute.",
    ],
  },
  {
    version: "1.109.0",
    listed: false,
    title: "Start your first rollout straight away",
    tag: "Account",
    date: "October 11, 2026",
    highlights: [
      "Your first visit no longer opens the welcome tour, so you can start your first rollout straight away. The rollout tour is still in the help menu, and its Go to Team button now opens your team in Settings.",
      "In the rollout planner, Continue now says what is missing when it cannot move on yet, and the options are easier to tap on a phone.",
      "Before you order distribution, your rollout shows a checklist you can work through, with how many items are done.",
      "Buttons in the share sheet and on an activity are bigger and easier to tap on a phone, and Settings opens and types faster.",
    ],
  },
  {
    version: "1.108.0",
    title: "The pitch kit in three steps",
    tag: "Pitching",
    date: "October 11, 2026",
    highlights: [
      "The pitch kit is now three simple steps: tell the story, add who made it, share it. Each number turns into a check when it is done.",
      "One button, Write it for me, fills in what is missing. Give it a hint if you like.",
      "No more Save buttons. Your story and credits save when you click away.",
      "The press kit starts with four must-haves (About, Bio, Photos, Contact). Everything else sits under Extras, and Next walks you through.",
      "Sharing is one button and one link. Search, embargo and interview settings moved under More options.",
      "Plainer names everywhere: Assets is now Photos, Live is Shows, and the bio opens on one box.",
    ],
  },
  {
    version: "1.107.1",
    tag: "AI",
    date: "October 11, 2026",
    highlights: [
      "UrgAns keeps working when its usual AI models are down. It switches to a backup model, so your plan is still shaped around your answers.",
    ],
  },
  {
    version: "1.107.0",
    title: "A first plan shaped around you",
    tag: "AI",
    date: "October 11, 2026",
    highlights: [
      "Signing up asks what's already done just once. Your first plan then asks only three quick questions.",
      "UrgAns now shapes your first plan around what matters most to you and your budget. It marks where to start and can add a few steps made for you.",
      "Your first plan always gets built, even when UrgAns is busy.",
    ],
  },
  {
    version: "1.106.0",
    title: "Pitching, redesigned",
    tag: "Pitching",
    date: "October 11, 2026",
    highlights: [
      "Pitching, redesigned. You see curators' faces everywhere: when you pick, when you pay and when they answer. Their replies read like messages.",
      "After you send, the screen shows who it went to. Pick your song from a row of chips instead of a dropdown.",
      "Curators: tap Listen and it counts as listened. Then Add it or Pass, one tap each.",
      "Curator pages you share now open on a big photo, one button and your playlists as tiles.",
    ],
  },
  {
    version: "1.105.1",
    listed: false,
    tag: "Pitching",
    date: "October 11, 2026",
    highlights: [
      "The content calendar scrolls on desktop again. On shorter laptop screens the last weeks of the month were cut off with no way to reach them; now the whole month, including release week, scrolls into view.",
      "On laptop screens the calendar is more compact, so the whole month fits without scrolling on most of them.",
      "Long captions in the post editor now grow as you type instead of hiding behind a small box.",
    ],
  },
  {
    version: "1.105.0",
    title: "Sign up straight into your first rollout",
    tag: "Account",
    date: "October 11, 2026",
    highlights: [
      "After you sign up, Urganize takes you straight to your new rollout and starts its plan. It only asks the four things it does not know yet.",
      "Sign up now asks for the artist name, so you never type it twice.",
      "Your first plan is free.",
      "The last planner question is now \"What should the plan cover?\" Everything starts ticked. Untick what you do not want.",
    ],
  },
  {
    version: "1.104.0",
    listed: false,
    title: "Simpler pitching",
    tag: "Pitching",
    date: "October 11, 2026",
    highlights: [
      "Pitching is simpler. Curators now show as a picture grid. Tap one, paste your song link and send. Less text everywhere, on phone and desktop.",
    ],
  },
  {
    version: "1.103.0",
    title: "Share a rollout, get a month free",
    tag: "Account",
    date: "October 11, 2026",
    highlights: [
      "Share your rollout and get 1 month free. The first time you share, copy or save a post from the share sheet, we add 30 free days for your team. One free month per team.",
    ],
  },
  {
    version: "1.102.0",
    listed: false,
    title: "Get paid by fans directly",
    tag: "Rollouts",
    date: "October 11, 2026",
    highlights: [
      "On the Distribute step, you can now sign up with Fanlly to get paid by fans directly. Upload a track, share one link, and fans tip you by bank transfer or card. You keep 75% of every tip.",
      "Fanlly does not put your music in stores, so keep using your distributor for that.",
    ],
  },
  {
    version: "1.101.0",
    title: "Invite a teammate when your plan is ready",
    tag: "Team",
    date: "October 11, 2026",
    highlights: [
      "When your first rollout plan is ready, Urganize asks you to invite one teammate before you carry on, so your team sees the plan from day one.",
      "Pick who they are, send the invite, and share the link on WhatsApp if you like. Your plan opens straight back up.",
    ],
  },
  {
    version: "1.100.0",
    listed: false,
    title: "Tell us how we're doing",
    tag: "App",
    date: "October 11, 2026",
    highlights: [
      "Now and then, Home asks how likely you are to recommend Urganize. Tap a number from 0 to 10 and tell us why if you like.",
      "You can close it in one tap, and it will not ask again for a while.",
    ],
  },
  {
    version: "1.99.0",
    listed: false,
    title: "Featured and On the rise in the Directory",
    tag: "Team",
    date: "October 11, 2026",
    highlights: [
      "The directory now shows two short lists at the top: Featured, picked by hand each quarter, and On the rise this month, for people whose recent work helped a rollout come out.",
      "Nobody can pay to be on either list, and a list with nobody on it does not show.",
      "Search results are not ranked. The lists only show when you have not searched or filtered.",
    ],
  },
  {
    version: "1.98.0",
    title: "Artists can ask a manager to work with them",
    tag: "Team",
    date: "October 11, 2026",
    highlights: [
      "Artists can ask a manager to work with them, and say what they need. A yes starts a shared rollout for you both.",
      "On an open activity, tap Find someone to see people for that job. A yes puts them on the activity.",
      "If your plan has no room for another person, you get a clear message and a next step.",
    ],
  },
  {
    version: "1.97.0",
    title: "Claim your profile",
    tag: "Team",
    date: "October 11, 2026",
    highlights: [
      "If you worked on someone's rollout, they can now claim their own profile with a link and a few quick steps.",
      "Credited people get a page that shows their name, role and credits. They can ask for it to be removed.",
      "On your rollout, send the claim link by email or copy a WhatsApp message for the person you credited.",
    ],
  },
  {
    version: "1.96.0",
    title: "UrgAns drafts your directory bio",
    tag: "AI",
    date: "October 11, 2026",
    highlights: [
      "UrgAns can now draft your directory bio from the work you have done. You read it, change it, and only then does it save.",
      "If you are an artist, your directory page now shows the photo, bio, city and genre from your published press kit. You edit them in one place.",
      "A bio never shows on a profile that nobody has claimed yet.",
    ],
  },
  {
    version: "1.95.0",
    listed: false,
    title: "Directory profiles say what you are",
    tag: "Team",
    date: "October 11, 2026",
    highlights: [
      "Directory profiles now show what you are: Manager, Artist, Creative or Adjacent pro. The card leads with what matters most for that type.",
      "Say what you are open to, like taking new artists or open to hire. The Message button only shows when it fits.",
      "In the directory, filter by profile type and by what people are open to.",
    ],
  },
  {
    version: "1.94.0",
    listed: false,
    title: "Give the Home chat full width",
    tag: "AI",
    date: "October 10, 2026",
    highlights: [
      "On Home, tap Home in the top bar to fold the left side away and give the chat the full width. Tap it again to bring it back.",
    ],
  },
  {
    version: "1.93.2",
    listed: false,
    tag: "Pitching",
    date: "October 10, 2026",
    highlights: [
      "The Pitching page now shows where each rollout's editorial pitch stands, with a button to open the details.",
    ],
  },
  {
    version: "1.93.1",
    tag: "Pitching",
    date: "October 10, 2026",
    highlights: [
      "The editorial pitch now also points you to Apple Music for Artists, with where to paste your pitch.",
    ],
  },
  {
    version: "1.93.0",
    listed: false,
    title: "Home's chat is its own chat",
    tag: "AI",
    date: "October 10, 2026",
    highlights: [
      "Home's chat is now its own chat. It stays put and never goes away.",
      "Start a new session when you want to talk about something else. Your sessions list stays tidy.",
    ],
  },
  {
    version: "1.92.15",
    tag: "Pitching",
    date: "October 10, 2026",
    highlights: [
      "The Spotify pitch now tells you where to paste it and has a button that opens Spotify for Artists.",
    ],
  },
  {
    version: "1.92.14",
    listed: false,
    tag: "Team",
    date: "October 10, 2026",
    highlights: [
      "Once your team has joined, you no longer see the \"invite your team\" tip.",
    ],
  },
  {
    version: "1.92.13",
    listed: false,
    tag: "App",
    date: "October 9, 2026",
    highlights: [
      "Home counts the days to a release right wherever you are. It used to say a day too early in some time zones.",
      "The week of your rollout plan on Home now matches the day you picked.",
    ],
  },
  {
    version: "1.92.12",
    listed: false,
    tag: "Rollouts",
    date: "October 9, 2026",
    highlights: [
      "When you assign or update an activity, the alert to your teammate no longer gets lost when the app is busy.",
      "Who changed an activity is now always recorded.",
    ],
  },
  {
    version: "1.92.11",
    listed: false,
    tag: "Account",
    date: "October 9, 2026",
    highlights: [
      "Starting a payment now tells you when Paystack is too slow, instead of spinning forever.",
      "A slow phone notification service can no longer hold up your morning emails.",
    ],
  },
  {
    version: "1.92.10",
    listed: false,
    tag: "Rollouts",
    date: "October 9, 2026",
    highlights: [
      "Your data export now includes every activity, comment and file, no matter how big your team is.",
      "Deleting your account now removes all of your attachment files, not just the first batch.",
      "Home now shows your own upcoming shows even when other teams have many.",
    ],
  },
  {
    version: "1.92.9",
    listed: false,
    tag: "Team",
    date: "October 9, 2026",
    highlights: [
      "Teams with many rollouts now see every activity counted, so progress and \"Released\" are right.",
      "UrgAns now calls a rollout released when it has come out, the same as your catalog.",
    ],
  },
  {
    version: "1.92.8",
    listed: false,
    tag: "App",
    date: "October 9, 2026",
    highlights: [
      "When a lot of alerts arrive at once, you now get one message instead of one for each, and older assignments stay in the bell.",
    ],
  },
  {
    version: "1.92.7",
    listed: false,
    tag: "Rollouts",
    date: "October 9, 2026",
    highlights: [
      "The bell now says the same thing on screen and out loud, and a pile of \"overdue\" alerts shows as one line you can open.",
    ],
  },
  {
    version: "1.92.6",
    listed: false,
    tag: "App",
    date: "October 9, 2026",
    highlights: [
      "Opening, reloading or sharing a Settings link now always lands on Settings over your catalog, never on a \"page not found\" screen.",
    ],
  },
  {
    version: "1.92.5",
    listed: false,
    tag: "Rollouts",
    date: "October 9, 2026",
    highlights: [
      "A rollout that has already come out no longer asks you to fix things before you order distribution.",
    ],
  },
  {
    version: "1.92.4",
    listed: false,
    tag: "Rollouts",
    date: "October 9, 2026",
    highlights: [
      "The guided tour now shows \"Step 2 of 3\" with a small progress bar, and its Skip and Next buttons are bigger and easier to tap.",
    ],
  },
  {
    version: "1.92.3",
    listed: false,
    tag: "Team",
    date: "October 9, 2026",
    highlights: [
      "An empty Opportunities page now says what it is for and puts the Add opportunity button right there.",
    ],
  },
  {
    version: "1.92.2",
    listed: false,
    tag: "Rollouts",
    date: "October 9, 2026",
    highlights: [
      "When you go to delete a rollout, Urganize now checks how many activities it has before you confirm, so a full rollout never looks empty.",
      "In Settings, each rollout you can delete now shows when it was made, so two \"Untitled rollout\" rows are easy to tell apart.",
    ],
  },
  {
    version: "1.92.1",
    listed: false,
    tag: "Rollouts",
    date: "October 9, 2026",
    highlights: [
      "Starting a rollout from the + New rollout button and closing UrgAns before it finished no longer leaves an empty \"Untitled rollout\" in your catalogue. Anything you've already added to it is kept.",
    ],
  },
  {
    version: "1.92.0",
    listed: false,
    title: "See the plan before you answer",
    tag: "AI",
    date: "October 9, 2026",
    highlights: [
      "Before you answer UrgAns's questions, you can now see the plan it starts from: how many activities, how they split across the weeks, and a few of them by name. Looking is free.",
    ],
  },
  {
    version: "1.91.3",
    listed: false,
    tag: "Rollouts",
    date: "October 9, 2026",
    highlights: [
      "You can name a rollout as you create it. Leave the name empty and it stays Untitled rollout.",
      "Picking Single, EP or Album no longer starts the rollout straight away, so you can change your pick before you press Create rollout.",
    ],
  },
  {
    version: "1.91.2",
    listed: false,
    tag: "Rollouts",
    date: "October 9, 2026",
    highlights: [
      "Rollouts in your Catalogue now say Released once release day comes, or once every activity is done. Before, they all said Draft.",
      "The Released filter now shows those rollouts too.",
    ],
  },
  {
    version: "1.91.1",
    listed: false,
    tag: "App",
    date: "October 9, 2026",
    highlights: [
      "If one part of Home can't load, the rest of Home still shows instead of an error page.",
      "The \"Back to your rollouts\" button on the error page now takes you to your Catalogue.",
      "Closing the planner before you finish no longer leaves an empty \"Untitled rollout\" behind.",
      "A new, empty rollout no longer shows the distribution warning before you have started.",
    ],
  },
  {
    version: "1.91.0",
    listed: false,
    title: "Log what each rollout costs",
    tag: "Rollouts",
    date: "October 9, 2026",
    highlights: [
      "You can now log what you pay for on each rollout. Open Spend, add the cost, and see the total.",
      "Download the list as a spreadsheet.",
      "Thirty days after release day, Urganize asks what the rollout paid back, and shows your answer on the rollout.",
      "Managers also see where the money went, by type, on Home.",
    ],
  },
  {
    version: "1.90.0",
    title: "A check before you order distribution",
    tag: "Rollouts",
    date: "October 9, 2026",
    highlights: [
      "Before you order distribution, Urganize now checks your rollout and lists what the stores still need. Each item has a Fix button that takes you to the right spot.",
      "The sign-up button stays hidden until the things the stores need are filled in. If only small things are left, you can order anyway.",
      "Songs now have a Featured artist box, so you do not need to put it in the title.",
      "You now say Yes or No on whether a song is explicit. Before, it was a box that was quietly left unticked.",
    ],
  },
  {
    version: "1.89.0",
    title: "Pitch Spotify editorial in every plan",
    tag: "Pitching",
    date: "October 9, 2026",
    highlights: [
      "Every rollout plan now has a step to pitch Spotify editorial. It comes after you order distribution, and it is due 28 days before release day.",
      "Rollouts you already made get the step the first time you open them. You get reminders at 28, 14 and 8 days out.",
      "On Manager and above, Draft my pitch fills in your genre, moods, instruments and song description for you.",
    ],
  },
  {
    version: "1.88.5",
    listed: false,
    tag: "Rollouts",
    date: "October 9, 2026",
    highlights: [
      "Each task on Home now reads as one sentence, like \"Send the press release in Midnight EP by Dorian, 3 days overdue.\"",
      "Tap a task card anywhere to open it. The circle on the left only marks it done.",
      "Home's loading screen now matches how Home looks once it loads.",
    ],
  },
  {
    version: "1.88.4",
    listed: false,
    tag: "App",
    date: "October 7, 2026",
    highlights: [
      "Admin now lives in Settings. Credits is still one tap away from the credits badge at the top.",
    ],
  },
  {
    version: "1.88.3",
    listed: false,
    tag: "App",
    date: "October 7, 2026",
    highlights: [
      "The Sessions link in the top bar's More menu is gone. Your chats are still on Home, under Sessions.",
    ],
  },
  {
    version: "1.88.2",
    listed: false,
    tag: "App",
    date: "October 7, 2026",
    highlights: [
      "On a phone, press and hold any tab or menu item to see what it is for. A quick tap still opens it.",
    ],
  },
  {
    version: "1.88.1",
    listed: false,
    tag: "Team",
    date: "October 7, 2026",
    highlights: [
      "Pages like Relationships and Shows no longer repeat their name in a big heading.",
      "Rest your pointer on a menu item for half a second to see what it is for.",
    ],
  },
  {
    version: "1.88.0",
    title: "Home is your UrgAns chat",
    tag: "AI",
    date: "October 7, 2026",
    highlights: [
      "On a computer, Home is your UrgAns chat: your tasks on the left, UrgAns on the right.",
      "On a phone, type to UrgAns from the box at the bottom of Home. You can add a photo or a file, or talk.",
      "Your tasks and other lists on Home fold into neat stacks. Tap the label to open one.",
      "Your chats with UrgAns are now called sessions. Start a new one with New session.",
      "The circle you tick to finish a task is easier to see.",
    ],
  },
  {
    version: "1.87.0",
    listed: false,
    title: "Tag teammates with @",
    tag: "Team",
    date: "October 7, 2026",
    highlights: [
      "In a rollout's chat, type @ to tag someone. They get an email and a notification. Use @everyone to tag the whole team.",
    ],
  },
  {
    version: "1.86.0",
    listed: false,
    title: "Timeline gets its own tab",
    tag: "Rollouts",
    date: "October 7, 2026",
    highlights: [
      "Timeline now has its own tab in a rollout, so you can get back to it from Notes or Content.",
      "You can open the timeline full screen.",
    ],
  },
  {
    version: "1.85.1",
    listed: false,
    tag: "App",
    date: "October 7, 2026",
    highlights: [
      "Opening the chat from Home no longer freezes for a moment first.",
    ],
  },
  {
    version: "1.85.0",
    listed: false,
    title: "Smoother sending from Home",
    tag: "AI",
    date: "October 7, 2026",
    highlights: [
      "Sending a message from Home now slides your chat box down into the full chat, instead of jumping.",
    ],
  },
  {
    version: "1.84.1",
    listed: false,
    tag: "AI",
    date: "October 7, 2026",
    highlights: [
      "Opening UrgAns on your phone now brings up the keyboard right away.",
    ],
  },
  {
    version: "1.84.0",
    listed: false,
    title: "Close the Today panel, find saved chats",
    tag: "AI",
    date: "October 7, 2026",
    highlights: [
      "In the full chat you can close the Today panel, and bring it back from the Today button or by pressing Home.",
      "Your saved chats are back on desktop. Open them from the Chats button in the chat.",
    ],
  },
  {
    version: "1.83.0",
    listed: false,
    title: "Home chat opens the full chat",
    tag: "AI",
    date: "October 7, 2026",
    highlights: [
      "Typing in the Home chat box now opens the full chat with your message sent.",
      "Chat messages now appear in bubbles. On a computer, your priority task sits beside the chat.",
      "There is a Home arrow at the top of the chat to take you back.",
    ],
  },
  {
    version: "1.82.0",
    listed: false,
    title: "A cleaner Home",
    tag: "App",
    date: "October 7, 2026",
    highlights: [
      "Home is cleaner: the team name and the count chips under your greeting are gone.",
    ],
  },
  {
    version: "1.81.0",
    listed: false,
    title: "A simpler priority task",
    tag: "App",
    date: "October 7, 2026",
    highlights: [
      "The priority task card on Home is simpler: just the task and a button to open it.",
    ],
  },
  {
    version: "1.80.0",
    listed: false,
    title: "Attach, pick a rollout or talk from Home",
    tag: "AI",
    date: "October 7, 2026",
    highlights: [
      "The chat box on Home now has everything the UrgAns chat has: attach a photo or file, pick a rollout, and talk instead of typing.",
    ],
  },
  {
    version: "1.79.0",
    listed: false,
    title: "A normal chat box on Home",
    tag: "AI",
    date: "October 7, 2026",
    highlights: [
      "The chat box on Home now looks like a normal chat box. Press Enter to send.",
    ],
  },
  {
    version: "1.78.0",
    title: "UrgAns reads PDF, Word and Excel files",
    tag: "AI",
    date: "October 7, 2026",
    highlights: [
      "You can now attach PDF, Word and Excel files to a message in UrgAns, and it will read them.",
    ],
  },
  {
    version: "1.77.0",
    listed: false,
    title: "The ask bar is now a chat box",
    tag: "AI",
    date: "October 7, 2026",
    highlights: [
      "On Home, the ask bar is now a chat box. Type a message and UrgAns opens with it already sent.",
    ],
  },
  {
    version: "1.76.0",
    title: "Attach photos and files to UrgAns",
    tag: "AI",
    date: "October 7, 2026",
    highlights: [
      "You can now attach photos and text files to a message in UrgAns. Tap the plus, take a photo or pick a file, and UrgAns will read it.",
    ],
  },
  {
    version: "1.75.0",
    listed: false,
    title: "UrgAns reads its replies out loud",
    tag: "AI",
    date: "October 6, 2026",
    highlights: [
      "UrgAns can now read its replies out loud. Tap the speaker under any reply to listen.",
    ],
  },
  {
    version: "1.74.0",
    listed: false,
    title: "An easier ask bar on Home",
    tag: "AI",
    date: "October 6, 2026",
    highlights: [
      "On Home, the ask bar now sits right above \"See everything\" and is easier to spot.",
      "The round UrgAns button no longer shows on Home, since the ask bar does the same job.",
    ],
  },
  {
    version: "1.73.0",
    listed: false,
    title: "Cleaner screens and a new body font",
    tag: "App",
    date: "October 5, 2026",
    highlights: [
      "Cleaner screens. The small grey lines under titles and buttons now sit behind a tap-for-info icon.",
      "A new body font, Instrument Sans, and Young Serif now also headlines the calendar and share images.",
      "Settings is easier to scan. Your team, Artists and Press kits fold open one at a time.",
    ],
  },
  {
    version: "1.72.0",
    listed: false,
    title: "A calmer Home",
    tag: "App",
    date: "October 5, 2026",
    highlights: [
      "Home is calmer. It opens on the one thing to do, and the long lists wait behind See everything.",
    ],
  },
  {
    version: "1.71.0",
    listed: false,
    title: "A cleaner trial-ended page",
    tag: "Account",
    date: "October 5, 2026",
    highlights: [
      "The trial-ended page is cleaner. It shows what you built and one button to continue.",
      "On iPhone you can email yourself the link to pay on the web.",
      "Shows has a ticket icon, so it no longer looks like a record button.",
    ],
  },
  {
    version: "1.69.0",
    listed: false,
    title: "A calmer first visit",
    tag: "App",
    date: "October 4, 2026",
    highlights: [
      "Your first time on Home is calmer. You see Chappi and one button to start a rollout.",
    ],
  },
  {
    version: "1.68.0",
    listed: false,
    title: "New headline font",
    tag: "App",
    date: "October 4, 2026",
    highlights: [
      "Headlines have a new look. They use a chunkier, friendlier font.",
    ],
  },
  {
    version: "1.67.0",
    title: "Opportunities is open",
    tag: "Team",
    date: "October 4, 2026",
    highlights: [
      "Opportunities is open. Add the deals, grants, sync and brand work you are going after, and give each one a next step and a date.",
      "The list puts what is late first, so you know what to chase.",
    ],
  },
  {
    version: "1.66.0",
    listed: false,
    title: "A steadier phone bar and better search",
    tag: "App",
    date: "October 4, 2026",
    highlights: [
      "The bar at the bottom of your phone only tucks away when you really scroll. It stays put on short pages and in UrgAns.",
      "One search now finds the activities in the rollout you are in.",
      "UrgAns opens ready to type, and new icons make each area easier to spot.",
    ],
  },
  {
    version: "1.65.1",
    listed: false,
    tag: "App",
    date: "October 4, 2026",
    highlights: [
      "In Settings, Brand colors now stays folded until you open it, so Artists & brand is easier to scan.",
    ],
  },
  {
    version: "1.65.0",
    title: "A new look for Urganize",
    tag: "App",
    date: "October 4, 2026",
    highlights: [
      "Urganize has a new look. A top menu replaces the side menu, and every page now has a clear title and one main button.",
      "Home shows your day at a glance and the one task to do first.",
      "Your rollouts are in one table you can filter, with a card view if you prefer.",
      "If your plan ends, the screen now shows what is waiting for you and one clear way to continue.",
    ],
  },
  {
    version: "1.64.0",
    listed: false,
    title: "The content calendar is back",
    tag: "Pitching",
    date: "October 4, 2026",
    highlights: [
      "The content calendar is back. Plan your posts on a month grid, one calendar for each account.",
    ],
  },
  {
    version: "1.63.0",
    title: "A Distribute step on every rollout",
    tag: "Rollouts",
    date: "October 2, 2026",
    highlights: [
      "New Distribute step on every rollout. It checks you have what the stores need, then takes you to sign up with our distribution partner.",
    ],
  },
  {
    version: "1.62.0",
    title: "Every artist gets a page",
    tag: "Team",
    date: "October 2, 2026",
    highlights: [
      "Every artist now has their own page. See their rollouts, shows, team and press kit all in one place.",
      "When a rollout is done, it keeps the press kit it went out with. Changing the bio later will not change an old rollout.",
    ],
  },
  {
    version: "1.61.0",
    listed: false,
    title: "Use Urganize with just credits",
    tag: "Account",
    date: "October 2, 2026",
    highlights: [
      "No plan? If you have credits, you can now use all of Urganize with the Solo features, not just UrgAns.",
    ],
  },
  {
    version: "1.60.0",
    listed: false,
    title: "See your credits under the chat box",
    tag: "AI",
    date: "October 2, 2026",
    highlights: [
      "UrgAns now shows how many credits you have left, right under the chat box.",
    ],
  },
  {
    version: "1.59.0",
    listed: false,
    title: "Directory search on every plan",
    tag: "Account",
    date: "October 2, 2026",
    highlights: [
      "Every plan can now search the directory, Solo included.",
      "Solo is now for one person. To work with teammates, move up to Manager. Anyone already on your Solo team stays.",
    ],
  },
  {
    version: "1.58.0",
    title: "Buy more UrgAns credits",
    tag: "Account",
    date: "October 2, 2026",
    highlights: [
      "You can buy more UrgAns credits. Pick a pack and pay with your card or bank. They are added right away.",
      "A new credits page lists every credit you got and every credit you spent.",
      "If your plan ends, your credits stay. You can still use UrgAns with them.",
      "You see how many credits you have before UrgAns starts something.",
    ],
  },
  {
    version: "1.57.0",
    title: "Start a pitch from your story",
    tag: "Pitching",
    date: "October 2, 2026",
    highlights: [
      "When you pitch a playlist, one tap starts your note from the story you wrote in the Pitch kit.",
      "Your press kit can now pick up the story and credits from your latest rollout. You choose what to accept.",
    ],
  },
  {
    version: "1.56.0",
    title: "A pitch kit for every rollout",
    tag: "Pitching",
    date: "October 2, 2026",
    highlights: [
      "Each rollout now has a Pitch kit. Write the story behind it and show its credits, on top of your artist's press kit.",
      "Ask UrgAns to Fill both and it writes the empty parts of your press kit and the story. It never changes what you already wrote.",
    ],
  },
  {
    version: "1.55.0",
    title: "UrgAns runs on credits",
    tag: "AI",
    date: "October 1, 2026",
    highlights: [
      "UrgAns now uses credits. Every team starts with 50 free credits to try it.",
      "Credits never run out on their own. What you don't use stays with you.",
      "You see an estimate before UrgAns drafts a plan or a press kit section.",
    ],
  },
  {
    version: "1.54.0",
    listed: false,
    title: "Home fits your phone",
    tag: "App",
    date: "September 30, 2026",
    highlights: [
      "Home no longer gets cut off on the right side on your phone.",
    ],
  },
  {
    version: "1.53.0",
    listed: false,
    title: "Clearer fields and text",
    tag: "App",
    date: "September 30, 2026",
    highlights: [
      "Boxes you type in have a clearer outline, and small grey text is darker, so both are easier to see.",
      "You can pinch to zoom on your phone again.",
      "New passwords need at least 8 characters wherever you make one. Your current password still works to sign in.",
      "Menus, pop-ups and error messages work better with a keyboard and a screen reader.",
      "A greyed-out Next button in setup now tells you what is missing.",
    ],
  },
  {
    version: "1.52.0",
    listed: false,
    title: "Your chats in the side menu",
    tag: "AI",
    date: "September 30, 2026",
    highlights: [
      "Your UrgAns chats now sit in the menu on the left, right under the pages. Tap one to open it.",
      "The plus at the top of the list starts a new chat.",
    ],
  },
  {
    version: "1.51.0",
    listed: false,
    title: "One menu for your rollout on a computer",
    tag: "Rollouts",
    date: "September 30, 2026",
    highlights: [
      "On a computer, everything for your rollout now sits in one menu on the right, with UrgAns right under it.",
      "New activity moved next to your progress bar.",
      "The small cards for your other rollouts are gone. Tap the back arrow to pick a different one.",
    ],
  },
  {
    version: "1.50.0",
    listed: false,
    title: "Settings opens over your page",
    tag: "App",
    date: "September 29, 2026",
    highlights: [
      "Settings is now a pop-up. It opens right over the page you're on, with a short list of topics on the left, so you never lose your place.",
      "Type in the search box to jump straight to what you need, like your password or inviting someone.",
      "On your phone it fills the screen. Pick a topic, then tap the arrow to go back.",
      "If you close it while something you typed isn't saved yet, it asks first.",
    ],
  },
  {
    version: "1.49.0",
    listed: false,
    title: "A chat for every rollout",
    tag: "Team",
    date: "September 29, 2026",
    highlights: [
      "Every rollout now has its own chat. Anyone on the team with access to it can talk there, and every activity has its own smaller chat too, for the people working on just that one thing.",
    ],
  },
  {
    version: "1.48.1",
    listed: false,
    tag: "Rollouts",
    date: "September 25, 2026",
    highlights: [
      "Renaming a rollout used to quietly clear its release date, which could hide your whole plan and ask you to pick a date again. That's fixed now — renaming only changes the name.",
    ],
  },
  {
    version: "1.48.0",
    listed: false,
    title: "Talk to UrgAns",
    tag: "AI",
    date: "September 25, 2026",
    highlights: [
      "You can now talk to UrgAns instead of typing. Tap the mic, say what you need, and your words drop into the box to check and send.",
      "Nothing is sent until you tap send, so you can fix a name or a title first.",
    ],
  },
  {
    version: "1.47.0",
    listed: false,
    title: "Plans build as soon as you answer",
    tag: "AI",
    date: "September 25, 2026",
    highlights: [
      "UrgAns now builds your rollout plan the moment you finish answering its questions, instead of showing you a draft to approve first.",
      "Tell it what to leave out, like marketing or paid ads, and the plan follows what you asked for. It reads what you type, too.",
    ],
  },
  {
    version: "1.46.0",
    listed: false,
    title: "Shows is out of beta",
    tag: "Rollouts",
    date: "September 25, 2026",
    highlights: [
      "Shows is out of beta. The DJ pack you send now carries the actual tracks, and your run of show is yours to edit.",
      "Move a show's date and its links move with it, so your DJ's downloads keep working instead of going dead.",
      "Rename a set, fix a song's title or length, and see who already has a pack before you send it again.",
    ],
  },
  {
    version: "1.45.0",
    listed: false,
    title: "Artist colours for share images",
    tag: "Pitching",
    date: "September 24, 2026",
    highlights: [
      "You can now give each artist their own colors for share images, instead of Urganize's own colors. Set them in Settings, under the artist's name.",
    ],
  },
  {
    version: "1.44.0",
    title: "UrgAns remembers your conversations",
    tag: "AI",
    date: "September 24, 2026",
    highlights: [
      "UrgAns remembers your conversations now, so you can pick one back up later instead of starting fresh. Your past chats also show up in a history list, where you can reopen or delete them.",
    ],
  },
  {
    version: "1.43.1",
    listed: false,
    tag: "AI",
    date: "September 24, 2026",
    highlights: [
      "Asking UrgAns to draft a press kit section for you now works, instead of failing every time.",
    ],
  },
  {
    version: "1.43.0",
    listed: false,
    title: "Share to X and Snapchat",
    tag: "Pitching",
    date: "September 24, 2026",
    highlights: [
      "When you share a rollout, you can now also post to X or Snapchat, the same way as Instagram and WhatsApp.",
    ],
  },
  {
    version: "1.42.1",
    listed: false,
    tag: "AI",
    date: "September 24, 2026",
    highlights: [
      "UrgAns replies read cleanly now. Bold words show up bold, not wrapped in stars, and copying a reply gives you clean text.",
    ],
  },
  {
    version: "1.42.0",
    title: "Share a rollout in a few taps",
    tag: "Pitching",
    date: "September 24, 2026",
    highlights: [
      "Share a rollout on Instagram, as your WhatsApp status, or in a message to anyone. Answer four quick questions and we make the images and captions.",
      "After your first rollout, the share screen opens once by itself. After that, every rollout has a Share button, and you can ask UrgAns to open it.",
    ],
  },
  {
    version: "1.41.0",
    listed: false,
    title: "A 3-day free trial",
    tag: "Account",
    date: "September 10, 2026",
    highlights: [
      "The free trial is now 3 days instead of 14. Same terms otherwise: your whole team, no card.",
    ],
  },
  {
    version: "1.40.0",
    listed: false,
    title: "Three plans: Solo, Manager and Label",
    tag: "Account",
    date: "September 9, 2026",
    highlights: [
      "The Group plan is gone. There are three plans now: Solo, Manager and Label.",
      "The \"Most teams\" badge moved from Manager to Solo, since that is where most teams start.",
    ],
  },
  {
    version: "1.39.0",
    listed: false,
    title: "New yearly prices",
    tag: "Account",
    date: "September 9, 2026",
    highlights: [
      "New prices, and every plan is now paid once a year.",
      "There is no monthly option any more, so there is one price to read on every plan.",
      "Already paying? Your price stays exactly where it is. Ask us if you want to move to a new one.",
      "UrgAns suggests a few things to ask it when you open it, so there is somewhere to start.",
      "Asking UrgAns to add an activity works now. It did not know that word before.",
    ],
  },
  {
    version: "1.38.0",
    listed: false,
    title: "Fold the side menu to icons",
    tag: "App",
    date: "September 9, 2026",
    highlights: [
      "Keep dragging the side menu's right edge and it collapses to just icons. Drag it back out to bring the words back.",
      "Your team name and artist sit beside the logo now, not under it.",
      "The teammate and rollout counts are gone from the menu, so it looks the same open or collapsed.",
    ],
  },
  {
    version: "1.37.0",
    listed: false,
    title: "Releases are now rollouts",
    tag: "Rollouts",
    date: "September 9, 2026",
    highlights: [
      "Releases are now called rollouts. Same thing, clearer name. You will see it everywhere in the app.",
    ],
  },
  {
    version: "1.36.0",
    listed: false,
    title: "Pitching gets its own page",
    tag: "Pitching",
    date: "September 9, 2026",
    highlights: [
      "Pitching has its own page now. Open it from the side menu, the top bar or the bar at the bottom of your phone to see every pitch you have sent and what the playlist owner said.",
      "You can send a pitch from that page too. Pick the release, pick a playlist, send the song.",
      "Press kits moved into Settings. Open Settings, then Profile, and they are there.",
    ],
  },
  {
    version: "1.35.0",
    listed: false,
    title: "Plain hints in the side menu",
    tag: "App",
    date: "September 9, 2026",
    highlights: [
      "Hover a row in the side menu and it tells you what that page is for, in one plain line.",
      "The Metadata page is quieter. Every box has a small i beside it, so the explanation is there when you want it and out of the way when you don't.",
      "Shorter wording in a few more places, with the detail tucked behind the same small i.",
      "The Settings tab holding your team name, logo and artists is called Profile now.",
    ],
  },
  {
    version: "1.34.0",
    listed: false,
    title: "Resize the side menu",
    tag: "App",
    date: "September 9, 2026",
    highlights: [
      "You can resize the side menu now. Drag its right edge to make it wider or narrower, and double-click that edge to put it back.",
      "The width you pick is remembered, so the menu stays how you left it next time you open the app.",
      "The New release button is called New rollout now. Same button, same place.",
    ],
  },
  {
    version: "1.33.0",
    listed: false,
    title: "Sign in straight to UrgAns",
    tag: "AI",
    date: "September 9, 2026",
    highlights: [
      "Signing in takes you straight to UrgAns. Ask it something, or tap Catalog for your releases.",
      "UrgAns is first in the side menu and the top bar now, so it is the easiest thing to reach.",
      "Hover a row in the side menu and it tells you what that page is for, in one plain line.",
      "The Metadata page is quieter. Every box has a small i beside it, so the explanation is there when you want it and out of the way when you don't.",
      "Shorter wording in a few more places, with the detail tucked behind the same small i.",
      "The Settings tab holding your team name, logo and artists is called Profile now.",
    ],
  },
  {
    version: "1.32.1",
    listed: false,
    tag: "Rollouts",
    date: "September 8, 2026",
    highlights: [
      "Tapping \"Review your draft plan\" opens your plan again. Some people were being sent to the Metadata page instead.",
      "An old link to something you have since switched off now opens the release, instead of a page with nothing on it.",
    ],
  },
  {
    version: "1.32.0",
    title: "Better tailored plans, and a voice",
    tag: "AI",
    date: "September 8, 2026",
    highlights: [
      "UrgAns tailors your rollout plan more reliably now. It used to give up and hand you the plain playbook more often than it should have.",
      "UrgAns has a voice now — strict, a little bossy, and focused on getting your release out. Its replies also read clean, with no stray symbols.",
    ],
  },
  {
    version: "1.31.0",
    listed: false,
    title: "Notes are back",
    tag: "Rollouts",
    date: "September 8, 2026",
    highlights: [
      "Notes are back on. Park a thought mid-call with nothing to fill in first, then link it to a release whenever you want.",
      "You can search your notes now. It reads the whole note, not just the title, and your words can be in any order.",
      "Turn a note into an activity in one tap. It carries over the note's title, and the release the note belongs to.",
    ],
  },
  {
    version: "1.30.0",
    listed: false,
    title: "Metadata collection is back",
    tag: "Rollouts",
    date: "September 7, 2026",
    highlights: [
      "Metadata collection is back on. Fill in the details music stores need, and send collaborators a link so they can add their own credits and splits.",
      "The fan email capture page is back on too. Any link you shared for either of these works again, and everything people sent you while they were off is still there.",
      "The content calendar stays off for now.",
    ],
  },
  {
    version: "1.29.0",
    listed: false,
    title: "Ask UrgAns for your release recap",
    tag: "AI",
    date: "September 7, 2026",
    highlights: [
      "Ask UrgAns for your release recap and the card shows up right there in the chat. Pick Story or Square and save it without leaving the conversation.",
      "The Release recap button is gone. Ask for it in your own words, and mention anything worth remembering about the release — UrgAns will put it on the card.",
    ],
  },
  {
    version: "1.28.0",
    listed: false,
    title: "Ask UrgAns for a status update",
    tag: "AI",
    date: "September 7, 2026",
    highlights: [
      "Ask UrgAns for a status update instead of hunting for a button. Say \"status update\" or ask it in your own words, and the paragraph comes back in the chat with the numbers it was written from.",
      "The old Status update button is gone. One place to ask, and you can copy the paragraph straight out of the conversation.",
    ],
  },
  {
    version: "1.27.0",
    listed: false,
    title: "A look of its own",
    tag: "App",
    date: "September 7, 2026",
    highlights: [
      "Urganize has a look of its own now. A woven cloth texture and hand-drawn borders run through every screen you open, in light mode and dark.",
      "Nothing moved and nothing works differently. Same app, more character.",
    ],
  },
  {
    version: "1.26.1",
    listed: false,
    tag: "Team",
    date: "September 7, 2026",
    highlights: [
      "Going back into an artist's press kit is instant. It shows the kit straight away instead of a loading screen.",
    ],
  },
  {
    version: "1.26.0",
    title: "Ask anyone in the directory to work on a release",
    tag: "Team",
    date: "September 7, 2026",
    highlights: [
      "You can now ask anyone in the directory to work on a release. Say what the job is and send it.",
      "They answer in one tap. If they are interested, their email comes back to you and you can reply straight from the message.",
      "Everyone you asked, and what each of them said, shows on the release and in your settings.",
    ],
  },
  {
    version: "1.25.0",
    listed: false,
    title: "UrgAns knows your shows and press kits",
    tag: "AI",
    date: "September 7, 2026",
    highlights: [
      "UrgAns knows about your shows now. Ask what is coming up, build a set from the artist's catalogue, check whether it will run over your slot, and send the pack to your DJ.",
      "It can write and publish a press kit too. Talk a bio through with it, then tell it to put the kit live.",
      "It can also add someone to your roster, move a release to a different artist, and archive a release you have finished.",
      "And when you ask for something it is not allowed to do, it tells you where to find it instead of guessing.",
    ],
  },
  {
    version: "1.24.2",
    listed: false,
    tag: "Pitching",
    date: "September 5, 2026",
    highlights: [
      "The press kits tab opens straight away now. It shows what you saw last time while it quietly checks for anything new, instead of making you wait.",
      "Opening one artist's kit is quicker too. It used to ask the server twice before it could show you anything.",
    ],
  },
  {
    version: "1.24.1",
    listed: false,
    tag: "App",
    date: "September 5, 2026",
    highlights: [
      "The buttons at the bottom of your phone no longer come and go. Every one is always there, so nothing moves under your thumb.",
      "Press kits now sits at the end of that row.",
      "Song moved off it. You'll still find it in a release's menu, one tap away.",
    ],
  },
  {
    version: "1.24.0",
    title: "A press kit for every artist",
    tag: "Pitching",
    date: "September 5, 2026",
    highlights: [
      "Every artist has a press kit now. It lives at one link you keep, instead of making a new one for each release.",
      "Urganize fills in what it already knows about the artist and asks you for the rest. Add photos, a bio and who to contact, then publish when you are ready.",
      "Press kit links you have already sent still work. They start pointing at the new kit once you publish it.",
    ],
  },
  {
    version: "1.23.1",
    listed: false,
    tag: "Rollouts",
    date: "September 5, 2026",
    highlights: [
      "Opening an activity is calmer. Its name comes first now, with the status, release and due date on one quiet line underneath.",
      "The fields lost their labels and boxes. Tap any of them to change it, exactly as before.",
      "Notes stay hidden until you add some, and you can now invite a teammate from inside the assignee list.",
    ],
  },
  {
    version: "1.23.0",
    listed: false,
    title: "Tell us from inside the app",
    tag: "App",
    date: "September 3, 2026",
    highlights: [
      "Something broken, or something you wish Urganize did? Tell us from inside the app. Tap the “?” at the top, or open Settings → Account on your phone.",
      "We get the page you were on and which release you had open, so you don’t have to explain where it happened.",
    ],
  },
  {
    version: "1.22.0",
    title: "UrgAns helps with strategy and ideas",
    tag: "AI",
    date: "September 3, 2026",
    highlights: [
      "UrgAns can now help with creative direction, content ideas, marketing strategy, and career advice — just ask, no special phrasing needed.",
      "Ask UrgAns to compare your last few releases or show you who on your team is carrying the most work right now.",
      "UrgAns will tell you plainly when it doesn't have streaming or audience numbers, instead of guessing.",
    ],
  },
  {
    version: "1.21.0",
    listed: false,
    title: "Three release tools paused",
    tag: "Rollouts",
    date: "September 3, 2026",
    highlights: [
      "We turned off three release tools for now: Metadata collection, the fan email capture page, and the content calendar. Any links you shared for these will stop working until we turn them back on.",
      "Nothing you already saved is gone. Your metadata, credits, calendar posts and email signups are all still there, waiting for these to come back.",
    ],
  },
  {
    version: "1.20.1",
    listed: false,
    tag: "App",
    date: "September 2, 2026",
    highlights: [
      "Renaming a set works properly now. Typing no longer wipes what you had just typed with each new letter.",
    ],
  },
  {
    version: "1.20.0",
    listed: false,
    title: "Shows are here",
    tag: "Rollouts",
    date: "September 2, 2026",
    highlights: [
      "Shows are here. Book a date, keep its run of show, and build the set against the minutes you were given. The total tells you if it fits.",
      "Send the tracks to your DJ as a pack. Each person gets their own link, so you can see who opened it and who downloaded.",
      "Playing a festival? Book several days and several artists at once. Each day and each artist gets its own show, set and pack.",
      "Give a set any name you like. Tap Rename on the set you are looking at.",
    ],
  },
  {
    version: "1.19.0",
    listed: false,
    title: "Notifications on Android",
    tag: "App",
    date: "September 2, 2026",
    highlights: [
      "The Android app can now send you notifications, the same as the web app: when an activity is due, when one is handed to you, and when we have news. Install the newest build of the app, then tap Turn on when the card appears after you sign in, or switch it on any time in Settings.",
      "Notifications you turned on in a browser keep working. Turning them on in the app adds your phone to the list, so both ring.",
    ],
  },
  {
    version: "1.18.0",
    title: "Install Urganize on your device",
    tag: "App",
    date: "September 2, 2026",
    highlights: [
      "After about a minute in the app, we offer to put Urganize on your device. On Android, one tap gets you the app. On a computer, one tap installs it in its own window. On an iPhone, the card shows you the two taps that add it to your Home Screen.",
      "Say Not now and it stays out of your way for the rest of the visit. Once you have installed it, we do not ask again.",
      "If you turn the install down, the notifications card follows a moment later, so you still get the choice.",
    ],
  },
  {
    version: "1.17.0",
    listed: false,
    title: "Turn on notifications",
    tag: "App",
    date: "September 2, 2026",
    highlights: [
      "Urganize now asks if you want notifications on. A small card shows up shortly after you sign in, on each device you use. Tap Turn on and your phone or computer will tell you when an activity is due or handed to you, even when the app is closed.",
      "Said no? Tap Not now and it stays quiet. You can always turn notifications on later in Settings.",
    ],
  },
  {
    version: "1.16.0",
    title: "Try a test release",
    tag: "Rollouts",
    date: "September 1, 2026",
    highlights: [
      "Just want to look around first? Try a test release. One tap sets up a full plan you can play with, and you can delete it whenever you are done.",
    ],
  },
  {
    version: "1.15.0",
    listed: false,
    title: "The Solo plan",
    tag: "Account",
    date: "September 1, 2026",
    highlights: [
      "Solo is now a plan you can pick. It is for one artist, and it is the cheapest way in.",
      "When your plan is full and you invite someone, we now tell you so. The button used to just go grey without saying why.",
    ],
  },
  {
    version: "1.14.1",
    listed: false,
    tag: "App",
    date: "September 1, 2026",
    highlights: [
      "Home and Catalog always take you back to your full list of releases now. If you only had one release, they used to pull you straight back into it.",
    ],
  },
  {
    version: "1.14.0",
    listed: false,
    title: "One menu button on your phone",
    tag: "App",
    date: "August 31, 2026",
    highlights: [
      "On your phone, the row of buttons above your activities is gone. Everything it held is in the menu button at the bottom of the screen, along with everything that was already there.",
      "The menu is in order of what you use most, so the things you open every week are at the top. The one you have open is highlighted.",
    ],
  },
  {
    version: "1.13.0",
    listed: false,
    title: "Search your catalog",
    tag: "App",
    date: "August 31, 2026",
    highlights: [
      "Your catalog has a search bar at the top now, on your phone and on your computer. Type part of a release name or an artist name to find it.",
      "The search on your phone also finds pages now, not just activities. Type \"billing\" and it takes you to Settings.",
    ],
  },
  {
    version: "1.12.0",
    listed: false,
    title: "Phone search finds activities",
    tag: "App",
    date: "August 31, 2026",
    highlights: [
      "On your phone, the search button now searches your activities. Type a few letters and tap the one you want. It used to only look through the menu's own eight buttons, so it could never find an activity.",
      "The menu button opens just the menu. The search box is gone from it, because search has its own place now.",
    ],
  },
  {
    version: "1.11.3",
    listed: false,
    tag: "Rollouts",
    date: "August 31, 2026",
    highlights: [
      "Shows has its own microphone icon now. It used to share the calendar icon with your content calendar, so on a big screen the two were hard to tell apart.",
      "The content calendar is now just called Content.",
    ],
  },
  {
    version: "1.11.2",
    listed: false,
    tag: "AI",
    date: "August 31, 2026",
    highlights: [
      "UrgAns opens on your phone again. The notifications button we added earlier today was stopping it, so we have taken that button back out and will put it back once it works properly.",
    ],
  },
  {
    version: "1.11.1",
    listed: false,
    tag: "App",
    date: "August 31, 2026",
    highlights: [
      "The bottom menu on your phone shows icons only now, with no words under them, so the buttons are bigger and easier to hit.",
      "Your notifications are on your phone at last. Open UrgAns and tap the bell in the bottom menu to see them.",
    ],
  },
  {
    version: "1.11.0",
    listed: false,
    title: "Back to your catalog in one tap",
    tag: "App",
    date: "August 31, 2026",
    highlights: [
      "Tap Catalog in the side menu to leave a release and get back to your list. It used to look like you were already there, so it was easy to miss.",
      "Catalog now has an arrow. Open it to see all your releases and jump straight to any one of them.",
    ],
  },
  {
    version: "1.10.2",
    listed: false,
    tag: "Rollouts",
    date: "August 31, 2026",
    highlights: [
      "Notes and Shows now open straight away instead of loading when you tap them. The app gets them ready in the background while you read, the same way it already did for your catalog and UrgAns.",
    ],
  },
  {
    version: "1.10.1",
    listed: false,
    tag: "App",
    date: "August 31, 2026",
    highlights: [
      "If the app reloads itself after we ship an update, it now takes you to the page you tapped instead of dropping you back where you started.",
    ],
  },
  {
    version: "1.10.0",
    title: "A whole release on one timeline",
    tag: "Rollouts",
    date: "August 31, 2026",
    highlights: [
      "See a whole release on one screen. Every activity sits on a week line with today marked, so you can tell what is late and what is coming without reading a list.",
      "Drag an activity to another week to move it. On a phone you get the same week-by-week view to read.",
    ],
  },
  {
    version: "1.9.1",
    listed: false,
    tag: "Rollouts",
    date: "August 30, 2026",
    highlights: [
      "The back arrow next to a release name now always takes you to your list of releases. It used to guess where you came from, and it guessed wrong a lot.",
    ],
  },
  {
    version: "1.9.0",
    listed: false,
    title: "Meet Chappi",
    tag: "AI",
    date: "August 30, 2026",
    highlights: [
      "Meet Chappi, the face of UrgAns. He waits with you while UrgAns thinks, sits on screens that are still empty, and turns up to celebrate when every activity on a release is done.",
    ],
  },
  {
    version: "1.8.0",
    listed: false,
    title: "Remove an artist you added by mistake",
    tag: "Team",
    date: "August 30, 2026",
    highlights: [
      "You can remove an artist you added by mistake. It only works if they have no releases and nobody is limited to seeing them, and it tells you which one is in the way.",
    ],
  },
  {
    version: "1.7.0",
    listed: false,
    title: "Move a release to another artist",
    tag: "Rollouts",
    date: "August 30, 2026",
    highlights: [
      "Filed a release under the wrong artist? You can move it now, from the release itself.",
    ],
  },
  {
    version: "1.6.0",
    title: "Work with more than one artist",
    tag: "Team",
    date: "August 30, 2026",
    highlights: [
      "You can work with more than one artist now. Add them in Settings, and pick who a release is for when you create it.",
      "Invite an artist and they only see their own releases. You can now do that for an artist who has no releases yet.",
    ],
  },
  {
    version: "1.5.4",
    listed: false,
    tag: "Rollouts",
    date: "August 29, 2026",
    highlights: [
      "The back arrow on a release always takes you somewhere now. Before, it could bounce you between the same two screens and you could never get out.",
    ],
  },
  {
    version: "1.5.3",
    listed: false,
    tag: "Rollouts",
    date: "August 29, 2026",
    highlights: [
      "Picking who does an activity is now a simple dropdown. Tap it and the list of your team opens — no keyboard pops up over it any more.",
    ],
  },
  {
    version: "1.5.2",
    listed: false,
    tag: "Rollouts",
    date: "August 29, 2026",
    highlights: [
      "The assignee box shows your whole team again. If an activity was already assigned to someone, opening the box only showed that one person, so you could not hand the work to anybody else.",
      "Tapping a box no longer zooms the page in on your phone. That was happening on almost every field in the app.",
      "Fixed a rare case in the plan editor where moving past the assignee box could quietly clear who it was assigned to.",
    ],
  },
  {
    version: "1.5.1",
    listed: false,
    tag: "Team",
    date: "August 29, 2026",
    highlights: [
      "Your teammates can now open a release's pages — Collect metadata, the calendar, the press kit and the rest. Before, those pages said \"Release not found.\" unless you were the person who created the release.",
      "If the Collect metadata page can't refresh, you keep what already loaded and get a Retry button instead of the page going blank.",
    ],
  },
  {
    version: "1.5.0",
    title: "Handed-off activities arrive by email",
    tag: "Team",
    date: "August 29, 2026",
    highlights: [
      "When you hand an activity to a teammate, they now get an email as well, not just a notification. It reads like a note from you, with the activity, the release and the due date, and a button that opens it.",
      "This also works when you create an activity that is already assigned to someone. Before, that told nobody at all.",
    ],
  },
  {
    version: "1.4.3",
    listed: false,
    tag: "Team",
    date: "August 29, 2026",
    highlights: [
      "Invite links are dependable now. If a teammate created an account from your link but never landed in your workspace, that can no longer happen: they join automatically the next time they sign in.",
      "Signing up on a weak connection used to leave a teammate stuck outside the team, so you could not assign them anything and they could not see your releases. Both are fixed by the same change.",
    ],
  },
  {
    version: "1.4.2",
    listed: false,
    tag: "App",
    date: "August 28, 2026",
    highlights: [
      "No more pop-up the moment you land. If you have no releases yet, you get to look around first, and the app offers to help a little later.",
      "You can close that create-release window now. The Create release button is right there whenever you are ready.",
    ],
  },
  {
    version: "1.4.1",
    listed: false,
    tag: "Account",
    date: "August 27, 2026",
    highlights: [
      "The credits form now remembers the person filling it in. Next time you send them a link, their name, email and publishing details are already there, so they only add what is new.",
      "It remembers on their own phone or computer, never on ours, and it never fills in shares or what they did on the song. Those change with every song.",
    ],
  },
  {
    version: "1.4.0",
    listed: false,
    title: "Hear when credits come in",
    tag: "Rollouts",
    date: "August 27, 2026",
    highlights: [
      "When someone sends their credits, you hear about it straight away, with what they filled in. No more checking the page to see if anyone answered.",
      "You can download everyone's credits as a spreadsheet. The shares come out as real numbers, so you can add up the column and see if it reaches 100.",
      "If someone goes back and fixes their answer, we do not message you a second time.",
    ],
  },
  {
    version: "1.3.0",
    title: "Close and reopen a credits link",
    tag: "Rollouts",
    date: "August 27, 2026",
    highlights: [
      "You can now close a credits link when you are done collecting, and open it again later. Anyone who opens a closed link sees a short note instead of the form.",
      "If the same person fills in the form twice, their new answer replaces the old one. Before, you got two entries for one person and your shares added up wrong.",
      "Writers and producers now have to enter their share, so you are not left chasing the one number you need.",
      "Your song details have a new ISWC box, next to ISRC and UPC.",
      "The credits form is easier to fill in on a phone, and new answers show up as soon as you open the page.",
    ],
  },
  {
    version: "1.2.1",
    listed: false,
    tag: "App",
    date: "August 27, 2026",
    highlights: [
      "Your workspace logo and your profile photo now show up after you upload them. A very large picture used to upload fine and then never appear, leaving a broken box with nothing you could do about it.",
      "Big pictures are shrunk before they upload, so they save faster and load quickly even on a slow connection.",
    ],
  },
  {
    version: "1.2.0",
    title: "Connect your AI app to Urganize",
    tag: "AI",
    date: "August 25, 2026",
    highlights: [
      "Connect the AI app you already use to Urganize and ask it about your releases. It can see your releases, activities and notes, and add or change them — it cannot delete anything.",
      "You decide which apps get in, and you can cut any of them off at any time from Settings.",
    ],
  },
  {
    version: "1.1.4",
    listed: false,
    tag: "Account",
    date: "August 25, 2026",
    highlights: [
      "You stay logged in. A slow or patchy connection used to sign you out for real — you would come back to the app, or reopen it on your phone, and be asked to log in again even though nothing was wrong with your account. Now a request that does not get through is treated as exactly that, and your session is left alone.",
      "A hiccup loading your profile no longer looks like being logged out, and no longer shows you a red error while you are working.",
      "If your session genuinely does end, the login page now tells you so instead of appearing out of nowhere, and your email is still filled in.",
    ],
  },
  {
    version: "1.1.3",
    listed: false,
    tag: "App",
    date: "August 25, 2026",
    highlights: [
      "On a computer, pages inside a release now use the full width. Collect metadata, your calendar, files and your press kit were being squeezed into a narrow strip with empty space next to them.",
      "The buttons next to a share link no longer get cut off.",
    ],
  },
  {
    version: "1.1.2",
    listed: false,
    tag: "Rollouts",
    date: "August 25, 2026",
    highlights: [
      "The Collect metadata page is easier to read. You now see three small steps — tap one to open it.",
      "Each step shows a quick note, like how many details you've filled in or whether your link is live, so you know what's left without opening anything.",
    ],
  },
  {
    version: "1.1.1",
    listed: false,
    tag: "Rollouts",
    date: "August 25, 2026",
    highlights: [
      "The back arrow above a release now takes you back. If you have a page open like Cover art or Song, it closes that first and puts you back on your activities. Press it again and you go to wherever you were before.",
      "Fixed a case where the back arrow did nothing at all if you only had one release.",
    ],
  },
  {
    version: "1.1.0",
    listed: false,
    title: "Pick your plan in the app",
    tag: "Account",
    date: "August 24, 2026",
    highlights: [
      "You can now pick your plan in the app. Manager, Label or Group, paid monthly or once a year.",
      "Every plan says plainly what it covers: how many people can be on your team, how many releases you can run at once, and how much UrgAns you get.",
      "Bigger setups are priced per deal. If Group fits you, there is a button to talk to us instead of paying online.",
    ],
  },
  {
    version: "1.0.0",
    title: "Urganize 1.0, with UrgAns switched on",
    tag: "AI",
    date: "August 24, 2026",
    highlights: [
      "Urganize is 1.0. UrgAns, your AI helper, is switched on.",
      "Ask UrgAns anything about your releases and it answers right away.",
      "Tell it what to do and it does it: start a release, add an activity, tick one off, save a note.",
      "It always asks first before doing anything you can't undo.",
    ],
  },
  {
    version: "0.61.0",
    listed: false,
    title: "Switch plans any time",
    tag: "Account",
    date: "August 23, 2026",
    highlights: [
      "You can switch plans any time. Moving up only charges for the days you have left, and your paid-through date stays the same. Moving down costs nothing and starts when your paid time ends.",
      "If your card fails, you don't get locked out. You can still open everything. You just can't make changes until it's sorted.",
      "You can download your data any time, on any plan. One file has everything, and a second one is a spreadsheet of your activities.",
      "Finished a release? Archive it to clear it off your list. Nothing is deleted, and you can bring it back.",
      "Settings now shows which plan is on, how many teammates it covers, and who can change it.",
    ],
  },
  {
    version: "0.60.0",
    listed: false,
    title: "A 14-day free trial for every team",
    tag: "Account",
    date: "August 22, 2026",
    highlights: [
      "Every team now starts with a 14-day free trial of the whole product, no card required. The trial belongs to the team rather than to each person, so bringing teammates in does not start a fresh clock for them.",
      "In the last ten days of a trial, a quiet line at the top of the app tells you how many are left. Nothing is held back or hidden while it runs — the trial is the full product.",
      "When a trial ends, everything you built stays exactly where it is: releases, activities, files, notes, all of it. Nothing is deleted, and it is all waiting the moment a plan is active.",
      "One plan covers everyone on your team. If you would rather talk to a person, or you need an invoice, that is on the same screen — a roster deal gets scoped and quoted by hand.",
      "Billing in Settings now speaks for the team: how long the trial has left, which plan is active, and who can change it. If billing is not yours to handle, one tap tells the person whose it is.",
    ],
  },
  {
    version: "0.59.1",
    listed: false,
    tag: "App",
    date: "August 21, 2026",
    highlights: [
      "On your phone, everything you can open for a release — Plan, Collect metadata, Pitch, Files, Calendar, Press kit — now sits together at the bottom of the screen, stacked so you can see all of it at once. It stays put while you scroll your activities, and nothing runs off the side of the screen the way the old sideways-scrolling row did.",
      "Notes came off that row, since it already has its own tab in the bar at the bottom of your phone screen.",
      "The content calendar is no longer marked Beta.",
    ],
  },
  {
    version: "0.59.0",
    listed: false,
    title: "A cleaner sign-in",
    tag: "Account",
    date: "August 21, 2026",
    highlights: [
      "The sign-in page got a clean new look: your logo up top and two simple buttons — Continue with Google or Continue with Email.",
      "Signing in with email is now one step at a time. Type just your email and continue: if you have an account, the password field appears right there; if you're new, you go straight into sign-up with your email already filled in.",
      "Stuck at the door? A \"Having trouble signing in? Contact us\" link at the base of the page opens a chat with us.",
    ],
  },
  {
    version: "0.58.1",
    listed: false,
    tag: "AI",
    date: "August 21, 2026",
    highlights: [
      "Tapping the UrgAns icon while already on the assistant page now takes you back to your workspace — before, it did nothing.",
      "On phones, switching between UrgAns and Home no longer loses the release you had pinned in the assistant.",
    ],
  },
  {
    version: "0.58.0",
    listed: false,
    title: "A welcome note when you join",
    tag: "Account",
    date: "August 21, 2026",
    highlights: [
      "New members now get a welcome note from Lucky in their inbox when they finish setting up — with a direct line to him on WhatsApp if anything feels confusing.",
    ],
  },
  {
    version: "0.57.0",
    title: "Invites arrive by email",
    tag: "Team",
    date: "August 21, 2026",
    highlights: [
      "Teammate invites now arrive by email. Invite someone with their address from Settings or UrgAns and the join link lands in their inbox — the copyable link is still there as a backup for sharing in a chat.",
    ],
  },
  {
    version: "0.56.3",
    listed: false,
    tag: "Rollouts",
    date: "August 18, 2026",
    highlights: [
      "Creating a release with a rollout plan no longer asks twice whether it's a single, EP or album. You answer once in the create window, and the planner walkthrough carries that answer forward — it now starts at the artist question, six questions instead of seven.",
      "Choosing a rollout plan now takes you straight into the planning questions no matter where you created the release from — the workspace, UrgAns, or the new-release button in the bar — instead of only from the workspace.",
    ],
  },
  {
    version: "0.56.2",
    listed: false,
    tag: "AI",
    date: "August 18, 2026",
    highlights: [
      "Asking UrgAns to create a release now works end to end. It used to walk you through the seven rollout questions and then stop with “there is already a release plan” — it had no way to create the release, so it aimed the plan at one you already had. Now, when you finish the questions, it creates the new release and drafts its rollout plan in one go.",
      "If a plan is ever pointed at a release that already has its activities, UrgAns now says so and offers to plan a new release instead of giving up.",
    ],
  },
  {
    version: "0.56.1",
    listed: false,
    tag: "AI",
    date: "August 16, 2026",
    highlights: [
      "The message box in UrgAns now sits right on top of the keyboard on your phone. It used to float in the middle of the screen with a band of empty space underneath it, which was worst on iPhone.",
      "The box is a single line now. The release you're talking about sits beside what you're typing instead of taking a row of its own, so more of the screen is your conversation.",
      "Your conversation reads from the top of the screen downwards, the way other assistants do, instead of starting at the bottom and growing up.",
    ],
  },
  {
    version: "0.56.0",
    listed: false,
    title: "A login to send your team",
    tag: "Team",
    date: "August 16, 2026",
    highlights: [
      "Creating a release now hands you a login to send to your team. You don't have to go looking for it — the moment the release is set up, the link is there to copy straight into a message or an email.",
      "A new Team logins section in Settings lets you create as many logins as you need, one per person, and label each one so you know who you sent it to.",
      "Nobody has to be sent a password. Whoever opens your link chooses their own on the way in, so there's never a password sitting in a chat you'd have to go back and delete.",
      "You can revoke any login you've handed out. It stops working immediately, and anyone who already joined keeps their access.",
    ],
  },
  {
    version: "0.55.2",
    tag: "Rollouts",
    date: "August 15, 2026",
    highlights: [
      "Your activities are grouped by what state they're in, not only by when they're due. In Progress, Blocked, In Review, Backlog and Locked each get their own group now, so the work you've actually started is visible at a glance instead of sitting unmarked among everything else.",
      "Every group's bar shows how much of the release sits in that state, so you can read the shape of a release — how much is underway, how much is waiting, how much is done — without opening anything.",
      "Groups with nothing in them stay hidden, so the list only shows the states your release is actually in.",
    ],
  },
  {
    version: "0.55.1",
    listed: false,
    tag: "Rollouts",
    date: "August 15, 2026",
    highlights: [
      "Your activities list now shows all five time groups — Overdue, Due today, Due this week, Upcoming and No due date — from the moment a release has work in it, so you can read at a glance how the release is spread across the weeks ahead instead of only seeing the groups that happen to be occupied.",
    ],
  },
  {
    version: "0.55.0",
    title: "Plan EPs and albums",
    tag: "Rollouts",
    date: "August 14, 2026",
    highlights: [
      "You can plan EPs and albums now, not just singles. Creating a release asks what you're putting out, and each one gets a playbook built for its shape rather than a single's plan stretched to fit.",
      "The EP playbook runs 16 weeks and is built around a lead single that drops six weeks ahead of the EP, so the single's numbers are in hand when you pitch the EP to playlists.",
      "The album playbook runs 21 weeks around two singles, at twelve weeks and six weeks out, with the album announcement landing alongside the second one.",
      "Both cover the work a multi-track release actually needs: metadata and split sheets for every track, one content shoot that covers the whole record, and a track-by-track push after release day.",
    ],
  },
  {
    version: "0.54.2",
    listed: false,
    tag: "Rollouts",
    date: "August 14, 2026",
    highlights: [
      "Every group in your activities list now carries a slim progress bar showing how much of it is underway. Work you've started fills the bar, so you can read a release's momentum at a glance without opening a single group.",
    ],
  },
  {
    version: "0.54.1",
    listed: false,
    tag: "Rollouts",
    date: "August 14, 2026",
    highlights: [
      "Amber warning notices are much easier to read in the light theme. The amber was too pale against the cream background to read comfortably even on its own, so the notices that tell you a release has no date yet, or that an invite is about to expire, were harder to read than the ordinary text around them.",
    ],
  },
  {
    version: "0.54.0",
    listed: false,
    title: "Press kits are back",
    tag: "Pitching",
    date: "August 14, 2026",
    highlights: [
      "Press kits are back. Open a release and you can generate a shareable link again — one page with the artwork, the details and your promo shots, ready to send to a blog, a playlist or a radio show.",
      "The Press kit button now sits beside Calendar at the bottom of your activities, so both of the things you send out live in the same place.",
    ],
  },
  {
    version: "0.53.1",
    listed: false,
    tag: "Rollouts",
    date: "August 14, 2026",
    highlights: [
      "Delete buttons look like delete buttons again. The red fill behind them was never actually being drawn, so anything asking you to confirm deleting a release or a note — or the card UrgAns shows before it does something it can't undo — came out as a thin outline with red writing inside it, far fainter than a warning should look.",
      "Red warning text is easier to read across the app, in both the light and dark themes. The red sat too pale on the light background and too dull on the dark one, so error messages and delete warnings were among the hardest things on the page to read at exactly the moment they mattered most.",
    ],
  },
  {
    version: "0.53.0",
    title: "UrgAns runs more of your workspace",
    tag: "AI",
    date: "August 14, 2026",
    highlights: [
      "UrgAns can now run more of your workspace for you: rename a release, set or move its date, delete a release or an activity, comment on an activity, and find, edit, pin or delete your notes — just by asking.",
      "Ask UrgAns to assign work to someone by name and it looks up the right teammate instead of guessing.",
      "Plan a rollout by talking it through: UrgAns asks what you're releasing, when, what's ready and what you're going for, then drafts the plan from the playbook — no form to fill in.",
      "UrgAns can also fill in your distribution details (ISRC, UPC, genre, label, the (P) and (C) lines), plan content posts on your calendars, invite or remove teammates, pitch a song to a playlist, and handle your press kit link and release recap.",
      "Anything that can't be undone now asks first. UrgAns shows a card spelling out exactly what will happen — including how many activities go with a release, or how many a plan is about to create — and nothing runs until you approve it.",
    ],
  },
  {
    version: "0.52.0",
    listed: false,
    title: "Settings shows what you pay for",
    tag: "Account",
    date: "August 14, 2026",
    highlights: [
      "Settings now tells you what you are paying for. Billing sits at the top of the Account tab and says whether you are on a trial or a plan, how much of it is left, and the date it runs to. Paying used to finish on a screen with a Billing button that led to a page with no billing on it anywhere.",
      "From there you can go straight to the plans to start, change or renew. If you are on a Label plan it puts you in touch with us instead, since those are arranged with you directly.",
    ],
  },
  {
    version: "0.51.3",
    tag: "Rollouts",
    date: "August 14, 2026",
    highlights: [
      "Collecting metadata is three plain steps now: fill in the song's details, send one link to everyone who worked on it, then watch their answers land. The page used to open on three blocks of industry jargon at once with nothing saying what to do first, or that any of it could wait.",
      "Every field explains itself in ordinary words. ISRC, UPC, the ℗ and © lines — each one now says what it is and where to get it, and the page tells you outright that everything is optional and shows how many you have filled in.",
      "The form your collaborators fill in was rewritten for the people who actually fill it in. It opens by saying it takes about two minutes and only three things are required, each section says when you can skip it entirely, and terms like PRO, IPI and splits are explained in plain language right under the box.",
    ],
  },
  {
    version: "0.51.2",
    listed: false,
    tag: "Rollouts",
    date: "August 14, 2026",
    highlights: [
      "The Calendar button under your activities now sits on the left, lined up with the lists above it, instead of floating in the middle of the column.",
    ],
  },
  {
    version: "0.51.1",
    listed: false,
    tag: "App",
    date: "August 13, 2026",
    highlights: [
      "Settings and Admin now sit at the bottom of the workspace's left-hand menu instead of mixed in with your releases and UrgAns, so the everyday links stay together and account stuff stays out of the way until you need it.",
      "Calendar moved out of the crowded release header and into its own pill that stays with you at the bottom of the task list on a wider screen, so you can jump to it without scrolling back up.",
    ],
  },
  {
    version: "0.51.0",
    listed: false,
    title: "Settings in four tabs",
    tag: "App",
    date: "August 13, 2026",
    highlights: [
      "Settings is four tabs now — Account, Workspace, Team and Notifications — instead of one long scroll. Twelve sections used to sit stacked in a single column with nothing grouping them, so changing your password meant scrolling past your team, your logo and your releases to get there. Each tab holds only what belongs together, and the page finally has its name at the top.",
      "Your three notification settings sit together in one place. Push, the after-a-task check-in and the weekly nudge were three separate blocks spread down the page, and now they read as the one set of choices they always were.",
      "Every tab has its own link, so you can go straight to the part you want and Settings remembers where you were when you refresh.",
      "The two places you can set an artist name no longer look identical. One is your own profile, one is the workspace's artist — they're in different tabs now and each says which it is.",
    ],
  },
  {
    version: "0.50.2",
    listed: false,
    tag: "Rollouts",
    date: "August 13, 2026",
    highlights: [
      "When something in the app breaks, it now says so and offers you a way on. A page that hit a problem used to just stop where it was, half drawn, with nothing to click and no hint that anything had gone wrong. You get a short explanation, a Try again, and a way back to your releases — and the menus and the UrgAns button stay put, so a broken page costs you the page and not your way out of it.",
      "The panels either side of your work can no longer take the app down with them. If UrgAns or your workspace card runs into trouble it quietly steps aside and the rest keeps working, where before the whole screen went with it.",
    ],
  },
  {
    version: "0.50.1",
    tag: "AI",
    date: "August 13, 2026",
    highlights: [
      "UrgAns replies now stream in word by word instead of appearing all at once, so you can start reading the moment the first words land.",
      "Every reply carries a quiet row of actions underneath: copy it in one tap (handy for pasting into a chat), regenerate the last answer, or rate it with a thumbs up or down so we know what's working.",
      "Suggested follow-up questions now sit in their own titled list under the answer, each one a full-width row you can tap to ask — clearer than the small floating buttons they used to be.",
    ],
  },
  {
    version: "0.50.0",
    listed: false,
    title: "Take a note from UrgAns",
    tag: "AI",
    date: "August 13, 2026",
    highlights: [
      "You can take a note without leaving UrgAns. Start a message with \"note\" — \"note Call the promoter about Friday\" — and it saves straight to your notes, first line as the title. There's a Take a note button under the prompt too, for when you'd rather have the full page and room to write.",
      "If you're already looking at a release when you do it, the note is filed under that release. Otherwise it's just a note, and you can link it to something later.",
    ],
  },
  {
    version: "0.49.1",
    listed: false,
    tag: "Account",
    date: "August 13, 2026",
    highlights: [
      "Signing up and signing in now survive a bad connection. Both pages used to arrive as a loading screen and only became themselves once the rest of the app had finished downloading, so on a weak mobile signal a single missing piece left you watching the word \"Loading\" for as long as you were willing to wait, with nothing to tap and nothing explaining why. The form is part of the page now, there from the moment it lands.",
      "If a browser has JavaScript turned off — a content blocker, or private-browsing restrictions — both pages say so plainly instead of leaving you pressing a button that quietly does nothing.",
    ],
  },
  {
    version: "0.49.0",
    listed: false,
    title: "One release opens straight in",
    tag: "Rollouts",
    date: "August 12, 2026",
    highlights: [
      "With one release, Urganize opens straight into its activities. A catalog of one was a screen with a single card on it and one thing to click, standing between you and the only work you had. It comes back the moment you start a second release, which is the point at which there is actually a choice to make.",
    ],
  },
  {
    version: "0.48.2",
    listed: false,
    tag: "Rollouts",
    date: "August 12, 2026",
    highlights: [
      "Metadata, Files, Press kit and Pitch now name the release you have open, right under the heading — \"for Best · Babyboy Dorian\". Collecting credits or sending a pitch without a visible reminder of which release you were in meant taking it on trust, which is a bad thing to guess at when the details go out to a distributor.",
    ],
  },
  {
    version: "0.48.1",
    listed: false,
    tag: "App",
    date: "August 12, 2026",
    highlights: [
      "The arrow that folds the left menu now sits at the bottom of it rather than up beside your workspace name, so the top of the panel is just your logo and your details.",
    ],
  },
  {
    version: "0.48.0",
    listed: false,
    title: "Fold the side menu",
    tag: "App",
    date: "August 12, 2026",
    highlights: [
      "The menu on the left now folds down to a strip of icons. Use the arrow in its corner and it narrows, handing the space back to whatever you are working on. The choice sticks as you move around the app and after a reload, so it stays the way you left it.",
      "Folding it also keeps it around in places it used to vanish. On a mid-sized screen with UrgAns open beside your work there was not room for both, so the menu hid itself. Now you can shrink it instead of losing it.",
    ],
  },
  {
    version: "0.47.0",
    title: "Earlier deadline reminders",
    tag: "Rollouts",
    date: "August 12, 2026",
    highlights: [
      "Deadline reminders reach you earlier. Until now you only heard about an activity the day before it was due, which is late if the thing takes a week. You get a nudge seven days out, another three days out, then one the day before.",
      "A short note of encouragement once a week, because most of a rollout is waiting between the busy parts. If you would rather not get them there is a switch to turn them off in Settings.",
      "Start a release and you get a reminder to come back and finish setting it up. It is easy to create one then get pulled into something else before it has a date or a plan.",
    ],
  },
  {
    version: "0.46.0",
    title: "Pitch your songs to playlist curators",
    tag: "Pitching",
    date: "August 12, 2026",
    highlights: [
      "You can pitch your songs to playlists from inside Urganize. Open a release, hit Pitch, then browse playlists by platform or genre with the owner's name and follower count on each one. Send a song with a link plus a short note. The link can be anything: a private stream, a demo host, or a live page if the song is already out.",
      "Playlist owners answer you in the product instead of leaving you guessing. A pitch comes back marked Listened, Added or Passed, often with a line of feedback. You see the answer on the release beside the pitch you sent.",
      "Playlist owners get their own small corner of Urganize. They join by invite only, they list their playlists then clear pitches in a couple of taps. They never see your releases, your tasks, your files or your team. Ask us for an invite link if there is a curator you want on board.",
      "A release can have ten pitches waiting on a reply at once. It keeps you honest with the people you are pitching to. It also stops the same playlist getting the same song twice while the first one is still unanswered.",
    ],
  },
  {
    version: "0.45.2",
    listed: false,
    tag: "AI",
    date: "August 12, 2026",
    highlights: [
      "UrgAns opens beside your work again when you sign in. It had stopped doing that once signing in started taking you to your releases, because it was only opening for people who went to its own page. Close it and it stays closed for the rest of your session.",
    ],
  },
  {
    version: "0.45.1",
    listed: false,
    tag: "Account",
    date: "August 12, 2026",
    highlights: [
      "Signing in now takes you straight to your releases instead of to UrgAns. Your catalog is what you came for, so it is what you see first. UrgAns is still one tap away from the top bar, from the bottom bar on phones and from the panel on the left.",
    ],
  },
  {
    version: "0.45.0",
    listed: false,
    title: "First release, no detours",
    tag: "Rollouts",
    date: "August 12, 2026",
    highlights: [
      "First release, no detours: if you haven't created a release yet, the New release screen now opens on its own and stays open until you make one — there's nothing else to do on an empty dashboard anyway. Signing out is still always available.",
    ],
  },
  {
    version: "0.44.3",
    listed: false,
    tag: "Pitching",
    date: "August 12, 2026",
    highlights: [
      "The content calendar got a proper tune-up on phones. An empty month now gives you a Plan a post button instead of telling you to tap a day that isn't there, there's an Add a post button under the list for any other day, and the small controls — marking a post as posted, opening a post, closing things — are all easier to hit.",
      "It behaves better on desktop too: with the UrgAns panel open the calendar now switches to its list view instead of cramming seven skinny columns into the space that's left, and switching between calendars or months shows a loading state instead of briefly showing the wrong posts.",
      "A handful of small wrongs put right: deleting a calendar no longer flashes a confusing warning over its own confirmation, the back button no longer replays your calendar setup steps, error messages lost their database jargon, and the post form no longer shows a disabled \"coming soon\" row.",
    ],
  },
  {
    version: "0.44.2",
    listed: false,
    tag: "Rollouts",
    date: "August 10, 2026",
    highlights: [
      "Metadata is no longer marked Beta. Distribution fields and collaborator credits have been in real use long enough to stand on their own.",
    ],
  },
  {
    version: "0.44.1",
    listed: false,
    tag: "Rollouts",
    date: "August 10, 2026",
    highlights: [
      "Fixed the row of buttons above your release's activities (Metadata, Calendar, Notes, and the rest) on phones — it used to crop the first one off the edge of the screen and could wrap a button's own label across it. It now scrolls as one line, so every button is there and reads correctly.",
    ],
  },
  {
    version: "0.44.0",
    title: "A recap card for every release",
    tag: "Rollouts",
    date: "August 10, 2026",
    highlights: [
      "Finished a release? You can now get a recap card for it: a poster built from your own numbers, the activities you completed, the days of work behind it and the size of your team. It appears on a release once its date has passed or every activity is done.",
      "Two sizes come out of it, one shaped for stories and one for feeds. Before it builds you can add one thing you are proud of. It's optional, so skipping it still gives you a card that looks right.",
      "Share it straight from your phone or download it on the web. Rebuild it whenever the numbers change.",
    ],
  },
  {
    version: "0.43.0",
    title: "Say how a task went",
    tag: "AI",
    date: "August 10, 2026",
    highlights: [
      "Mark a task done and UrgAns now asks how it went. Three taps to answer — Went well, Went okay, or Didn't go to plan — plus a line about what happened if you feel like it. The task completes the instant you tick it, so answering is never something you wait on, and skipping costs one tap with no follow-up.",
      "What you say is kept with the task, so the story of a release builds itself as you work instead of being reconstructed later from memory.",
      "If you'd rather not be asked, turn off \"Ask me after tasks\" in Settings and the question stops for good.",
    ],
  },
  {
    version: "0.42.1",
    listed: false,
    tag: "Rollouts",
    date: "August 9, 2026",
    highlights: [
      "A release with no date set no longer shows a date line at all. It used to read \"Date not set\" on every card, which said nothing you couldn't already see — the prompt to add one still sits in the release's activity list, where you can actually set it.",
    ],
  },
  {
    version: "0.42.0",
    listed: false,
    title: "Notes",
    tag: "Rollouts",
    date: "August 9, 2026",
    highlights: [
      "Added Notes — a private place to jot things down the moment they come up, mid-call or mid-DM, with no setup and nothing to fill in first. Link a note to a release whenever it's relevant, or leave it as-is; either way it saves as you type.",
    ],
  },
  {
    version: "0.41.4",
    listed: false,
    tag: "App",
    date: "August 8, 2026",
    highlights: [
      "The app is faster to open, especially on a slow or busy connection. Your releases and activities now start loading the moment the page does, instead of waiting on a sign-in check first, and the server fetches them all at once rather than one after another.",
      "Metadata, Files, Press kit and Content calendar now open instantly. Once you pick a release, they quietly load in the background while you read your activities, and re-opening one you've already seen doesn't reload at all.",
      "Switching between your workspace, UrgAns and Settings is quicker, and each shows one clean loading state instead of flashing through two.",
      "None of this runs when your phone is on Data Saver or a 2G connection, so it never spends your data without earning it.",
    ],
  },
  {
    version: "0.41.3",
    listed: false,
    tag: "App",
    date: "August 7, 2026",
    highlights: [
      "Your catalog on a phone now uses the full width of the screen. Releases are wide rows — cover art beside the title, date and progress — so you see four or five at a glance instead of two floating cards with empty space either side. Release titles are bigger everywhere too.",
    ],
  },
  {
    version: "0.41.2",
    listed: false,
    tag: "Rollouts",
    date: "August 6, 2026",
    highlights: [
      "A new activity now shows up in your list the moment you create it, instead of only after a refresh.",
    ],
  },
  {
    version: "0.41.1",
    listed: false,
    tag: "Rollouts",
    date: "August 6, 2026",
    highlights: [
      "A release with no date now makes it clear you can add activities right away — the date card offers it directly, and an empty activity list has its own \"Add your first activity\" button. Setting a date was never required to add your own work; it just looked that way.",
      "Fixed activities being filed against the wrong release when two releases shared a name — likelier now that \"Untitled release\" is the default. Typing a name that matches more than one release no longer guesses; pick the one you meant from the list.",
    ],
  },
  {
    version: "0.41.0",
    listed: false,
    title: "Create a release with nothing up front",
    tag: "Rollouts",
    date: "August 6, 2026",
    highlights: [
      "Creating a release no longer asks for anything up front. Skip the name and we'll call it \"Untitled release\"; skip the date and add it whenever it's confirmed — both are marked optional.",
      "If you created a release without a date, its activities view now carries a card to set one. For a release started from the rollout plan, that card is what builds your plan: pick the date and all 64 activities appear, scheduled around it.",
    ],
  },
  {
    version: "0.40.12",
    listed: false,
    tag: "AI",
    date: "August 6, 2026",
    highlights: [
      "The UrgAns loading screen no longer holds space for text that isn't there, so the assistant's greeting no longer shifts up once it's ready.",
    ],
  },
  {
    version: "0.40.11",
    listed: false,
    tag: "App",
    date: "August 6, 2026",
    highlights: [
      "The page now sits evenly on the screen — the workspace card used to hang 32px further left than everything above it, so the left and right edges never quite matched.",
    ],
  },
  {
    version: "0.40.10",
    listed: false,
    tag: "App",
    date: "August 6, 2026",
    highlights: [
      "The workspace loading screen now matches what actually loads in — release cards, the activity list, and the focused release layout no longer shift or resize once your data arrives.",
    ],
  },
  {
    version: "0.40.9",
    listed: false,
    tag: "AI",
    date: "August 6, 2026",
    highlights: [
      "The workspace card now runs the full height of the screen and carries links to your Catalog, UrgAns, and Settings, so getting around no longer means reaching for the top bar.",
    ],
  },
  {
    version: "0.40.8",
    listed: false,
    tag: "Rollouts",
    date: "August 6, 2026",
    highlights: [
      "Your workspace card now shows the Urganize mark until you upload your own logo, instead of your workspace initials.",
    ],
  },
  {
    version: "0.40.7",
    listed: false,
    tag: "Rollouts",
    date: "August 6, 2026",
    highlights: [
      "Your release cards now line up exactly with the workspace card and UrgAns panel — the last fix nudged them slightly too high.",
    ],
  },
  {
    version: "0.40.6",
    listed: false,
    tag: "Rollouts",
    date: "August 5, 2026",
    highlights: [
      "Your releases now really do fit 4 across when UrgAns is closed and your screen has the room — the cards were a touch too wide to ever manage it, so they're slightly slimmer at their widest.",
    ],
  },
  {
    // v0.40.5's highlight originally also claimed the 4-across grid. It
    // didn't ship working (the cards were 32px too wide for the available
    // space — see URG-225), so the claim was trimmed to what that release
    // actually delivered rather than left standing as a false entry.
    version: "0.40.5",
    listed: false,
    tag: "Rollouts",
    date: "August 5, 2026",
    highlights: [
      "Your release cards now line up with the workspace card and UrgAns panel instead of sitting lower than both.",
    ],
  },
  {
    version: "0.40.4",
    listed: false,
    tag: "App",
    date: "August 5, 2026",
    highlights: [
      "Workspace identity and Workspace logo now share one row in Settings instead of stacking full-width — a tidier fit since they're really one pairing (both feed your workspace card).",
    ],
  },
  {
    version: "0.40.3",
    listed: false,
    tag: "Account",
    date: "August 5, 2026",
    highlights: [
      "Signing in now greets you with the Urganize mark instead of a generic spinner while your workspace loads.",
    ],
  },
  {
    version: "0.40.2",
    listed: false,
    tag: "Team",
    date: "August 5, 2026",
    highlights: [
      "Teammates now leads Settings — it's the first thing you see instead of being buried below your workspace details.",
    ],
  },
  {
    version: "0.40.1",
    listed: false,
    tag: "Rollouts",
    date: "August 5, 2026",
    highlights: [
      "Fixed the release grid showing only one narrow column when both the workspace card and UrgAns were open on screen — it now uses the available space and shows two.",
    ],
  },
  {
    version: "0.40.0",
    listed: false,
    title: "A workspace card",
    tag: "Team",
    date: "August 5, 2026",
    highlights: [
      "A workspace card now sits alongside the dashboard, UrgAns, Settings, and your releases — your label or team logo, name, artist, teammate count, and active-release count, all in one place. Update your workspace name and logo from Settings; everywhere else, the card just reflects it.",
    ],
  },
  {
    version: "0.39.1",
    listed: false,
    tag: "Rollouts",
    date: "August 5, 2026",
    highlights: [
      "Metadata, Calendar, Files, and Press kit now open right where your activity list sits, instead of floating on top of the workspace. The buttons above stay put so you can switch between them, the open one stays lit, and clicking it again brings your activities back. The calendar tucks your other releases aside while it's open so its month grid has room.",
    ],
  },
  {
    version: "0.39.0",
    listed: false,
    title: "Release pages open instantly",
    tag: "App",
    date: "August 4, 2026",
    highlights: [
      "Metadata, Calendar, Files, and Press kit no longer load a whole separate page. Your release stays visible in the top bar and they open instantly.",
    ],
  },
  {
    version: "0.38.5",
    listed: false,
    tag: "Rollouts",
    date: "August 4, 2026",
    highlights: [
      "The Motion progress bar on your releases was hard to see against the background — it now stands out clearly in both light and dark mode.",
    ],
  },
  {
    version: "0.38.4",
    listed: false,
    tag: "App",
    date: "August 4, 2026",
    highlights: [
      "Loading states got a lot less bare across the app — admin pages, the press kit and metadata pages, the content calendar, and public press-kit/credit links now show a proper preview of what's coming instead of a plain spinner or blank screen.",
    ],
  },
  {
    version: "0.38.3",
    listed: false,
    tag: "Rollouts",
    date: "August 4, 2026",
    highlights: [
      "Release pages got simpler: everything now happens right where you're already working, without an extra page to click into. The Metadata shortcut also moved to the front of the row so it's the first thing you see.",
    ],
  },
  {
    version: "0.38.2",
    listed: false,
    tag: "AI",
    date: "August 4, 2026",
    highlights: [
      "UrgAns has its own address now: the assistant's page moved to a URL that matches its name. Old links and shortcuts still get you there.",
    ],
  },
  {
    version: "0.38.1",
    listed: false,
    tag: "App",
    date: "August 4, 2026",
    highlights: [
      "The Workspace button in the top bar now closes the catalog when you're already looking at it, taking you back to UrgAns. Before, clicking it there didn't do anything.",
    ],
  },
  {
    version: "0.38.0",
    listed: false,
    title: "Chappi is now UrgAns",
    tag: "AI",
    date: "August 3, 2026",
    highlights: [
      "Chappi has a new name: UrgAns. Same assistant, same everything else.",
      "UrgAns now travels with you. Sign in, and every page you visit keeps the assistant open in a panel on the side, carrying your conversation along. Close it and it stays out of your way; the UrgAns icon in the top bar brings it back whenever you want it.",
    ],
  },
  {
    version: "0.37.2",
    listed: false,
    tag: "AI",
    date: "July 31, 2026",
    highlights: [
      "Redrew the Chappi cursor from scratch: it's sharper on high-resolution screens now, and the fix for staying visible over dark backgrounds is a clean filled circle instead of the boxy outline from the last update.",
    ],
  },
  {
    version: "0.37.1",
    listed: false,
    tag: "AI",
    date: "July 31, 2026",
    highlights: [
      "Fixed the Chappi cursor's outline from earlier today — it was showing up as an ugly solid box instead of a clean edge. It now fills in just the mark itself, the way it was supposed to look the first time.",
    ],
  },
  {
    version: "0.37.0",
    title: "Release metadata",
    tag: "Rollouts",
    date: "July 31, 2026",
    highlights: [
      "Release metadata is here: every release gets a Metadata page (next to Press kit) where you fill in distribution details — ISRC, UPC, genre, label, copyright lines — and generate a shareable link for collaborators. Send it to producers, co-writers, and engineers so they can submit their own publishing credits (splits, PRO, IPI, socials) without needing an Urganize account, and watch their submissions land on the page as they come in.",
    ],
  },
  {
    version: "0.36.1",
    listed: false,
    tag: "AI",
    date: "July 31, 2026",
    highlights: [
      "Fixed two rough edges in the Chappi cursor: it no longer gets stuck on the regular pointer after you select some text, and it now stays visible when it passes over dark buttons or images instead of disappearing.",
    ],
  },
  {
    version: "0.36.0",
    listed: false,
    title: "Chappi slides in beside your releases",
    tag: "AI",
    date: "July 31, 2026",
    highlights: [
      "Chappi now slides in beside your releases instead of taking over the screen — open it from the catalog, keep working with your releases in view, and expand to full screen whenever you want more room.",
    ],
  },
  {
    version: "0.35.6",
    listed: false,
    tag: "AI",
    date: "July 31, 2026",
    highlights: [
      "The Chappi cursor now stays put — it used to flip back to the regular pointer over buttons and links, and now it doesn't. Fixed a glitch where opening a pop-up (creating a release, deleting one, and a few others) would turn the whole dimmed screen into a hand cursor.",
    ],
  },
  {
    version: "0.35.5",
    listed: false,
    tag: "Account",
    date: "July 31, 2026",
    highlights: [
      "Signing in now lands you on Chappi first — ask it anything or jump straight into a quick action, with your releases and tasks always one tap away in the top bar.",
    ],
  },
  {
    version: "0.35.4",
    listed: false,
    tag: "Team",
    date: "July 31, 2026",
    highlights: [
      "Invite prompts now say what they mean: \"Invite artists, freelancers and team members\" replaces the narrower \"Invite teammates\" everywhere it appears — Settings, the release page, Chappi's invite banner, and after your first release.",
    ],
  },
  {
    version: "0.35.3",
    listed: false,
    tag: "Rollouts",
    date: "July 31, 2026",
    highlights: [
      "Activities: the Status and Assignee fields dropped their Beta tags — they're no longer experimental.",
      "Attachments are temporarily hidden from activities while we rework file uploads. Nothing you'd already attached was touched or deleted, it's just hidden from the app for now.",
    ],
  },
  {
    version: "0.35.2",
    listed: false,
    tag: "AI",
    date: "July 31, 2026",
    highlights: [
      "The Chappi mark now replaces your mouse pointer while you work in Urganize on a computer. Buttons and text fields still show their usual cursors, and phones and tablets are unaffected.",
    ],
  },
  {
    version: "0.35.1",
    listed: false,
    tag: "Account",
    date: "July 31, 2026",
    highlights: [
      "Choosing \"I prefer to start from scratch\" during sign-up now does what it says: your first release starts with an empty activity list instead of the pre-built rollout plan.",
    ],
  },
  {
    version: "0.35.0",
    title: "Press kits are here",
    tag: "Pitching",
    date: "July 31, 2026",
    highlights: [
      "Press kits are here: generate a shareable, branded link for any release straight from its page — cover art, release details, and photos pull in automatically, and the kit updates itself whenever the release changes. Send it to press, curators, or bookers with one link.",
    ],
  },
  {
    version: "0.34.1",
    listed: false,
    tag: "App",
    date: "July 31, 2026",
    highlights: [
      "Loading screens on the release and press kit pages now match what actually appears, so content no longer jumps around as the page finishes loading.",
    ],
  },
  {
    version: "0.34.0",
    listed: false,
    title: "Simpler moving around a release",
    tag: "App",
    date: "July 30, 2026",
    highlights: [
      "Simplified how you move around a release: the left side menu is gone. Every release page now has a plain Back link at the top, and the release page itself carries direct buttons to its content calendar and press kit — one click, nothing to collapse or expand.",
    ],
  },
  {
    version: "0.33.5",
    listed: false,
    tag: "Rollouts",
    date: "July 30, 2026",
    highlights: [
      "The release menu now has a Dashboard link at the top, so you can always get back home from any release page — no more hunting for the way out.",
      "Selecting a release on the dashboard now shows an Overview button that opens the release page directly.",
      "Cleaned up the release menu: the collapse control is a small icon instead of looking like another menu item, and the duplicate Content calendar button is gone from the release header.",
    ],
  },
  {
    version: "0.33.4",
    listed: false,
    tag: "Pitching",
    date: "July 30, 2026",
    highlights: [
      "The press kit is now one click from your dashboard — select a release and the Press kit button appears right next to Calendar and Files, no need to open the release first.",
    ],
  },
  {
    version: "0.33.3",
    listed: false,
    tag: "Account",
    date: "July 29, 2026",
    highlights: [
      "Removed an old, half-finished setup screen that could take over the dashboard and leave you stuck with no way out. Signing up walks through the proper setup flow, and joining a workspace by invite now takes you straight in.",
    ],
  },
  {
    version: "0.33.2",
    listed: false,
    tag: "Team",
    date: "July 29, 2026",
    highlights: [
      "Fixed invited teammates getting stuck on a first-time setup screen after accepting their invite — joining a workspace now takes you straight to the dashboard. Anyone already stuck is freed the next time they open the app.",
    ],
  },
  {
    version: "0.33.1",
    listed: false,
    tag: "AI",
    date: "July 26, 2026",
    highlights: [
      "Fixed Chappi's message box floating mid-screen on mobile — it now sits properly at the bottom of the page.",
    ],
  },
  {
    version: "0.33.0",
    title: "AI status updates",
    tag: "AI",
    date: "July 26, 2026",
    highlights: [
      "The AI status update generator is now live — read your release's current state and get a one-paragraph update ready to share.",
      "AI rollout planning and status updates now retry more reliably behind the scenes, so a slow response is far less likely to show as an error.",
    ],
  },
  {
    version: "0.32.0",
    title: "The AI rollout planner is live",
    tag: "AI",
    date: "July 26, 2026",
    highlights: [
      "The AI rollout planner is now live — when you create a release with a rollout plan, it's tailored by AI to your release's context, ready to review and edit before you commit it.",
    ],
  },
  {
    version: "0.31.1",
    listed: false,
    tag: "App",
    date: "July 23, 2026",
    highlights: [
      "The notifications panel dropped its Beta tag — the label stays in Settings only.",
    ],
  },
  {
    version: "0.31.0",
    listed: false,
    title: "Urganize cheers you on",
    tag: "App",
    date: "July 23, 2026",
    highlights: [
      "Urganize now cheers you on — a welcome when you arrive, a momentum nudge while you work, and a gentle reminder if you've been away a while, all as notifications on devices that have them on.",
      "\"What's new\" announcements now only cover real feature releases — no more cards about tiny fixes.",
      "Signing in is smoother for Google accounts — the password option always stays available alongside the Google suggestion.",
    ],
  },
  {
    version: "0.30.1",
    listed: false,
    tag: "AI",
    date: "July 23, 2026",
    highlights: [
      "The Chappi dock's welcome now sits at the bottom of the panel, right above the footer — no more floating mid-air with empty space beneath it.",
    ],
  },
  {
    version: "0.30.0",
    listed: false,
    title: "What's new after every update",
    tag: "App",
    date: "July 23, 2026",
    highlights: [
      "A \"What's new\" note now greets you on your first visit after an update — everything that shipped since you last looked, in one place. Dismiss it and it stays gone until the next release.",
      "Announcements: the team can now send a push notification to every user's device — release notes, tips, and news will start arriving where you are.",
    ],
  },
  {
    version: "0.29.0",
    title: "Start from the proven plan or blank",
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "Creating a release now starts with a choice: begin from the proven rollout plan (recommended) or from a blank release you build up yourself — two clear cards, pick one, then name and date it.",
      "Settings gains a Back button that returns you to exactly where you came from — the release you were on, your scoped workspace, or UrgAns.",
    ],
  },
  {
    version: "0.28.3",
    listed: false,
    tag: "App",
    date: "July 23, 2026",
    highlights: [
      "Loading screens across Settings now mirror your real data — the Teammates and Releases lists show exactly as many placeholder rows as you have members and releases, so content lands where the placeholders stood.",
      "The single-release loading screen matches its final shape too: back button, motion bar, and side rails sized to your roster.",
      "Notifications are now marked Beta in Settings and in the notifications panel.",
    ],
  },
  {
    version: "0.28.2",
    listed: false,
    tag: "Team",
    date: "July 23, 2026",
    highlights: [
      "Invite links are now short and clean — app.urganize.app/join/… with a small code, instead of the long token they used to carry. Old links keep working until they expire.",
    ],
  },
  {
    version: "0.28.1",
    listed: false,
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "Sharing an app.urganize.app link now shows the current branded card — the share image was stale and its URL could resolve to an address social crawlers couldn't reach.",
    ],
  },
  {
    version: "0.28.0",
    title: "Invite artists to only their releases",
    tag: "Team",
    date: "July 23, 2026",
    highlights: [
      "Invites now come in two kinds: a Teammate sees your whole catalog, while an Artist only ever sees their own releases — pick Artist when inviting (by email or link) and choose which artist they are.",
      "Artist-scoped access is enforced everywhere: the catalog, release pages, and activities all show an invited artist only their own work.",
    ],
  },
  {
    version: "0.27.0",
    title: "Invite by link",
    tag: "Team",
    date: "July 23, 2026",
    highlights: [
      "Invite by link: don't have someone's email? Copy invite link from Settings → Teammates and share it anywhere — anyone who opens it joins your team as a Team Member. Links stay valid for 7 days.",
      "Only you can delete your releases — teammates never see a Delete button on releases they don't own.",
      "Team invites are now marked Beta while we refine collaboration.",
    ],
  },
  {
    version: "0.26.1",
    listed: false,
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "The Releases list in Settings no longer labels every release \"draft\" — the status shows only once a release has actually moved past its starting point, same as the catalog cards.",
    ],
  },
  {
    version: "0.26.0",
    title: "Teams work end to end",
    tag: "Team",
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
    listed: false,
    tag: "Team",
    date: "July 23, 2026",
    highlights: [
      "Teammate invite links now always point at app.urganize.app — invitees land straight on the accept page instead of hitting a hosting login wall. Re-send any invite that didn't work.",
    ],
  },
  {
    version: "0.25.1",
    listed: false,
    tag: "App",
    date: "July 23, 2026",
    highlights: [
      "No more phantom scrollbar — when your catalog fits the screen, the page doesn't scroll at all, and when it doesn't fit, you scroll without a visible scrollbar, like a native app.",
      "Notifications can now be cleared — a Clear button in the notifications panel empties it in one tap.",
    ],
  },
  {
    version: "0.25.0",
    listed: false,
    title: "Pin a chat to a release",
    tag: "AI",
    date: "July 23, 2026",
    highlights: [
      "Chappi chats can now be pinned to a specific release — a picker under the message box lists your releases by name (with their cover art), so instructions like \"add an activity\" land on the release you chose without naming it every time.",
    ],
  },
  {
    version: "0.24.1",
    listed: false,
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "The activity view now names the release it belongs to, right between the status and the due date — no more guessing which release an activity is part of.",
      "Long activity titles now wrap onto the next line on mobile instead of getting cut off at the edge of the screen.",
      "On Android, the keyboard no longer covers the Chappi message box while you type — the page now makes room for it.",
    ],
  },
  {
    version: "0.24.0",
    title: "The app opens instantly",
    tag: "App",
    date: "July 23, 2026",
    highlights: [
      "The app now remembers what it showed you — your catalog, activities, and settings paint instantly on every visit, like a proper mobile app, refreshing quietly in the background.",
      "The mobile catalog is redesigned: release cards are centered at a comfortable size instead of edge to edge, and a single release fits your screen with no scrolling.",
      "The motion tracker now shows on mobile too when you open a release.",
      "UrgAns on mobile behaves like a real chat app — the page stays put, the conversation scrolls on its own, the message box stays pinned, and tapping it no longer zooms the screen.",
      "The account button in the top bar is now a clean profile icon instead of your initials, drawn in the house style.",
    ],
  },
  {
    version: "0.23.2",
    listed: false,
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "Fixed the single-release view scrolling the whole page when your roster is large — the screen now stays locked and the release rails scroll on their own, which also makes switching between releases reliable.",
      "The motion tracker is back on the single-release view — a progress bar with the done count (like 2 of 64) sits right at the top, next to a smaller back button.",
      "Chappi's welcome screen is simpler — straight to the greeting and the message box.",
    ],
  },
  {
    version: "0.23.1",
    listed: false,
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "Opening a release now keeps everything on one screen — the page stays put and the activities list scrolls on its own, so the back button and your other releases never leave view.",
      "The release row at the top of the app is cleaner: just the cover art, release name, and date.",
      "Chappi conversations now start from the bottom, right above the message box — like every chat you already use.",
    ],
  },
  {
    version: "0.23.0",
    listed: false,
    title: "Follow your device's light or dark",
    tag: "App",
    date: "July 23, 2026",
    highlights: [
      "Appearance gains a System option — pick it and the app follows your device's light/dark setting automatically, switching live the moment your device does.",
      "Release statuses now carry a Beta tag everywhere they appear (release cards, the release page, and the activity view) while we refine how statuses work.",
    ],
  },
  {
    version: "0.22.3",
    listed: false,
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "The new-release form is down to its essentials — the rollout-timing explainer now appears after you create the release, inside the dismissible guide, where it's actually useful.",
    ],
  },
  {
    version: "0.22.2",
    listed: false,
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "The release row in the top bar now reads like the card it replaced — artist name over the title, with the release date alongside.",
      "The help menu's icons joined the house set: a tour laminate for Docs, a studio microphone for Contact, a speaker cab for Community.",
      "Trimmed the notifications setting to a single quiet status line once it's on.",
    ],
  },
  {
    version: "0.22.1",
    listed: false,
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "Opening a release now puts the whole release — cover art and all — into the top bar, and the activities take over the page. The duplicate \"showing activities for\" pill is gone.",
      "New in-house icons for Settings (mixing-desk faders) and Sign out (an eject button) — no more stock gear and door.",
      "The create-activity window lost its redundant \"Quick Create\" label.",
    ],
  },
  {
    version: "0.22.0",
    listed: false,
    title: "Tasks are now activities",
    tag: "Rollouts",
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
    listed: false,
    title: "A full visual pass",
    tag: "App",
    date: "July 23, 2026",
    highlights: [
      "A full visual pass in the house style: soft rounded corners are back everywhere, the top bar went quiet and calm, and the help \"?\" moved up beside the rest of the navigation.",
      "Hand-drawn icons throughout the chrome — a record crate for your releases, a waveform bubble for Chappi, a live-signal mark for notifications — instead of the stock icons every app uses.",
      "The release picker in quick-create now shows cover art (or the Urganize mark) instead of letter initials, the releases view dropped its redundant heading, and the release page's list is now titled Activities.",
    ],
  },
  {
    version: "0.20.0",
    listed: false,
    title: "A shorter new-release form",
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "The new-release form is shorter — the description field is gone. Once you're in your new release, a quick dismissible guide points you to what matters: the tasks below.",
      "The quick \"create task\" shortcut (press C) no longer shows a leftover Tag picker from an earlier version of the app.",
      "The releases view now centers your releases as a group instead of bunching them to one side when you have fewer than a full row.",
    ],
  },
  {
    version: "0.19.3",
    listed: false,
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "The release completion label now reads \"Motion\" — how much of the release is moving, at a glance.",
    ],
  },
  {
    version: "0.19.2",
    listed: false,
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "Releases without cover art now wear the Urganize \"U\" mark as their default artwork — on every release, past and future, in both light and dark mode — until you upload the real thing.",
      "Fixed Settings sections randomly flashing back to their loading state while you were mid-page — background session refreshes no longer disturb what's already on screen.",
      "Appearance and Notifications now sit side by side on one row, and the redundant \"Account / Settings\" heading is gone from the top bar.",
    ],
  },
  {
    version: "0.19.1",
    listed: false,
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "Task edits now show up in your list instantly — reassign or unassign someone, rename a task, or move a date, and the row updates the moment you do it. New and deleted tasks appear and disappear right away too.",
      "Loading screens across the app now match what actually loads, so pages land in place instead of jumping around.",
    ],
  },
  {
    version: "0.19.0",
    title: "Real notifications, and install on your phone",
    tag: "App",
    date: "July 23, 2026",
    highlights: [
      "Real notifications are here. Turn them on in Settings and your device tells you when a task is assigned to you, when something's due, and when a task changes status — even when the app is closed.",
      "Urganize is now installable on your phone: add it to your home screen and it opens like an app, notifications included.",
    ],
  },
  {
    version: "0.18.1",
    listed: false,
    tag: "App",
    date: "July 23, 2026",
    highlights: [
      "Settings polish: your artist now leads the page — it's the first thing you see. Password and session controls moved to the bottom where account plumbing belongs.",
      "The light/dark mode switch is now a proper two-sided control with a sliding highlight — tap the side you want.",
      "Removed the workspace logo and notification-preferences sections; neither was earning its place.",
    ],
  },
  {
    version: "0.18.0",
    listed: false,
    title: "Tasks open in a pop-up",
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "Tasks now open in a smooth pop-up right over your list instead of taking over the whole page — close it and you're exactly where you left off.",
      "Simplified the task view: priorities, tags, and the activity feed are gone. A task is its title, status, owner, due date, notes, files, and comments.",
      "Settings got a full redesign: one clean page with clear sections instead of scattered boxed cards.",
    ],
  },
  {
    version: "0.17.2",
    listed: false,
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "Cleaned up the task panel: the priority and status filter dropdowns are gone — the task sections themselves are the filter now.",
      "The help menu's community link is now simply called Community, and the keyboard shortcuts panel was removed.",
    ],
  },
  {
    version: "0.17.1",
    listed: false,
    tag: "Rollouts",
    date: "July 23, 2026",
    highlights: [
      "Task sections now only show up when there's something in them. No more empty \"Overdue (0)\" or \"Upcoming (0)\" rows — a section appears when a task moves into it and disappears when it empties out.",
    ],
  },
  {
    version: "0.17.0",
    listed: false,
    title: "Urganize is free to use",
    tag: "Account",
    date: "July 23, 2026",
    highlights: [
      "Urganize is now free to use — no trial countdown, no payment lock. We're setting up every team personally, so just sign in and run your releases.",
      "Signing in now lands you straight on your releases. Chappi is still one tap away in the top bar.",
      "The content calendar is now marked Beta while we keep improving it.",
    ],
  },
  {
    version: "0.16.4",
    listed: false,
    tag: "Rollouts",
    date: "July 22, 2026",
    highlights: [
      "Removed the Files section from the release page and the workspace while we rework file storage. Nothing you've uploaded was touched or deleted, it's just hidden from the app for now.",
    ],
  },
  {
    version: "0.16.3",
    listed: false,
    tag: "Rollouts",
    date: "July 21, 2026",
    highlights: [
      "Deleting a release now lives in one place: Settings, where you can see every release and delete deliberately. Removed the quick-delete icon from the workspace so it's no longer one accidental tap away.",
    ],
  },
  {
    version: "0.16.2",
    listed: false,
    tag: "App",
    date: "July 21, 2026",
    highlights: [
      "Settings page cleanup: inviting a teammate now shows a real, shareable invite link (instead of just claiming it was sent), and newly invited teammates show up in the list right away, no refresh needed. Fixed the Remove button showing up next to your own name in the teammates list. The loading screen also no longer flashes the wrong layout while your account loads.",
    ],
  },
  {
    version: "0.16.1",
    listed: false,
    tag: "Rollouts",
    date: "July 20, 2026",
    highlights: [
      "Files now have their own page instead of sitting nested under the task list, so it's clear they're their own thing.",
    ],
  },
  {
    version: "0.16.0",
    listed: false,
    title: "A full visual refresh",
    tag: "App",
    date: "July 20, 2026",
    highlights: [
      "Gave the app a full visual refresh: a new color palette, new typography, and clearer, plainer wording throughout.",
    ],
  },
  {
    version: "0.15.1",
    listed: false,
    tag: "App",
    date: "July 20, 2026",
    highlights: [
      "Fixed the first-time setup wizard incorrectly appearing for existing accounts, and gave it a solid background so it no longer overlaps the page behind it.",
    ],
  },
  {
    version: "0.15.0",
    listed: false,
    title: "Content calendars",
    tag: "Pitching",
    date: "July 20, 2026",
    highlights: [
      "Content calendars: plan social posts per release, one platform account at a time, on a real month grid with a mobile-friendly list view. (Rolling out behind a flag.)",
    ],
  },
  {
    version: "0.14.3",
    listed: false,
    tag: "AI",
    date: "July 15, 2026",
    highlights: [
      "Chappi now carries a Beta badge everywhere it appears, so it's clear the assistant is still finding its feet.",
      "Chappi's welcome message now speaks to what it's really for: taking the release off your mind, then inviting you to tell it what's going on.",
    ],
  },
  {
    version: "0.14.1",
    listed: false,
    tag: "Account",
    date: "July 15, 2026",
    highlights: [
      "Coming back to Urganize now takes you straight in — if you're already signed in, you no longer catch a flash of the login screen on the way.",
    ],
  },
  {
    version: "0.14.0",
    listed: false,
    title: "Chappi floats with you",
    tag: "AI",
    date: "July 15, 2026",
    highlights: [
      "Chappi now floats with you: an Ask Chappi button at the bottom-right of every page opens a chat panel that follows you around the app — same conversation as the full Chappi page, expandable any time, with a direct line to the founder in its footer. (Rolling out with Chappi.)",
      "Chappi's home got a polish: the greeting now sits centered in the page, and managers get a one-tap banner for inviting their teammates.",
    ],
  },
  {
    version: "0.13.1",
    listed: false,
    tag: "Account",
    date: "July 15, 2026",
    highlights: [
      "Signing in now lands you on Chappi first — a centered ask-anything box with your quick actions right under it — and a new workspace icon in the top bar keeps your releases and tasks one click away. (Rolling out with Chappi.)",
    ],
  },
  {
    version: "0.13.0",
    listed: false,
    title: "Chappi gets its own page",
    tag: "AI",
    date: "July 14, 2026",
    highlights: [
      "Chappi now has its own page, reached from a new icon in the top bar, with a real scrolling conversation — a long chat no longer crowds your releases and tasks.",
    ],
  },
  {
    version: "0.11.0",
    listed: false,
    title: "Promo codes",
    tag: "Account",
    date: "July 13, 2026",
    highlights: [
      "Promo codes: partner workshops and programs can now give their participants a free window of full Urganize access — redeem a code, no card required.",
    ],
  },
  {
    version: "0.10.0",
    title: "An AI assistant joins the dashboard",
    tag: "AI",
    date: "July 13, 2026",
    highlights: [
      "UrgAns, a conversational AI assistant, is built into the dashboard as the front door: ask about your releases and take actions in plain language. (Rolling out behind a flag; falls back to a command bar until fully switched on.)",
      "Added light mode across the app, with automatic system-preference detection and a manual toggle.",
      "Faster load times — cut the app's initial load size by over 20%.",
      "Task completion is now instant and reliable, with no more silent failures when checking off a task.",
      "Fixed notification bugs, including notifications not clearing when their task was deleted.",
    ],
  },
  {
    version: "0.9.0",
    title: "The release workspace",
    tag: "Rollouts",
    date: "May–June 2026",
    highlights: [
      "The release workspace: create a release and instantly get a hand-crafted 64-task rollout plan spanning 11 weeks of pre- and post-release work.",
      "Tasks with assignees, due dates, priority, and dependencies — blocked tasks are clearly marked and unlock automatically as their blockers complete.",
      "File and asset attachments — upload artwork, masters, contracts, and split sheets straight to a release.",
      "Event milestones — listening parties, video shoots, and release day appear as dated points on the release timeline.",
      "Consolidated everything onto one workspace screen: releases and their tasks together, instead of separate pages.",
      "Real-time notifications with a notification bell.",
      "Recurring monthly and annual subscriptions plus a Label plan, with billing in local and international currency.",
      "28-day free trial (no card required) for every new account.",
      "Google sign-in alongside email and password, and end-to-end team invites.",
      "Workspace logo that automatically fills in as placeholder cover art for releases without their own artwork.",
      "Direct WhatsApp line to the founder for support.",
      "Built (behind flags, pending activation) an AI rollout planner and an AI status-update generator.",
    ],
  },
  {
    version: "0.8.0",
    title: "Urganize, rebuilt",
    tag: "App",
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

// What /changelog shows: every entry not marked `listed: false`.
export const publicChangelog: Release[] = changelog.filter((release) => release.listed !== false);

export const releaseTag = (release: Release): ReleaseTag => release.tag ?? "App";

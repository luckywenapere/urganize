// The guides (2026-09-30, global-branding pass).
//
// WHY THESE EXIST. A search for "music release planning software" returned
// other vendors' pages and none of ours, because this site had no page that
// answers a question a stranger types before they know Urganize exists. Every
// page we had is about the product; none is about the problem. These are the
// problem pages: plain answers to what a manager or an artist actually
// searches, each ending at the product that does the work.
//
// WHERE THE FACTS COME FROM. Every timing, step and count below is taken from
// the single-release playbook the product ships
// (apps/web/lib/release-templates/single-v0.3.md: 11 weeks, 8 before release
// day and 3 after, 64 activities) and the plan sizes the site already states
// (90 for an EP, 113 for an album). Nothing here is a statistic, a benchmark or
// a claim about how a platform's algorithm behaves, and that is the rule for
// adding to this file: if it is not in the playbook or the product, it does not
// belong in a guide. An invented number is the fastest way to lose the trust a
// guide exists to earn.
//
// COPY RULES, the same as every marketing string: short sentences, plain words,
// no Oxford comma, no em dashes, "release" for the music coming out and
// "rollout" for the plan and the work, "deliver" and never "ship", and never the
// word the positioning guard retires for the product. apps/web's
// positioning-guard walks apps/homepage, so a slip fails the build.

import type { ProductShot } from "./product-shots";

export type GuideBlock =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "list"; items: readonly string[] };

export type GuideSection = {
  heading: string;
  blocks: readonly GuideBlock[];
};

export type Guide = {
  slug: string;
  /** The page's H1 and its search title (the layout appends " | Urganize"). */
  title: string;
  /** About 120 characters: the page description gets the short line appended. */
  summary: string;
  datePublished: string;
  dateModified: string;
  intro: readonly string[];
  /** The picture under the intro: a drawn still (#966, mock approved by the
   *  founder 2026-11-01), not a capture. Light and dark, wide and phone.
   *  The people, artist and song in them are made up. If the screen it
   *  draws changes, redraw all four files. */
  still: { desktop: ProductShot; phone: ProductShot; alt: string };
  sections: readonly GuideSection[];
  /** Slugs of the guides to link at the bottom. */
  related: readonly string[];
};

// The four files of one guide still, light and dark, wide and phone. The
// sizes are typed in: they must be the WebP files' pixel sizes (the stage at
// 2x), so after re-filming a still, update them or the picture's box will
// have the wrong shape.
function guideStill(
  name: string,
  wide: readonly [number, number],
  phone: readonly [number, number],
): { desktop: ProductShot; phone: ProductShot } {
  const src = (variant: string) => `/images/product/guide-${name}${variant}.webp`;
  return {
    desktop: { light: src(""), dark: src("-dark"), width: wide[0], height: wide[1] },
    phone: { light: src("-phone"), dark: src("-phone-dark"), width: phone[0], height: phone[1] },
  };
}

export const GUIDES: readonly Guide[] = [
  {
    slug: "how-to-plan-a-music-release",
    title: "How to plan a music release in 11 weeks",
    summary:
      "A week-by-week plan for one single: what to lock, brief, upload, pitch and post, from 8 weeks out to 3 weeks after.",
    datePublished: "2026-09-30",
    dateModified: "2026-09-30",
    intro: [
      "A release that goes well is rarely a lucky one. It is a plan someone wrote down early, and a team that knew who owned each step.",
      "This is the plan Urganize uses for a single. It runs 11 weeks: 8 weeks before release day and 3 weeks after. It was written with working managers. Change it to fit your song, your budget and your team.",
      "Start when the master is done, or within a week of it being done.",
    ],
    still: {
      ...guideStill("plan", [1360, 800], [716, 680]),
      alt: "An Urganize timeline for the single Harmattan Gold: activities set out week by week from 8 weeks out to release day, today marked, and the Spotify editorial pitch open with one owner, Ada Nwosu, and one week, 5 weeks out.",
    },
    sections: [
      {
        heading: "Weeks 8 and 7: decide and brief",
        blocks: [
          { type: "h3", text: "8 weeks out" },
          {
            type: "list",
            items: [
              "Lock the master file. That means the final mix and the final master.",
              "Pick your release date and lock it.",
              "Choose a distributor and check that your account works.",
              "Brief your marketing lead on the song: the story, the audience and the mood.",
              "Set a budget for ads, design, PR and content.",
              "Pick the 3 playlists or curators you most want to reach.",
            ],
          },
          { type: "h3", text: "7 weeks out" },
          {
            type: "list",
            items: [
              "Brief your designer on the cover art: the idea, your references and the sizes.",
              "Plan the day you will shoot content.",
              "Write the song details: title, songwriter splits, producer credits and language.",
              "Draft the split sheet and send it to everyone who worked on the song.",
              "Decide whether you will run a pre-save campaign.",
            ],
          },
          {
            type: "p",
            text: "Making vinyl, CDs or cassettes? Start production now. Making them takes 8 to 12 weeks on its own.",
          },
        ],
      },
      {
        heading: "Week 6: make the assets and upload",
        blocks: [
          {
            type: "list",
            items: [
              "Your designer delivers the first draft of the cover art.",
              "Shoot your content: promo video, photos and short clips.",
              "Get the split sheet signed by everyone.",
              "Upload the track and the song details to your distributor.",
              "Upload the cover art.",
              "Check that your release date is locked at your distributor.",
              "Submit your Spotify for Artists pitch, with a private link to the song.",
              "Set up your pre-save link once your distributor has accepted the song.",
              "Start reaching out to curators, also with a private link.",
            ],
          },
        ],
      },
      {
        heading: "Week 5: check the upload, then push",
        blocks: [
          {
            type: "p",
            text: "Early in week 5, check that your distributor accepted the song with no errors. If it was turned down, fix it and send it again that day.",
          },
          {
            type: "list",
            items: [
              "Approve the final cover art.",
              "Send your editorial playlist pitch with your final files. Four or more weeks before release is the window for this.",
              "Turn your pre-save campaign on.",
              "Start cutting your shoot footage into 3 to 5 short promo clips.",
            ],
          },
        ],
      },
      {
        heading: "Weeks 4 to 2: build the noise",
        blocks: [
          { type: "h3", text: "4 weeks out" },
          {
            type: "list",
            items: [
              "Announce the release date on your socials.",
              "Start teaser posts. One every 2 to 3 days works.",
              "Tell any PR contacts about the release.",
              "Follow up with the curators you reached out to.",
            ],
          },
          { type: "h3", text: "3 weeks out" },
          {
            type: "list",
            items: [
              "Post teasers more often.",
              "Schedule your release-day posts.",
              "Confirm any release-day events, like a listening session or a live stream.",
              "Send your press release or a short blurb to your contacts.",
              "Confirm the playlist spots that came back as yes.",
            ],
          },
          { type: "h3", text: "2 weeks out" },
          {
            type: "list",
            items: [
              "Plan the listening party or live stream, if you are doing one.",
              "Post a snippet of the song on TikTok or Reels.",
              "Queue your release-day stories and posts.",
              "Get access to Spotify for Artists and Apple Music for Artists, so you can see your numbers on release day.",
            ],
          },
        ],
      },
      {
        heading: "Release week",
        blocks: [
          {
            type: "list",
            items: [
              "7 days out: start the countdown posts.",
              "3 days out: make the final push, and start ads if your budget allows.",
              "1 day out: send a pre-save reminder to your mailing list and fans.",
              "Release day: post the announcement on every platform.",
              "Release day: watch your distributor to see the song go live everywhere.",
              "Release day: post a thank-you and share the early numbers with your team.",
            ],
          },
        ],
      },
      {
        heading: "After release: follow through",
        blocks: [
          {
            type: "p",
            text: "Most plans stop on release day. This one does not. The weeks after are where a release keeps going or goes quiet.",
          },
          { type: "h3", text: "The day after" },
          {
            type: "list",
            items: [
              "Pull your first-week numbers: streams, saves, playlist adds and top markets.",
              "Sit down with your team. What worked and what did not?",
              "Find your best-performing content.",
              "Look into any platform where the song did worse than you hoped.",
              "Thank the curators, press and collaborators who helped.",
              "Update your release tracker.",
            ],
          },
          { type: "h3", text: "Weeks 1 to 3" },
          {
            type: "list",
            items: [
              "Post follow-up content: a lyric video, behind the scenes, a live or acoustic version, or the story behind the song.",
              "Pitch more editorial playlists, using your first-week numbers as proof.",
              "Try mood and genre playlists. They are less competitive than editorial ones.",
              "Look at where your listeners are coming from. Your strongest market may deserve content made for it.",
              "Decide when the next release is and what builds on this one.",
              "Write down what you learned, so the next rollout starts ahead.",
            ],
          },
        ],
      },
      {
        heading: "Keep it from falling apart",
        blocks: [
          {
            type: "p",
            text: "A plan on its own finishes nothing. Every step needs one owner and one date, or it becomes something everyone thought someone else was doing.",
          },
          {
            type: "p",
            text: "Urganize builds this plan for you when you create a rollout: 64 activities for a single, 90 for an EP and 113 for an album. It asks about your goals first, and you can also make your own. Every activity has an owner and a due date, and you can edit or delete any of them.",
          },
        ],
      },
    ],
    related: ["music-release-checklist", "how-to-pitch-playlist-curators"],
  },
  {
    slug: "music-release-checklist",
    title: "Music release checklist: who does what",
    summary:
      "A release checklist sorted by person: what the artist, manager, marketing lead and designer each own, and when.",
    datePublished: "2026-09-30",
    dateModified: "2026-09-30",
    intro: [
      "Release plans fail in the gaps between people. Everyone thinks someone else booked the shoot.",
      "Use this list to give every step one owner. It follows the single-release plan from our 11-week timeline, sorted by who does the work instead of by week.",
      "Not sure about the order of things? Read the week-by-week version first.",
    ],
    still: {
      ...guideStill("checklist", [1360, 908], [716, 940]),
      alt: "An Urganize activity list for Harmattan Gold: each activity has an owner and a week, and the owner menu is open on the first cover art draft, listing the artist, the manager, the marketing lead and the designer.",
    },
    sections: [
      {
        heading: "The artist",
        blocks: [
          {
            type: "list",
            items: [
              "8 weeks out: lock the master file.",
              "8 weeks out: brief your marketing lead on the song, together with your manager.",
              "7 weeks out: write the song details with your manager: title, splits, producer credits and language.",
              "6 weeks out: shoot the content.",
              "5 weeks out: approve the final cover art, with your manager.",
              "4 weeks out: announce the release date.",
              "2 weeks out: post a snippet on TikTok or Reels.",
              "7 days out: start the countdown posts.",
              "Release day: post the announcement and a thank-you.",
              "After release: thank the curators, press and collaborators who helped, and reply to fan posts and tags.",
            ],
          },
        ],
      },
      {
        heading: "The manager",
        blocks: [
          {
            type: "list",
            items: [
              "8 weeks out: lock the release date, choose the distributor and check the account works.",
              "8 weeks out: set the budget.",
              "7 weeks out: brief the designer, plan the shoot day, draft the split sheet and decide on a pre-save campaign.",
              "6 weeks out: get the split sheet signed.",
              "6 weeks out: upload the track, the song details and the cover art, and confirm the date at your distributor.",
              "6 weeks out: set up the pre-save link.",
              "5 weeks out: check that the distributor accepted the song with no errors, and turn the pre-save campaign on.",
              "4 weeks out: brief your PR contacts.",
              "3 weeks out: confirm release-day events and send the press release.",
              "2 weeks out: plan the listening party or live stream, and set up Spotify for Artists and Apple Music for Artists access.",
              "1 day out: send the pre-save reminder.",
              "Release day: watch your distributor to see the song go live everywhere.",
              "After: pull the first-week numbers, run the debrief, look into any weak platform and update your release tracker.",
              "3 weeks after: decide when the next release is, and write down what you learned.",
            ],
          },
          {
            type: "p",
            text: "Got vinyl, CDs or cassettes in the plan? Add a step at 7 weeks out to start production. It takes 8 to 12 weeks on its own.",
          },
        ],
      },
      {
        heading: "The marketing lead",
        blocks: [
          {
            type: "list",
            items: [
              "8 weeks out: pick the 3 playlists or curators you most want to reach.",
              "6 weeks out: submit the Spotify for Artists pitch with a private link, and start reaching out to curators.",
              "5 weeks out: send the editorial pitch with the final files, and start cutting the shoot footage into 3 to 5 clips.",
              "4 weeks out: start the teasers, one every 2 to 3 days, and follow up with curators.",
              "3 weeks out: post teasers more often, schedule the release-day posts and confirm the playlist spots that came back as yes.",
              "2 weeks out: queue the release-day stories and posts.",
              "3 days out: make the final push, and start ads if the budget allows.",
              "After: find the best-performing content, post follow-ups and pitch secondary playlists with the first-week numbers.",
              "2 weeks after: try mood and genre playlists, and review how your ads did if you ran any.",
            ],
          },
        ],
      },
      {
        heading: "The designer",
        blocks: [
          {
            type: "list",
            items: [
              "7 weeks out: receive the cover art brief, with the idea, the references and the sizes.",
              "6 weeks out: deliver the first draft of the cover art.",
              "5 weeks out: the artist and manager approve the final version. Be ready to make changes.",
            ],
          },
          {
            type: "p",
            text: "The designer has the fewest steps, and they are steps other people are waiting on. Give them the brief early.",
          },
        ],
      },
      {
        heading: "Give every line a name and a date",
        blocks: [
          {
            type: "p",
            text: "That is the whole trick. A checklist in a chat gets scrolled past. A checklist where each line has an owner, a due date and a status gets done.",
          },
          {
            type: "p",
            text: "Urganize turns this into your rollout. Each activity is assigned to a person, dated and tracked, and one list shows what is done, what is overdue and what is due this week.",
          },
        ],
      },
    ],
    related: ["how-to-plan-a-music-release", "how-to-pitch-playlist-curators"],
  },
  {
    slug: "how-to-pitch-playlist-curators",
    title: "How to pitch your song to playlist curators",
    summary:
      "When to pitch, who to pitch first, what to send and how to follow up, in the order a release team works.",
    datePublished: "2026-09-30",
    dateModified: "2026-09-30",
    intro: [
      "Playlists help a song get heard. Getting onto one takes early work, a short message and some follow-up.",
      "This is the order a release team follows, week by week. It comes from our 11-week single-release plan.",
    ],
    still: {
      ...guideStill("pitch", [1360, 1200], [716, 1200]),
      alt: "An Urganize pitch to the curator Lola Adeyemi for her playlist Lagos Late Nights: a private song link, a short note at 145 of 300 characters and a Send pitch button, above the Answers list where replies show as Added or Listened.",
    },
    sections: [
      {
        heading: "Pick your targets early",
        blocks: [
          {
            type: "p",
            text: "At 8 weeks out, choose the 3 playlists or curators you most want to reach. Three is enough to start. A short list you know well beats a long list you copied from somewhere.",
          },
        ],
      },
      {
        heading: "Week 6: two pitches and one private link",
        blocks: [
          {
            type: "p",
            text: "Once your distributor has accepted the song, you can pitch it.",
          },
          {
            type: "list",
            items: [
              "Submit the song in Spotify for Artists. This puts it up for Release Radar and Discover Weekly consideration.",
              "Start reaching out to curators directly.",
            ],
          },
          {
            type: "p",
            text: "Use a private link for both. A private link lets a curator hear the song before it is out.",
          },
        ],
      },
      {
        heading: "Week 5: the editorial window",
        blocks: [
          {
            type: "p",
            text: "Send your editorial playlist pitch with your final files. The plan treats four or more weeks before release as the window for this, so do not wait for release week.",
          },
        ],
      },
      {
        heading: "What to put in your message",
        blocks: [
          {
            type: "p",
            text: "Keep it short. Curators read a lot of these. Urganize caps a pitch note at 300 characters for that reason.",
          },
          {
            type: "list",
            items: [
              "Who you are, in one line.",
              "What the song sounds like, in plain words.",
              "Why it fits this playlist in particular.",
              "The private link.",
            ],
          },
          {
            type: "p",
            text: "Leave out your life story, your streaming history and a list of everywhere else you have pitched.",
          },
        ],
      },
      {
        heading: "Weeks 4 and 3: follow up once",
        blocks: [
          {
            type: "p",
            text: "At 4 weeks out, follow up with the curators you contacted. At 3 weeks out, confirm the spots that came back as yes. One polite follow-up is enough. Do not send five.",
          },
        ],
      },
      {
        heading: "After release: use real numbers",
        blocks: [
          {
            type: "list",
            items: [
              "Thank the curators who helped. They remember.",
              "Pitch secondary editorial playlists, using your first-week numbers as proof.",
              "Try mood and genre playlists. They are less competitive than editorial ones.",
            ],
          },
        ],
      },
      {
        heading: "Write down who you pitched",
        blocks: [
          {
            type: "p",
            text: "Pitching goes wrong when it lives in your direct messages. Keep a record of who you pitched, when, and what they said.",
          },
          {
            type: "p",
            text: "Curators who have joined Urganize can be pitched from inside your rollout. They answer with one tap, and you see the answer on your release. It is free for curators.",
          },
        ],
      },
    ],
    related: ["how-to-plan-a-music-release", "music-release-checklist"],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

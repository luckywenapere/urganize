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
    version: "1.94.0",
    date: "October 10, 2026",
    highlights: [
      "On Home, tap Home in the top bar to fold the left side away and give the chat the full width. Tap it again to bring it back.",
    ],
  },
  {
    version: "1.93.2",
    date: "October 10, 2026",
    highlights: [
      "The Pitching page now shows where each rollout's editorial pitch stands, with a button to open the details.",
    ],
  },
  {
    version: "1.93.1",
    date: "October 10, 2026",
    highlights: [
      "The editorial pitch now also points you to Apple Music for Artists, with where to paste your pitch.",
    ],
  },
  {
    version: "1.93.0",
    date: "October 10, 2026",
    highlights: [
      "Home's chat is now its own chat. It stays put and never goes away.",
      "Start a new session when you want to talk about something else. Your sessions list stays tidy.",
    ],
  },
  {
    version: "1.92.15",
    date: "October 10, 2026",
    highlights: [
      "The Spotify pitch now tells you where to paste it and has a button that opens Spotify for Artists.",
    ],
  },
  {
    version: "1.92.14",
    date: "October 10, 2026",
    highlights: [
      "Once your team has joined, you no longer see the \"invite your team\" tip.",
    ],
  },
  {
    version: "1.92.13",
    date: "October 9, 2026",
    highlights: [
      "Home counts the days to a release right in the Americas too. It used to say a day too early for anyone west of Africa.",
      "The week of your rollout plan on Home now matches the day you picked.",
    ],
  },
  {
    version: "1.92.12",
    date: "October 9, 2026",
    highlights: [
      "When you assign or update an activity, the alert to your teammate no longer gets lost when the app is busy.",
      "Who changed an activity is now always recorded.",
    ],
  },
  {
    version: "1.92.11",
    date: "October 9, 2026",
    highlights: [
      "Starting a payment now tells you when Paystack is too slow, instead of spinning forever.",
      "A slow phone notification service can no longer hold up your morning emails.",
    ],
  },
  {
    version: "1.92.10",
    date: "October 9, 2026",
    highlights: [
      "Your data export now includes every activity, comment and file, no matter how big your team is.",
      "Deleting your account now removes all of your attachment files, not just the first batch.",
      "Home now shows your own upcoming shows even when other teams have many.",
    ],
  },
  {
    version: "1.92.9",
    date: "October 9, 2026",
    highlights: [
      "Teams with many rollouts now see every activity counted, so progress and \"Released\" are right.",
      "UrgAns now calls a rollout released when it has come out, the same as your catalog.",
    ],
  },
  {
    version: "1.92.8",
    date: "October 9, 2026",
    highlights: [
      "When a lot of alerts arrive at once, you now get one message instead of one for each, and older assignments stay in the bell.",
    ],
  },
  {
    version: "1.92.7",
    date: "October 9, 2026",
    highlights: [
      "The bell now says the same thing on screen and out loud, and a pile of \"overdue\" alerts shows as one line you can open.",
    ],
  },
  {
    version: "1.92.6",
    date: "October 9, 2026",
    highlights: [
      "Opening, reloading or sharing a Settings link now always lands on Settings over your catalog, never on a \"page not found\" screen.",
    ],
  },
  {
    version: "1.92.5",
    date: "October 9, 2026",
    highlights: [
      "A rollout that has already come out no longer asks you to fix things before you order distribution.",
    ],
  },
  {
    version: "1.92.4",
    date: "October 9, 2026",
    highlights: [
      "The guided tour now shows \"Step 2 of 3\" with a small progress bar, and its Skip and Next buttons are bigger and easier to tap.",
    ],
  },
  {
    version: "1.92.3",
    date: "October 9, 2026",
    highlights: [
      "An empty Opportunities page now says what it is for and puts the Add opportunity button right there.",
    ],
  },
  {
    version: "1.92.2",
    date: "October 9, 2026",
    highlights: [
      "When you go to delete a rollout, Urganize now checks how many activities it has before you confirm, so a full rollout never looks empty.",
      "In Settings, each rollout you can delete now shows when it was made, so two \"Untitled rollout\" rows are easy to tell apart.",
    ],
  },
  {
    version: "1.92.1",
    date: "October 9, 2026",
    highlights: [
      "Starting a rollout from the + New rollout button and closing UrgAns before it finished no longer leaves an empty \"Untitled rollout\" in your catalogue. Anything you've already added to it is kept.",
    ],
  },
  {
    version: "1.92.0",
    date: "October 9, 2026",
    highlights: [
      "Before you answer UrgAns's questions, you can now see the plan it starts from: how many activities, how they split across the weeks, and a few of them by name. Looking is free.",
    ],
  },
  {
    version: "1.91.3",
    date: "October 9, 2026",
    highlights: [
      "You can name a rollout as you create it. Leave the name empty and it stays Untitled rollout.",
      "Picking Single, EP or Album no longer starts the rollout straight away, so you can change your pick before you press Create rollout.",
    ],
  },
  {
    version: "1.91.2",
    date: "October 9, 2026",
    highlights: [
      "Rollouts in your Catalogue now say Released once release day comes, or once every activity is done. Before, they all said Draft.",
      "The Released filter now shows those rollouts too.",
    ],
  },
  {
    version: "1.91.1",
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
    date: "October 9, 2026",
    highlights: [
      "You can now log what you pay for on each rollout. Open Spend, add the cost, and see the total.",
      "Download the list as a spreadsheet that opens in Excel or Google Sheets.",
      "Thirty days after release day, Urganize asks what the rollout paid back, and shows your answer on the rollout.",
      "Managers also see where the money went, by type, on Home.",
    ],
  },
  {
    version: "1.90.0",
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
    date: "October 9, 2026",
    highlights: [
      "Every rollout plan now has a step to pitch Spotify editorial. It comes after you order distribution, and it is due 28 days before release day.",
      "Rollouts you already made get the step the first time you open them. You get reminders at 28, 14 and 8 days out.",
      "On Manager and above, Draft my pitch fills in your genre, moods, instruments and song description for you.",
    ],
  },
  {
    version: "1.88.5",
    date: "October 9, 2026",
    highlights: [
      "Each task on Home now reads as one sentence, like \"Send the press release in Midnight EP by Dorian, 3 days overdue.\"",
      "Tap a task card anywhere to open it. The circle on the left only marks it done.",
      "Home's loading screen now matches how Home looks once it loads.",
    ],
  },
  {
    version: "1.88.4",
    date: "October 7, 2026",
    highlights: [
      "Admin now lives in Settings. Credits is still one tap away from the credits badge at the top.",
    ],
  },
  {
    version: "1.88.3",
    date: "October 7, 2026",
    highlights: [
      "The Sessions link in the top bar's More menu is gone. Your chats are still on Home, under Sessions.",
    ],
  },
  {
    version: "1.88.2",
    date: "October 7, 2026",
    highlights: [
      "On a phone, press and hold any tab or menu item to see what it is for. A quick tap still opens it.",
    ],
  },
  {
    version: "1.88.1",
    date: "October 7, 2026",
    highlights: [
      "Pages like Relationships and Shows no longer repeat their name in a big heading.",
      "Rest your pointer on a menu item for half a second to see what it is for.",
    ],
  },
  {
    version: "1.88.0",
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
    date: "October 7, 2026",
    highlights: [
      "In a rollout's chat, type @ to tag someone. They get an email and a notification. Use @everyone to tag the whole team.",
    ],
  },
  {
    version: "1.86.0",
    date: "October 7, 2026",
    highlights: [
      "Timeline now has its own tab in a rollout, so you can get back to it from Notes or Content.",
      "You can open the timeline full screen.",
    ],
  },
  {
    version: "1.85.1",
    date: "October 7, 2026",
    highlights: [
      "Opening the chat from Home no longer freezes for a moment first.",
    ],
  },
  {
    version: "1.85.0",
    date: "October 7, 2026",
    highlights: [
      "Sending a message from Home now slides your chat box down into the full chat, instead of jumping.",
    ],
  },
  {
    version: "1.84.1",
    date: "October 7, 2026",
    highlights: [
      "Opening UrgAns on your phone now brings up the keyboard right away.",
    ],
  },
  {
    version: "1.84.0",
    date: "October 7, 2026",
    highlights: [
      "In the full chat you can close the Today panel, and bring it back from the Today button or by pressing Home.",
      "Your saved chats are back on desktop. Open them from the Chats button in the chat.",
    ],
  },
  {
    version: "1.83.0",
    date: "October 7, 2026",
    highlights: [
      "Typing in the Home chat box now opens the full chat with your message sent.",
      "Chat messages now appear in bubbles. On a computer, your priority task sits beside the chat.",
      "There is a Home arrow at the top of the chat to take you back.",
    ],
  },
  {
    version: "1.82.0",
    date: "October 7, 2026",
    highlights: [
      "Home is cleaner: the team name and the count chips under your greeting are gone.",
    ],
  },
  {
    version: "1.81.0",
    date: "October 7, 2026",
    highlights: [
      "The priority task card on Home is simpler: just the task and a button to open it.",
    ],
  },
  {
    version: "1.80.0",
    date: "October 7, 2026",
    highlights: [
      "The chat box on Home now has everything the UrgAns chat has: attach a photo or file, pick a rollout, and talk instead of typing.",
    ],
  },
  {
    version: "1.79.0",
    date: "October 7, 2026",
    highlights: [
      "The chat box on Home now looks like a normal chat box. Press Enter to send.",
    ],
  },
  {
    version: "1.78.0",
    date: "October 7, 2026",
    highlights: [
      "You can now attach PDF, Word and Excel files to a message in UrgAns, and it will read them.",
    ],
  },
  {
    version: "1.77.0",
    date: "October 7, 2026",
    highlights: [
      "On Home, the ask bar is now a chat box. Type a message and UrgAns opens with it already sent.",
    ],
  },
  {
    version: "1.76.0",
    date: "October 7, 2026",
    highlights: [
      "You can now attach photos and text files to a message in UrgAns. Tap the plus, take a photo or pick a file, and UrgAns will read it.",
    ],
  },
  {
    version: "1.75.0",
    date: "October 6, 2026",
    highlights: [
      "UrgAns can now read its replies out loud. Tap the speaker under any reply to listen.",
    ],
  },
  {
    version: "1.74.0",
    date: "October 6, 2026",
    highlights: [
      "On Home, the ask bar now sits right above \"See everything\" and is easier to spot.",
      "The round UrgAns button no longer shows on Home, since the ask bar does the same job.",
    ],
  },
  {
    version: "1.73.0",
    date: "October 5, 2026",
    highlights: [
      "Cleaner screens. The small grey lines under titles and buttons now sit behind a tap-for-info icon.",
      "A new body font, Instrument Sans, and Young Serif now also headlines the calendar and share images.",
      "Settings is easier to scan. Your team, Artists and Press kits fold open one at a time.",
    ],
  },
  {
    version: "1.72.0",
    date: "October 5, 2026",
    highlights: [
      "Home is calmer. It opens on the one thing to do, and the long lists wait behind See everything.",
    ],
  },
  {
    version: "1.71.0",
    date: "October 5, 2026",
    highlights: [
      "The trial-ended page is cleaner. It shows what you built and one button to continue.",
      "On iPhone you can email yourself the link to pay on the web.",
      "Shows has a ticket icon, so it no longer looks like a record button.",
    ],
  },
  {
    version: "1.69.0",
    date: "October 4, 2026",
    highlights: [
      "Your first time on Home is calmer. You see Chappi and one button to start a rollout.",
    ],
  },
  {
    version: "1.68.0",
    date: "October 4, 2026",
    highlights: [
      "Headlines have a new look. They use a chunkier, friendlier font.",
    ],
  },
  {
    version: "1.67.0",
    date: "October 4, 2026",
    highlights: [
      "Opportunities is open. Add the deals, grants, sync and brand work you are going after, and give each one a next step and a date.",
      "The list puts what is late first, so you know what to chase.",
    ],
  },
  {
    version: "1.66.0",
    date: "October 4, 2026",
    highlights: [
      "The bar at the bottom of your phone only tucks away when you really scroll. It stays put on short pages and in UrgAns.",
      "One search now finds the activities in the rollout you are in.",
      "UrgAns opens ready to type, and new icons make each area easier to spot.",
    ],
  },
  {
    version: "1.65.1",
    date: "October 4, 2026",
    highlights: [
      "In Settings, Brand colors now stays folded until you open it, so Artists & brand is easier to scan.",
    ],
  },
  {
    version: "1.65.0",
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
    date: "October 4, 2026",
    highlights: [
      "The content calendar is back. Plan your posts on a month grid, one calendar for each account.",
    ],
  },
  {
    version: "1.63.0",
    date: "October 2, 2026",
    highlights: [
      "New Distribute step on every rollout. It checks you have what the stores need, then takes you to sign up with our distribution partner.",
    ],
  },
  {
    version: "1.62.0",
    date: "October 2, 2026",
    highlights: [
      "Every artist now has their own page. See their rollouts, shows, team and press kit all in one place.",
      "When a rollout is done, it keeps the press kit it went out with. Changing the bio later will not change an old rollout.",
    ],
  },
  {
    version: "1.61.0",
    date: "October 2, 2026",
    highlights: [
      "No plan? If you have credits, you can now use all of Urganize with the Solo features, not just UrgAns.",
    ],
  },
  {
    version: "1.60.0",
    date: "October 2, 2026",
    highlights: [
      "UrgAns now shows how many credits you have left, right under the chat box.",
    ],
  },
  {
    version: "1.59.0",
    date: "October 2, 2026",
    highlights: [
      "Every plan can now search the directory, Solo included.",
      "Solo is now for one person. To work with teammates, move up to Manager. Anyone already on your Solo team stays.",
    ],
  },
  {
    version: "1.58.0",
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
    date: "October 2, 2026",
    highlights: [
      "When you pitch a playlist, one tap starts your note from the story you wrote in the Pitch kit.",
      "Your press kit can now pick up the story and credits from your latest rollout. You choose what to accept.",
    ],
  },
  {
    version: "1.56.0",
    date: "October 2, 2026",
    highlights: [
      "Each rollout now has a Pitch kit. Write the story behind it and show its credits, on top of your artist's press kit.",
      "Ask UrgAns to Fill both and it writes the empty parts of your press kit and the story. It never changes what you already wrote.",
    ],
  },
  {
    version: "1.55.0",
    date: "October 1, 2026",
    highlights: [
      "UrgAns now uses credits. Every team starts with 50 free credits to try it.",
      "Credits never run out on their own. What you don't use stays with you.",
      "You see an estimate before UrgAns drafts a plan or a press kit section.",
    ],
  },
  {
    version: "1.54.0",
    date: "September 30, 2026",
    highlights: [
      "Home no longer gets cut off on the right side on your phone.",
    ],
  },
  {
    version: "1.53.0",
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
    date: "September 30, 2026",
    highlights: [
      "Your UrgAns chats now sit in the menu on the left, right under the pages. Tap one to open it.",
      "The plus at the top of the list starts a new chat.",
    ],
  },
  {
    version: "1.51.0",
    date: "September 30, 2026",
    highlights: [
      "On a computer, everything for your rollout now sits in one menu on the right, with UrgAns right under it.",
      "New activity moved next to your progress bar.",
      "The small cards for your other rollouts are gone. Tap the back arrow to pick a different one.",
    ],
  },
  {
    version: "1.50.0",
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
    date: "September 29, 2026",
    highlights: [
      "Every rollout now has its own chat. Anyone on the team with access to it can talk there, and every activity has its own smaller chat too, for the people working on just that one thing.",
    ],
  },
  {
    version: "1.48.1",
    date: "September 25, 2026",
    highlights: [
      "Renaming a rollout used to quietly clear its release date, which could hide your whole plan and ask you to pick a date again. That's fixed now — renaming only changes the name.",
    ],
  },
  {
    version: "1.48.0",
    date: "September 25, 2026",
    highlights: [
      "You can now talk to UrgAns instead of typing. Tap the mic, say what you need, and your words drop into the box to check and send.",
      "Nothing is sent until you tap send, so you can fix a name or a title first.",
    ],
  },
  {
    version: "1.47.0",
    date: "September 25, 2026",
    highlights: [
      "UrgAns now builds your rollout plan the moment you finish answering its questions, instead of showing you a draft to approve first.",
      "Tell it what to leave out, like marketing or paid ads, and the plan follows what you asked for. It reads what you type, too.",
    ],
  },
  {
    version: "1.46.0",
    date: "September 25, 2026",
    highlights: [
      "Shows is out of beta. The DJ pack you send now carries the actual tracks, and your run of show is yours to edit.",
      "Move a show's date and its links move with it, so your DJ's downloads keep working instead of going dead.",
      "Rename a set, fix a song's title or length, and see who already has a pack before you send it again.",
    ],
  },
  {
    version: "1.45.0",
    date: "September 24, 2026",
    highlights: [
      "You can now give each artist their own colors for share images, instead of Urganize's own colors. Set them in Settings, under the artist's name.",
    ],
  },
  {
    version: "1.44.0",
    date: "September 24, 2026",
    highlights: [
      "UrgAns remembers your conversations now, so you can pick one back up later instead of starting fresh. Your past chats also show up in a history list, where you can reopen or delete them.",
    ],
  },
  {
    version: "1.43.1",
    date: "September 24, 2026",
    highlights: [
      "Asking UrgAns to draft a press kit section for you now works, instead of failing every time.",
    ],
  },
  {
    version: "1.43.0",
    date: "September 24, 2026",
    highlights: [
      "When you share a rollout, you can now also post to X or Snapchat, the same way as Instagram and WhatsApp.",
    ],
  },
  {
    version: "1.42.1",
    date: "September 24, 2026",
    highlights: [
      "UrgAns replies read cleanly now. Bold words show up bold, not wrapped in stars, and copying a reply gives you clean text.",
    ],
  },
  {
    version: "1.42.0",
    date: "September 24, 2026",
    highlights: [
      "Share a rollout on Instagram, as your WhatsApp status, or in a message to anyone. Answer four quick questions and we make the images and captions.",
      "After your first rollout, the share screen opens once by itself. After that, every rollout has a Share button, and you can ask UrgAns to open it.",
    ],
  },
  {
    version: "1.41.0",
    date: "September 10, 2026",
    highlights: [
      "The free trial is now 3 days instead of 14. Same terms otherwise: your whole team, no card.",
    ],
  },
  {
    version: "1.40.0",
    date: "September 9, 2026",
    highlights: [
      "The Group plan is gone. There are three plans now: Solo, Manager and Label.",
      "The \"Most teams\" badge moved from Manager to Solo, since that is where most teams start.",
    ],
  },
  {
    version: "1.39.0",
    date: "September 9, 2026",
    highlights: [
      "New prices, and every plan is now paid once a year. Solo is ₦5,000, Manager is ₦22,000 and Label is ₦50,000.",
      "There is no monthly option any more, so there is one price to read on every plan.",
      "Already paying? Your price stays exactly where it is. Ask us if you want to move to a new one.",
      "UrgAns suggests a few things to ask it when you open it, so there is somewhere to start.",
      "Asking UrgAns to add an activity works now. It did not know that word before.",
    ],
  },
  {
    version: "1.38.0",
    date: "September 9, 2026",
    highlights: [
      "Keep dragging the side menu's right edge and it collapses to just icons. Drag it back out to bring the words back.",
      "Your team name and artist sit beside the logo now, not under it.",
      "The teammate and rollout counts are gone from the menu, so it looks the same open or collapsed.",
    ],
  },
  {
    version: "1.37.0",
    date: "September 9, 2026",
    highlights: [
      "Releases are now called rollouts. Same thing, clearer name. You will see it everywhere in the app.",
    ],
  },
  {
    version: "1.36.0",
    date: "September 9, 2026",
    highlights: [
      "Pitching has its own page now. Open it from the side menu, the top bar or the bar at the bottom of your phone to see every pitch you have sent and what the playlist owner said.",
      "You can send a pitch from that page too. Pick the release, pick a playlist, send the song.",
      "Press kits moved into Settings. Open Settings, then Profile, and they are there.",
    ],
  },
  {
    version: "1.35.0",
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
    date: "September 9, 2026",
    highlights: [
      "You can resize the side menu now. Drag its right edge to make it wider or narrower, and double-click that edge to put it back.",
      "The width you pick is remembered, so the menu stays how you left it next time you open the app.",
      "The New release button is called New rollout now. Same button, same place.",
    ],
  },
  {
    version: "1.33.0",
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
    date: "September 8, 2026",
    highlights: [
      "Tapping \"Review your draft plan\" opens your plan again. Some people were being sent to the Metadata page instead.",
      "An old link to something you have since switched off now opens the release, instead of a page with nothing on it.",
    ],
  },
  {
    version: "1.32.0",
    date: "September 8, 2026",
    highlights: [
      "UrgAns tailors your rollout plan more reliably now. It used to give up and hand you the plain playbook more often than it should have.",
      "UrgAns has a voice now — strict, a little bossy, and focused on getting your release out. Its replies also read clean, with no stray symbols.",
    ],
  },
  {
    version: "1.31.0",
    date: "September 8, 2026",
    highlights: [
      "Notes are back on. Park a thought mid-call with nothing to fill in first, then link it to a release whenever you want.",
      "You can search your notes now. It reads the whole note, not just the title, and your words can be in any order.",
      "Turn a note into an activity in one tap. It carries over the note's title, and the release the note belongs to.",
    ],
  },
  {
    version: "1.30.0",
    date: "September 7, 2026",
    highlights: [
      "Metadata collection is back on. Fill in the details music stores need, and send collaborators a link so they can add their own credits and splits.",
      "The fan email capture page is back on too. Any link you shared for either of these works again, and everything people sent you while they were off is still there.",
      "The content calendar stays off for now.",
    ],
  },
  {
    version: "1.29.0",
    date: "September 7, 2026",
    highlights: [
      "Ask UrgAns for your release recap and the card shows up right there in the chat. Pick Story or Square and save it without leaving the conversation.",
      "The Release recap button is gone. Ask for it in your own words, and mention anything worth remembering about the release — UrgAns will put it on the card.",
    ],
  },
  {
    version: "1.28.0",
    date: "September 7, 2026",
    highlights: [
      "Ask UrgAns for a status update instead of hunting for a button. Say \"status update\" or ask it in your own words, and the paragraph comes back in the chat with the numbers it was written from.",
      "The old Status update button is gone. One place to ask, and you can copy the paragraph straight out of the conversation.",
    ],
  },
  {
    version: "1.27.0",
    date: "September 7, 2026",
    highlights: [
      "Urganize has a look of its own now. A woven cloth texture and hand-drawn borders run through every screen you open, in light mode and dark.",
      "Nothing moved and nothing works differently. Same app, more character.",
    ],
  },
  {
    version: "1.26.1",
    date: "September 7, 2026",
    highlights: [
      "Going back into an artist's press kit is instant. It shows the kit straight away instead of a loading screen.",
    ],
  },
  {
    version: "1.26.0",
    date: "September 7, 2026",
    highlights: [
      "You can now ask anyone in the directory to work on a release. Say what the job is and send it.",
      "They answer in one tap. If they are interested, their email comes back to you and you can reply straight from the message.",
      "Everyone you asked, and what each of them said, shows on the release and in your settings.",
    ],
  },
  {
    version: "1.25.0",
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
    date: "September 5, 2026",
    highlights: [
      "The press kits tab opens straight away now. It shows what you saw last time while it quietly checks for anything new, instead of making you wait.",
      "Opening one artist's kit is quicker too. It used to ask the server twice before it could show you anything.",
    ],
  },
  {
    version: "1.24.1",
    date: "September 5, 2026",
    highlights: [
      "The buttons at the bottom of your phone no longer come and go. Every one is always there, so nothing moves under your thumb.",
      "Press kits now sits at the end of that row.",
      "Song moved off it. You'll still find it in a release's menu, one tap away.",
    ],
  },
  {
    version: "1.24.0",
    date: "September 5, 2026",
    highlights: [
      "Every artist has a press kit now. It lives at one link you keep, instead of making a new one for each release.",
      "Urganize fills in what it already knows about the artist and asks you for the rest. Add photos, a bio and who to contact, then publish when you are ready.",
      "Press kit links you have already sent still work. They start pointing at the new kit once you publish it.",
    ],
  },
  {
    version: "1.23.1",
    date: "September 5, 2026",
    highlights: [
      "Opening an activity is calmer. Its name comes first now, with the status, release and due date on one quiet line underneath.",
      "The fields lost their labels and boxes. Tap any of them to change it, exactly as before.",
      "Notes stay hidden until you add some, and you can now invite a teammate from inside the assignee list.",
    ],
  },
  {
    version: "1.23.0",
    date: "September 3, 2026",
    highlights: [
      "Something broken, or something you wish Urganize did? Tell us from inside the app. Tap the “?” at the top, or open Settings → Account on your phone.",
      "We get the page you were on and which release you had open, so you don’t have to explain where it happened.",
    ],
  },
  {
    version: "1.22.0",
    date: "September 3, 2026",
    highlights: [
      "UrgAns can now help with creative direction, content ideas, marketing strategy, and career advice — just ask, no special phrasing needed.",
      "Ask UrgAns to compare your last few releases or show you who on your team is carrying the most work right now.",
      "UrgAns will tell you plainly when it doesn't have streaming or audience numbers, instead of guessing.",
    ],
  },
  {
    version: "1.21.0",
    date: "September 3, 2026",
    highlights: [
      "We turned off three release tools for now: Metadata collection, the fan email capture page, and the content calendar. Any links you shared for these will stop working until we turn them back on.",
      "Nothing you already saved is gone. Your metadata, credits, calendar posts and email signups are all still there, waiting for these to come back.",
    ],
  },
  {
    version: "1.20.1",
    date: "September 2, 2026",
    highlights: [
      "Renaming a set works properly now. Typing no longer wipes what you had just typed with each new letter.",
    ],
  },
  {
    version: "1.20.0",
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
    date: "September 2, 2026",
    highlights: [
      "The Android app can now send you notifications, the same as the web app: when an activity is due, when one is handed to you, and when we have news. Install the newest build of the app, then tap Turn on when the card appears after you sign in, or switch it on any time in Settings.",
      "Notifications you turned on in a browser keep working. Turning them on in the app adds your phone to the list, so both ring.",
    ],
  },
  {
    version: "1.18.0",
    date: "September 2, 2026",
    highlights: [
      "After about a minute in the app, we offer to put Urganize on your device. On Android, one tap gets you the app. On a computer, one tap installs it in its own window. On an iPhone, the card shows you the two taps that add it to your Home Screen.",
      "Say Not now and it stays out of your way for the rest of the visit. Once you have installed it, we do not ask again.",
      "If you turn the install down, the notifications card follows a moment later, so you still get the choice.",
    ],
  },
  {
    version: "1.17.0",
    date: "September 2, 2026",
    highlights: [
      "Urganize now asks if you want notifications on. A small card shows up shortly after you sign in, on each device you use. Tap Turn on and your phone or computer will tell you when an activity is due or handed to you, even when the app is closed.",
      "Said no? Tap Not now and it stays quiet. You can always turn notifications on later in Settings.",
    ],
  },
  {
    version: "1.16.0",
    date: "September 1, 2026",
    highlights: [
      "Just want to look around first? Try a test release. One tap sets up a full plan you can play with, and you can delete it whenever you are done.",
    ],
  },
  {
    version: "1.15.0",
    date: "September 1, 2026",
    highlights: [
      "Solo is now a plan you can pick. It is for one artist, and it is the cheapest way in.",
      "When your plan is full and you invite someone, we now tell you so. The button used to just go grey without saying why.",
    ],
  },
  {
    version: "1.14.1",
    date: "September 1, 2026",
    highlights: [
      "Home and Catalog always take you back to your full list of releases now. If you only had one release, they used to pull you straight back into it.",
    ],
  },
  {
    version: "1.14.0",
    date: "August 31, 2026",
    highlights: [
      "On your phone, the row of buttons above your activities is gone. Everything it held is in the menu button at the bottom of the screen, along with everything that was already there.",
      "The menu is in order of what you use most, so the things you open every week are at the top. The one you have open is highlighted.",
    ],
  },
  {
    version: "1.13.0",
    date: "August 31, 2026",
    highlights: [
      "Your catalog has a search bar at the top now, on your phone and on your computer. Type part of a release name or an artist name to find it.",
      "The search on your phone also finds pages now, not just activities. Type \"billing\" and it takes you to Settings.",
    ],
  },
  {
    version: "1.12.0",
    date: "August 31, 2026",
    highlights: [
      "On your phone, the search button now searches your activities. Type a few letters and tap the one you want. It used to only look through the menu's own eight buttons, so it could never find an activity.",
      "The menu button opens just the menu. The search box is gone from it, because search has its own place now.",
    ],
  },
  {
    version: "1.11.3",
    date: "August 31, 2026",
    highlights: [
      "Shows has its own microphone icon now. It used to share the calendar icon with your content calendar, so on a big screen the two were hard to tell apart.",
      "The content calendar is now just called Content.",
    ],
  },
  {
    version: "1.11.2",
    date: "August 31, 2026",
    highlights: [
      "UrgAns opens on your phone again. The notifications button we added earlier today was stopping it, so we have taken that button back out and will put it back once it works properly.",
    ],
  },
  {
    version: "1.11.1",
    date: "August 31, 2026",
    highlights: [
      "The bottom menu on your phone shows icons only now, with no words under them, so the buttons are bigger and easier to hit.",
      "Your notifications are on your phone at last. Open UrgAns and tap the bell in the bottom menu to see them.",
    ],
  },
  {
    version: "1.11.0",
    date: "August 31, 2026",
    highlights: [
      "Tap Catalog in the side menu to leave a release and get back to your list. It used to look like you were already there, so it was easy to miss.",
      "Catalog now has an arrow. Open it to see all your releases and jump straight to any one of them.",
    ],
  },
  {
    version: "1.10.2",
    date: "August 31, 2026",
    highlights: [
      "Notes and Shows now open straight away instead of loading when you tap them. The app gets them ready in the background while you read, the same way it already did for your catalog and UrgAns.",
    ],
  },
  {
    version: "1.10.1",
    date: "August 31, 2026",
    highlights: [
      "If the app reloads itself after we ship an update, it now takes you to the page you tapped instead of dropping you back where you started.",
    ],
  },
  {
    version: "1.10.0",
    date: "August 31, 2026",
    highlights: [
      "See a whole release on one screen. Every activity sits on a week line with today marked, so you can tell what is late and what is coming without reading a list.",
      "Drag an activity to another week to move it. On a phone you get the same week-by-week view to read.",
    ],
  },
  {
    version: "1.9.1",
    date: "August 30, 2026",
    highlights: [
      "The back arrow next to a release name now always takes you to your list of releases. It used to guess where you came from, and it guessed wrong a lot.",
    ],
  },
  {
    version: "1.9.0",
    date: "August 30, 2026",
    highlights: [
      "Meet Chappi, the face of UrgAns. He waits with you while UrgAns thinks, sits on screens that are still empty, and turns up to celebrate when every activity on a release is done.",
    ],
  },
  {
    version: "1.8.0",
    date: "August 30, 2026",
    highlights: [
      "You can remove an artist you added by mistake. It only works if they have no releases and nobody is limited to seeing them, and it tells you which one is in the way.",
    ],
  },
  {
    version: "1.7.0",
    date: "August 30, 2026",
    highlights: [
      "Filed a release under the wrong artist? You can move it now, from the release itself.",
    ],
  },
  {
    version: "1.6.0",
    date: "August 30, 2026",
    highlights: [
      "You can work with more than one artist now. Add them in Settings, and pick who a release is for when you create it.",
      "Invite an artist and they only see their own releases. You can now do that for an artist who has no releases yet.",
    ],
  },
  {
    version: "1.5.4",
    date: "August 29, 2026",
    highlights: [
      "The back arrow on a release always takes you somewhere now. Before, it could bounce you between the same two screens and you could never get out.",
    ],
  },
  {
    version: "1.5.3",
    date: "August 29, 2026",
    highlights: [
      "Picking who does an activity is now a simple dropdown. Tap it and the list of your team opens — no keyboard pops up over it any more.",
    ],
  },
  {
    version: "1.5.2",
    date: "August 29, 2026",
    highlights: [
      "The assignee box shows your whole team again. If an activity was already assigned to someone, opening the box only showed that one person, so you could not hand the work to anybody else.",
      "Tapping a box no longer zooms the page in on your phone. That was happening on almost every field in the app.",
      "Fixed a rare case in the plan editor where moving past the assignee box could quietly clear who it was assigned to.",
    ],
  },
  {
    version: "1.5.1",
    date: "August 29, 2026",
    highlights: [
      "Your teammates can now open a release's pages — Collect metadata, the calendar, the press kit and the rest. Before, those pages said \"Release not found.\" unless you were the person who created the release.",
      "If the Collect metadata page can't refresh, you keep what already loaded and get a Retry button instead of the page going blank.",
    ],
  },
  {
    version: "1.5.0",
    date: "August 29, 2026",
    highlights: [
      "When you hand an activity to a teammate, they now get an email as well, not just a notification. It reads like a note from you, with the activity, the release and the due date, and a button that opens it.",
      "This also works when you create an activity that is already assigned to someone. Before, that told nobody at all.",
    ],
  },
  {
    version: "1.4.3",
    date: "August 29, 2026",
    highlights: [
      "Invite links are dependable now. If a teammate created an account from your link but never landed in your workspace, that can no longer happen: they join automatically the next time they sign in.",
      "Signing up on a weak connection used to leave a teammate stuck outside the team, so you could not assign them anything and they could not see your releases. Both are fixed by the same change.",
    ],
  },
  {
    version: "1.4.2",
    date: "August 28, 2026",
    highlights: [
      "No more pop-up the moment you land. If you have no releases yet, you get to look around first, and the app offers to help a little later.",
      "You can close that create-release window now. The Create release button is right there whenever you are ready.",
    ],
  },
  {
    version: "1.4.1",
    date: "August 27, 2026",
    highlights: [
      "The credits form now remembers the person filling it in. Next time you send them a link, their name, email and publishing details are already there, so they only add what is new.",
      "It remembers on their own phone or computer, never on ours, and it never fills in shares or what they did on the song. Those change with every song.",
    ],
  },
  {
    version: "1.4.0",
    date: "August 27, 2026",
    highlights: [
      "When someone sends their credits, you hear about it straight away, with what they filled in. No more checking the page to see if anyone answered.",
      "You can download everyone's credits as a spreadsheet. The shares come out as real numbers, so you can add up the column and see if it reaches 100.",
      "If someone goes back and fixes their answer, we do not message you a second time.",
    ],
  },
  {
    version: "1.3.0",
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
    date: "August 27, 2026",
    highlights: [
      "Your workspace logo and your profile photo now show up after you upload them. A very large picture used to upload fine and then never appear, leaving a broken box with nothing you could do about it.",
      "Big pictures are shrunk before they upload, so they save faster and load quickly even on a slow connection.",
    ],
  },
  {
    version: "1.2.0",
    date: "August 25, 2026",
    highlights: [
      "Connect Claude, ChatGPT or another AI app to Urganize and ask it about your releases. It can see your releases, activities and notes, and add or change them — it cannot delete anything.",
      "You decide which apps get in, and you can cut any of them off at any time from Settings.",
    ],
  },
  {
    version: "1.1.4",
    date: "August 25, 2026",
    highlights: [
      "You stay logged in. A slow or patchy connection used to sign you out for real — you would come back to the app, or reopen it on your phone, and be asked to log in again even though nothing was wrong with your account. Now a request that does not get through is treated as exactly that, and your session is left alone.",
      "A hiccup loading your profile no longer looks like being logged out, and no longer shows you a red error while you are working.",
      "If your session genuinely does end, the login page now tells you so instead of appearing out of nowhere, and your email is still filled in.",
    ],
  },
  {
    version: "1.1.3",
    date: "August 25, 2026",
    highlights: [
      "On a computer, pages inside a release now use the full width. Collect metadata, your calendar, files and your press kit were being squeezed into a narrow strip with empty space next to them.",
      "The buttons next to a share link no longer get cut off.",
    ],
  },
  {
    version: "1.1.2",
    date: "August 25, 2026",
    highlights: [
      "The Collect metadata page is easier to read. You now see three small steps — tap one to open it.",
      "Each step shows a quick note, like how many details you've filled in or whether your link is live, so you know what's left without opening anything.",
    ],
  },
  {
    version: "1.1.1",
    date: "August 25, 2026",
    highlights: [
      "The back arrow above a release now takes you back. If you have a page open like Cover art or Song, it closes that first and puts you back on your activities. Press it again and you go to wherever you were before.",
      "Fixed a case where the back arrow did nothing at all if you only had one release.",
    ],
  },
  {
    version: "1.1.0",
    date: "August 24, 2026",
    highlights: [
      "You can now pick your plan in the app. Manager, Label or Group, paid monthly or once a year.",
      "Every plan says plainly what it covers: how many people can be on your team, how many releases you can run at once, and how much UrgAns you get.",
      "Bigger setups are priced per deal. If Group fits you, there is a button to talk to us instead of paying online.",
    ],
  },
  {
    version: "1.0.0",
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
    date: "August 21, 2026",
    highlights: [
      "On your phone, everything you can open for a release — Plan, Collect metadata, Pitch, Files, Calendar, Press kit — now sits together at the bottom of the screen, stacked so you can see all of it at once. It stays put while you scroll your activities, and nothing runs off the side of the screen the way the old sideways-scrolling row did.",
      "Notes came off that row, since it already has its own tab in the bar at the bottom of your phone screen.",
      "The content calendar is no longer marked Beta.",
    ],
  },
  {
    version: "0.59.0",
    date: "August 21, 2026",
    highlights: [
      "The sign-in page got a clean new look: your logo up top and two simple buttons — Continue with Google or Continue with Email.",
      "Signing in with email is now one step at a time. Type just your email and continue: if you have an account, the password field appears right there; if you're new, you go straight into sign-up with your email already filled in.",
      "Stuck at the door? A \"Having trouble signing in? Contact us\" link at the base of the page opens a chat with us.",
    ],
  },
  {
    version: "0.58.1",
    date: "August 21, 2026",
    highlights: [
      "Tapping the UrgAns icon while already on the assistant page now takes you back to your workspace — before, it did nothing.",
      "On phones, switching between UrgAns and Home no longer loses the release you had pinned in the assistant.",
    ],
  },
  {
    version: "0.58.0",
    date: "August 21, 2026",
    highlights: [
      "New members now get a welcome note from Lucky in their inbox when they finish setting up — with a direct line to him on WhatsApp if anything feels confusing.",
    ],
  },
  {
    version: "0.57.0",
    date: "August 21, 2026",
    highlights: [
      "Teammate invites now arrive by email. Invite someone with their address from Settings or UrgAns and the join link lands in their inbox — the copyable link is still there as a backup for sharing over WhatsApp or chat.",
    ],
  },
  {
    version: "0.56.3",
    date: "August 18, 2026",
    highlights: [
      "Creating a release with a rollout plan no longer asks twice whether it's a single, EP or album. You answer once in the create window, and the planner walkthrough carries that answer forward — it now starts at the artist question, six questions instead of seven.",
      "Choosing a rollout plan now takes you straight into the planning questions no matter where you created the release from — the workspace, UrgAns, or the new-release button in the bar — instead of only from the workspace.",
    ],
  },
  {
    version: "0.56.2",
    date: "August 18, 2026",
    highlights: [
      "Asking UrgAns to create a release now works end to end. It used to walk you through the seven rollout questions and then stop with “there is already a release plan” — it had no way to create the release, so it aimed the plan at one you already had. Now, when you finish the questions, it creates the new release and drafts its rollout plan in one go.",
      "If a plan is ever pointed at a release that already has its activities, UrgAns now says so and offers to plan a new release instead of giving up.",
    ],
  },
  {
    version: "0.56.1",
    date: "August 16, 2026",
    highlights: [
      "The message box in UrgAns now sits right on top of the keyboard on your phone. It used to float in the middle of the screen with a band of empty space underneath it, which was worst on iPhone.",
      "The box is a single line now. The release you're talking about sits beside what you're typing instead of taking a row of its own, so more of the screen is your conversation.",
      "Your conversation reads from the top of the screen downwards, the way other assistants do, instead of starting at the bottom and growing up.",
    ],
  },
  {
    version: "0.56.0",
    date: "August 16, 2026",
    highlights: [
      "Creating a release now hands you a login to send to your team. You don't have to go looking for it — the moment the release is set up, the link is there to copy straight into WhatsApp or an email.",
      "A new Team logins section in Settings lets you create as many logins as you need, one per person, and label each one so you know who you sent it to.",
      "Nobody has to be sent a password. Whoever opens your link chooses their own on the way in, so there's never a password sitting in a chat you'd have to go back and delete.",
      "You can revoke any login you've handed out. It stops working immediately, and anyone who already joined keeps their access.",
    ],
  },
  {
    version: "0.55.2",
    date: "August 15, 2026",
    highlights: [
      "Your activities are grouped by what state they're in, not only by when they're due. In Progress, Blocked, In Review, Backlog and Locked each get their own group now, so the work you've actually started is visible at a glance instead of sitting unmarked among everything else.",
      "Every group's bar shows how much of the release sits in that state, so you can read the shape of a release — how much is underway, how much is waiting, how much is done — without opening anything.",
      "Groups with nothing in them stay hidden, so the list only shows the states your release is actually in.",
    ],
  },
  {
    version: "0.55.1",
    date: "August 15, 2026",
    highlights: [
      "Your activities list now shows all five time groups — Overdue, Due today, Due this week, Upcoming and No due date — from the moment a release has work in it, so you can read at a glance how the release is spread across the weeks ahead instead of only seeing the groups that happen to be occupied.",
    ],
  },
  {
    version: "0.55.0",
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
    date: "August 14, 2026",
    highlights: [
      "Every group in your activities list now carries a slim progress bar showing how much of it is underway. Work you've started fills the bar, so you can read a release's momentum at a glance without opening a single group.",
    ],
  },
  {
    version: "0.54.1",
    date: "August 14, 2026",
    highlights: [
      "Amber warning notices are much easier to read in the light theme. The amber was too pale against the cream background to read comfortably even on its own, so the notices that tell you a release has no date yet, or that an invite is about to expire, were harder to read than the ordinary text around them.",
    ],
  },
  {
    version: "0.54.0",
    date: "August 14, 2026",
    highlights: [
      "Press kits are back. Open a release and you can generate a shareable link again — one page with the artwork, the details and your promo shots, ready to send to a blog, a playlist or a radio show.",
      "The Press kit button now sits beside Calendar at the bottom of your activities, so both of the things you send out live in the same place.",
    ],
  },
  {
    version: "0.53.1",
    date: "August 14, 2026",
    highlights: [
      "Delete buttons look like delete buttons again. The red fill behind them was never actually being drawn, so anything asking you to confirm deleting a release or a note — or the card UrgAns shows before it does something it can't undo — came out as a thin outline with red writing inside it, far fainter than a warning should look.",
      "Red warning text is easier to read across the app, in both the light and dark themes. The red sat too pale on the light background and too dull on the dark one, so error messages and delete warnings were among the hardest things on the page to read at exactly the moment they mattered most.",
    ],
  },
  {
    version: "0.53.0",
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
    date: "August 14, 2026",
    highlights: [
      "Settings now tells you what you are paying for. Billing sits at the top of the Account tab and says whether you are on a trial or a plan, how much of it is left, and the date it runs to. Paying used to finish on a screen with a Billing button that led to a page with no billing on it anywhere.",
      "From there you can go straight to the plans to start, change or renew. If you are on a Label plan it puts you in touch with us instead, since those are arranged with you directly.",
    ],
  },
  {
    version: "0.51.3",
    date: "August 14, 2026",
    highlights: [
      "Collecting metadata is three plain steps now: fill in the song's details, send one link to everyone who worked on it, then watch their answers land. The page used to open on three blocks of industry jargon at once with nothing saying what to do first, or that any of it could wait.",
      "Every field explains itself in ordinary words. ISRC, UPC, the ℗ and © lines — each one now says what it is and where to get it, and the page tells you outright that everything is optional and shows how many you have filled in.",
      "The form your collaborators fill in was rewritten for the people who actually fill it in. It opens by saying it takes about two minutes and only three things are required, each section says when you can skip it entirely, and terms like PRO, IPI and splits are explained in plain language right under the box.",
    ],
  },
  {
    version: "0.51.2",
    date: "August 14, 2026",
    highlights: [
      "The Calendar button under your activities now sits on the left, lined up with the lists above it, instead of floating in the middle of the column.",
    ],
  },
  {
    version: "0.51.1",
    date: "August 13, 2026",
    highlights: [
      "Settings and Admin now sit at the bottom of the workspace's left-hand menu instead of mixed in with your releases and UrgAns, so the everyday links stay together and account stuff stays out of the way until you need it.",
      "Calendar moved out of the crowded release header and into its own pill that stays with you at the bottom of the task list on a wider screen, so you can jump to it without scrolling back up.",
    ],
  },
  {
    version: "0.51.0",
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
    date: "August 13, 2026",
    highlights: [
      "When something in the app breaks, it now says so and offers you a way on. A page that hit a problem used to just stop where it was, half drawn, with nothing to click and no hint that anything had gone wrong. You get a short explanation, a Try again, and a way back to your releases — and the menus and the UrgAns button stay put, so a broken page costs you the page and not your way out of it.",
      "The panels either side of your work can no longer take the app down with them. If UrgAns or your workspace card runs into trouble it quietly steps aside and the rest keeps working, where before the whole screen went with it.",
    ],
  },
  {
    version: "0.50.1",
    date: "August 13, 2026",
    highlights: [
      "UrgAns replies now stream in word by word instead of appearing all at once, so you can start reading the moment the first words land.",
      "Every reply carries a quiet row of actions underneath: copy it in one tap (handy for pasting into WhatsApp), regenerate the last answer, or rate it with a thumbs up or down so we know what's working.",
      "Suggested follow-up questions now sit in their own titled list under the answer, each one a full-width row you can tap to ask — clearer than the small floating buttons they used to be.",
    ],
  },
  {
    version: "0.50.0",
    date: "August 13, 2026",
    highlights: [
      "You can take a note without leaving UrgAns. Start a message with \"note\" — \"note Call the promoter about Friday\" — and it saves straight to your notes, first line as the title. There's a Take a note button under the prompt too, for when you'd rather have the full page and room to write.",
      "If you're already looking at a release when you do it, the note is filed under that release. Otherwise it's just a note, and you can link it to something later.",
    ],
  },
  {
    version: "0.49.1",
    date: "August 13, 2026",
    highlights: [
      "Signing up and signing in now survive a bad connection. Both pages used to arrive as a loading screen and only became themselves once the rest of the app had finished downloading, so on a weak mobile signal a single missing piece left you watching the word \"Loading\" for as long as you were willing to wait, with nothing to tap and nothing explaining why. The form is part of the page now, there from the moment it lands.",
      "If a browser has JavaScript turned off — a content blocker, or private-browsing restrictions — both pages say so plainly instead of leaving you pressing a button that quietly does nothing.",
    ],
  },
  {
    version: "0.49.0",
    date: "August 12, 2026",
    highlights: [
      "With one release, Urganize opens straight into its activities. A catalog of one was a screen with a single card on it and one thing to click, standing between you and the only work you had. It comes back the moment you start a second release, which is the point at which there is actually a choice to make.",
    ],
  },
  {
    version: "0.48.2",
    date: "August 12, 2026",
    highlights: [
      "Metadata, Files, Press kit and Pitch now name the release you have open, right under the heading — \"for Best · Babyboy Dorian\". Collecting credits or sending a pitch without a visible reminder of which release you were in meant taking it on trust, which is a bad thing to guess at when the details go out to a distributor.",
    ],
  },
  {
    version: "0.48.1",
    date: "August 12, 2026",
    highlights: [
      "The arrow that folds the left menu now sits at the bottom of it rather than up beside your workspace name, so the top of the panel is just your logo and your details.",
    ],
  },
  {
    version: "0.48.0",
    date: "August 12, 2026",
    highlights: [
      "The menu on the left now folds down to a strip of icons. Use the arrow in its corner and it narrows, handing the space back to whatever you are working on. The choice sticks as you move around the app and after a reload, so it stays the way you left it.",
      "Folding it also keeps it around in places it used to vanish. On a mid-sized screen with UrgAns open beside your work there was not room for both, so the menu hid itself. Now you can shrink it instead of losing it.",
    ],
  },
  {
    version: "0.47.0",
    date: "August 12, 2026",
    highlights: [
      "Deadline reminders reach you earlier. Until now you only heard about an activity the day before it was due, which is late if the thing takes a week. You get a nudge seven days out, another three days out, then one the day before.",
      "A short note of encouragement once a week, because most of a rollout is waiting between the busy parts. If you would rather not get them there is a switch to turn them off in Settings.",
      "Start a release and you get a reminder to come back and finish setting it up. It is easy to create one then get pulled into something else before it has a date or a plan.",
    ],
  },
  {
    version: "0.46.0",
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
    date: "August 12, 2026",
    highlights: [
      "UrgAns opens beside your work again when you sign in. It had stopped doing that once signing in started taking you to your releases, because it was only opening for people who went to its own page. Close it and it stays closed for the rest of your session.",
    ],
  },
  {
    version: "0.45.1",
    date: "August 12, 2026",
    highlights: [
      "Signing in now takes you straight to your releases instead of to UrgAns. Your catalog is what you came for, so it is what you see first. UrgAns is still one tap away from the top bar, from the bottom bar on phones and from the panel on the left.",
    ],
  },
  {
    version: "0.45.0",
    date: "August 12, 2026",
    highlights: [
      "First release, no detours: if you haven't created a release yet, the New release screen now opens on its own and stays open until you make one — there's nothing else to do on an empty dashboard anyway. Signing out is still always available.",
    ],
  },
  {
    version: "0.44.3",
    date: "August 12, 2026",
    highlights: [
      "The content calendar got a proper tune-up on phones. An empty month now gives you a Plan a post button instead of telling you to tap a day that isn't there, there's an Add a post button under the list for any other day, and the small controls — marking a post as posted, opening a post, closing things — are all easier to hit.",
      "It behaves better on desktop too: with the UrgAns panel open the calendar now switches to its list view instead of cramming seven skinny columns into the space that's left, and switching between calendars or months shows a loading state instead of briefly showing the wrong posts.",
      "A handful of small wrongs put right: deleting a calendar no longer flashes a confusing warning over its own confirmation, the back button no longer replays your calendar setup steps, error messages lost their database jargon, and the post form no longer shows a disabled \"coming soon\" row.",
    ],
  },
  {
    version: "0.44.2",
    date: "August 10, 2026",
    highlights: [
      "Metadata is no longer marked Beta. Distribution fields and collaborator credits have been in real use long enough to stand on their own.",
    ],
  },
  {
    version: "0.44.1",
    date: "August 10, 2026",
    highlights: [
      "Fixed the row of buttons above your release's activities (Metadata, Calendar, Notes, and the rest) on phones — it used to crop the first one off the edge of the screen and could wrap a button's own label across it. It now scrolls as one line, so every button is there and reads correctly.",
    ],
  },
  {
    version: "0.44.0",
    date: "August 10, 2026",
    highlights: [
      "Finished a release? You can now get a recap card for it: a poster built from your own numbers, the activities you completed, the days of work behind it and the size of your team. It appears on a release once its date has passed or every activity is done.",
      "Two sizes come out of it, one shaped for stories and one for feeds. Before it builds you can add one thing you are proud of. It's optional, so skipping it still gives you a card that looks right.",
      "Share it straight from your phone or download it on the web. Rebuild it whenever the numbers change.",
    ],
  },
  {
    version: "0.43.0",
    date: "August 10, 2026",
    highlights: [
      "Mark a task done and UrgAns now asks how it went. Three taps to answer — Went well, Went okay, or Didn't go to plan — plus a line about what happened if you feel like it. The task completes the instant you tick it, so answering is never something you wait on, and skipping costs one tap with no follow-up.",
      "What you say is kept with the task, so the story of a release builds itself as you work instead of being reconstructed later from memory.",
      "If you'd rather not be asked, turn off \"Ask me after tasks\" in Settings and the question stops for good.",
    ],
  },
  {
    version: "0.42.1",
    date: "August 9, 2026",
    highlights: [
      "A release with no date set no longer shows a date line at all. It used to read \"Date not set\" on every card, which said nothing you couldn't already see — the prompt to add one still sits in the release's activity list, where you can actually set it.",
    ],
  },
  {
    version: "0.42.0",
    date: "August 9, 2026",
    highlights: [
      "Added Notes — a private place to jot things down the moment they come up, mid-call or mid-DM, with no setup and nothing to fill in first. Link a note to a release whenever it's relevant, or leave it as-is; either way it saves as you type.",
    ],
  },
  {
    version: "0.41.4",
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
    date: "August 7, 2026",
    highlights: [
      "Your catalog on a phone now uses the full width of the screen. Releases are wide rows — cover art beside the title, date and progress — so you see four or five at a glance instead of two floating cards with empty space either side. Release titles are bigger everywhere too.",
    ],
  },
  {
    version: "0.41.2",
    date: "August 6, 2026",
    highlights: [
      "A new activity now shows up in your list the moment you create it, instead of only after a refresh.",
    ],
  },
  {
    version: "0.41.1",
    date: "August 6, 2026",
    highlights: [
      "A release with no date now makes it clear you can add activities right away — the date card offers it directly, and an empty activity list has its own \"Add your first activity\" button. Setting a date was never required to add your own work; it just looked that way.",
      "Fixed activities being filed against the wrong release when two releases shared a name — likelier now that \"Untitled release\" is the default. Typing a name that matches more than one release no longer guesses; pick the one you meant from the list.",
    ],
  },
  {
    version: "0.41.0",
    date: "August 6, 2026",
    highlights: [
      "Creating a release no longer asks for anything up front. Skip the name and we'll call it \"Untitled release\"; skip the date and add it whenever it's confirmed — both are marked optional.",
      "If you created a release without a date, its activities view now carries a card to set one. For a release started from the rollout plan, that card is what builds your plan: pick the date and all 64 activities appear, scheduled around it.",
    ],
  },
  {
    version: "0.40.12",
    date: "August 6, 2026",
    highlights: [
      "The UrgAns loading screen no longer holds space for text that isn't there, so the assistant's greeting no longer shifts up once it's ready.",
    ],
  },
  {
    version: "0.40.11",
    date: "August 6, 2026",
    highlights: [
      "The page now sits evenly on the screen — the workspace card used to hang 32px further left than everything above it, so the left and right edges never quite matched.",
    ],
  },
  {
    version: "0.40.10",
    date: "August 6, 2026",
    highlights: [
      "The workspace loading screen now matches what actually loads in — release cards, the activity list, and the focused release layout no longer shift or resize once your data arrives.",
    ],
  },
  {
    version: "0.40.9",
    date: "August 6, 2026",
    highlights: [
      "The workspace card now runs the full height of the screen and carries links to your Catalog, UrgAns, and Settings, so getting around no longer means reaching for the top bar.",
    ],
  },
  {
    version: "0.40.8",
    date: "August 6, 2026",
    highlights: [
      "Your workspace card now shows the Urganize mark until you upload your own logo, instead of your workspace initials.",
    ],
  },
  {
    version: "0.40.7",
    date: "August 6, 2026",
    highlights: [
      "Your release cards now line up exactly with the workspace card and UrgAns panel — the last fix nudged them slightly too high.",
    ],
  },
  {
    version: "0.40.6",
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
    date: "August 5, 2026",
    highlights: [
      "Your release cards now line up with the workspace card and UrgAns panel instead of sitting lower than both.",
    ],
  },
  {
    version: "0.40.4",
    date: "August 5, 2026",
    highlights: [
      "Workspace identity and Workspace logo now share one row in Settings instead of stacking full-width — a tidier fit since they're really one pairing (both feed your workspace card).",
    ],
  },
  {
    version: "0.40.3",
    date: "August 5, 2026",
    highlights: [
      "Signing in now greets you with the Urganize mark instead of a generic spinner while your workspace loads.",
    ],
  },
  {
    version: "0.40.2",
    date: "August 5, 2026",
    highlights: [
      "Teammates now leads Settings — it's the first thing you see instead of being buried below your workspace details.",
    ],
  },
  {
    version: "0.40.1",
    date: "August 5, 2026",
    highlights: [
      "Fixed the release grid showing only one narrow column when both the workspace card and UrgAns were open on screen — it now uses the available space and shows two.",
    ],
  },
  {
    version: "0.40.0",
    date: "August 5, 2026",
    highlights: [
      "A workspace card now sits alongside the dashboard, UrgAns, Settings, and your releases — your label or team logo, name, artist, teammate count, and active-release count, all in one place. Update your workspace name and logo from Settings; everywhere else, the card just reflects it.",
    ],
  },
  {
    version: "0.39.1",
    date: "August 5, 2026",
    highlights: [
      "Metadata, Calendar, Files, and Press kit now open right where your activity list sits, instead of floating on top of the workspace. The buttons above stay put so you can switch between them, the open one stays lit, and clicking it again brings your activities back. The calendar tucks your other releases aside while it's open so its month grid has room.",
    ],
  },
  {
    version: "0.39.0",
    date: "August 4, 2026",
    highlights: [
      "Metadata, Calendar, Files, and Press kit no longer load a whole separate page. Your release stays visible in the top bar and they open instantly.",
    ],
  },
  {
    version: "0.38.5",
    date: "August 4, 2026",
    highlights: [
      "The Motion progress bar on your releases was hard to see against the background — it now stands out clearly in both light and dark mode.",
    ],
  },
  {
    version: "0.38.4",
    date: "August 4, 2026",
    highlights: [
      "Loading states got a lot less bare across the app — admin pages, the press kit and metadata pages, the content calendar, and public press-kit/credit links now show a proper preview of what's coming instead of a plain spinner or blank screen.",
    ],
  },
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

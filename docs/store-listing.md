# App store listings

Paste-ready listing copy for the Urganize mobile app. Written 2026-09-09 for the
AI Music Manager positioning, amended 2026-09-11 when the category widened
to **AI Music Business Manager**, and again later that day when the audience
narrowed to **artists and managers** (founder call: labels are no longer an
audience).

**Every string here comes from the same place as the product's own copy.** The
category, the audience order and the promise are defined once in
`apps/web/lib/positioning.ts`, and `apps/web/lib/positioning-guard.test.ts`
scans this file for the retired phrases, so a listing that drifted from the
product would fail the build rather than sit here quietly disagreeing with it.

Do not reorder the audience. It is artists then managers, everywhere. Labels were
the third entry until 2026-09-11.

---

## Google Play — READY TO PASTE

The app is `com.urganize.app`. Every field below is inside Play's own limits,
with one exception that is called out where it appears: the app name cannot fit
the full category and carries a shortened form.

### App name (30 characters max)

```
Urganize: Music Business AI
```

27 characters.

⚠️ **THIS IS THE ONE FIELD THE CATEGORY DOES NOT FIT, and it needs the founder's
word before anyone submits.** "Urganize: AI Music Business Manager" is 35
characters against a hard 30-character cap that both stores enforce, so
something has to give and this is the least-bad thing on offer: it keeps all
three distinctive words (music, business, AI), drops only "Manager", and reads
as a noun phrase rather than a fragment. Every other field on this page carries
the category in full.

The reason the brand leads rather than the category is unchanged: Play shows the
app name under the icon, so whatever follows "Urganize" is what survives the
truncation.

### Short description (80 characters max)

```
AI Music Business Manager for artists and managers.
```

51 characters. This is the one-liner from `positioning.ts` unchanged.

### Full description (4000 characters max)

```
Urganize is an AI Music Business Manager for artists and managers. It helps music teams plan rollouts, coordinate people, manage assets and metadata, track execution and keep every part moving from one place.

PLAN THE ROLLOUT
Every release starts with a real plan, not a blank board. Pick what you are putting out and Urganize lays out the whole rollout, sized to the format, with every activity dated around release day. The plans come from playbooks written by working managers, and you can edit or delete anything that does not apply to you.

GIVE EVERY ACTIVITY AN OWNER
Put a name and a date on each piece of work. Your team sees what is theirs, what is late and what is coming. Nobody has to ask where things stand.

KEEP THE FILES AND THE DETAILS TOGETHER
The master, the artwork and the release details live with the release. Collect credits and splits from producers, writers and engineers through one link, and they do not need an account to fill it in.

BUILD A PRESS KIT YOU CAN SEND
Every artist gets one standing page you can send to writers, radio and playlist curators. It stays current as your releases land.

PLAN THE SHOWS TOO
Book a date, build the set against the slot length so it cannot overrun, and send the tracks to your DJ as one private link.

ASK URGANS
UrgAns is the personal AI for music professionals inside Urganize. Ask it what is late, have it draft a rollout plan, or tell it to create an activity in plain words. You review and approve anything it drafts before it takes effect.

WHO IT IS FOR
Artists running their own releases. Managers running more than one artist at a time.

Start free for 3 days. No card needed.
```

1,656 characters.

Recounted 2026-09-11, twice. The figure here read 1,776 for a block that
measured 1,714 — the rollout rename had shortened it and nobody recounted — and
then 1,656 once the audience narrowed later the same day. Measured off the
fenced text above with `wc -m`, not estimated.

### Other Play Console fields

| Field | Value |
| --- | --- |
| Category | Music & Audio |
| Tags | music, release planning, artist manager, music manager |
| Contact email | contact@urganize.app |
| Website | https://urganize.app |
| Privacy policy | https://urganize.app/privacy |

Graphics are not covered here. The feature graphic and screenshots are a
separate design pass; when they are made, the text baked into them uses the
same one-liner as the share card (see
`apps/homepage/scripts/generate-og-image.mjs`).

---

## Apple App Store — PENDING

**Not ready to submit, and the blocker is not copy.** The iOS side of the
Capacitor shell has never been built or signed: it needs a Mac, an Apple
Developer account, the Push Notifications capability and an APNs key, none of
which can be done from this repo. See `docs/mobile/codemagic-setup.md` and
`docs/mobile/push-setup.md`.

The copy below is drafted against Apple's field limits so it is ready when the
build is, but treat it as a draft until somebody has seen it in App Store
Connect.

### App name (30 characters max)

```
Urganize: Music Business AI
```

Same 30-character cap and the same compromise as Play, for the same reason. See
the note under the Play app name above.

### Subtitle (30 characters max)

```
Plan and run your releases
```

25 characters. Apple's subtitle is shorter than Play's short description, so
this carries the promise rather than the audience. The audience is in the first
line of the description.

### Promotional text (170 characters max)

```
AI Music Business Manager for artists and managers. Plan, organize and execute rollouts from one place.
```

103 characters. This is `SHORT_DESCRIPTION` from `positioning.ts` unchanged.
(The figure here read 110 for a string that was 111; measured this time.)

### Description

Use the Google Play full description above without changes. It is inside
Apple's 4,000-character limit and carries no Play-specific wording.

### Keywords (100 characters max, comma separated)

```
music manager,release planning,artist manager,rollout,press kit,setlist,music team
```

82 characters. No spaces after the commas: Apple counts them, and the field is
tight.

THE TAGS AND KEYWORDS DID NOT MOVE WITH THE CATEGORY on 2026-09-11, and that is
the same call `LANDING_KEYWORDS` records in `apps/homepage/app/layout.tsx`:
these are not read, they are typed into a store's search box, and nobody
searches for a phrase we widened last week. "music manager" is still what a
manager types. Revisit once the longer term has an audience.

THE AUDIENCE NARROWING LATER THAT DAY IS THE ONE EXCEPTION: `label` left the
Apple keywords, the way `A&R software` left `LANDING_KEYWORDS` when that audience
went. A category rename keeps its keywords because the searcher still types the
old word; a keyword that recruits an audience we no longer name sends the wrong
person to a listing that tells them so.

### Other App Store Connect fields

| Field | Value |
| --- | --- |
| Primary category | Music |
| Secondary category | Productivity |
| Support URL | https://urganize.app |
| Marketing URL | https://urganize.app |
| Privacy policy | https://urganize.app/privacy |

**One review risk worth knowing before submitting.** Apple prohibits linking to
outside payment for digital subscriptions from inside a reviewed iOS app, and
`apps/web/lib/platform.ts` already hides pricing and the Subscribe button on iOS
for that reason. The listing must not promise in-app purchase, because there is
none: subscriptions are bought on the web.

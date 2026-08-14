# Fan capture playbook — `capture_v0.1`

Hand-crafted source of truth for what makes a release email-capture page convert.
Encoded as TypeScript in `index.ts`; this file is the human-readable original.
Edit both together — a test asserts the `id` and `version` here match the code.

**What this is.** House rules, written from running releases, in the same spirit
as the release playbooks: the domain knowledge is the product, and it is
deterministic. Nothing here is generated, and nothing here needs a model to
work. The checklist in `index.ts` grades a manager's page against these rules
and tells them what to fix before they send the link.

**What this is not.** Not a citation of published conversion research, and it
deliberately quotes no study percentages. Every number below is either an
objective layout constraint (character counts, aspect ratios, viewport heights)
or a stated rule of thumb. Where a rule is a judgement call, it is graded as a
`suggestion`, not a `blocker` — the manager overrules the playbook, not the
other way around.

**Why the graphic and the link get their own rules.** Those two are the whole
mechanic. A capture page is a trade: the fan gives an email, the artist gives a
link. The graphic is what makes them believe the trade is worth making before
they have read a single word, and the link is what they are actually here for.
Everything else on the page is plumbing.

---

## The trade

A capture page has exactly one job: convert a tap from a bio link, a story
swipe-up, or a DM into an email address, and pay for it immediately.

The three failure modes, in the order they cost the most:

1. **The fan does not believe the page is really the artist's.** Unfamiliar
   domains and unbranded forms read as phishing. This is why the artwork and
   the artist name have to be above the fold, and why the release title has to
   be the thing the headline is about.
2. **The fan does not know what they get.** "Join the mailing list" is a cost
   with no benefit attached. "Hear it before Friday" is a trade.
3. **The fan is asked for too much, or paid too late.** Every extra field is a
   reason to stop. Every "check your inbox" is a promise made at exactly the
   moment the fan was ready to act.

---

## Rules

### G1. The graphic must be the artwork or the artist — never a logo (`suggestion`)

The image is doing identity work, not decoration. A fan arriving from a bio
link has about one second to recognise that this is the artist they follow.
Cover art or a press shot does that instantly; a label logo, a wordmark, or a
stock "subscribe" graphic does not.

Practical form: use the release cover art unless you have a portrait press shot
that is more recognisable than the artwork. If the release has no artwork yet,
that is the thing to fix before sending the link.

### G2. The graphic must be square or portrait, never landscape (`suggestion`)

Capture traffic is a phone. On a 375×667 viewport, a 16:9 image consumes the
top of the screen and pushes the email field below the fold, so the fan has to
scroll before they see what they are being asked for. A 1:1 image leaves room
for the headline and the field; a 4:5 is the most the page can take and still
keep the button in view.

House ceiling: the graphic gets at most 55% of the first screen.

### G3. One image, above the fold (`suggestion`)

A gallery is for a press kit, not a capture page. A second image gives the eye
somewhere else to go at the exact moment it should be going to the field. If
there are more images worth showing, they belong on the press kit link.

### L1. The destination link must be real, direct, and yours (`blocker`)

The link is what the fan came for. Three things break it:

- It is missing. The page then collects emails and pays nothing, which is the
  single fastest way to burn a fanbase's trust.
- It is not a URL, or it is a URL with no scheme, so it resolves to nothing
  when tapped.
- It points somewhere the fan did not expect — a shop, a Linktree with eleven
  other things on it, a login wall.

Practical form: link straight to the thing you named. If you promised the
video, link the video.

### L2. Name what the link is (`suggestion`)

"Get the link" is vague enough to feel like a trick. "Watch the video" and
"Hear it first" tell the fan what happens next, which is what makes the trade
legible. This is the `destinationLabel` field, and it should be a noun the fan
would use.

### L3. Pay immediately, on the same screen (`house rule, enforced by the build`)

The link is revealed the instant the email is accepted. There is no
confirmation email, no double opt-in, no "check your inbox".

This is not configurable, which is why it is not in the checklist — it is how
the public page is built. It is recorded here because it is the most important
rule on the page and someone will eventually propose adding a confirmation
step. The moment the fan submits is the moment they are most willing to act;
sending them to a mail client is where that willingness is lost, and on a phone
mid-scroll it is lost for good.

### C1. Ask for one thing (`suggestion`)

Email only, unless a name genuinely changes what you send. Every additional
field is another decision between the fan and the button, and a name that will
never be used in a message is a field that costs conversion and returns
nothing.

Turn on the name field when you actually write "Hey {name}" — not before.

### C2. The headline is short, specific, and about this release (`blocker` if missing)

It has to survive a 375px screen without wrapping to three lines, which in
practice means roughly 60 characters or fewer. It also has to say what this is:
a headline that would work for any artist is not doing identity work.

Rules of thumb:
- Name the release or the moment ("First listen", "Out Friday"), not the
  mechanism ("Sign up").
- Avoid "newsletter", "mailing list", and "subscribe". They describe what you
  get, not what they get.

### C3. The incentive states the exchange (`suggestion`)

One line under the headline saying what the email buys, and when. Time-bounded
beats open-ended: "the link, 24 hours before it's public" is a reason to act
now; "updates about my music" is a reason to act eventually, which is a reason
to never act.

Keep it to one sentence. If it needs two, the offer is too complicated.

### C4. The button says what happens (`suggestion`)

"Submit" describes the fan's work. "Send me the link" describes their reward.
Match the button to the `destinationLabel` so the page reads as one promise
made twice.

Ceiling: 32 characters, or it wraps inside the button on a phone.

### T1. Say who is asking and that it is not spam (`suggestion`)

A one-line consent note under the field, in plain words, stating what the email
will be used for and that unsubscribing is possible. This is a trust device
first — it visibly costs the page nothing and it removes the "what am I signing
up for" hesitation.

The build ships house copy when this is left blank, so the page can never
present a bare field with no explanation.

### T2. The page must not go out with the link paused (`blocker` if paused`)

Pausing is for after the campaign, not during it. A paused page still resolves,
still shows the graphic, and tells the fan the list is closed — which is the
honest thing to show, but it is not what anyone means to have live while they
are still sharing the link.

---

## Send-readiness

The checklist grades a page as **ready to send** only when no `blocker` is
outstanding. Suggestions never block sending: they are the difference between a
page that works and a page that works well, and the manager is the one who
knows which of them their release can ignore.

The score shown in-app is `passed / total`, counting both severities. Every
rule always runs, so the denominator never moves under the manager as they
type and the count reads as progress rather than a shifting target. It is a
progress indicator, not a grade — a page at 8/11 with no blockers is sendable,
and the playbook says so.

Two rules above are deliberately **not graded**: G2 (aspect ratio) and G3 (one
image). Both are real, and both are surfaced as guidance beside the image
picker — but `assets` stores no image dimensions, so grading them would mean
guessing, and a checklist that guesses is worse than one that stays quiet.

---

## Timing (guidance only, not graded)

Capture converts on anticipation, so the window that works is announcement
through release day. Two practical consequences:

- Put the link up when you announce, not on release day. On release day the
  fan can simply go and listen, and the trade has nothing left to offer.
- After release day, swap the destination to the thing that is still worth
  having — the video, the tour presale, the next single — or pause the page.
  A capture page pointing at a song that is already everywhere is a page that
  reads as a stale link.

This is not in the checklist because the product cannot see what the manager
plans to send, and a rule that fires on every post-release page would be noise.

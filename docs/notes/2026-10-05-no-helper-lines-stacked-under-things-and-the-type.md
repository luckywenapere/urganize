# No helper lines stacked under things, and the type (2026-10-05)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder rule: a heading or button never carries a grey sentence stacked under it. The words move behind a small info icon (`InfoTip`, or `HelpTip` with a key from `lib/help-copy.ts` when the copy is worth the fifth-grader guard). `PageHeader` takes `info` for "what this page is for" and keeps `description` for live facts (a count, who is shown). `SettingRow` and the Settings section intros use the icon. Money and delete warnings moved behind it too on the founder's say-so; the confirm dialogs still state the consequence in full. Not swept yet: modal and form field hints, empty-state sentences.

Type: Young Serif is the display face (`--font-young-serif`, one weight, so `.font-display` turns faux bold off) and Instrument Sans is the body face (`--font-instrument-sans`). Generated images (recap, share cards) use the Young Serif TTF but still Space Grotesk for body text, because Instrument Sans only ships as a variable font and satori cannot read one. The marketing site keeps its own faces. Settings > Artists & brand is three folds (`SettingsGroup`): Your team, Artists, Press kits.

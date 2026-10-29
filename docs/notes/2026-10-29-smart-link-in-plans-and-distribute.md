# Smart link in every plan and in Distribute (2026-10-29, v1.206.0, no flag)

GitHub #850. Mocks approved by Oyin: `docs/mocks/presave-distribute/mock.html`, with two changes he asked for on approval: call it "smart link", never "pre-save link", and make it without a UPC or ISRC.

## What changed

- **Every new plan holds the smart link task.** `SMART_LINK_MOVE` (`lib/planner-v2/moves.ts`, id `smart_link`, "Set up and share your smart link", day -14, free) sits beside the distributor and release-day moves. `validatePlanV2` reports `missing_smart_link` (so UrgAns's one retry is told) and `repairPlanV2` adds and protects it, so the UrgAns plan and the quick fallback plan both carry it. Not asked for when the song is already out, or when no day before release day is left. A task the model wrote itself ("Set up the pre-save link") counts and is renamed.
- **The wording.** `lib/smart-link-task.ts` holds `isSmartLinkTask` (title says smart/pre-save link, not a reminder; or one of the six playbook setup step ids) and `smartLinkWording`, which `planV2ToDoc` runs on every task title. The playbooks' setup steps now say "smart link". The rollout menu row is always "Smart link". "Pre-save" stays only where it names what fans do (the Pre-saves count, reminder tasks, the share text, social captions).
- **The task opens the link.** `components/tasks/SmartLinkTaskPanel.tsx` in `TaskDetailView`: the link with Copy, Share link and See the numbers; before the link exists, why, and Open smart link. Its GET is the Smart link view's own, so opening the task also makes a ready link.
- **Distribute, per rollout:** tabs Stores (unchanged), Smart link, Numbers, as `?tab=link|numbers` on `/dashboard/distribute/[releaseId]`. `SmartLinkSection` takes `part`: `all` (rollout menu), `link` (no numbers) or `numbers` (So far and Where fans click, which now also shows before release day when Altlink has store clicks).
- **Distribute list:** two tags per row from `GET /api/distribute/summary?ids=` (stored rows and cached numbers only, never a live Altlink call). Each id goes through `decideReleaseAccess`; membership is loaded once. Tags are partner-free (`storesChip`, `linkChip` in `lib/distribute-summary.ts`).
- **No code needed for a pre-save.** `decideCreate` makes a pre-save from a title, artist and future date; a code is only required once the song is out. A UPC that arrives after the link exists is patched on (`patchIfChanged` now sends `upc` as well as `isrc`). If Altlink still answers 422 `missing_identifier`, the old path stands: the claim is deleted and the view reads "not ready".

## Not verified

- Nothing ran against Altlink. That Altlink takes a create with no UPC or ISRC is Oyin's word, not tested here; the 422 fallback covers it if not.
- No live session: the tabs, tags and task panel were type-checked and unit-tested, not clicked through.
- Existing rollouts get no new task; only plans made from now on.

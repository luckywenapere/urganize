/**
 * What the distribution partner accepts, kept out of the rules so changing it is
 * one line (2026-10-09).
 */

/**
 * The audio formats Therealmusic Distro accepts, as lowercase file types
 * ("wav", "flac", "mp3").
 *
 * EMPTY ON PURPOSE. This has not been confirmed with the partner yet, and a
 * guess in either direction is worse than no rule: too strict refuses a
 * perfectly good master, too loose lets a rejection through. While the list is
 * empty the `audio_wrong_format` rule is SKIPPED (lib/distribution-rules.ts).
 *
 * OPEN QUESTION, owner Yb Lekzy: which audio format does Therealmusic Distro
 * require? Ask for the exact list, put it here, and the rule switches on with
 * no other change.
 */
export const DISTRIBUTION_AUDIO_FORMATS: readonly string[] = [];

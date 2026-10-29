// The smart link task (Oct 29, 2026, #850): every new plan holds one, and the
// task opens the rollout's smart link. Pure module, safe in the browser.
//
// Oyin's call: the product says "smart link", never "pre-save link". Fans still
// pre-save through it, so "pre-save" stays only where it names what fans do
// ("214 pre-saves", "pre-save reminder to fans").

/** The playbook steps that set the link up, in every playbook. */
const SMART_LINK_TEMPLATE_TASK_IDS: ReadonlySet<string> = new Set([
  'w6_setup_presave',
  'w10_single_presave_setup',
  'w4_ep_presave_setup',
  'w13_single_1_presave_setup',
  'w8_single_2_presave_setup',
  'w5_album_presave_setup',
]);

const LINK_WORDS = /\b(smart|pre-?save) link\b/i;

/** True for a title about the link itself, not a reminder that mentions it. */
export const isSmartLinkTaskTitle = (title: string | null | undefined): boolean =>
  Boolean(title && LINK_WORDS.test(title) && !/\breminder\b/i.test(title));

export function isSmartLinkTask(task: { title?: string | null; templateTaskId?: string | null }): boolean {
  if (task.templateTaskId && SMART_LINK_TEMPLATE_TASK_IDS.has(task.templateTaskId)) return true;
  return isSmartLinkTaskTitle(task.title);
}

/**
 * The rollout menu row and panel title for the `capture` scene (#852, Altlink
 * call): "Smart link" once the rollout has a link or could have one (a UPC or
 * ISRC and a release date), "Fan emails" until then, so no smart link shows on
 * a rollout Altlink cannot make one for. Unknown (still loading) reads as not
 * ready: most rollouts have no code yet.
 */
export const captureRowLabel = (smartLinkReady: boolean | null): 'Smart link' | 'Fan emails' =>
  smartLinkReady ? 'Smart link' : 'Fan emails';

/** "Set up the pre-save link" reads "Set up the smart link". */
export const smartLinkWording = (title: string): string =>
  title.replace(/\bpre-?save link\b/gi, (match) => (match[0] === 'P' ? 'Smart link' : 'smart link'));

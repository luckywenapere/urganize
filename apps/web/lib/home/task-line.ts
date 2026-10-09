import { getRelativeDueLabel } from '@/lib/tasks';

type TaskLineInput = {
  title: string;
  releaseTitle: string | null;
  artistName: string | null;
  dueDate: string | null;
};

/**
 * A task on Home as ONE statement (2026-10-08, founder call): the task, where it
 * sits and when it is due, said together instead of a title with tags under it.
 * For example:
 *
 *   "Send the press release in Midnight EP by Dorian, 3 days overdue."
 *   "Book the studio in Midnight EP, due tomorrow."
 *   "Call the printer, not in a rollout, no due date."
 *
 * `title` and `rest` (joined by `joiner`) are the two halves of that one sentence, kept apart only so
 * the screen can make the task name stand out while it reads as a single line;
 * `text` is the whole thing. Pure, so the wording is the same on the top card and
 * on every row, and a test can hold it. The due part is the same label the rest
 * of the app uses (getRelativeDueLabel), only lowercased to sit inside a
 * sentence, so the two can never disagree about what is overdue. Home only lists
 * open tasks, so a task is never treated as finished here.
 */
function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function describeTaskLine(
  task: TaskLineInput,
  now: Date = new Date(),
): { title: string; rest: string; joiner: string; text: string; isOverdue: boolean } {
  const due = getRelativeDueLabel({ dueDate: task.dueDate, completedAt: null, compressedRunway: false }, now);
  const dueClause = due.label.charAt(0).toLowerCase() + due.label.slice(1);

  // A title that already ends in punctuation would put it before our comma.
  // Read defensively (2026-10-09): this runs for every task on Home, and a row
  // whose title or names arrive as null or a non-string must not throw, since
  // one throw here used to take the whole of Home down.
  const title = asText(task.title).replace(/[\s.,:;]+$/, '') || 'Untitled activity';

  const release = asText(task.releaseTitle);
  const artist = asText(task.artistName);
  // A missing artist is simply left out. "by Unassigned artist" reads as a
  // person's name inside a sentence, which it is not.
  const where = release ? (artist ? `in ${release} by ${artist}` : `in ${release}`) : 'not in a rollout';

  const rest = `${where}, ${dueClause}.`;
  // "in Midnight EP" follows the task name directly; "not in a rollout" needs a
  // comma first or it reads as part of the name.
  const joiner = release ? ' ' : ', ';
  return { title, rest, joiner, text: `${title}${joiner}${rest}`, isOverdue: due.isOverdue };
}

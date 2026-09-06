import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from './email';
import {
  APP_URL,
  buildWorkRequestAnswerEmail,
  buildWorkRequestEmail,
} from './email-templates';
import { DIRECTORY_ROLE_LABELS, type DirectoryRole } from './directory-roles';
import { DIRECTORY_SETTINGS_ANCHOR } from './person-profile';

/**
 * Telling somebody a request arrived, and telling the asker what came back.
 *
 * THE EMAIL IS THE PART THAT ACTUALLY REACHES A PERSON. The inbox lives inside
 * Settings, which is not somewhere anybody sits, so an in-app list on its own
 * would mean a request that waits until the recipient happens to look. The
 * list is where they act; this is what gets them there.
 *
 * NEVER THROWS AND NEVER BLOCKS. The row is written first and is the durable
 * record; a mail failure must not cost the sender their ask. Every failure is
 * swallowed, the sendEmail contract already used by every other sender here.
 */

const settingsUrl = () => `${APP_URL}/settings#${DIRECTORY_SETTINGS_ANCHOR}`;

async function lookupPerson(
  admin: SupabaseClient,
  userId: string
): Promise<{ email: string; name: string } | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const email = data?.user?.email;
    if (!email) return null;
    const metadataName = data.user?.user_metadata?.name;
    return { email, name: typeof metadataName === 'string' ? metadataName : '' };
  } catch {
    return null;
  }
}

export async function notifyWorkRequest(
  admin: SupabaseClient,
  input: { recipientUserId: string; senderName: string; role: string; note: string }
): Promise<void> {
  try {
    const recipient = await lookupPerson(admin, input.recipientUserId);
    if (!recipient) return;

    const built = buildWorkRequestEmail({
      recipientName: recipient.name,
      senderName: input.senderName,
      roleLabel: DIRECTORY_ROLE_LABELS[input.role as DirectoryRole] || input.role,
      note: input.note,
      settingsUrl: settingsUrl(),
    });

    await sendEmail({
      to: recipient.email,
      subject: built.subject,
      html: built.html,
      text: built.text,
      // "<name> via Urganize", the assignment email's rule: the inbox row
      // should read as the person, not as the product.
      fromLabel: `${input.senderName} via Urganize`,
    });
  } catch {
    // Nothing to do and nobody to tell. The request is already recorded.
  }
}

export async function notifyWorkRequestAnswer(
  admin: SupabaseClient,
  input: {
    senderUserId: string;
    recipientUserId: string;
    role: string;
    status: 'interested' | 'passed';
    reply: string | null;
  }
): Promise<void> {
  try {
    const [sender, answerer] = await Promise.all([
      lookupPerson(admin, input.senderUserId),
      lookupPerson(admin, input.recipientUserId),
    ]);
    if (!sender) return;

    const answererName = answerer?.name || 'They';

    const built = buildWorkRequestAnswerEmail({
      recipientName: sender.name,
      answererName,
      roleLabel: DIRECTORY_ROLE_LABELS[input.role as DirectoryRole] || input.role,
      interested: input.status === 'interested',
      reply: input.reply || '',
      directoryUrl: `${APP_URL}/dashboard/directory`,
    });

    await sendEmail({
      to: sender.email,
      subject: built.subject,
      html: built.html,
      text: built.text,
      fromLabel: `${answererName} via Urganize`,
    });
  } catch {
    // Same posture: the answer is already saved.
  }
}

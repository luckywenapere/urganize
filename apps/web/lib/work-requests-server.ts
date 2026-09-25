import type { SupabaseClient } from '@supabase/supabase-js';
import { isEmailConfigured, sendEmail } from './email';
import { APP_URL } from './email/links';
import { DIRECTORY_ROLE_LABELS, type DirectoryRole } from './directory-roles';
import { revealsContact, type WorkRequestStatus } from './work-requests';
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

// Declared here rather than imported from app/api/directory/_shared: a lib
// module must not depend on a route group. lib/person-public-server.ts holds
// the same literal for the same reason.
const PERSON_PROFILES_TABLE = 'person_profiles';

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

/**
 * Their public profile, or nothing.
 *
 * Only a `public` record has a page: somebody listed as `directory` is
 * findable inside the app and their /p/ URL would 404, so linking it would be
 * worse than linking nothing. Never throws.
 */
async function lookupPublicProfileUrl(
  admin: SupabaseClient,
  userId: string
): Promise<string | undefined> {
  try {
    const { data } = await admin
      .from(PERSON_PROFILES_TABLE)
      .select('slug, visibility')
      .eq('user_id', userId)
      .maybeSingle();
    const slug = typeof data?.slug === 'string' ? data.slug : '';
    return slug && data?.visibility === 'public' ? `${APP_URL}/p/${slug}` : undefined;
  } catch {
    return undefined;
  }
}

export async function notifyWorkRequest(
  admin: SupabaseClient,
  input: { recipientUserId: string; senderName: string; role: string; note: string }
): Promise<void> {
  try {
    if (!isEmailConfigured()) return;
    const recipient = await lookupPerson(admin, input.recipientUserId);
    if (!recipient) return;

    await sendEmail(admin, {
      templateId: 'work_request',
      to: recipient.email,
      props: {
        recipientName: recipient.name,
        senderName: input.senderName,
        roleLabel: DIRECTORY_ROLE_LABELS[input.role as DirectoryRole] || input.role,
        note: input.note,
        settingsUrl: settingsUrl(),
      },
      trigger: 'work_request_sent',
      recipientUserId: input.recipientUserId,
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
    status: WorkRequestStatus;
    reply: string | null;
  }
): Promise<void> {
  try {
    if (!isEmailConfigured()) return;
    const [sender, answerer] = await Promise.all([
      lookupPerson(admin, input.senderUserId),
      lookupPerson(admin, input.recipientUserId),
    ]);
    if (!sender) return;

    const answererName = answerer?.name || 'They';

    // THE INTRODUCTION, and the reason this function exists at all rather than
    // just confirming an answer. Our From address is always the verified
    // sender, so without this the asker is handed a yes and no way to act on
    // it. `revealsContact` is the consent rule and this is its only caller:
    // interested hands over a way to reach them, a pass hands over nothing.
    const reveal = revealsContact(input.status);
    const contactEmail = reveal ? answerer?.email : undefined;
    const profileUrl = reveal ? await lookupPublicProfileUrl(admin, input.recipientUserId) : undefined;

    await sendEmail(admin, {
      templateId: 'work_request_answer',
      to: sender.email,
      props: {
        recipientName: sender.name,
        answererName,
        roleLabel: DIRECTORY_ROLE_LABELS[input.role as DirectoryRole] || input.role,
        interested: reveal,
        reply: input.reply || '',
        contactEmail,
        profileUrl,
      },
      trigger: 'work_request_answered',
      recipientUserId: input.senderUserId,
      actorUserId: input.recipientUserId,
      fromLabel: `${answererName} via Urganize`,
      // So that hitting Reply just works, which is what most people will do
      // before they read anything else in the message. Falls back to the
      // configured mailbox on a pass or an address that fails validation.
      replyTo: contactEmail,
    });
  } catch {
    // Same posture: the answer is already saved.
  }
}

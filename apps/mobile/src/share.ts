import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { safeShareFileName, type BridgeRequestMap, type ShareFilePayload } from '@urganize/native-bridge';

type ShareOutcome = 'shared' | 'cancelled';

const CANCELLED = /cancel|dismiss/i;

/** A file the page built (an image, an export) to the OS share sheet. */
export async function shareFile(payload: ShareFilePayload): Promise<ShareOutcome> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');

  // One safe path segment in the cache folder; the name comes from the page.
  const file = new File(Paths.cache, safeShareFileName(payload.fileName));
  if (file.exists) file.delete();
  file.create();
  file.write(payload.data, { encoding: payload.kind === 'base64' ? 'base64' : 'utf8' });

  try {
    // shareAsync resolves when the sheet closes and does not say whether the
    // person picked a target, so anything short of an error counts as shared.
    await Sharing.shareAsync(file.uri, { mimeType: payload.mimeType, dialogTitle: payload.title });
    return 'shared';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (CANCELLED.test(message)) return 'cancelled';
    throw error;
  }
}

/**
 * Plain text to the OS share sheet. React Native's own Share does text on both
 * platforms, so this needs no extra native module. iOS says when the sheet was
 * closed without sharing; Android cannot tell, so it always reads as shared.
 */
export async function shareText(payload: BridgeRequestMap['shareText']['payload']): Promise<ShareOutcome> {
  const result = await Share.share(
    { message: payload.text, title: payload.title },
    { dialogTitle: payload.title }
  );
  return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
}

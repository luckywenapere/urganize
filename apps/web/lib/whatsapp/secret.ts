// Encrypting a team's own AI key before it is stored. Server only.
//
// AES-256-GCM, with the key derived from WHATSAPP_KEY_SECRET. If that variable
// is missing the feature refuses to store a key at all, rather than falling back
// to storing one in the clear. Format: v1.<iv>.<tag>.<ciphertext>, all base64url.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function keyBytes(secret: string | undefined): Buffer | null {
  const value = (secret ?? process.env.WHATSAPP_KEY_SECRET ?? '').trim();
  if (value.length < 16) return null;
  return createHash('sha256').update(value).digest();
}

export function isKeyStorageConfigured(secret?: string): boolean {
  return keyBytes(secret) !== null;
}

export function encryptSecret(plain: string, secret?: string): string {
  const key = keyBytes(secret);
  if (!key) throw new Error('WHATSAPP_KEY_SECRET is not set');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join('.');
}

/** Returns null for anything that does not decrypt, never throws. */
export function decryptSecret(stored: string, secret?: string): string | null {
  const key = keyBytes(secret);
  if (!key || !stored) return null;
  const [version, iv, tag, body] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

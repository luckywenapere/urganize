import { Buffer } from 'node:buffer';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/releases/_shared';

const COVER_ART_BUCKET = 'release-cover-art';
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function getExtension(file: File) {
  const byType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return byType[file.type] || file.name.split('.').pop()?.toLowerCase() || 'jpg';
}

function sanitizeFileSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Cover image is required.' }, { status: 400 });
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Cover image must be JPG, PNG, or WebP.' }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'Cover image must be smaller than 8MB.' }, { status: 400 });
  }

  const bucketResult = await adminClient.storage.getBucket(COVER_ART_BUCKET);
  if (bucketResult.error) {
    const createResult = await adminClient.storage.createBucket(COVER_ART_BUCKET, {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE_BYTES,
      allowedMimeTypes: Array.from(ALLOWED_IMAGE_TYPES),
    });

    if (createResult.error) {
      return NextResponse.json(
        { error: createResult.error.message || 'Could not prepare cover image storage.' },
        { status: 500 }
      );
    }
  } else if (bucketResult.data && bucketResult.data.public !== true) {
    const updateResult = await adminClient.storage.updateBucket(COVER_ART_BUCKET, {
      public: true,
      fileSizeLimit: MAX_FILE_SIZE_BYTES,
      allowedMimeTypes: Array.from(ALLOWED_IMAGE_TYPES),
    });

    if (updateResult.error) {
      return NextResponse.json(
        { error: updateResult.error.message || 'Could not update cover image storage.' },
        { status: 500 }
      );
    }
  }

  const extension = getExtension(file);
  const baseName = sanitizeFileSegment(file.name.replace(/\.[^.]+$/, '')) || 'cover-art';
  const storagePath = `${auth.user.id}/${Date.now()}-${baseName}.${extension}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const uploadResult = await adminClient.storage.from(COVER_ART_BUCKET).upload(storagePath, fileBuffer, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadResult.error) {
    return NextResponse.json(
      { error: uploadResult.error.message || 'Could not upload cover image.' },
      { status: 500 }
    );
  }

  const { data } = adminClient.storage.from(COVER_ART_BUCKET).getPublicUrl(storagePath);

  return NextResponse.json({
    coverArtUrl: data.publicUrl,
    storagePath,
    bucket: COVER_ART_BUCKET,
  });
}

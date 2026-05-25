import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

const PROOFS_BUCKET = 'proofs';
const RELEASE_ASSET_CATEGORIES = ['cover_art', 'audio', 'promo_image', 'video', 'document'] as const;

const extractProofPath = (publicUrl: string): string | null => {
  const marker = `/storage/v1/object/public/${PROOFS_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(publicUrl.slice(index + marker.length));
};

const isOptionalTableMissingError = (error: unknown): boolean => {
  const code = String((error as { code?: string } | null)?.code || '').toUpperCase();
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('relation') && message.includes('does not exist')
  );
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ planId: string }> }
) {
  const posthogServer = createServerPostHogClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const { planId } = await context.params;
    if (!planId) {
      return NextResponse.json({ error: 'Plan id is required' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const confirmationText = String(body?.confirmationText || '').trim();
    if (confirmationText !== 'DELETE') {
      return NextResponse.json({ error: 'Please type DELETE exactly to continue' }, { status: 400 });
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: userError,
    } = await supabaseUserClient.auth.getUser(token);

    if (userError || !user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: release, error: releaseError } = await supabaseAdmin
      .from('releases')
      .select('id,owner_user_id,title')
      .eq('id', planId)
      .maybeSingle();

    if (releaseError) {
      return NextResponse.json({ error: releaseError.message || 'Could not load plan' }, { status: 500 });
    }
    if (!release || release.owner_user_id !== user.id) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const { data: taskFiles } = await supabaseAdmin
      .from('ai_tasks')
      .select('user_input_file_url')
      .eq('release_id', planId)
      .not('user_input_file_url', 'is', null);

    const proofPaths = (taskFiles || [])
      .map((row) => extractProofPath(String(row.user_input_file_url || '')))
      .filter((path): path is string => !!path);

    const assetPaths: string[] = [];
    for (const category of RELEASE_ASSET_CATEGORIES) {
      const assetPrefix = `${user.id}/${planId}/assets/${category}`;
      const { data: bucketFiles } = await supabaseAdmin.storage.from(PROOFS_BUCKET).list(assetPrefix, {
        limit: 1000,
        sortBy: { column: 'created_at', order: 'asc' },
      });
      for (const file of bucketFiles || []) {
        if (file.name) {
          assetPaths.push(`${assetPrefix}/${file.name}`);
        }
      }
    }

    const allStoragePaths = Array.from(new Set([...proofPaths, ...assetPaths]));
    if (allStoragePaths.length > 0) {
      await supabaseAdmin.storage.from(PROOFS_BUCKET).remove(allStoragePaths);
    }

    const optionalTables: Array<{ table: string; column: string }> = [
      { table: 'plan_feedback', column: 'release_id' },
      { table: 'release_workspaces', column: 'release_id' },
      { table: 'release_assets', column: 'release_id' },
      { table: 'files', column: 'release_id' },
    ];

    for (const item of optionalTables) {
      const result = await supabaseAdmin.from(item.table).delete().eq(item.column, planId);
      if (result.error && !isOptionalTableMissingError(result.error)) {
        return NextResponse.json({ error: result.error.message || `Failed to delete ${item.table}` }, { status: 500 });
      }
    }

    const tasksDelete = await supabaseAdmin.from('ai_tasks').delete().eq('release_id', planId);
    if (tasksDelete.error) {
      return NextResponse.json({ error: tasksDelete.error.message || 'Failed to delete plan tasks' }, { status: 500 });
    }

    const releaseDelete = await supabaseAdmin
      .from('releases')
      .delete()
      .eq('id', planId)
      .eq('owner_user_id', user.id);
    if (releaseDelete.error) {
      return NextResponse.json({ error: releaseDelete.error.message || 'Failed to delete plan' }, { status: 500 });
    }

    captureServerAnalyticsEvent(
      posthogServer,
      user.id,
      createPostHogEvent('release_deleted', {
        release_id: planId,
      })
    );

    return NextResponse.json({
      status: 'deleted',
      planId,
      title: release.title || 'Untitled Plan',
      deletedAt: new Date().toISOString(),
    });
  } finally {
    await shutdownServerAnalytics(posthogServer);
  }
}

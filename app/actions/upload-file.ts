'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role bypasses RLS
);

export async function uploadFileToDatabase(fileData: any) {
  const { data, error } = await supabaseAdmin
    .from('files')
    .insert([fileData])
    .select()
    .single();

  if (error) throw error;
  return data;
}
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './server';

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ApiError(
      503,
      'not_configured',
      'データベースが未設定です。環境変数 SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください（手順は README を参照）。',
    );
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) {
    console.error(`rpc ${fn} failed:`, error);
    // 関数が見つからない = schema.sql が未実行
    if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') {
      throw new ApiError(
        503,
        'schema_missing',
        'データベースの準備ができていません。supabase/schema.sql を Supabase の SQL Editor で実行してください（手順は README を参照）。',
      );
    }
    // service_role キーが違う・URLが違う など
    if (error.code === '42501' || /invalid api key|jwt/i.test(error.message ?? '')) {
      throw new ApiError(
        503,
        'not_configured',
        'データベースに接続できません。SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が正しいか確認してください。',
      );
    }
    throw new ApiError(500, 'db_error', 'データベースでエラーが発生しました。');
  }
  return data as T;
}

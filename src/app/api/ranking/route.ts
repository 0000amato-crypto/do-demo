import { json, route } from '@/lib/server';
import { rpc } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// 上位100人。全員同じ内容なので、CDNに数秒キャッシュさせる。
export const GET = route(async () => {
  const [entries, total] = await Promise.all([
    rpc<unknown[]>('get_ranking', { p_limit: 100 }),
    rpc<number>('get_total_clicks'),
  ]);
  return json(
    { total_clicks: Number(total), entries },
    200,
    { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' },
  );
});

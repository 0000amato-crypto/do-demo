import { json, route } from '@/lib/server';
import { rpc } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// 世界累計クリック数だけを返す軽量API。CDNに数秒キャッシュさせて、DBへの負荷を抑える。
export const GET = route(async () => {
  const total = await rpc<number>('get_total_clicks');
  return json(
    { total_clicks: Number(total) },
    200,
    { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10' },
  );
});

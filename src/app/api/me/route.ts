import {
  hashToken,
  json,
  limitByIp,
  readToken,
  route,
  setTokenCookie,
} from '@/lib/server';
import { rpc } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type MeResult = {
  total_clicks: number;
  user: { anon_id: string; display_name: string | null; clicks: number; rank: number | null } | null;
};

// 自分の記録（クリック数・順位）と世界累計を返す。
// ブラウザ側に識別情報がなくても、Cookie に残っていれば復元して返す。
export const GET = route(async (req) => {
  limitByIp(req, 'me', 120, 10_000);
  const token = readToken(req);

  if (!token) {
    const total = await rpc<number>('get_total_clicks');
    return json({ total_clicks: Number(total), user: null });
  }

  const r = await rpc<MeResult>('get_me', { p_token_hash: hashToken(token) });
  const res = json({
    total_clicks: Number(r.total_clicks),
    user: r.user,
    token: r.user ? token : undefined,
  });
  if (r.user) setTokenCookie(res, token);
  return res;
});

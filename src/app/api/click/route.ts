import {
  ApiError,
  UUID_RE,
  hashToken,
  json,
  limitByIp,
  readToken,
  route,
  setTokenCookie,
} from '@/lib/server';
import { rpc } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// クリックを記録する。
//   requestId: 送信ごとのID。通信エラーで再送しても二重に加算されない（冪等）
//   count    : 今回の送信に含まれるクリック数（1〜50）
export const POST = route(async (req) => {
  limitByIp(req, 'click', 300, 10_000);

  const token = readToken(req);
  if (!token) {
    throw new ApiError(401, 'no_token', '識別情報がありません。ページを再読み込みしてください。');
  }

  const body = (await req.json().catch(() => null)) as { requestId?: unknown; count?: unknown } | null;
  const requestId = body?.requestId;
  const count = body?.count;
  if (
    typeof requestId !== 'string' ||
    !UUID_RE.test(requestId) ||
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 50
  ) {
    throw new ApiError(400, 'bad_request', 'リクエストの形式が正しくありません。');
  }

  const result = await rpc<Record<string, unknown>>('record_clicks', {
    p_token_hash: hashToken(token),
    p_request_id: requestId,
    p_count: count,
  });

  const res = json(result);
  setTokenCookie(res, token);
  return res;
});

import {
  ApiError,
  hashToken,
  json,
  limitByIp,
  readToken,
  route,
  setTokenCookie,
} from '@/lib/server';
import { rpc } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// 表示名の登録（任意）。空文字なら解除して、匿名IDの表示に戻す。
export const PUT = route(async (req) => {
  limitByIp(req, 'name', 30, 60_000);

  const token = readToken(req);
  if (!token) {
    throw new ApiError(401, 'no_token', '識別情報がありません。ページを再読み込みしてください。');
  }

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  if (!body || typeof body.name !== 'string') {
    throw new ApiError(400, 'bad_request', 'リクエストの形式が正しくありません。');
  }

  const name = body.name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if ([...name].length > 20) {
    throw new ApiError(400, 'name_too_long', '表示名は20文字以内にしてください。');
  }
  if (/^anonymous_/i.test(name)) {
    throw new ApiError(400, 'name_reserved', '「Anonymous_」で始まる名前は使えません。');
  }

  const r = await rpc<{ anon_id: string; display_name: string | null }>('set_display_name', {
    p_token_hash: hashToken(token),
    p_name: name,
  });

  const res = json(r);
  setTokenCookie(res, token);
  return res;
});

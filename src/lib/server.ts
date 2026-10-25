import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- 識別情報（引き継ぎコード）------------------------------------------
// Crockford Base32 の20文字（100bit）。DBにはハッシュだけを保存する。
const TOKEN_RE = /^[0-9A-HJKMNP-TV-Z]{20}$/;
export const COOKIE_NAME = 'dou_token';

export function normalizeToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return TOKEN_RE.test(s) ? s : null;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** ヘッダー（localStorage 由来）を優先し、なければ Cookie から読む */
export function readToken(req: NextRequest): string | null {
  return (
    normalizeToken(req.headers.get('x-user-token')) ??
    normalizeToken(req.cookies.get(COOKIE_NAME)?.value)
  );
}

export function setTokenCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 400,
  });
}

// ---- レスポンス --------------------------------------------------------
export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export function route(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof ApiError) {
        return json({ error: e.code, message: e.message }, e.status, e.headers);
      }
      console.error(e);
      return json(
        { error: 'server_error', message: 'サーバーでエラーが発生しました。' },
        500,
      );
    }
  };
}

// ---- 簡易レート制限（IP単位・インスタンス内） ----------------------------
// ユーザー単位の本命の制限は DB 関数 record_clicks 内にある。
// こちらは、識別情報を使い捨てにして大量に送ってくる相手への補助的な防御。
const buckets = new Map<string, { n: number; reset: number }>();

export function limitByIp(req: NextRequest, scope: string, max: number, windowMs: number) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const now = Date.now();
  const key = `${scope}:${ip}`;
  let b = buckets.get(key);
  if (!b || b.reset <= now) {
    b = { n: 0, reset: now + windowMs };
    buckets.set(key, b);
    if (buckets.size > 10000) {
      for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    }
  }
  b.n += 1;
  if (b.n > max) {
    throw new ApiError(
      429,
      'rate_limited',
      'リクエストが多すぎます。少し待ってから、もう一度お試しください。',
      { 'Retry-After': String(Math.max(1, Math.ceil((b.reset - now) / 1000))) },
    );
  }
}

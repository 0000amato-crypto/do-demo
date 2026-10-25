// ブラウザ側の共通処理（識別情報・API呼び出し・表示用の整形）

export type MeUser = {
  anon_id: string;
  display_name: string | null;
  clicks: number;
  rank: number | null;
};
export type MeResponse = { total_clicks: number; user: MeUser | null; token?: string };
export type ClickResponse = {
  accepted: number;
  requested: number;
  user_clicks: number;
  total_clicks: number;
  anon_id: string;
  display_name: string | null;
};
export type RankingEntry = { rank: number; anon_id: string; name: string; clicks: number };
export type RankingResponse = { total_clicks: number; entries: RankingEntry[] };

// ---- 識別情報（引き継ぎコード） ------------------------------------------
const STORAGE_KEY = 'dou_token';
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32（I L O U を除く）

export function generateToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join('');
}

/** 表示用: XXXX-XXXX-XXXX-XXXX-XXXX */
export function formatToken(token: string): string {
  return token.match(/.{1,4}/g)?.join('-') ?? token;
}

/** 入力されたコードを正規化。形式が違えば null */
export function normalizeCode(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{20}$/.test(s) ? s : null;
}

export function loadToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string) {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // localStorage が使えなくても、サーバーが発行する Cookie で引き継げる
  }
}

export function newRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---- API ---------------------------------------------------------------
export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

/** DBの未設定など、利用者側では直せない（再試行しても無駄な）エラー */
export function isSetupError(e: unknown): boolean {
  return (
    e instanceof ApiClientError &&
    e.status === 503 &&
    (e.code === 'not_configured' || e.code === 'schema_missing')
  );
}

type ApiOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
  keepalive?: boolean;
};

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.token) headers['x-user-token'] = opts.token;

  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      keepalive: opts.keepalive,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiClientError(0, 'network', '通信できませんでした。');
  }

  let data: { error?: string; message?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    // JSON でない応答
  }

  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      data?.error ?? 'error',
      data?.message ?? 'エラーが発生しました。',
      Number(res.headers.get('retry-after')) || undefined,
    );
  }
  return data as T;
}

// ---- 表示 --------------------------------------------------------------
export const fmt = (n: number) => n.toLocaleString('en-US');

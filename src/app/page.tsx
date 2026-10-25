'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import SettingsDialog from '@/components/SettingsDialog';
import {
  api,
  ApiClientError,
  fmt,
  generateToken,
  isSetupError,
  loadToken,
  newRequestId,
  saveToken,
  type ClickResponse,
  type MeResponse,
} from '@/lib/client';

const QUIPS = [
  '何も起きませんでした。',
  '押しました。以上です。',
  '世界は変わっていません。',
  'ありがとうございます。特に意味はありません。',
  '確かに、1増えました。',
  'それでも、押しますか。',
];

const MILESTONES: Record<number, string> = {
  1: '初めて押しました。世界が1だけ増えました。',
  10: '10回押しました。まだ何も起きていません。',
  100: '100回押しました。何も変わっていません。',
  1000: '1,000回押しました。お疲れさまです。',
  10000: '10,000回押しました。本当に、何も起きません。',
};

const MAX_BATCH = 50;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export default function Home() {
  // サーバーが確定させた値（画面には、これに「送信待ちの分」を足して表示する）
  const [total, setTotal] = useState<number | null>(null);
  const [clicks, setClicks] = useState(0);
  const [rank, setRank] = useState<number | null>(null);
  const [profile, setProfile] = useState<{ anonId: string | null; displayName: string | null }>({
    anonId: null,
    displayName: null,
  });
  const [pending, setPending] = useState(0);

  const [token, setToken] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [throttled, setThrottled] = useState(false);
  const [quip, setQuip] = useState('');
  const [popKey, setPopKey] = useState(0);
  const [floaters, setFloaters] = useState<{ id: number; x: number }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [origin, setOrigin] = useState('');

  const tokenRef = useRef<string | null>(null);
  const unsent = useRef(0); // まだ送っていないクリック
  const inflight = useRef(false); // 送信中か
  const pendingRef = useRef(0); // unsent + 送信中
  const clicksRef = useRef(0);
  const epoch = useRef(0); // クリックの応答を受けるたびに増える（古い応答の上書き防止）
  const floaterId = useRef(0);
  const quipLockUntil = useRef(0);
  const meTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setPendingBoth = useCallback((n: number) => {
    pendingRef.current = n;
    setPending(n);
  }, []);

  // ---- 自分の記録・順位の取得 --------------------------------------------
  const refreshMe = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    const startEpoch = epoch.current;
    try {
      const r = await api<MeResponse>('/api/me', { token: t });
      const idle =
        !inflight.current && unsent.current === 0 && startEpoch === epoch.current;
      if (r.user) {
        setRank(r.user.rank);
        setProfile({ anonId: r.user.anon_id, displayName: r.user.display_name });
        if (idle) {
          clicksRef.current = r.user.clicks;
          setClicks(r.user.clicks);
        }
      } else {
        setRank(null);
      }
      if (idle) setTotal((prev) => Math.max(prev ?? 0, r.total_clicks));
    } catch (e) {
      if (isSetupError(e)) setFatal((e as ApiClientError).message);
    }
  }, []);

  const pollStats = useCallback(async () => {
    try {
      const r = await api<{ total_clicks: number }>('/api/stats');
      if (!inflight.current && unsent.current === 0) {
        setTotal((prev) => Math.max(prev ?? 0, r.total_clicks));
      }
    } catch {
      // 次の更新を待つ
    }
  }, []);

  const scheduleMe = useCallback(() => {
    clearTimeout(meTimer.current);
    meTimer.current = setTimeout(() => {
      void refreshMe();
    }, 1200);
  }, [refreshMe]);

  // ---- クリックの送信 ----------------------------------------------------
  // 連打は、送信中にたまった分をまとめて次の1回で送る。
  // 通信に失敗したら「同じ requestId」で再送するので、二重には加算されない。
  const flush: () => Promise<void> = useCallback(async () => {
    if (inflight.current || unsent.current === 0 || !tokenRef.current) return;
    inflight.current = true;

    const count = Math.min(unsent.current, MAX_BATCH);
    unsent.current -= count;
    const requestId = newRequestId();
    let attempt = 0;

    for (;;) {
      try {
        const r = await api<ClickResponse>('/api/click', {
          method: 'POST',
          token: tokenRef.current,
          body: { requestId, count },
          keepalive: true,
        });
        epoch.current += 1;
        clicksRef.current = r.user_clicks;
        setClicks(r.user_clicks);
        setTotal(r.total_clicks);
        setProfile({ anonId: r.anon_id, displayName: r.display_name });
        setOffline(false);
        setThrottled(r.accepted < count);
        break;
      } catch (e) {
        const err = e instanceof ApiClientError ? e : null;
        const retryable =
          !err ||
          err.status === 0 ||
          err.status === 429 ||
          (err.status >= 500 && !isSetupError(err));
        if (!retryable) {
          // 直しようのないエラー。送信待ちの分も諦めて、理由を表示する
          setFatal(err?.message ?? 'エラーが発生しました。');
          pendingRef.current -= unsent.current;
          unsent.current = 0;
          break;
        }
        setOffline(err?.status === 0);
        attempt += 1;
        await sleep(err?.retryAfter ? err.retryAfter * 1000 : Math.min(500 * 2 ** attempt, 8000));
      }
    }

    setPendingBoth(pendingRef.current - count);
    inflight.current = false;
    scheduleMe();
    if (unsent.current > 0) void flush();
  }, [scheduleMe, setPendingBoth]);

  // ---- 起動時: 識別情報を用意する -----------------------------------------
  useEffect(() => {
    let alive = true;
    setOrigin(window.location.origin);
    (async () => {
      let t = loadToken();
      if (!t) {
        // localStorage にないとき、Cookie に残っていれば復元する
        try {
          const r = await api<MeResponse>('/api/me');
          if (r.token) t = r.token;
        } catch {
          // 未設定などのエラーは、このあとの refreshMe で表示する
        }
      }
      t = loadToken() ?? t ?? generateToken();
      saveToken(t);
      if (!alive) return;
      tokenRef.current = t;
      setToken(t);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---- 識別情報が決まったら、数値を取得して定期更新する --------------------
  useEffect(() => {
    if (!token) return;
    void refreshMe();
    void flush(); // 読み込み前に押された分があれば送る
    const meTick = setInterval(() => {
      if (!document.hidden) void refreshMe();
    }, 10_000);
    const statsTick = setInterval(() => {
      if (!document.hidden) void pollStats();
    }, 5_000);
    const onVisible = () => {
      if (!document.hidden) {
        void refreshMe();
        void flush();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(meTick);
      clearInterval(statsTick);
      clearTimeout(meTimer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token, refreshMe, pollStats, flush]);

  // ---- 押す ----------------------------------------------------------------
  const press = () => {
    if (fatal) return;
    unsent.current += 1;
    setPendingBoth(pendingRef.current + 1);
    const shown = clicksRef.current + pendingRef.current;

    setPopKey((k) => k + 1);

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const id = (floaterId.current += 1);
      const x = Math.round((Math.random() - 0.5) * 70);
      setFloaters((list) => [...list.slice(-9), { id, x }]);
    }

    const now = Date.now();
    if (MILESTONES[shown]) {
      setQuip(MILESTONES[shown]);
      quipLockUntil.current = now + 3000;
    } else if (now >= quipLockUntil.current) {
      setQuip(pick(QUIPS));
      quipLockUntil.current = now + 1800;
    }

    if (typeof navigator.vibrate === 'function') navigator.vibrate(6);
    void flush();
  };

  // ---- 表示 ----------------------------------------------------------------
  const shownClicks = clicks + pending;
  const totalText = total === null ? '—' : fmt(total + pending);
  const totalSize = totalText.length <= 9 ? 'l' : totalText.length <= 13 ? 'm' : 's';

  const shareText =
    shownClicks > 0
      ? `世界で${fmt(shownClicks)}回押しました。あなたは何回押しますか？`
      : '世界で1番どうでもいいことに、あなたも参加しませんか？';
  const shareHref =
    `https://x.com/intent/post?text=${encodeURIComponent(shareText)}` +
    (origin ? `&url=${encodeURIComponent(origin)}` : '');

  const note = offline
    ? '通信できません。押した分は、つながるまで保留します。'
    : throttled
      ? '押しすぎです。少し休んでください。'
      : quip;

  return (
    <main className="page">
      <header>
        <h1 className="title">世界で1番どうでもいいランキング</h1>
        <p className="tagline">世界で1番どうでもいいことに、あなたも参加しませんか？</p>
      </header>

      {fatal && (
        <p className="alert" role="alert">
          {fatal}
        </p>
      )}

      <div className="stage">
        <button type="button" className="push" onClick={press} disabled={!!fatal}>
          押す
        </button>
        {floaters.map((f) => (
          <span
            key={f.id}
            className="plus"
            style={{ '--x': `${f.x}px` } as CSSProperties}
            aria-hidden="true"
            onAnimationEnd={() => setFloaters((list) => list.filter((x) => x.id !== f.id))}
          >
            +1
          </span>
        ))}
      </div>

      <p className="desc">
        このボタンを押しても、何も起きません。
        <br />
        ただ、世界のクリック数が1増えます。
      </p>
      <p className="quip">{note}</p>

      <section className="stats" aria-label="クリック数">
        <p className="stat-label">世界累計クリック数</p>
        <p className="total num" data-size={totalSize}>
          <span key={popKey} className="pop">
            {totalText}
          </span>
          <span className="unit">回</span>
        </p>

        <div className="pair">
          <div>
            <p className="stat-label">あなたが押した回数</p>
            <p className="mid num">
              <span key={popKey} className="pop">
                {fmt(shownClicks)}
              </span>
              <span className="unit">回</span>
            </p>
          </div>
          <div>
            <p className="stat-label">あなたの順位</p>
            {shownClicks === 0 ? (
              <>
                <p className="mid num">圏外</p>
                <p className="hint">1回押すと参加できます</p>
              </>
            ) : rank === null ? (
              <p className="mid num">集計中…</p>
            ) : (
              <p className="mid num">
                <span className="prefix">世界第</span>
                {fmt(rank)}
                <span className="unit">位</span>
              </p>
            )}
          </div>
        </div>
      </section>

      <nav className="actions">
        <Link href="/ranking" className="linkbtn">
          世界ランキングを見る
        </Link>
      </nav>

      <footer className="foot">
        <a className="textlink" href={shareHref} target="_blank" rel="noopener noreferrer">
          Xで共有する
        </a>
        <button type="button" className="textlink" onClick={() => setSettingsOpen(true)}>
          表示名・引き継ぎ
        </button>
      </footer>

      {token && (
        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          token={token}
          anonId={profile.anonId}
          displayName={profile.displayName}
          hasClicks={shownClicks > 0}
          onSaved={(p) => setProfile(p)}
        />
      )}
    </main>
  );
}

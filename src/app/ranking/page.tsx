'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  api,
  ApiClientError,
  fmt,
  loadToken,
  type MeResponse,
  type RankingResponse,
} from '@/lib/client';

export default function RankingPage() {
  const [data, setData] = useState<RankingResponse | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (document.hidden) return;
      try {
        const [ranking, mine] = await Promise.all([
          api<RankingResponse>('/api/ranking'),
          api<MeResponse>('/api/me', { token: loadToken() }).catch(() => null),
        ]);
        if (!alive) return;
        setData(ranking);
        setMe(mine);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof ApiClientError ? e.message : 'ランキングを取得できませんでした。');
      }
    };

    void load();
    const tick = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(tick);
    };
  }, []);

  const myAnonId = me?.user?.anon_id;
  const myRank = me?.user?.rank ?? null;
  const myClicks = me?.user?.clicks ?? 0;

  return (
    <main className="rk">
      <div className="rk-top">
        <Link href="/" className="linkbtn">
          押しにいく
        </Link>
      </div>

      <h1 className="rk-title">世界ランキング</h1>
      <p className="rk-sub">
        上位100人{data ? `・世界累計 ${fmt(data.total_clicks)} 回` : ''}
      </p>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {data && data.entries.length === 0 && (
        <p className="empty">まだ誰も押していません。最初の1人になれます。</p>
      )}

      {data && data.entries.length > 0 && (
        <ol className="rows">
          {data.entries.map((e) => {
            const mine = e.anon_id === myAnonId;
            return (
              <li key={e.anon_id} className={`row${mine ? ' me' : ''}`}>
                <span className="pos num">{e.rank}位</span>
                <span className="name">
                  {e.name}
                  {mine && <span className="me-tag">あなた</span>}
                </span>
                <span className="cnt num">
                  {fmt(e.clicks)}
                  <small>回</small>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {!data && !error && <p className="empty">読み込み中…</p>}

      {data && (
        <div className="mebar">
          <div className="mebar-in">
            <span>あなたの順位</span>
            {myClicks > 0 && myRank !== null ? (
              <span className="num">
                世界第 {fmt(myRank)} 位（{fmt(myClicks)}回）
              </span>
            ) : (
              <span>
                圏外 <Link href="/">押すと参加できます</Link>
              </span>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

# 世界で1番どうでもいいランキング

ボタンを押すと、世界のクリック数が1増えます。それだけのサイトです。

- フロントエンド: Next.js (App Router) + React
- データベース: Supabase (PostgreSQL)
- クリック処理: Next.js の API + データベース関数（1トランザクション）

## 1. セットアップ

### 1-1. Supabase のプロジェクトを作る

1. https://supabase.com でプロジェクトを作成（無料プランで動きます）
2. 左メニュー **SQL Editor** を開き、`supabase/schema.sql` の中身をすべて貼り付けて **Run**
3. **Project Settings → API** を開き、次の2つを控える
   - Project URL
   - `service_role` キー（新しい画面では **Secret key** / `sb_secret_...`）

> ⚠️ このキーは、データベースを自由に操作できる鍵です。**サーバー専用**です。
> `NEXT_PUBLIC_` を付けたり、GitHub に上げたりしないでください。

### 1-2. 環境変数を設定する

```bash
cp .env.example .env.local
```

`.env.local` を編集:

```
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=（控えたキー）
```

**未設定のままでも起動しますが**、画面に「データベースが未設定です」と表示され、ボタンは押せません。
`schema.sql` を実行していない場合も、その旨が表示されます。

## 2. 起動

```bash
npm install
npm run dev
```

http://localhost:3000 を開きます。

## 3. 公開（Vercel）

1. このフォルダを GitHub に push
2. https://vercel.com で **Add New → Project** → リポジトリを選択
3. **Environment Variables** に `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を追加
4. **Deploy**

Next.js が動く環境（Cloudflare, Fly.io, 自前の Node サーバーなど）でも、同じ環境変数で動きます。
`npm run build && npm start` で本番起動できます。

## 4. 仕組み

| 要件 | 実装 |
| --- | --- |
| 匿名ID・再訪問で引き継ぎ | 初回訪問時にブラウザが20文字のランダムな識別情報を作り、localStorage とサーバー発行の Cookie に保存。DB には **ハッシュだけ** 保存。最初の1回を押したときに `Anonymous_XXXXXXXX` を発行 |
| 複数端末 | 画面下「表示名・引き継ぎ」に出る**引き継ぎコード**を別端末で入力 |
| 同時アクセスで正確 | `record_clicks` 関数が1トランザクションで、ユーザー行・全体統計・二重計上防止を更新。同一ユーザーは行ロックで順番に処理 |
| 二重計上防止 | 1回の送信ごとに `requestId`。通信エラーで同じ `requestId` を再送しても、2回目は加算されない |
| 連打 | 画面は即時に増え、送信中にたまった分は次の1リクエストにまとめて送る（最大50件） |
| レート制限 | DB側: 1人あたり、最大40回のバースト + 毎秒15回の継続（超過分は加算されない）。API側: IP単位の簡易制限 |
| 世界累計 | 書き込み集中を避けるため8分割して保持し、読むときに合計 |
| 順位 | 自分より多く押した人の数 + 1。**同数は同順位**（1位, 2位, 2位, 4位）。表示順は先に参加した人が上 |
| ランキング圏外 | まだ1回も押していない人 |

## 5. 運用メモ

整合性チェック（`true` なら全員の合計 = 世界累計）:

```sql
select (select coalesce(sum(click_count), 0) from public.users)
     = (select coalesce(sum(total_clicks), 0) from public.global_stats) as consistent;
```

- `click_requests` は二重計上防止用で、増え続けます。古い行は消して構いません（`schema.sql` 末尾を参照）。
- 自分の順位は「自分より多い人数を数える」方式です。数十万人規模まではそのまま動きます。それ以上になったら、順位を定期集計してキャッシュする構成に切り替えてください。
- 大量の自動クリック対策を強めたい場合は、Vercel Firewall や Upstash Ratelimit などでIP単位の制限を足してください。
- 表示名の不適切な言葉のチェックは入れていません。公開後に必要なら追加してください。

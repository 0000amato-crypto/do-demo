'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiClientError, formatToken, normalizeCode, saveToken } from '@/lib/client';

type Props = {
  open: boolean;
  onClose: () => void;
  token: string;
  anonId: string | null;
  displayName: string | null;
  hasClicks: boolean;
  onSaved: (p: { anonId: string | null; displayName: string | null }) => void;
};

type Msg = { kind: 'ok' | 'err'; text: string } | null;

export default function SettingsDialog({
  open,
  onClose,
  token,
  anonId,
  displayName,
  hasClicks,
  onSaved,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState('');
  const [nameMsg, setNameMsg] = useState<Msg>(null);
  const [codeMsg, setCodeMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setName(displayName ?? '');
      setNameMsg(null);
      setCodeMsg(null);
      setReveal(false);
      setCopied(false);
      setCode('');
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
    // 開いた瞬間の値だけを使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveName = async () => {
    setBusy(true);
    setNameMsg(null);
    try {
      const r = await api<{ anon_id: string; display_name: string | null }>('/api/name', {
        method: 'PUT',
        token,
        body: { name },
      });
      onSaved({ anonId: r.anon_id, displayName: r.display_name });
      setName(r.display_name ?? '');
      setNameMsg({ kind: 'ok', text: r.display_name ? '保存しました。' : '解除しました。' });
    } catch (e) {
      setNameMsg({ kind: 'err', text: e instanceof ApiClientError ? e.message : '保存できませんでした。' });
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(formatToken(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setReveal(true); // コピーできない環境では、表示して手で写してもらう
    }
  };

  const adopt = async () => {
    const normalized = normalizeCode(code);
    if (!normalized) {
      setCodeMsg({ kind: 'err', text: 'コードの形式が正しくありません（英数字20文字）。' });
      return;
    }
    setBusy(true);
    setCodeMsg(null);
    try {
      const r = await api<{ user: unknown }>('/api/me', { token: normalized });
      if (!r.user) {
        setCodeMsg({ kind: 'err', text: 'このコードの記録は見つかりませんでした。' });
        return;
      }
      if (
        hasClicks &&
        normalized !== token &&
        !window.confirm(
          'この端末の記録は、入力したコードの記録に切り替わります。\nこの端末のコードを控えていない場合、元には戻せません。よろしいですか？',
        )
      ) {
        return;
      }
      saveToken(normalized);
      window.location.reload();
    } catch (e) {
      setCodeMsg({ kind: 'err', text: e instanceof ApiClientError ? e.message : '確認できませんでした。' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="settings-title"
    >
      <div className="dlg">
        <h2 id="settings-title">表示名・引き継ぎ</h2>

        <h3>表示名（任意）</h3>
        <p>
          ランキングに表示される名前です。未設定のときは、
          {anonId ? `「${anonId}」` : '最初に押したときに発行される匿名ID'}が表示されます。
        </p>
        <div className="row-in">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="20文字まで"
            aria-label="表示名"
            autoComplete="off"
          />
          <button type="button" className="btn-s" onClick={saveName} disabled={busy}>
            保存
          </button>
        </div>
        {nameMsg && <p className={`msg ${nameMsg.kind === 'err' ? 'err' : ''}`}>{nameMsg.text}</p>}

        <h3>この記録を、ほかの端末で続ける</h3>
        <p>
          下のコードを、ほかの端末の「引き継ぎコードを入力」に入力すると、同じ記録で押せます。
          コードを知っている人は、あなたの記録を操作できます。人に見せないでください。
        </p>
        <p className="code">{reveal ? formatToken(token) : '••••-••••-••••-••••-••••'}</p>
        <div className="row-in">
          <button type="button" className="btn-s ghost" onClick={() => setReveal((v) => !v)}>
            {reveal ? '隠す' : '表示'}
          </button>
          <button type="button" className="btn-s ghost" onClick={copyCode}>
            {copied ? 'コピーしました' : 'コピー'}
          </button>
        </div>

        <h3>引き継ぎコードを入力</h3>
        <div className="row-in">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
            aria-label="引き継ぎコード"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button type="button" className="btn-s" onClick={adopt} disabled={busy || !code.trim()}>
            引き継ぐ
          </button>
        </div>
        {codeMsg && <p className={`msg ${codeMsg.kind === 'err' ? 'err' : ''}`}>{codeMsg.text}</p>}

        <div className="close">
          <button type="button" className="btn-s ghost" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </dialog>
  );
}

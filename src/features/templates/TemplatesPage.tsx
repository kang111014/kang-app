import { useEffect, useRef, useState } from 'react';
import Sheet from '../../components/Sheet';
import TemplateThumb from '../../components/TemplateThumb';
import TopBar from '../../components/TopBar';
import { analyzeDemoImage } from '../../ai/claudeTemplate';
import { kvGet, kvSet, loadAsset } from '../../core/db';
import { navigate } from '../../core/router';
import { useSettings } from '../../core/settings';
import { shareFile } from '../../core/share';
import { BUILTIN_TEMPLATES, deleteUserTemplate, DISABLED_KEY, listUserTemplates } from '../../story/templates';
import type { StoryTemplate } from '../../story/types';
import { setDraft } from './draft';
import { addRequest, CLAUDE_REQUEST_TEXT, listRequests, markDone, removeRequest, type TemplateRequest } from './requests';

function RequestThumb({ assetId }: { assetId: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    loadAsset(assetId).then((b) => {
      if (b) setUrl((u = URL.createObjectURL(b)));
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [assetId]);
  return url ? <img src={url} alt="示範圖" /> : <img alt="" />;
}

export default function TemplatesPage() {
  const settings = useSettings();
  const [userTemplates, setUserTemplates] = useState<StoryTemplate[]>([]);
  const [disabled, setDisabled] = useState<string[]>([]);
  const [requests, setRequests] = useState<TemplateRequest[]>([]);
  const [selected, setSelected] = useState<StoryTemplate | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [demo, setDemo] = useState<File | null>(null);
  const [method, setMethod] = useState<1 | 2>(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const demoInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    setUserTemplates(await listUserTemplates());
    setDisabled(await kvGet<string[]>(DISABLED_KEY, []));
    setRequests(await listRequests());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function toggleEnabled(t: StoryTemplate) {
    const next = disabled.includes(t.id) ? disabled.filter((d) => d !== t.id) : [...disabled, t.id];
    setDisabled(next);
    await kvSet(DISABLED_KEY, next);
  }

  async function submitDemo() {
    if (!demo) return;
    setMsg(null);
    if (method === 1) {
      // 先開分享選單（手機規定要在按下按鈕的當下開），同時把示範圖存起來
      const sharing = shareFile(demo, CLAUDE_REQUEST_TEXT);
      await addRequest(demo);
      const r = await sharing;
      setDemo(null);
      await refresh();
      setMsg({
        text:
          r === 'downloaded'
            ? '示範圖已存好也下載了。請把它傳給 Claude，並說「幫我做成新版型」。'
            : '示範圖已存好。把它傳給 Claude 後，等 Claude 做好更新網站，新版型就會出現。',
      });
      return;
    }
    if (!settings?.claudeKey) {
      setMsg({ text: '還沒有 Claude API 金鑰。請先到「設定」照步驟申請並貼上。', err: true });
      return;
    }
    setBusy('Claude 正在分析示範圖…（約 30 秒～1 分鐘）');
    try {
      const t = await analyzeDemoImage(settings.claudeKey, demo);
      setDraft(t);
      setDemo(null);
      navigate('/templates/edit/draft');
    } catch (e) {
      setMsg({ text: (e as Error).message, err: true });
    } finally {
      setBusy(null);
    }
  }

  const all = [...userTemplates, ...BUILTIN_TEMPLATES];
  const pending = requests.filter((r) => r.status === 'pending');

  return (
    <div className="app">
      <TopBar title="版型管理" right={<button className="icon-btn" onClick={() => setAddOpen(true)}>＋ 新增</button>} />
      <main className="page">
        {msg && <p className={`notice ${msg.err ? 'err' : 'ok'}`}>{msg.text}</p>}
        {busy && <p className="notice">{busy}</p>}

        <div className="card">
          <h2>所有版型（{all.length}）</h2>
          <p className="muted small">點版型可以編輯、複製或停用。停用的版型不會被隨機抽到。</p>
          <div className="tpl-grid">
            {all.map((t) => (
              <button key={t.id} className={`tpl ${disabled.includes(t.id) ? 'off' : ''}`} onClick={() => setSelected(t)}>
                <TemplateThumb template={t} />
                <span>{t.name}{t.source !== 'builtin' ? ' ✎' : ''}</span>
              </button>
            ))}
          </div>
        </div>

        {pending.length > 0 && (
          <div className="card">
            <h2>等 Claude 製作中（{pending.length}）</h2>
            <p className="muted small">這些示範圖已經存在手機裡。如果還沒傳給 Claude，可以按「再分享一次」。</p>
            {pending.map((r) => (
              <div className="list-item" key={r.id}>
                <RequestThumb assetId={r.assetId} />
                <div style={{ flex: 1 }}>
                  <div className="small">{new Date(r.createdAt).toLocaleString('zh-TW')}</div>
                  <div className="row" style={{ marginTop: 6 }}>
                    <button
                      className="btn small ghost"
                      onClick={async () => {
                        const b = await loadAsset(r.assetId);
                        if (b) shareFile(new File([b], r.fileName, { type: b.type }), CLAUDE_REQUEST_TEXT);
                      }}
                    >
                      再分享一次
                    </button>
                    <button className="btn small ghost" onClick={async () => { await markDone(r); refresh(); }}>已完成</button>
                    <button className="btn small danger" onClick={async () => { await removeRequest(r.id); refresh(); }}>刪除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {selected && (
        <Sheet title={selected.name} onClose={() => setSelected(null)}>
          <div className="stack">
            {selected.source !== 'builtin' ? (
              <button className="btn primary" onClick={() => navigate(`/templates/edit/${encodeURIComponent(selected.id)}`)}>✏️ 編輯</button>
            ) : (
              <p className="muted small">內建版型不能直接改，可以複製一份再改。</p>
            )}
            <button className="btn ghost" onClick={() => navigate(`/templates/copy/${encodeURIComponent(selected.id)}`)}>📄 複製一份來改</button>
            <button className="btn ghost" onClick={() => { toggleEnabled(selected); setSelected(null); }}>
              {disabled.includes(selected.id) ? '✅ 重新啟用' : '🚫 停用（不會被隨機抽到）'}
            </button>
            {selected.source !== 'builtin' && (
              <button className="btn danger" onClick={async () => { await deleteUserTemplate(selected.id); setSelected(null); refresh(); }}>🗑 刪除</button>
            )}
          </div>
        </Sheet>
      )}

      {addOpen && !demo && (
        <Sheet title="新增版型" onClose={() => setAddOpen(false)}>
          <div className="stack">
            <button className="btn primary" onClick={() => { setAddOpen(false); demoInput.current?.click(); }}>
              🖼️ 上傳示範圖（照著喜歡的限動做）
            </button>
            <button className="btn ghost" onClick={() => navigate('/templates/new')}>✏️ 自己做：上傳背景或邊框，拖拉格子</button>
          </div>
        </Sheet>
      )}
      <input ref={demoInput} className="hidden-input" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setDemo(f); setMethod(1); } e.target.value = ''; }} />

      {demo && (
        <Sheet title="要用哪種方式做成版型？" onClose={() => setDemo(null)}>
          <label className={`radio-card ${method === 1 ? 'on' : ''}`}>
            <input type="radio" checked={method === 1} onChange={() => setMethod(1)} />
            <div>
              <b>1. 交給 Claude 製作（建議）</b>
              <div className="muted small">示範圖會存在手機裡，並打開分享選單，請把圖傳給 Claude App。Claude 做好版型後會更新網站，做出來最精緻。不用金鑰、不用付費。</div>
            </div>
          </label>
          <label className={`radio-card ${method === 2 ? 'on' : ''}`}>
            <input type="radio" checked={method === 2} onChange={() => setMethod(2)} />
            <div>
              <b>2. App 立即分析</b>
              <div className="muted small">把示範圖送到 Claude API，約 1 分鐘內產生版型，之後可以再微調。需要你自己的 Claude API 金鑰（只存在手機裡，會依用量計費，每次約台幣幾元）。</div>
              {!settings?.claudeKey && method === 2 && (
                <div className="small" style={{ marginTop: 6 }}>
                  還沒設定金鑰 → <a href="#/settings">到設定申請</a>
                </div>
              )}
            </div>
          </label>
          <button className="btn primary block" onClick={submitDemo} disabled={!!busy}>
            {method === 1 ? '存好並分享給 Claude' : '開始分析'}
          </button>
        </Sheet>
      )}
    </div>
  );
}

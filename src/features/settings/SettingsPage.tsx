import { useEffect, useState, type ReactNode } from 'react';
import TopBar from '../../components/TopBar';
import { testClaudeKey } from '../../ai/claudeTemplate';
import { updateSettings, useSettings, type Settings } from '../../core/settings';
import { testPexelsKey, testUnsplashKey } from '../../online/stock';

type KeyName = 'unsplashKey' | 'pexelsKey' | 'claudeKey';

function KeyField({
  name,
  label,
  placeholder,
  test,
  guide,
}: {
  name: KeyName;
  label: string;
  placeholder: string;
  test: (k: string) => Promise<boolean>;
  guide: ReactNode;
}) {
  const settings = useSettings();
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (settings) setValue(settings[name]);
  }, [settings, name]);

  async function save() {
    const v = value.trim();
    await updateSettings({ [name]: v } as Partial<Settings>);
    if (!v) return setStatus({ text: '已清除', ok: true });
    setStatus({ text: '測試中…', ok: true });
    try {
      const ok = await test(v);
      setStatus(ok ? { text: '✅ 金鑰可以使用，已存在這支手機', ok: true } : { text: '❌ 金鑰無法使用，請確認有沒有貼錯', ok: false });
    } catch {
      setStatus({ text: '已儲存，但目前無法連線測試', ok: false });
    }
  }

  return (
    <div className="card">
      <h2>{label}</h2>
      <div className="row">
        <input
          className="input"
          style={{ flex: 1, minWidth: 0 }}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button className="btn small ghost" onClick={() => setShow(!show)}>{show ? '隱藏' : '顯示'}</button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn small primary" onClick={save}>儲存並測試</button>
        {settings?.[name] && <button className="btn small danger" onClick={() => { setValue(''); updateSettings({ [name]: '' } as Partial<Settings>); setStatus({ text: '已清除', ok: true }); }}>清除</button>}
      </div>
      {status && <p className={`notice ${status.ok ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>{status.text}</p>}
      <details>
        <summary>一步一步教你申請</summary>
        {guide}
      </details>
    </div>
  );
}

export default function SettingsPage() {
  const s = useSettings();
  if (!s) return null;
  return (
    <div className="app">
      <TopBar title="設定" />
      <main className="page">
        <div className="card">
          <h2>素材與聲音</h2>
          <label className="switch-row">
            <span>
              <b>使用網路素材</b>
              <div className="muted small">隨機下載圖庫背景、配色色卡、可愛貼圖。只會下載，你的照片影片不會上傳。</div>
            </span>
            <input type="checkbox" checked={s.useOnline} onChange={(e) => updateSettings({ useOnline: e.target.checked })} />
          </label>
          <label className="switch-row">
            <span>
              <b>短影片保留影片原音</b>
              <div className="muted small">關掉時只用你選的音樂。兩個都有時會混在一起。</div>
            </span>
            <input type="checkbox" checked={s.keepOriginalAudio} onChange={(e) => updateSettings({ keepOriginalAudio: e.target.checked })} />
          </label>
        </div>

        <p className="muted small">以下金鑰都是選填。沒填也能用：背景會改用免金鑰的隨機圖庫。金鑰只存在這支手機，不會傳給 Claude 或其他人。</p>

        <KeyField
          name="unsplashKey"
          label="Unsplash 金鑰（免費圖庫）"
          placeholder="貼上 Access Key"
          test={testUnsplashKey}
          guide={
            <ol className="steps small">
              <li>用 Safari 打開 <a href="https://unsplash.com/join" target="_blank" rel="noreferrer">unsplash.com/join</a>，註冊一個免費帳號（可用 Google 登入）。</li>
              <li>打開 <a href="https://unsplash.com/oauth/applications" target="_blank" rel="noreferrer">unsplash.com/oauth/applications</a>，按「New Application」。</li>
              <li>把條款的勾勾全部勾起來，按「Accept terms」。</li>
              <li>Application name 填「kang-app」，Description 隨便填一句（例如「personal story maker」），按「Create application」。</li>
              <li>往下找到「Keys」區塊的 <b>Access Key</b>，長按複製。</li>
              <li>回到這裡貼上，按「儲存並測試」。（免費版每小時可以用 50 次，夠用了）</li>
            </ol>
          }
        />

        <KeyField
          name="pexelsKey"
          label="Pexels 金鑰（免費圖庫）"
          placeholder="貼上 API Key"
          test={testPexelsKey}
          guide={
            <ol className="steps small">
              <li>用 Safari 打開 <a href="https://www.pexels.com/join" target="_blank" rel="noreferrer">pexels.com/join</a>，註冊免費帳號。</li>
              <li>打開 <a href="https://www.pexels.com/api/new/" target="_blank" rel="noreferrer">pexels.com/api/new</a>。</li>
              <li>填寫用途（例如「Personal app for making Instagram stories」），網址可填 https://kang111014.github.io/kang-app/，勾選同意後送出。</li>
              <li>頁面會顯示你的 <b>API Key</b>，長按複製。</li>
              <li>回到這裡貼上，按「儲存並測試」。</li>
            </ol>
          }
        />

        <KeyField
          name="claudeKey"
          label="Claude API 金鑰（版型「App 立即分析」用）"
          placeholder="sk-ant-..."
          test={testClaudeKey}
          guide={
            <ol className="steps small">
              <li>這把金鑰和你平常用的 Claude App 訂閱是分開的，用多少付多少（分析一張示範圖大約台幣幾元）。不想付費的話，新增版型時選「交給 Claude 製作」就好。</li>
              <li>用 Safari 打開 <a href="https://platform.claude.com" target="_blank" rel="noreferrer">platform.claude.com</a>，用你的 Email 登入或註冊。</li>
              <li>進入「Billing（帳單）」，綁定信用卡並儲值（最低 5 美元）。</li>
              <li>進入「API Keys」，按「Create Key」，名稱填「kang-app」，按建立。</li>
              <li>畫面會顯示一串 <b>sk-ant-</b> 開頭的金鑰，<b>只會顯示這一次</b>，馬上長按複製。</li>
              <li>回到這裡貼上，按「儲存並測試」。</li>
            </ol>
          }
        />

        <div className="card">
          <h2>📲 加到主畫面</h2>
          <ol className="steps small">
            <li>用 iPhone 的 <b>Safari</b> 打開 https://kang111014.github.io/kang-app/</li>
            <li>點畫面下方的「分享」按鈕（方框加向上箭頭）。</li>
            <li>往下滑，點「加入主畫面」，再點右上角「加入」。</li>
            <li>桌面就會出現「康的App」圖示，之後從這裡打開。</li>
          </ol>
        </div>

        <div className="card">
          <h2>關於資料</h2>
          <p className="muted small">
            版型、設定、金鑰都存在這支手機的瀏覽器裡。刪除主畫面的 App 圖示或清除 Safari 網站資料時會一起被清掉。照片和影片只在手機上處理，不會上傳到任何地方。
          </p>
          <button className="btn small ghost" onClick={() => location.reload()}>重新整理到最新版</button>
        </div>
      </main>
    </div>
  );
}

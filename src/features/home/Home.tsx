import { navigate } from '../../core/router';
import { FEATURES } from '../registry';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function Home() {
  const visible = FEATURES.filter((f) => !f.hidden);
  return (
    <div className="app">
      <header className="topbar">
        <h1>康的App</h1>
      </header>
      <main className="page">
        {!isStandalone() && (
          <div className="card">
            <h2>📲 加到主畫面，用起來像真的 App</h2>
            <p className="muted">
              用 iPhone 的 Safari 開這個網址，點下方的「分享」按鈕（方框加向上箭頭），往下滑選「加入主畫面」，再按「加入」。之後從桌面圖示打開就是全螢幕。
            </p>
          </div>
        )}
        <div className="feature-grid">
          {visible.map((f) => (
            <button key={f.id} className="feature" onClick={() => navigate(f.path)}>
              <span className="emoji">{f.emoji}</span>
              <b>{f.name}</b>
              <span className="muted small">{f.description}</span>
            </button>
          ))}
          <div className="feature soon">
            <span className="emoji">✨</span>
            <b>更多功能</b>
            <span className="muted small">想到什麼就跟 Claude 說，陸續加上</span>
          </div>
        </div>
      </main>
    </div>
  );
}

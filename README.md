# 康的App

專屬於我的小工具集合，用 iPhone 的 Safari 打開就能用，也可以「加入主畫面」變成像 App 一樣。

👉 https://kang111014.github.io/kang-app/

## 功能

- 🎞️ **限時動態產生器**：從相簿選照片和影片，自動挑出清楚、亮度好、有人臉、不重複的素材，排成 IG 限時動態（9:16）的拼貼照片或短影片。可以「換一個」隨機換風格、加背景音樂、存回相簿。
- 🧩 **版型管理**：10 個內建版型，可以自己拖拉做新版型，或上傳喜歡的限動示範圖請 Claude 做成版型。

## 加到 iPhone 主畫面

1. 用 Safari 打開上面的網址
2. 點下方「分享」按鈕 → 往下滑選「加入主畫面」→「加入」

## 開發

```bash
npm install
npm run dev     # 本機預覽
npm test        # 測試
npm run build   # 建置
```

push 到 `main` 會自動部署到 GitHub Pages。開發說明見 `CLAUDE.md`，版型格式見 `docs/TEMPLATES.md`。

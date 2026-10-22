# kang-app 開發筆記

使用者（康）不是工程師，用 iPhone，沒有 Mac。跟他溝通一律用繁體中文、白話。

## 這是什麼

一個可以一直擴充的個人 PWA（網頁 App），部署在 GitHub Pages：https://kang111014.github.io/kang-app/
push 到 main 會由 `.github/workflows/deploy.yml` 自動測試、建置、部署。

## 技術

- TypeScript + React + Vite，`npm run dev` / `npm test` / `npm run build`
- 路由用網址 hash（`#/story`），GitHub Pages 不支援伺服器路由
- 資料存 IndexedDB（`src/core/db.ts`），每筆有 id/createdAt/updatedAt/deletedAt，日後可做跨裝置同步
- 人臉偵測（MediaPipe）與 FFmpeg 的 wasm 檔在建置時從 node_modules 複製到 `public/vendor/`（`scripts/copy-vendor.mjs`），不依賴外部 CDN
- 使用者的照片影片絕不上傳；網路素材只下載

## 新增功能

1. 在 `src/features/<名稱>/` 寫頁面元件
2. 在 `src/features/registry.ts` 加一筆，首頁自動出現卡片
3. 需要存資料就在 `src/core/db.ts` 加 store 並把 `DB_VERSION` 加 1

## 限時動態產生器

- 版型：`src/templates/builtin/*.json`，格式見 `docs/TEMPLATES.md`
- 繪圖：`src/story/render.ts`（照片和影片共用同一個繪圖函式）
- 短影片：`src/story/player.ts` 用 canvas + MediaRecorder 即時錄製（iPhone 會直接錄成 MP4）；`src/story/ffmpeg.ts` 用單執行緒 FFmpeg.wasm 做轉檔
- 素材挑選：`src/media/`（清晰度、亮度、人臉、相似連拍）
- 「App 立即分析」示範圖：`src/ai/claudeTemplate.ts`，使用者自己的 Claude API 金鑰，存在手機本機

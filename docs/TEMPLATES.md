# 限時動態版型格式

版型是純 JSON。內建版型放在 `src/templates/builtin/<id>.json`，新增一個檔案、推上 main 之後網站會自動部署，App 裡就會出現新版型。格式定義在 `src/story/types.ts`，檢查規則在 `src/story/schema.ts`。

## 座標與顏色

- 畫布固定 **1080 × 1920**（9:16），座標以左上角為原點，單位是像素。
- 顏色可寫色碼 `#rrggbb`，或配色代號：`p0` 背景、`p1` 次要底色、`p2` 主強調、`p3` 副強調、`p4` 深色。用代號的部分每次「換一個」都會換色；想固定成示範圖的顏色就寫色碼。

## 欄位

```jsonc
{
  "schema": 1,
  "id": "polaroid",            // 英文小寫加連字號，不可重複
  "name": "拍立得散落",          // App 內顯示的名稱
  "source": "builtin",
  "mood": "light",             // light / dark / any：偏好的配色明暗
  "stickers": [1, 3],          // 隨機小貼圖數量 [最少, 最多]
  "backgrounds": [             // 背景候選，每次隨機挑一個
    { "type": "solid", "color": "p0" },
    { "type": "gradient", "colors": ["p0", "p1"], "angle": 160 },
    { "type": "pattern", "pattern": "dots|grid|stripes|checker", "base": "p0", "ink": "p1", "size": 44, "opacity": 0.6 },
    { "type": "image", "src": "builtin:<檔名>", "dim": 0.1 },
    { "type": "blur", "tint": "p0", "tintOpacity": 0.3 },          // 主照片模糊當背景
    { "type": "stock", "query": "paper texture", "fallback": "p0" } // 網路圖庫
  ],
  "slots": [                   // 照片／影片格，陣列順序 = 疊放順序（後面的在上面）
    {
      "id": "main", "role": "main",     // 只能有一個 main，短影片時放影片
      "x": 150, "y": 230, "w": 780, "h": 900,
      "rotate": -3,                      // 角度
      "shape": "rect|ellipse|arch",
      "radius": 24,                      // 圓角
      "frame": { "width": 34, "color": "#ffffff", "style": "plain|polaroid" },
      "shadow": true
    }
  ],
  "decorations": [             // 裝飾圖形，above: true 會疊在照片上面
    { "type": "tape", "x": 440, "y": 175, "w": 220, "h": 70, "rotate": -6, "color": "p2", "opacity": 0.8, "above": true, "animate": "twinkle|float|spin" }
  ],
  "overlay": "builtin:<檔名>"   // 選填：蓋在照片上的透明 PNG 邊框
}
```

裝飾 `type` 可用：`circle` `ring` `rect` `tape` `star` `sparkle` `heart` `flower` `dots` `wave` `line` `filmholes` `confetti` `blob` `image`（`image` 要給 `src`）。
`ring` / `wave` / `line` 可設 `stroke` 線寬。

## 圖片素材

版型需要的圖片（背景、邊框 PNG）放在 `public/template-assets/`，在 JSON 裡寫 `builtin:<檔名>`。

## 從示範圖做版型（給 Claude 的流程）

使用者在 App 裡選「交給 Claude 製作」後，會把示範圖傳給 Claude。製作步驟：

1. 看示範圖的版面，估算每個照片格的位置（換算到 1080 × 1920），最大的那格設為 `main`。
2. 背景能用純色／漸層／圖樣表現的就用；需要原圖質感的背景或邊框，裁好放進 `public/template-assets/`。
3. 文字一律不放（App 不配文字）。
4. 新增 `src/templates/builtin/<id>.json`，執行 `npm test`（會檢查格式與格子位置），再開 PR。合併後網站自動更新。

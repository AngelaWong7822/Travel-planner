# 專屬你的旅行筆記

離線也能使用的旅行行程規劃 Web App。支援多旅程管理、每日景點、預算、匯率換算、行李清單、重要文件，並可安裝到手機主畫面（PWA）。

## 功能

### 行程規劃
- 按日管理景點、時間、備註、訂位編號、連結、標籤、預估花費
- 多旅程建立、切換、重新命名
- 出發日期自動計算每日日期
- 今日總覽、全旅程搜尋
- 地圖／導航一鍵開啟（Google Maps、Apple 地圖）
- 編輯模式：複製景點／整天、▲▼ 排序、刪除二次確認

### 景點地圖
- 每日「列表／地圖」切換；闊畫面（≥1024px）時間線同地圖並排
- 景點按時間編號，虛線連起；用 OpenStreetMap Nominatim 自動查座標（每秒 1 次）
- 查唔到或者唔準：撳「改位置」／「喺地圖揀」手動釘位
- **成日路線**：一次過開 Google Maps 導航（最多 10 個點）

### 住宿與匯率
- **住宿**：入住日 + 晚數，範圍內每日顯示「今晚住」、訂位編號、一撳導航；退房日提醒
- 每個旅程可自訂目的地／本國貨幣與匯率

### 工具
- 天氣（Open-Meteo）：每日卡同今日頁顯示，撳今日頁天氣刷新；目的地喺旅程選單揀
- 行李清單模板與進度條
- 重要文件：**圖片 + PDF**（護照、機票等）
- 旅行模式（僅瀏覽）
- 深色模式、出發提醒等設定喺右上角齒輪

### 分享與列印
- **分享全程／今日／當天**純文字（Web Share API 或複製剪貼簿）
- **列印／另存 PDF**：開啟列印友好版面，可用瀏覽器「另存為 PDF」

### 出發提醒
- 本機通知（Notification API）：出發前一日、出發當日、行程中每日早上
- 需允許瀏覽器通知；**非**伺服器 Web Push（App 關閉後 iOS 可能無法觸發）

### 備份（右上角齒輪 → 備份）
- **匯出備份**：下載完整 JSON，所有圖片（封面、景點圖、文件，以及舊版留低嘅感想相）以 base64 內嵌，可跨裝置還原
- **分享備份檔**：支援檔案分享嘅裝置（多數手機）會顯示，可直接存去 iCloud Drive、AirDrop、WhatsApp 等
- **匯入（合併）**：將備份中的旅程追加到現有列表
- **匯入（取代）**：換成備份內容；先存好新資料先刪舊圖片，中途失敗唔會清走舊資料
- 設定入面顯示「上次匯出」時間
- **清理未使用圖片**（進階選項）：刪除 IndexedDB 中無引用的圖片

### 介面
- 粉彩糖果風：奶白圓點背景，卡片按類別分色（粉紅：行程、薄荷綠：匯率、薰衣草紫：分享／備份、奶油黃：住宿、天空藍：文件／行李）
- jf open 粉圓體、emoji 導航同標題、心心時間線、顏文字空白狀態
- 撳掣彈一彈、sheet 彈出；手機開咗「減少動態效果」會自動停
- 外觀全部喺 `css/cute.css`（喺 `styles.css` 之後載入）

### PWA 離線
- 樣式、字型、圖示均已**本地化**（無需 CDN 即可顯示介面）
- Service Worker 快取；有新版本時提示「立即更新」
- 曾連線開啟後可離線瀏覽行程

## 專案結構

```
JP/
├── index.html
├── styles.css
├── css/
│   └── cute.css              # 粉彩糖果風外觀（顏色、裝飾、動畫）
├── app.js                    # 核心邏輯（儲存、資料遷移、渲染、天氣…）
├── js/
│   ├── share-print.js        # 分享文字、列印預覽
│   ├── reminders.js          # 本機出發提醒
│   ├── weather-locations.js  # 天氣地點座標
│   ├── demo-data.js          # 東京 5 日模板（新手引導用）
│   ├── onboarding.js         # 新手引導
│   ├── ui-ux.js              # 今日頁、設定、景點編輯 sheet
│   ├── trip-calendar.js      # 行程日期月曆
│   ├── day-map.js            # 景點地圖、查座標、成日路線
│   ├── stays.js              # 住宿
│   └── backup.js             # 備份匯出、匯入（取代／合併）
├── sw.js
├── manifest.webmanifest
├── vendor/
│   ├── tailwind.css          # 預編譯 Tailwind（勿手改）
│   ├── fonts/                # jf open 粉圓（SIL OFL）、Noto Sans TC（後備）
│   ├── fontawesome/          # Font Awesome 6.4
│   └── leaflet/              # Leaflet 1.9.4（地圖）
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
├── tailwind-src.css          # Tailwind 原始檔
├── tailwind.config.js
└── README.md
```

## 本地執行

需要透過 HTTP 伺服器開啟（PWA 與 Service Worker 不支援 `file://`）：

```bash
cd JP
python3 -m http.server 8080
```

瀏覽器開啟：<http://localhost:8080>

## 重新編譯 Tailwind（可選）

修改 `index.html` 或 `app.js` 中的 Tailwind class 後：

```bash
npm install
npm run build:css
```

## 安裝到手機

1. 用 Safari（iOS）或 Chrome（Android）開啟網址
2. 至少連線開啟一次，讓資源完成快取
3. 選擇「加入主畫面」或「安裝 App」

## 資料儲存

| 類型 | 位置 | 說明 |
|------|------|------|
| 行程 JSON | `localStorage`（`TRAVEL_V6_STORAGE`） | 文字資料、圖片引用 |
| 圖片 | IndexedDB（`TRAVEL_APP_IMAGES`） | 封面、景點圖、文件 |
| UI 偏好 | `localStorage`（`TRAVEL_APP_UI_PREFS`） | 上次 tab、day |
| 深色模式 | `localStorage`（`TRAVEL_APP_DARK_MODE`） | 開／關 |
| 旅行模式 | `localStorage`（`TRAVEL_APP_TRAVEL_MODE`） | 開／關 |
| 提醒設定 | `localStorage`（`TRAVEL_APP_REMINDER_SETTINGS`） | 開關、時段 |
| 上次備份 | `localStorage`（`TRAVEL_APP_LAST_BACKUP`） | 上次匯出時間 |
| 列表／地圖 | `localStorage`（`TRAVEL_APP_DAY_VIEW`） | 上次揀嘅顯示方式 |

建議定期喺「齒輪 → 備份 → 匯出備份」或「分享備份檔」備份 JSON。

### 跨裝置「同步」建議

本 App 無雲端帳號。跨手機／電腦同步方式：

1. **分享備份檔** → 存到 iCloud Drive / Google Drive
2. 在新裝置開啟 App → **匯入（取代）** 或 **匯入（合併）**

## 備份格式

```json
{
  "version": 6,
  "activeIdx": 0,
  "trips": [
    {
      "name": "我的旅行",
      "city": "Tokyo",
      "localCurrency": "JPY",
      "homeCurrency": "HKD",
      "rate": 0.052,
      "startDate": "",
      "tripBudget": null,
      "itinerary": [
        {
          "title": "抵達・淺草",
          "events": [{ "loc": "淺草寺", "time": "14:00", "lat": 35.7134, "lon": 139.7955, "geoQ": "淺草寺" }],
          "expenses": [{ "amount": 1200, "cat": "food", "note": "拉麵", "ts": 0 }],
          "journal": { "text": "", "photos": ["idb:…"] }
        }
      ],
      "stays": [{ "name": "上野 APA", "address": "", "startIdx": 0, "nights": 3, "bookingRef": "", "cost": 36000 }],
      "wishlist": [],
      "checklist": [],
      "docs": [{ "url": "idb:…", "label": "護照", "mimeType": "image/jpeg" }]
    }
  ]
}
```

`expenses`、`journal`、`wishlist` 係舊版記帳／感想／想去清單嘅資料：介面已經拎走，但 app 會照樣保留，唔會因為存檔而刪走。

匯出時圖片／PDF 為 base64（app 內部存為 `idb:uuid`）；匯入後會自動遷移至 IndexedDB。PDF 上限 8MB。

## 部署

可部署到任何靜態主機（需 **HTTPS** 才能完整使用 PWA）：

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

將 `JP/` 資料夾內所有檔案（含 `vendor/`）上傳至網站根目錄即可。

## 離線限制

- 天氣更新、地圖底圖、自動查座標需要網絡
- 未快取過的 Unsplash 預設封面可能無法顯示
- 本機提醒需瀏覽器允許通知；背景／關閉 App 後不保證觸發（尤其 iOS）

## 技術棧

- 純 HTML / CSS / JavaScript
- Tailwind CSS 3（預編譯至 `vendor/tailwind.css`）
- Font Awesome 6、jf open 粉圓、Noto Sans TC（本地）
- Open-Meteo API（天氣）
- Leaflet + OpenStreetMap（地圖底圖、Nominatim 查座標）
- localStorage + IndexedDB

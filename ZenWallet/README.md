# 💰 ZenWallet - 現代化個人財務管理系統

ZenWallet 是一款從 Google Apps Script (GAS) 重構而來的雲端原生財務管理工具。透過 **GitHub Pages** 進行前端託管，並結合 **Firebase Firestore** 即時資料庫，提供使用者跨裝置、零延遲且具備專業權限控管的記帳體驗。

## ✨ 核心特色

* **即時雲端同步**：基於 Firebase Firestore，所有交易紀錄與資產變動皆即時同步，無需手動重整。
* **EchoVerge 統一授權 (一站通吃)**：深度整合 EchoVerge 授權系統。只要在旗下任一工具（如：教師薪資系統、考卷系統）啟用序號，即可自動解鎖本站專業版功能。
* **模組化 UI 佈局**：
    * **自由拖拽**：使用 SortableJS 實作卡片式儀表板，佈局順序自動儲存。
    * **彈性分隔**：整合 Split.js 讓使用者自由調整左右視窗比例。
* **全方位資產追蹤**：
    * **現金帳戶**：管理多個銀行、現金與電子支付帳戶。
    * **投資組合**：即時串接 API 追蹤全球股市與美股持股現值。
* **數據安全與私隱**：使用 Google Authentication 驗證，資料嚴格加密並隔離，僅限本人存取。

## 🏗️ 專案架構 (Modular Architecture)

本專案採用高度模組化的開發模式，方便後續擴充：

``` text
ZenWallet/
├── index.html              # SPA (Single Page Application) 入口網頁
├── assets/
│   ├── css/
│   │   ├── style.css       # 全域佈局與基礎樣式
│   │   └── dashboard.css   # 儀表板卡片、拖拽與 UI 組件樣式
│   ├── js/
│   │   ├── main.js         # 應用程式進入點與初始化
│   │   ├── firebase-config.js # Firebase 配置與初始化
│   │   └── modules/
│   │       ├── authManager.js   # 身份驗證與 EchoVerge 全域權限校驗
│   │       ├── dbManager.js     # Firestore CRUD 資料庫操作邏輯
│   │       ├── uiController.js  # 處理 Chart.js 圖表與互動 UI
│   │       └── portfolioApi.js  # 外部股市即時行情報價串接
│   └── img/
│       └── logo.svg        # 品牌識別資源
└── README.md               # 專案說明文件
```

## 💎 專業版功能說明
ZenWallet 自動偵測您在 Firebase 節點 `users/{uid}/account/info` 中的訂閱狀態：

| 功能 | 免費版 | 專業版 (全站通吃) |
| :--- | :--- | :--- |
| **交易紀錄** | 正常使用 | 正常使用 |
| **雲端備份/還原** | ❌ 僅限本地 | ✅ 無限制同步 |
| **持股追蹤數量** | 限制 3 檔 | ✅ 無限制 |
| **自定義佈局儲存** | ❌ 僅存於瀏覽器 | ✅ 雲端跨裝置同步 |
| **進階財務分析** | 基本圖表 | ✅ 深度趨勢與分類報告 |

## 🚀 部署與開發

### Firebase 配置：
1.  **建立專案**：前往 [Firebase Console](https://console.firebase.google.com/) 建立專案。
2.  **啟用服務**：啟用 **Firestore Database** 與 **Google Authentication**。
3.  **填寫資訊**：將配置資訊填入 `assets/js/firebase-config.js`。

### 安全性規則：
請務必於 Firebase 控制台設定 **Firestore Rules**，確保資料安全：
```javascript
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}